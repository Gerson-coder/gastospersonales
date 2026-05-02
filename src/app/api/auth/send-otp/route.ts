import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to write auth_otps and bypass RLS on the no-policy table
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateOtp, hashOtp, OTP_TTL_MS, type OtpPurpose } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/resend";

/**
 * POST /api/auth/send-otp
 *
 * Resend / new-device / pin-reset code generator. Requires an active
 * Supabase session — uses the session's email as the recipient. Any
 * prior unused OTP for the same purpose is invalidated before inserting
 * the new one (no "two valid codes" race).
 *
 * Body: { purpose }
 */
export async function POST(request: Request) {
  let body: { purpose?: OtpPurpose };
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
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
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
    .eq("user_id", user.id)
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
    .eq("user_id", user.id)
    .eq("purpose", purpose)
    .is("used_at", null);

  const otp = generateOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insertErr } = await admin.from("auth_otps").insert({
    user_id: user.id,
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
    to: user.email,
    code: otp,
    purpose,
  });

  if (!sendResult.delivered && !sendResult.devMode) {
    console.error(
      `[send-otp] send_failed user_id=${user.id} purpose=${purpose}`,
    );
  }

  return NextResponse.json({
    delivered: sendResult.delivered,
    devMode: sendResult.devMode,
  });
}
