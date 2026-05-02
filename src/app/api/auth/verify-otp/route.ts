import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to read auth_otps + flip email_verified_at + mint magiclink for new-device session
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isExpired,
  OTP_MAX_ATTEMPTS,
  type OtpPurpose,
  verifyOtp,
} from "@/lib/auth/otp";
import {
  deviceNameFromUserAgent,
  fingerprintHash,
  type DeviceSignals,
} from "@/lib/auth/device-fingerprint";
import { findUserByEmail } from "@/lib/auth/lookup";
import { recordAttempt } from "@/lib/auth/rate-limit";
import { sendNewDeviceLoginEmail } from "@/lib/auth/resend";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * POST /api/auth/verify-otp
 *
 * Body: { code, purpose, email?, deviceSignals? }
 *
 * Two modes:
 *   1. With session (default) — uses session's user.id. Used for
 *      `email_verification` (post-signup) and `pin_reset` (in-app).
 *      On success:
 *        - email_verification → set profiles.email_verified_at = now()
 *        - pin_reset          → flag the OTP as used (next /set-pin checks)
 *   2. With `email` + `deviceSignals` body params + no session — used
 *      by /login when the device is not trusted yet. Restricted to
 *      `purpose === "new_device"`. On success:
 *        - Marks `trusted_devices` for this user + fingerprint.
 *        - Rotates the throwaway password and signInWithPassword to set
 *          a fresh session cookie on the response.
 *
 * Returns: { ok: true, purpose, hasPin? } on success.
 *   `hasPin` is included in the no-session new_device path so the client
 *   can route to /auth/set-pin (PIN missing) vs /dashboard (PIN exists).
 */
export async function POST(request: Request) {
  let body: {
    code?: string;
    purpose?: OtpPurpose;
    email?: string;
    deviceSignals?: Pick<DeviceSignals, "screenResolution" | "timezone">;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const code = body.code?.trim();
  const purpose = body.purpose;
  if (!code || !purpose) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "El código debe ser de 6 dígitos." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();

  let userId: string;
  let userEmail: string;
  const noSession = !sessionUser;

  if (sessionUser && sessionUser.email) {
    userId = sessionUser.id;
    userEmail = sessionUser.email;
  } else if (body.email && body.email.trim().length > 0) {
    if (purpose !== "new_device") {
      return NextResponse.json(
        { error: "Sesión expirada." },
        { status: 401 },
      );
    }
    const normalized = body.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      return NextResponse.json(
        { error: "Correo inválido." },
        { status: 400 },
      );
    }
    const admin = createAdminClient();
    const found = await findUserByEmail(admin, normalized);
    if (!found) {
      return NextResponse.json(
        { error: "Código incorrecto." },
        { status: 400 },
      );
    }
    userId = found.id;
    userEmail = found.email;
  } else {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pull the most recent unused OTP for this user + purpose.
  const { data: otpRow, error: otpErr } = await admin
    .from("auth_otps")
    .select("id, code_hash, expires_at, attempts, used_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpErr || !otpRow) {
    await recordAttempt(userId, getIp(request), "otp", false);
    return NextResponse.json(
      { error: "No hay un código pendiente. Solicita uno nuevo." },
      { status: 400 },
    );
  }

  if (isExpired(otpRow.expires_at)) {
    await recordAttempt(userId, getIp(request), "otp", false);
    return NextResponse.json(
      { error: "El código expiró. Solicita uno nuevo." },
      { status: 400 },
    );
  }

  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(
      {
        error: "Demasiados intentos en este código. Solicita uno nuevo.",
      },
      { status: 429 },
    );
  }

  const matches = await verifyOtp(code, otpRow.code_hash);
  if (!matches) {
    await admin
      .from("auth_otps")
      .update({ attempts: (otpRow.attempts ?? 0) + 1 })
      .eq("id", otpRow.id);
    await recordAttempt(userId, getIp(request), "otp", false);
    return NextResponse.json(
      { error: "Código incorrecto." },
      { status: 400 },
    );
  }

  // Mark OTP consumed.
  await admin
    .from("auth_otps")
    .update({ used_at: new Date().toISOString() })
    .eq("id", otpRow.id);

  if (purpose === "email_verification") {
    await admin
      .from("profiles")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", userId);
  }

  // No-session new_device path: trust the device, mint a magiclink token
  // and consume it server-side to attach a fresh session cookie. Does NOT
  // invalidate other live sessions (multi-device support). After session
  // is up, fire-and-forget a "new device login" notification email.
  let hasPin = false;
  if (noSession && purpose === "new_device") {
    const userAgent = request.headers.get("user-agent");
    const acceptLanguage = request.headers.get("accept-language");
    const signals: DeviceSignals = {
      userAgent,
      acceptLanguage,
      screenResolution: body.deviceSignals?.screenResolution ?? null,
      timezone: body.deviceSignals?.timezone ?? null,
    };
    const fp = fingerprintHash(signals);
    const deviceName = deviceNameFromUserAgent(userAgent);

    const { error: deviceErr } = await admin
      .from("trusted_devices")
      .upsert(
        {
          user_id: userId,
          fingerprint_hash: fp,
          device_name: deviceName,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,fingerprint_hash" },
      );
    if (deviceErr) {
      console.error(
        `[verify-otp] trust_device_failed user=${userId} message=${deviceErr.message}`,
      );
      // Soft-fail — we still want to sign them in. They'll re-OTP on
      // next login until the trust insert succeeds.
    }

    const { data: linkData, error: linkErr } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
      });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error(
        `[verify-otp] generate_link_failed user=${userId} message=${linkErr?.message ?? "no token"}`,
      );
      return NextResponse.json(
        { error: "No pudimos iniciar sesión. Intenta otra vez." },
        { status: 500 },
      );
    }

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyErr) {
      console.error(
        `[verify-otp] verify_magic_failed user=${userId} message=${verifyErr.message}`,
      );
      return NextResponse.json(
        { error: "No pudimos iniciar sesión." },
        { status: 500 },
      );
    }

    const { data: pinRow } = await admin
      .from("user_pins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    hasPin = !!pinRow;

    // Notify the account holder of the new-device login. Fire-and-forget —
    // a slow Resend call should never block the redirect to /dashboard.
    void sendNewDeviceLoginEmail({
      to: userEmail,
      deviceName,
      ipAddress: getIp(request),
    }).catch((err) => {
      console.error(
        `[verify-otp] notify_new_device_failed user=${userId} message=${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  await recordAttempt(userId, getIp(request), "otp", true);

  return NextResponse.json({ ok: true, purpose, hasPin });
}

function getIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
