import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to read pin_hash and update failed_attempts/locked_until server-side
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/auth/pin";
import { checkAttemptLockout, recordAttempt } from "@/lib/auth/rate-limit";

/**
 * POST /api/auth/verify-pin
 *
 * Body: { pin }
 *
 * Verifies the PIN against the hash in user_pins. Increments
 * failed_attempts on miss; clears it on hit. After 5 misses we set
 * locked_until = now + 15 min and return 423 (locked) so the UI shows
 * the cooldown + "olvidé mi PIN" affordance.
 *
 * Auth: requires an active Supabase session AND a row in user_pins
 * (no PIN set → caller should send the user to /auth/set-pin).
 */
export async function POST(request: Request) {
  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const pin = body.pin?.trim();
  if (!pin) {
    return NextResponse.json({ error: "Falta el PIN." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const ip = getIp(request);

  const lockout = await checkAttemptLockout(user.id, ip, "pin");
  if (lockout.lockedUntil) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos fallidos. Espera unos minutos o usa 'Olvidé mi PIN'.",
        lockedUntil: lockout.lockedUntil.toISOString(),
      },
      { status: 423 },
    );
  }

  const admin = createAdminClient();

  const { data: pinRow, error: pinErr } = await admin
    .from("user_pins")
    .select("pin_hash, failed_attempts, locked_until")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pinErr || !pinRow) {
    return NextResponse.json(
      { error: "No tienes un PIN configurado." },
      { status: 404 },
    );
  }

  // Per-row lockout (separate from per-user-attempts lockout — this one
  // persists across browser restarts because it's in the row, not in
  // the audit log).
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
      .eq("user_id", user.id);
    await recordAttempt(user.id, ip, "pin", false);
    return NextResponse.json(
      {
        error: "PIN incorrecto.",
        attemptsRemaining: Math.max(0, 5 - newCount),
        lockedUntil: lockUntil,
      },
      { status: 401 },
    );
  }

  // Reset counter on success.
  await admin
    .from("user_pins")
    .update({ failed_attempts: 0, locked_until: null })
    .eq("user_id", user.id);
  await recordAttempt(user.id, ip, "pin", true);

  return NextResponse.json({ ok: true });
}

function getIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
