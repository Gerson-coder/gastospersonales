import "server-only";

// eslint-disable-next-line no-restricted-imports -- auth_attempts is an audit log written/read by the service role (no policies)
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate-limit guard for auth attempts. Persists each attempt to
 * `auth_attempts` and looks up recent failures BEFORE accepting a new
 * one. Two windows enforced:
 *
 *   - Per user, per action: 5 failed attempts in 15 min → reject with
 *     a "locked, try later" error. Successful attempts reset the count
 *     implicitly because the lookup only counts failures.
 *   - Per IP (no user yet, e.g. typoed email on registration): 20
 *     failed attempts in 15 min → same lockout.
 *
 * This is the LAST line of defense. The primary defense is bcrypt cost
 * 10 making each guess take ~70ms, so brute-forcing a 6-digit PIN at
 * 14 attempts/sec is already a year-long endeavour. The lockout keeps
 * those attacks visible and short.
 */

export type AttemptAction = "pin" | "password" | "otp";

const FAIL_THRESHOLD_PER_USER = 5;
const FAIL_THRESHOLD_PER_IP = 20;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Check whether the (user, action) or (ip, action) bucket has exceeded
 * its threshold. Returns the lockout-until timestamp when locked, null
 * when the caller is OK to proceed.
 *
 * Either userId or ip must be provided (or both — in that case, the
 * stricter wins).
 */
export async function checkAttemptLockout(
  userId: string | null,
  ip: string | null,
  action: AttemptAction,
): Promise<{ lockedUntil: Date | null }> {
  const supabase = createAdminClient();
  const cutoffISO = new Date(Date.now() - WINDOW_MS).toISOString();

  if (userId) {
    const { count } = await supabase
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", action)
      .eq("succeeded", false)
      .gte("occurred_at", cutoffISO);
    if ((count ?? 0) >= FAIL_THRESHOLD_PER_USER) {
      return { lockedUntil: new Date(Date.now() + WINDOW_MS) };
    }
  }

  if (ip) {
    const { count } = await supabase
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("action", action)
      .eq("succeeded", false)
      .gte("occurred_at", cutoffISO);
    if ((count ?? 0) >= FAIL_THRESHOLD_PER_IP) {
      return { lockedUntil: new Date(Date.now() + WINDOW_MS) };
    }
  }

  return { lockedUntil: null };
}

export async function recordAttempt(
  userId: string | null,
  ip: string | null,
  action: AttemptAction,
  succeeded: boolean,
): Promise<void> {
  const supabase = createAdminClient();
  // Best-effort write — if the audit log fails we still let the user
  // through (auth UX > telemetry).
  await supabase
    .from("auth_attempts")
    .insert({ user_id: userId, ip, action, succeeded });
}
