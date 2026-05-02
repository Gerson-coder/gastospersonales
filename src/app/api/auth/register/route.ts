import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

// eslint-disable-next-line no-restricted-imports -- service-role required to skip Supabase email confirmation + write profile fields server-side
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/auth/resend";

/**
 * POST /api/auth/register
 *
 * Passwordless registration. Body is `{ email }` only. Three branches:
 *
 *   1. New email                  → create auth user with throwaway password,
 *                                    sign-in to set cookies, send OTP, return 200.
 *   2. Existing + verified        → 409 with redirect hint to /login?email=...
 *   3. Existing + NOT verified    → reuse user, regenerate OTP, return 200 with
 *                                    `resumed: true` — the client treats it
 *                                    identically to the new-user path.
 *
 * The throwaway password is never surfaced. Future logins use OTP+PIN, so the
 * password row in `auth.users.encrypted_password` becomes inert. We keep it
 * (rather than wiping it) so a rollback to password-auth is trivial.
 */
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "Correo inválido." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Preflight: does an auth.users row already exist for this email?
  // listUsers paginates (default perPage=50). For our MVP scale this is
  // acceptable; revisit when user count grows past a few thousand.
  const existing = await findUserByEmail(admin, email);

  if (existing) {
    const userId = existing.id;
    const verified = await isEmailVerified(admin, userId);

    if (verified) {
      return NextResponse.json(
        {
          error: "email_exists_verified",
          redirect: `/login?email=${encodeURIComponent(email)}`,
        },
        { status: 409 },
      );
    }

    // Unverified ghost — reuse the row. Invalidate prior OTPs, insert a new
    // one, and return as if it were a fresh register so the client can
    // continue to /auth/verify-email without branching on `resumed`.
    const otpResult = await issueEmailOtp(admin, userId, email);
    if ("error" in otpResult) return otpResult.error;

    return NextResponse.json({
      userId,
      delivered: otpResult.delivered,
      devMode: otpResult.devMode,
      resumed: true,
    });
  }

  // New user. Generate a throwaway password — Supabase's createUser requires
  // SOMETHING; the user never sees it and never types it again.
  const throwawayPassword = randomBytes(32).toString("hex");

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: throwawayPassword,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    if (createErr) {
      console.error(
        `[register] create_failed branch=new code=${createErr.code ?? "unknown"} status=${createErr.status ?? "unknown"} message=${createErr.message}`,
      );
    }
    return NextResponse.json(
      { error: "No pudimos crear la cuenta. Intenta de nuevo." },
      { status: 400 },
    );
  }

  const userId = created.user.id;

  // Sign in the new user so cookies are set on the response. We use the
  // throwaway password we just set; from this point on the user re-enters
  // through OTP+PIN.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: throwawayPassword,
  });
  if (signInErr) {
    console.error(
      `[register] auto_signin_failed code=${signInErr.code ?? "unknown"} status=${signInErr.status ?? "unknown"} message=${signInErr.message}`,
    );
    return NextResponse.json(
      { error: "Cuenta creada, pero no pudimos iniciar sesión. Intenta entrar manualmente." },
      { status: 500 },
    );
  }

  const otpResult = await issueEmailOtp(admin, userId, email);
  if ("error" in otpResult) return otpResult.error;

  return NextResponse.json({
    userId,
    delivered: otpResult.delivered,
    devMode: otpResult.devMode,
  });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function findUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ id: string } | null> {
  // Walk pages until we find the email or run out. Supabase caps perPage at
  // 1000 — for our scale we only ever hit page 1.
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(
        `[register] list_users_failed page=${page} message=${error.message}`,
      );
      return null;
    }
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (found) return { id: found.id };
    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function isEmailVerified(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("email_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error(
      `[register] profile_lookup_failed message=${error.message}`,
    );
    return false;
  }
  return !!data?.email_verified_at;
}

type OtpIssue =
  | { delivered: boolean; devMode: boolean }
  | { error: NextResponse };

async function issueEmailOtp(
  admin: AdminClient,
  userId: string,
  email: string,
): Promise<OtpIssue> {
  const otp = generateOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

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
    console.error(
      `[register] otp_insert_failed code=${otpInsertErr.code ?? "unknown"} message=${otpInsertErr.message}`,
    );
    return {
      error: NextResponse.json(
        { error: "No pudimos enviar el código. Intenta de nuevo." },
        { status: 500 },
      ),
    };
  }

  const sendResult = await sendOtpEmail({
    to: email,
    code: otp,
    purpose: "email_verification",
  });
  if (!sendResult.delivered && !sendResult.devMode) {
    console.error(
      `[register] otp_send_failed user_id=${userId} email=${email}`,
    );
  }
  return { delivered: sendResult.delivered, devMode: sendResult.devMode };
}
