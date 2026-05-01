import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to read auth_otps + flip email_verified_at server-side
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  isExpired,
  OTP_MAX_ATTEMPTS,
  type OtpPurpose,
  verifyOtp,
} from "@/lib/auth/otp";
import { recordAttempt } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/verify-otp
 *
 * Body: { code, purpose }
 *
 * Requires an active Supabase session (the user is signed in but their
 * email may not be verified yet). On success:
 *   - email_verification → set profiles.email_verified_at = now()
 *   - new_device         → trust this device (caller passes signals separately
 *                          to /api/auth/trust-device after a successful verify)
 *   - pin_reset          → flag the session as eligible to write a new PIN
 *                          (the next /api/auth/set-pin call enforces this)
 *
 * Returns: { ok: true, purpose } on success.
 */
export async function POST(request: Request) {
  let body: { code?: string; purpose?: OtpPurpose };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const code = body.code?.trim();
  const purpose = body.purpose;
  if (!code || !purpose) {
    return NextResponse.json(
      { error: "Faltan datos." },
      { status: 400 },
    );
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "El código debe ser de 6 dígitos." },
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

  const admin = createAdminClient();

  // Pull the most recent unused OTP for this user + purpose.
  const { data: otpRow, error: otpErr } = await admin
    .from("auth_otps")
    .select("id, code_hash, expires_at, attempts, used_at")
    .eq("user_id", user.id)
    .eq("purpose", purpose)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpErr || !otpRow) {
    await recordAttempt(user.id, getIp(request), "otp", false);
    return NextResponse.json(
      { error: "No hay un código pendiente. Solicita uno nuevo." },
      { status: 400 },
    );
  }

  if (isExpired(otpRow.expires_at)) {
    await recordAttempt(user.id, getIp(request), "otp", false);
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
    await recordAttempt(user.id, getIp(request), "otp", false);
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
      .eq("id", user.id);
  }
  // For new_device + pin_reset, the OTP being marked as used is the
  // signal the next step (trust-device / set-pin) checks against.

  await recordAttempt(user.id, getIp(request), "otp", true);

  return NextResponse.json({ ok: true, purpose });
}

function getIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
