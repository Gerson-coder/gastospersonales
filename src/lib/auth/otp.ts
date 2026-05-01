import "server-only";

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

/**
 * OTP helpers — server-only. We generate 6-digit codes for three flows:
 *   - email_verification: confirm the email address on signup
 *   - new_device:         confirm a never-seen-before device on login
 *   - pin_reset:          let the user set a new PIN after forgetting it
 *
 * The plaintext code is sent ONCE via Resend and never persisted. The DB
 * stores a bcrypt hash so a Postgres dump can't replay codes. Each code
 * has a 10-minute TTL and a 5-attempt cap.
 */

const BCRYPT_COST = 10;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

export type OtpPurpose = "email_verification" | "new_device" | "pin_reset";

/**
 * Cryptographically-secure 6-digit code as a zero-padded string.
 * randomInt is sourced from node:crypto so the entropy is real.
 */
export function generateOtp(): string {
  // randomInt(min, max) is half-open [min, max). 1_000_000 covers 000000-999999.
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, "0");
}

export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_COST);
}

export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export function isExpired(expiresAt: Date | string): boolean {
  const t = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Date.now() > t.getTime();
}
