import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to write user_pins + trusted_devices (the API hashes the PIN before insert)
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashPin, validatePinFormat } from "@/lib/auth/pin";
import {
  deviceNameFromUserAgent,
  fingerprintHash,
  type DeviceSignals,
} from "@/lib/auth/device-fingerprint";

/**
 * POST /api/auth/set-pin
 *
 * Body: { pin, deviceSignals: { screenResolution, timezone } }
 *
 * Sets (or replaces) the user's PIN. Side effect: marks the current
 * device as trusted so the next /login can skip the email+password
 * step. The PIN's bcrypt hash never leaves this process — request body
 * dies as soon as we hash it.
 *
 * Auth: requires an active Supabase session.
 */
export async function POST(request: Request) {
  let body: {
    pin?: string;
    deviceSignals?: Pick<DeviceSignals, "screenResolution" | "timezone">;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const pin = body.pin;
  if (!pin) {
    return NextResponse.json({ error: "Falta el PIN." }, { status: 400 });
  }
  try {
    validatePinFormat(pin);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PIN inválido." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  // Email-verification gate (defense-in-depth — middleware also blocks
  // this, but a stale SW or direct API hit could bypass middleware).
  // Without verifying the email, an attacker who registered with a typo
  // or abandoned the OTP step could still set a PIN and move further
  // into the onboarding wizard.
  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("email_verified_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) {
    console.error(
      `[set-pin] profile_check_failed user=${user.id} message=${profileErr.message}`,
    );
    return NextResponse.json(
      { error: "No pudimos verificar tu cuenta." },
      { status: 500 },
    );
  }
  if (!profile || !profile.email_verified_at) {
    return NextResponse.json(
      { error: "Verifica tu correo antes de configurar el PIN." },
      { status: 403 },
    );
  }

  const pinHash = await hashPin(pin);

  // Upsert by user_id (unique). On reset-pin flow this overwrites the old hash.
  const { error: upsertErr } = await admin
    .from("user_pins")
    .upsert(
      {
        user_id: user.id,
        pin_hash: pinHash,
        failed_attempts: 0,
        locked_until: null,
        set_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (upsertErr) {
    console.error(
      `[set-pin] upsert_failed code=${upsertErr.code ?? "unknown"} message=${upsertErr.message}`,
    );
    return NextResponse.json(
      { error: "No pudimos guardar el PIN." },
      { status: 500 },
    );
  }

  // Mark this device as trusted. We compose the fingerprint from the
  // request headers + the client-supplied screen / tz so the same
  // browser+device hashes consistently across visits.
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
        user_id: user.id,
        fingerprint_hash: fp,
        device_name: deviceName,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,fingerprint_hash" },
    );
  if (deviceErr) {
    console.error(
      `[set-pin] trusted_devices_upsert_failed code=${deviceErr.code ?? "unknown"} message=${deviceErr.message}`,
    );
    // Soft-fail — the PIN is set, the user can re-trust on next login.
  }

  return NextResponse.json({ ok: true });
}
