import type { LlmOutput } from "../types";

import { isValidOperationCode } from "./operation-codes";
import {
  checkAmount,
  checkDate,
  type ValidationIssue,
} from "./sanity";

export type { ValidationIssue, IssueSeverity } from "./sanity";
export { isValidOperationCode, OPERATION_CODE_REGEX } from "./operation-codes";

export interface ValidationResult {
  /**
   * The original LLM output with confidence adjusted based on the
   * issues found. All other fields are passed through unchanged — the
   * validator never rewrites domain data, only confidence.
   */
  output: LlmOutput;
  issues: ValidationIssue[];
}

// Confidence multipliers per severity. Multiple issues compound:
// 2 errors = ×0.5 × 0.5 = ×0.25.
const ERROR_PENALTY = 0.5;
const WARN_PENALTY = 0.85;

// Hard cap on confidence for the generic ("unknown") source. The
// prompt itself caps at 0.7, but enforcing it here is defense in
// depth — the model can disregard prompt instructions, the validator
// cannot be disregarded.
const UNKNOWN_CONFIDENCE_CAP = 0.7;

/**
 * Run all validators against an LLM extraction. Aggregates issues,
 * adjusts confidence accordingly, and returns the result.
 *
 * Order of adjustments:
 *   1. Apply UNKNOWN_CONFIDENCE_CAP if source is "unknown".
 *   2. Multiply by penalty for each issue (errors: ×0.5, warns: ×0.85).
 *   3. Clamp final confidence to [0, 1].
 *
 * Validators run:
 *   - Operation-code regex (per source). Failing → "warn" issue.
 *   - Amount sanity (> 0, not absurdly large).
 *   - Date sanity (not future, not > 5 years old).
 *
 * The pipeline entry point is responsible for deciding what to do
 * with the result (escalate to 4o on errors, return as
 * LOW_CONFIDENCE if final confidence < threshold, etc.).
 */
export function validateExtraction(input: LlmOutput): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (input.reference) {
    if (!isValidOperationCode(input.source, input.reference)) {
      issues.push({
        field: "reference",
        severity: "warn",
        message: `reference does not match the expected ${input.source} operation code format`,
      });
    }
  }

  const amountIssue = checkAmount(input.amount);
  if (amountIssue) issues.push(amountIssue);

  const dateIssue = checkDate(input.occurredAt);
  if (dateIssue) issues.push(dateIssue);

  let adjusted = input.confidence;
  if (input.source === "unknown") {
    adjusted = Math.min(adjusted, UNKNOWN_CONFIDENCE_CAP);
  }

  for (const issue of issues) {
    adjusted *= issue.severity === "error" ? ERROR_PENALTY : WARN_PENALTY;
  }

  const finalConfidence = Math.max(0, Math.min(1, adjusted));

  return {
    output: { ...input, confidence: finalConfidence },
    issues,
  };
}
