import "server-only";

import { classifyReceipt } from "./classifier";
import { OcrPipelineError, type VisionUsage } from "./client";
import { extractorFor, extractYape } from "./extractors";
import type { OcrStreamEvent } from "./stream-events";
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

  const raw = await runExtract("gpt-4o-mini");
  const modelUsed: OcrModel = "gpt-4o-mini";

  // Eliminado el fallback / escalate a gpt-4o. El cap de costo por foto
  // ahora es predecible (~$0.005 mini con detail:low). Antes una foto
  // borrosa podia disparar dos llamadas extra a gpt-4o (~$0.05 por foto)
  // sin mejorar materialmente el output — la mayoria de "low confidence"
  // son fotos donde ningun modelo va a acertar y el user igual termina
  // editando los campos a mano. Mejor devolver el parse parcial rapido
  // y dejar que el user complete vs gastar 10x para casi el mismo
  // resultado.
  if (!raw) {
    return {
      ok: false,
      error: { kind: "MODEL_FAILURE", retryable: false },
    };
  }

  // ─── Stage 3: validate → adjust confidence ──────────────────────────
  const validated = validateExtraction(raw);

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

// ─── Streaming pipeline (Wave 2A) ───────────────────────────────────────

/**
 * Telemetry the streaming pipeline emits alongside its final result so
 * the API route can persist hit-rate data on the receipt row. Stays out
 * of the DB schema (lives in `receipts.raw_json`) until we have enough
 * volume to justify a dedicated column.
 */
export interface SpeculationTelemetry {
  /** Did we kick off the speculative Yape extractor? Always true today. */
  speculated: boolean;
  /** Did the classifier confirm Yape? */
  classifierSaidYape: boolean;
  /** Did we end up using the speculative Yape result? */
  usedSpeculative: boolean;
  /** Source label the classifier returned. */
  classifiedSource: OcrSource;
  /** Confidence the classifier returned. */
  classifierConfidence: number;
}

/**
 * `OcrSuccessData` from `stream-events.ts` is `ExtractedReceipt` —
 * which itself is `LlmOutput + receiptId + modelUsed`. The pipeline
 * doesn't know `receiptId` (the API route assigns it), so we return
 * the LLM output + modelUsed and the route enriches it.
 */
export type ExtractFromImageStreamingResult =
  | {
      ok: true;
      data: LlmOutput & { modelUsed: OcrModel };
      issues: ValidationIssue[];
      speculation: SpeculationTelemetry;
    }
  | {
      ok: false;
      error: OcrError;
      speculation: SpeculationTelemetry;
    };

export interface ExtractFromImageStreamingOpts {
  onUsage?: (
    usage: VisionUsage & { model: OcrModel; phase: "classify" | "extract" },
  ) => void;
  signal?: AbortSignal;
}

/**
 * Streaming OCR pipeline with speculative Yape execution.
 *
 * Why speculative: ~80% of shares are Yape. Today we serialize
 * classify (~800ms) → extract (~1.5s) for ~2.3s wall time. By kicking
 * off extractYape concurrently with the classifier and waiting on the
 * later of the two, the happy Yape path collapses to ~max(800, 1500) =
 * ~1.5s. Non-Yape pays the same as today (we abort the speculative
 * Yape extractor and dispatch the correct one).
 *
 * Cancellation: every OpenAI fetch is wired to the caller's
 * `AbortSignal` (the route uses `request.signal` so client disconnects
 * cancel work in flight). The internal `specCtrl` is linked to the
 * external signal so aborting the speculative branch also aborts when
 * the caller aborts.
 */
export async function extractFromImageStreaming(
  imageBase64: string,
  emit: (event: OcrStreamEvent) => void,
  opts: ExtractFromImageStreamingOpts = {},
): Promise<ExtractFromImageStreamingResult> {
  const baseSpeculation: SpeculationTelemetry = {
    speculated: false,
    classifierSaidYape: false,
    usedSpeculative: false,
    classifiedSource: "unknown",
    classifierConfidence: 0,
  };

  if (!imageBase64 || imageBase64.length < 100) {
    return {
      ok: false,
      error: {
        kind: "INVALID_IMAGE",
        message: "image data is empty or too small to be an image",
      },
      speculation: baseSpeculation,
    };
  }

  // ─── Stage 1+2 in parallel: classify + speculative Yape ─────────────
  emit({ type: "stage", stage: "classifying" });

  // Internal controller for the speculative Yape branch. We abort it
  // when the classifier rules out Yape — the per-attempt fetch in
  // `callVisionModel` listens to this signal.
  const specCtrl = new AbortController();

  // If the external caller aborts, propagate to the speculative branch.
  // (The classifier and the eventual real extractor receive the external
  // signal directly.)
  const onExternalAbort = () => specCtrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) {
      specCtrl.abort();
    } else {
      opts.signal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const classifyPromise = classifyReceipt(imageBase64, {
    onUsage: (u) =>
      opts.onUsage?.({ ...u, model: "gpt-4o-mini", phase: "classify" }),
    signal: opts.signal,
  });

  // Speculative Yape — fired immediately, no wait. Wrapped so a
  // rejection doesn't escape; we inspect it later.
  const speculativeYapePromise: Promise<
    { ok: true; output: LlmOutput } | { ok: false; err: unknown }
  > = extractYape(imageBase64, {
    onUsage: (u) =>
      opts.onUsage?.({ ...u, model: "gpt-4o-mini", phase: "extract" }),
    signal: specCtrl.signal,
  }).then(
    (output) => ({ ok: true as const, output }),
    (err) => ({ ok: false as const, err }),
  );

  let classification: Classification;
  try {
    classification = await classifyPromise;
  } catch (err) {
    // Classifier failed — abort speculative work and surface the error.
    specCtrl.abort();
    if (opts.signal) {
      opts.signal.removeEventListener("abort", onExternalAbort);
    }
    if (err instanceof OcrPipelineError) {
      console.error("[ocr/pipeline-stream] classify_failed", { kind: err.kind });
      return {
        ok: false,
        error: { kind: "MODEL_FAILURE", retryable: err.retryable },
        speculation: baseSpeculation,
      };
    }
    throw err;
  }

  emit({
    type: "classified",
    source: classification.source,
    confidence: classification.confidence,
  });

  const trustClassifier = classification.confidence >= CLASSIFIER_TRUST_THRESHOLD;
  const dispatchSource: OcrSource = trustClassifier
    ? classification.source
    : "unknown";

  const speculation: SpeculationTelemetry = {
    speculated: true,
    classifierSaidYape:
      trustClassifier && classification.source === "yape",
    usedSpeculative: false,
    classifiedSource: classification.source,
    classifierConfidence: classification.confidence,
  };

  // ─── Stage 3: extraction ────────────────────────────────────────────
  emit({ type: "stage", stage: "extracting" });

  let raw: LlmOutput | null = null;
  const modelUsed: OcrModel = "gpt-4o-mini";

  if (speculation.classifierSaidYape) {
    // Happy path: classifier confirmed Yape — wait on the speculative
    // result we already kicked off.
    const specResult = await speculativeYapePromise;
    if (specResult.ok) {
      raw = specResult.output;
      speculation.usedSpeculative = true;
    } else {
      // Speculative Yape errored even though the classifier said Yape.
      // Surface as MODEL_FAILURE — fallback would be the same extractor
      // again, no point retrying here.
      if (opts.signal) {
        opts.signal.removeEventListener("abort", onExternalAbort);
      }
      const err = specResult.err;
      if (err instanceof OcrPipelineError) {
        console.error("[ocr/pipeline-stream] speculative_yape_failed", {
          kind: err.kind,
        });
        return {
          ok: false,
          error: { kind: "MODEL_FAILURE", retryable: err.retryable },
          speculation,
        };
      }
      throw err;
    }
  } else {
    // Classifier disagreed — cancel speculative Yape and dispatch the
    // correct extractor. Pay the classifier time + extractor time, no
    // worse than the non-streaming pipeline.
    specCtrl.abort();
    // Drain the speculative promise so an unhandled rejection doesn't
    // escape; we don't care about the result.
    void speculativeYapePromise;

    const extractor = extractorFor(dispatchSource);
    try {
      raw = await extractor(imageBase64, {
        model: "gpt-4o-mini",
        onUsage: (u) =>
          opts.onUsage?.({ ...u, model: "gpt-4o-mini", phase: "extract" }),
        signal: opts.signal,
      });
    } catch (err) {
      if (opts.signal) {
        opts.signal.removeEventListener("abort", onExternalAbort);
      }
      if (err instanceof OcrPipelineError) {
        console.error("[ocr/pipeline-stream] extract_failed", {
          source: dispatchSource,
          kind: err.kind,
        });
        return {
          ok: false,
          error: { kind: "MODEL_FAILURE", retryable: err.retryable },
          speculation,
        };
      }
      throw err;
    }
  }

  if (opts.signal) {
    opts.signal.removeEventListener("abort", onExternalAbort);
  }

  if (!raw) {
    return {
      ok: false,
      error: { kind: "MODEL_FAILURE", retryable: false },
      speculation,
    };
  }

  // ─── Emit partials in one burst ─────────────────────────────────────
  // The current extractor returns one structured payload — we don't
  // have token-level streaming. Emitting partials here gives the
  // consumer something to animate progressively (Wave 2B handles
  // staggering on the consumer side).
  if (raw.counterparty?.name) {
    emit({
      type: "partial",
      field: "merchant",
      value: raw.counterparty.name,
      confidence: raw.confidence,
    });
  }
  emit({
    type: "partial",
    field: "amount",
    value: raw.amount.minor,
    confidence: raw.confidence,
  });
  emit({
    type: "partial",
    field: "currency",
    value: raw.amount.currency,
    confidence: raw.confidence,
  });
  emit({
    type: "partial",
    field: "date",
    value: raw.occurredAt,
    confidence: raw.confidence,
  });
  emit({
    type: "partial",
    field: "kind",
    value: raw.kind,
    confidence: raw.confidence,
  });
  if (raw.categoryHint) {
    emit({
      type: "partial",
      field: "category",
      value: raw.categoryHint,
      confidence: raw.confidence,
    });
  }
  if (raw.destinationApp) {
    emit({
      type: "partial",
      field: "destinationApp",
      value: raw.destinationApp,
      confidence: raw.confidence,
    });
  }

  // ─── Validate ───────────────────────────────────────────────────────
  emit({ type: "stage", stage: "validating" });
  const validated = validateExtraction(raw);

  if (validated.output.confidence < OCR_CONFIDENCE_THRESHOLD) {
    console.error("[ocr/pipeline-stream] low_confidence_final", {
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
      speculation,
    };
  }

  return {
    ok: true,
    data: { ...validated.output, modelUsed },
    issues: validated.issues,
    speculation,
  };
}
