import "server-only";

import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to look up users by email, validate trusted device + PIN hash, and mint a magiclink token for session creation
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fingerprintHash,
  type DeviceSignals,
} from "@/lib/auth/device-fingerprint";
import { findUserByEmail } from "@/lib/auth/lookup";
import { verifyPin } from "@/lib/auth/pin";
import { checkAttemptLockout, recordAttempt } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/login-with-pin
 *
 * No-session login flow for trusted devices.
 *
 * Body: { email, pin, deviceSignals: { screenResolution, timezone } }
 *
 * Validates, in this order:
 *   1. Email format + corresponds to an existing auth user.
 *   2. The current device fingerprint matches a row in `trusted_devices`
 *      for that user (same browser + screen + tz + UA + Accept-Language
 *      as the one used at /auth/set-pin).
 *   3. The PIN matches the bcrypt hash in `user_pins`.
 *   4. The user is not locked out (5 failures / 15 min via auth_attempts,
 *      plus a per-row `locked_until` set when the PIN itself goes 5-deep).
 *
 * On success, mints a one-time magiclink token via `admin.generateLink` and
 * consumes it server-side via `verifyOtp({ token_hash, type: "magiclink" })`.
 * The verifyOtp call attaches a fresh session cookie to the response WITHOUT
 * touching the user's existing sessions on other devices — multi-device by
 * default. The original throwaway password from /api/auth/register stays
 * unchanged (32 random bytes; uncrackable in practice, so rotation is not
 * a meaningful defense).
 *
 * Response:
 *   200 { ok: true } — cookies attached.
 *   400 — bad input.
 *   401 — wrong PIN, missing PIN, untrusted device, or unknown email.
 *         (We collapse all "you're not getting in" errors into 401 with a
 *         generic message to avoid leaking which leg failed.)
 *   423 — locked out (per-IP, per-user, or per-PIN).
 */
export async function POST(request: Request) {
  let body: {
    email?: string;
    pin?: string;
    deviceSignals?: Pick<DeviceSignals, "screenResolution" | "timezone">;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const pin = body.pin?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "El PIN debe ser de 4 dígitos." },
      { status: 400 },
    );
  }

  const ip = getIp(request);

  // IP-only lockout BEFORE we even know who the user is. Stops "rotate the
  // email field, hammer PINs" — different victims, same attacker.
  const earlyLockout = await checkAttemptLockout(null, ip, "pin");
  if (earlyLockout.lockedUntil) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos. Espera unos minutos e intenta otra vez.",
        lockedUntil: earlyLockout.lockedUntil.toISOString(),
      },
      { status: 423 },
    );
  }

  const admin = createAdminClient();

  const found = await findUserByEmail(admin, email);
  if (!found) {
    await recordAttempt(null, ip, "pin", false);
    return NextResponse.json(
      { error: "Credenciales incorrectas." },
      { status: 401 },
    );
  }
  const userId = found.id;
  const userEmail = found.email;

  // Per-user lockout. Same window/threshold as verify-pin.
  const userLockout = await checkAttemptLockout(userId, ip, "pin");
  if (userLockout.lockedUntil) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos fallidos. Espera unos minutos o usa 'Olvidé mi PIN'.",
        lockedUntil: userLockout.lockedUntil.toISOString(),
      },
      { status: 423 },
    );
  }

  // Device must already be trusted. New devices route through the OTP flow.
  const userAgent = request.headers.get("user-agent");
  const acceptLanguage = request.headers.get("accept-language");
  const signals: DeviceSignals = {
    userAgent,
    acceptLanguage,
    screenResolution: body.deviceSignals?.screenResolution ?? null,
    timezone: body.deviceSignals?.timezone ?? null,
  };
  const fp = fingerprintHash(signals);

  const { data: deviceRow } = await admin
    .from("trusted_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("fingerprint_hash", fp)
    .maybeSingle();
  if (!deviceRow) {
    await recordAttempt(userId, ip, "pin", false);
    return NextResponse.json(
      { error: "Dispositivo no reconocido." },
      { status: 401 },
    );
  }

  const { data: pinRow } = await admin
    .from("user_pins")
    .select("pin_hash, failed_attempts, locked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!pinRow) {
    return NextResponse.json(
      { error: "No tienes un PIN configurado." },
      { status: 401 },
    );
  }

  if (pinRow.locked_until && new Date(pinRow.locked_until) > new Date()) {
    return NextResponse.json(
      {
        error: "PIN bloqueado. Usa 'Olvidé mi PIN' para crear uno nuevo.",
        lockedUntil: pinRow.locked_until,
      },
      { status: 423 },
    );
  }

  const matches = await verifyPin(pin, pinRow.pin_hash);
  if (!matches) {
    const newCount = (pinRow.failed_attempts ?? 0) + 1;
    const lockUntil =
      newCount >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null;
    await admin
      .from("user_pins")
      .update({ failed_attempts: newCount, locked_until: lockUntil })
      .eq("user_id", userId);
    await recordAttempt(userId, ip, "pin", false);
    return NextResponse.json(
      {
        error: "PIN incorrecto.",
        attemptsRemaining: Math.max(0, 5 - newCount),
        lockedUntil: lockUntil,
      },
      { status: 401 },
    );
  }

  // PIN matched. Mint a magiclink token and consume it server-side so the
  // SSR client attaches a fresh session cookie. Does NOT invalidate the
  // user's other live sessions (multi-device support).
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error(
      `[login-with-pin] generate_link_failed user=${userId} message=${linkErr?.message ?? "no token"}`,
    );
    return NextResponse.json(
      { error: "No pudimos iniciar sesión. Intenta otra vez." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) {
    console.error(
      `[login-with-pin] verify_otp_failed user=${userId} message=${verifyErr.message}`,
    );
    return NextResponse.json(
      { error: "No pudimos iniciar sesión." },
      { status: 500 },
    );
  }

  // Reset PIN failure counters on successful auth.
  await admin
    .from("user_pins")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("user_id", userId);

  // Bump trusted_devices.last_seen_at so device-list UIs read accurate data.
  await admin
    .from("trusted_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", deviceRow.id);

  await recordAttempt(userId, ip, "pin", true);

  return NextResponse.json({ ok: true });
}

function getIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
