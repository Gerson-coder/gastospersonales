import type { Amount } from "../types";

/**
 * Sanity checks for individual fields. Each function returns null when
 * the field is fine, or a `ValidationIssue` with severity + message
 * when something looks off.
 *
 * Severities:
 *   - "error" → confidence × 0.5 (something is wrong)
 *   - "warn"  → confidence × 0.85 (something is unusual)
 *
 * The aggregate validator in `index.ts` collects issues and applies
 * the multipliers. Issues never reject the parse — they only adjust
 * confidence so the pipeline can route low-confidence results through
 * the LOW_CONFIDENCE path (manual review).
 */

export type IssueSeverity = "error" | "warn";

export interface ValidationIssue {
  field: string;
  severity: IssueSeverity;
  message: string;
}

// 1 minor unit = S/ 0.01. Anything below is a model misread.
const MIN_AMOUNT_MINOR = 1;
// 10 M soles = 1_000_000_000 minor units. Above is suspicious for any
// personal-finance receipt; warn but don't reject (could be legitimate
// BBVA business transfer screenshot).
const MAX_AMOUNT_MINOR = 1_000_000_000;

// Reject dates more than 5 minutes in the future (allows for clock
// skew between the user's device and the server).
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
// Warn (not reject) for dates older than 5 years — could be a user
// importing very old records, but most likely the model misread.
const MAX_AGE_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export function checkAmount(amount: Amount): ValidationIssue | null {
  if (amount.minor < MIN_AMOUNT_MINOR) {
    return {
      field: "amount.minor",
      severity: "error",
      message: "amount must be greater than zero",
    };
  }
  if (amount.minor > MAX_AMOUNT_MINOR) {
    return {
      field: "amount.minor",
      severity: "warn",
      message: "amount unusually large",
    };
  }
  return null;
}

export function checkDate(occurredAt: string): ValidationIssue | null {
  const ts = new Date(occurredAt).getTime();
  if (Number.isNaN(ts)) {
    return {
      field: "occurredAt",
      severity: "error",
      message: "occurredAt is not a valid date",
    };
  }
  const now = Date.now();
  if (ts > now + FUTURE_TOLERANCE_MS) {
    return {
      field: "occurredAt",
      severity: "error",
      message: "occurredAt is in the future",
    };
  }
  if (now - ts > MAX_AGE_MS) {
    return {
      field: "occurredAt",
      severity: "warn",
      message: "occurredAt is unusually old (> 5 years)",
    };
  }
  return null;
}
