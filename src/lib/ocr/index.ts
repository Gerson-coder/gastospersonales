import "server-only";

import { classifyReceipt } from "./classifier";
import { OcrPipelineError, type VisionUsage } from "./client";
import { extractorFor } from "./extractors";
import {
  OCR_CONFIDENCE_THRESHOLD,
  type Classification,
  type LlmOutput,
  type OcrError,
  type OcrModel,
  type OcrSource,
} from "./types";
import { validateExtraction, type ValidationIssue } from "./validators";

/**
 * OCR pipeline entry point.
 *
 * Orchestrates the full flow:
 *
 *   imageBase64
 *     → classify          (mini, low detail, ~600ms)
 *     → dispatch extractor for the classified source
 *     → extract (mini)
 *     → validate → adjusts confidence
 *     → if confidence < threshold AND on mini → re-extract with 4o
 *     → validate again
 *     → if still < threshold → return LOW_CONFIDENCE with partial
 *     → else                  → return ok with full LlmOutput
 *
 * Failure modes returned as `{ ok: false, error: OcrError }`:
 *   - INVALID_IMAGE    — input is empty / too small to be an image
 *   - MODEL_FAILURE    — both mini and 4o failed (with retry already
 *                        exhausted inside the client wrapper)
 *   - LOW_CONFIDENCE   — extraction succeeded but final confidence is
 *                        below `OCR_CONFIDENCE_THRESHOLD`. The partial
 *                        result is returned so the UI can pre-fill the
 *                        form fields it CAN and ask the user to fill
 *                        the rest.
 *
 * The caller (API route) is responsible for:
 *   - Authenticating the user
 *   - Persisting the image to Supabase Storage
 *   - Inserting the `receipts` row and assigning `receiptId`
 *   - Mapping these errors to HTTP status codes
 *
 * This module knows nothing about HTTP, auth, or storage.
 */

export type ExtractFromImageResult =
  | {
      ok: true;
      data: LlmOutput & { modelUsed: OcrModel };
      issues: ValidationIssue[];
    }
  | { ok: false; error: OcrError };

export interface ExtractFromImageOpts {
  /**
   * Per-call telemetry hook. Fires once for the classifier and once
   * (or twice, if escalating) for the extractor. The caller can sum
   * tokens to bill or rate-limit by cost.
   */
  onUsage?: (usage: VisionUsage & {
    model: OcrModel;
    phase: "classify" | "extract";
  }) => void;
}

// If the classifier returns a source label with confidence below this,
// we don't trust the label and route to the generic extractor instead.
// Generic is more permissive and won't fail just because the label was
// guessed wrong.
const CLASSIFIER_TRUST_THRESHOLD = 0.5;

export async function extractFromImage(
  imageBase64: string,
  opts: ExtractFromImageOpts = {},
): Promise<ExtractFromImageResult> {
  if (!imageBase64 || imageBase64.length < 100) {
    return {
      ok: false,
      error: {
        kind: "INVALID_IMAGE",
        message: "image data is empty or too small to be an image",
      },
    };
  }

  // ─── Stage 1: classify ──────────────────────────────────────────────
  let classification: Classification;
  try {
    classification = await classifyReceipt(imageBase64, {
      onUsage: (u) => opts.onUsage?.({ ...u, model: "gpt-4o-mini", phase: "classify" }),
    });
  } catch (err) {
    if (err instanceof OcrPipelineError) {
      console.error("[ocr/pipeline] classify_failed", { kind: err.kind });
      return {
        ok: false,
        error: { kind: "MODEL_FAILURE", retryable: err.retryable },
      };
    }
    throw err;
  }

  const dispatchSource: OcrSource =
    classification.confidence < CLASSIFIER_TRUST_THRESHOLD
      ? "unknown"
      : classification.source;

  const extractor = extractorFor(dispatchSource);

  // ─── Stage 2: extract with mini ─────────────────────────────────────
  const runExtract = async (model: OcrModel): Promise<LlmOutput | null> => {
    try {
      return await extractor(imageBase64, {
        model,
        onUsage: (u) => opts.onUsage?.({ ...u, model, phase: "extract" }),
      });
    } catch (err) {
      if (err instanceof OcrPipelineError) {
        console.error("[ocr/pipeline] extract_failed", {
          model,
          source: dispatchSource,
          kind: err.kind,
        });
        return null;
      }
      throw err;
    }
  };

  let raw = await runExtract("gpt-4o-mini");
  let modelUsed: OcrModel = "gpt-4o-mini";

  // If mini failed entirely, escalate straight to 4o.
  if (!raw) {
    raw = await runExtract("gpt-4o");
    modelUsed = "gpt-4o";
    if (!raw) {
      return {
        ok: false,
        error: { kind: "MODEL_FAILURE", retryable: false },
      };
    }
  }

  // ─── Stage 3: validate → adjust confidence ──────────────────────────
  let validated = validateExtraction(raw);

  // ─── Stage 4: escalate to 4o if mini's result is low-confidence ─────
  if (
    validated.output.confidence < OCR_CONFIDENCE_THRESHOLD &&
    modelUsed === "gpt-4o-mini"
  ) {
    const second = await runExtract("gpt-4o");
    if (second) {
      const secondValidated = validateExtraction(second);
      // Only adopt 4o's result if it's genuinely better — otherwise we
      // pay for the upgrade without improving the user's UX.
      if (secondValidated.output.confidence > validated.output.confidence) {
        validated = secondValidated;
        modelUsed = "gpt-4o";
      }
    }
  }

  // ─── Stage 5: final decision ────────────────────────────────────────
  if (validated.output.confidence < OCR_CONFIDENCE_THRESHOLD) {
    console.error("[ocr/pipeline] low_confidence_final", {
      source: validated.output.source,
      confidence: validated.output.confidence,
      modelUsed,
      issueCount: validated.issues.length,
    });
    return {
      ok: false,
      error: {
        kind: "LOW_CONFIDENCE",
        partial: { ...validated.output, modelUsed },
      },
    };
  }

  return {
    ok: true,
    data: { ...validated.output, modelUsed },
    issues: validated.issues,
  };
}
