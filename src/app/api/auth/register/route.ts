import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to skip Supabase email confirmation + write profile fields server-side
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/resend";

/**
 * POST /api/auth/register
 *
 * Creates the Supabase auth user (auto-confirmed via service role so we
 * skip Supabase's rate-limited SMTP), seeds profile fields, and emails
 * a 6-digit OTP via Resend. The client is responsible for navigating to
 * /auth/verify-email after a 200 response.
 *
 * Body: { email, password, fullName, birthDate?, phone? }
 *
 * On success the user is signed in (cookie set by signInWithPassword)
 * but their `profiles.email_verified_at` is still null — the middleware
 * gates /dashboard until that flips.
 */
export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
    fullName?: string;
    birthDate?: string;
    phone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const fullName = body.fullName?.trim();
  const birthDate = body.birthDate?.trim() || null;
  const phone = body.phone?.trim() || null;

  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Create the auth user with email_confirm:true so Supabase doesn't
  // send its own confirmation link (we replace that with our OTP).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    // 422 from Supabase usually means "user already exists". Surface a
    // friendly message so the UI can suggest /login.
    const msg =
      createErr?.message?.toLowerCase().includes("already registered") ||
      createErr?.message?.toLowerCase().includes("user already")
        ? "Ya existe una cuenta con ese correo. Inicia sesión."
        : createErr?.message ?? "No pudimos crear la cuenta.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const userId = created.user.id;

  // Seed extra profile fields. The handle_new_user trigger already
  // created a blank row; we UPDATE it via service role.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      birth_date: birthDate,
      phone,
      // display_name is what the welcome screen sets — pre-fill from
      // fullName so the dashboard greets correctly without forcing a
      // second prompt.
      display_name: fullName,
    })
    .eq("id", userId);
  if (profileErr) {
    console.error("[register] profile update failed:", profileErr);
    // Best-effort — don't fail the whole flow over a profile update.
  }

  // Sign in the new user so cookies are set on the response.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    console.error("[register] auto signin failed:", signInErr);
    return NextResponse.json(
      { error: "Cuenta creada, pero no pudimos iniciar sesión. Intenta entrar manualmente." },
      { status: 500 },
    );
  }

  // Generate + persist + send OTP for email verification.
  const otp = generateOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  // Invalidate any stale email_verification OTPs for this user before
  // inserting the new one.
  await admin
    .from("auth_otps")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("purpose", "email_verification")
    .is("used_at", null);

  const { error: otpInsertErr } = await admin.from("auth_otps").insert({
    user_id: userId,
    code_hash: codeHash,
    purpose: "email_verification",
    expires_at: expiresAt,
  });
  if (otpInsertErr) {
    console.error("[register] otp insert failed:", otpInsertErr);
    return NextResponse.json(
      { error: "Cuenta creada, pero no pudimos enviar el código. Intenta de nuevo desde el login." },
      { status: 500 },
    );
  }

  const sendResult = await sendOtpEmail({
    to: email,
    code: otp,
    purpose: "email_verification",
  });

  return NextResponse.json({
    userId,
    delivered: sendResult.delivered,
    devMode: sendResult.devMode,
  });
}
