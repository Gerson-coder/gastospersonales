import "server-only";

import bcrypt from "bcryptjs";

/**
 * PIN helpers — server-only. The PIN is a 6-digit secondary credential
 * the user types every time they unlock the app on a trusted device.
 *
 * - `hashPin` runs bcrypt cost 10 (~70ms on a typical CPU). Slower would
 *   block the API route too much; faster would weaken brute force resistance.
 * - `verifyPin` is constant-time via bcrypt's compareSync.
 * - `validatePinFormat` is a pure-string check the API route uses BEFORE
 *   the bcrypt call, so we don't waste 70ms on garbage input.
 *
 * The plaintext PIN never lives outside the request/response that's
 * setting or verifying it. The DB only ever stores the bcrypt hash.
 */

const BCRYPT_COST = 10;
const PIN_REGEX = /^\d{6}$/;

/**
 * Reject obvious bad inputs before bcrypt to keep the API route cheap.
 * Throws a friendly error for the caller to surface as a toast.
 */
export function validatePinFormat(pin: string): void {
  if (typeof pin !== "string") {
    throw new Error("El PIN debe ser un texto.");
  }
  if (!PIN_REGEX.test(pin)) {
    throw new Error("El PIN debe ser exactamente 6 dígitos.");
  }
  // Trivial sequences are not strictly forbidden but we discourage them.
  // Guard rejects 000000, 111111, 123456, 654321 — the obvious ones.
  // Users who insist can choose a different trivial PIN we didn't list,
  // which is acceptable for v1.
  if (
    pin === "000000" ||
    pin === "111111" ||
    pin === "123456" ||
    pin === "654321"
  ) {
    throw new Error("Elige un PIN menos predecible.");
  }
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_COST);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
