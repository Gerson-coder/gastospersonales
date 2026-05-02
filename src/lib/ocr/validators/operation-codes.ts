import type { OcrSource } from "../types";

/**
 * Operation-code format validators per source.
 *
 * These regexes are intentionally tolerant — the goal is to detect
 * "this looks wrong" not "this is wrong". A failing match lowers
 * confidence; it never rejects the parse outright. The user can still
 * see the autofilled form and override the field.
 *
 * Format references:
 *   - Yape: 9 digits, e.g. "123456789"
 *   - Plin: typically 11 alphanumeric chars (e.g. "P25030121456"),
 *           accept 8-12 to absorb future format tweaks.
 *   - BBVA: 6-9 digits depending on operation type. The constancia
 *           shows "N° de operación" usually 7-8 digits.
 *   - BCP:  same range as BBVA.
 *   - unknown: no validation; the generic prompt has no standard.
 */
export const OPERATION_CODE_REGEX: Record<OcrSource, RegExp | null> = {
  yape: /^\d{9}$/,
  plin: /^[A-Z0-9]{8,12}$/i,
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
