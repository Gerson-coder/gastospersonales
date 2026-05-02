import type { OcrSource } from "../types";

/**
 * Operation-code format validators per source.
 *
 * These regexes are intentionally tolerant — the goal is to detect
 * "this looks wrong" not "this is wrong". A failing match lowers
 * confidence; it never rejects the parse outright. The user can still
 * see the autofilled form and override the field.
 *
 * Format references (verified against real screenshots):
 *   - Yape: 8 digits in current app version (e.g. "09336248"). Accept
 *           8-9 to tolerate older receipts and future format tweaks.
 *   - Plin: varies by host bank. Interbank/BBVA Plin shows 8 numeric
 *           digits (e.g. "86640457"); older Plin variants used 11
 *           alphanumeric chars (e.g. "P25030121456"). Accept 6-12
 *           alphanumeric to cover both ranges without false negatives.
 *   - BBVA: 6-9 digits depending on operation type.
 *   - BCP:  same range as BBVA.
 *   - unknown: no validation; the generic prompt has no standard.
 */
export const OPERATION_CODE_REGEX: Record<OcrSource, RegExp | null> = {
  yape: /^\d{8,9}$/,
  plin: /^[A-Z0-9]{6,12}$/i,
  bbva: /^\d{6,9}$/,
  bcp: /^\d{6,9}$/,
  unknown: null,
};

export function isValidOperationCode(
  source: OcrSource,
  code: string,
): boolean {
  const regex = OPERATION_CODE_REGEX[source];
  if (!regex) return true; // no validation rule → don't penalize
  return regex.test(code);
}
