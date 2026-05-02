import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to write auth_otps and bypass RLS on the no-policy table
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateOtp, hashOtp, OTP_TTL_MS, type OtpPurpose } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/resend";
import { findUserByEmail } from "@/lib/auth/lookup";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * POST /api/auth/send-otp
 *
 * Resend / new-device / pin-reset code generator.
 *
 * Body: { purpose, email? }
 *
 * Two modes:
 *   1. With session (default) — uses the session's email as the recipient.
 *      Used for `email_verification` (post-signup), `pin_reset`, and any
 *      in-app re-issuance.
 *   2. With `email` body param + no session — used by /login email-first
 *      flow when the device is not trusted: the user gives us the email,
 *      we look up the user, and send a `new_device` OTP. This path ONLY
 *      accepts `purpose === "new_device"` to avoid letting unauthenticated
 *      callers issue arbitrary OTPs (e.g. a pin_reset on someone else's
 *      account).
 *
 * Either way, prior unused OTPs for the same purpose are invalidated
 * before inserting the new one (no "two valid codes" race) and a per-user
 * throttle (3 / 10 min) caps spam-resend abuse.
 */
export async function POST(request: Request) {
  let body: { purpose?: OtpPurpose; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const purpose = body.purpose;
  if (!purpose) {
    return NextResponse.json({ error: "Falta purpose." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();

  let userId: string;
  let userEmail: string;

  if (sessionUser && sessionUser.email) {
    userId = sessionUser.id;
    userEmail = sessionUser.email;
  } else if (body.email && body.email.trim().length > 0) {
    if (purpose !== "new_device") {
      return NextResponse.json(
        {
          error:
            "Inicia sesión para reenviar este código.",
        },
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
      // Don't leak whether the email exists. The login UI treats this
      // identically to "we sent a code" — the user will see the
      // verify-email page with no code arriving, which is the same as a
      // typo in their inbox.
      return NextResponse.json({ delivered: false, devMode: false });
    }
    userId = found.id;
    userEmail = found.email;
  } else {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Per-user throttle: max 3 OTPs in 10 minutes for the same purpose.
  // Stops the "spam-resend" flow while still allowing a normal user to
  // ask for a fresh code if their inbox has a delay.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("auth_otps")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .gte("created_at", tenMinAgo);
  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento e intenta otra vez." },
      { status: 429 },
    );
  }

  // Invalidate any prior pending OTP for this purpose.
  await admin
    .from("auth_otps")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("used_at", null);

  const otp = generateOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insertErr } = await admin.from("auth_otps").insert({
    user_id: userId,
    code_hash: codeHash,
    purpose,
    expires_at: expiresAt,
  });
  if (insertErr) {
    console.error(
      `[send-otp] insert_failed code=${insertErr.code ?? "unknown"} message=${insertErr.message}`,
    );
    return NextResponse.json(
      { error: "No pudimos generar el código. Intenta de nuevo." },
      { status: 500 },
    );
  }

  const sendResult = await sendOtpEmail({
    to: userEmail,
    code: otp,
    purpose,
  });

  if (!sendResult.delivered && !sendResult.devMode) {
    console.error(
      `[send-otp] send_failed user_id=${userId} purpose=${purpose}`,
    );
  }

  return NextResponse.json({
    delivered: sendResult.delivered,
    devMode: sendResult.devMode,
  });
}
