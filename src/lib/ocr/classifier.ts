import "server-only";

import { callVisionModel, type VisionUsage } from "./client";
import { CLASSIFIER_PROMPT } from "./prompts/classifier";
import { classificationSchema, type Classification } from "./types";

/**
 * First stage of the OCR pipeline.
 *
 * Classifies a receipt image into one of the known sources (yape /
 * plin / bbva / bcp / unknown) so the upstream dispatcher can pick the
 * right specialized extractor prompt.
 *
 * Tuning rationale:
 *   - Always uses `gpt-4o-mini`. Classification is a pattern-matching
 *     task on UI screenshots; 4o adds no measurable lift here for ~10×
 *     the cost. Even when the full extractor escalates to 4o, the
 *     classifier stays on mini.
 *   - `imageDetail: "auto"` — let the model decide. Initial tuning
 *     used "low" (512×512) for cost; real-world testing showed it
 *     blurred small wordmarks (Yape's bottom banner, Plin's bubble
 *     logo) enough to misclassify. "auto" sends a ~768px tile when
 *     useful and falls back to "low" for clearly small images, giving
 *     us logo recognition without forcing high detail on every call.
 *   - `maxTokens: 80` — the response is `{"source":"yape","confidence":1}`,
 *     which is ~30 tokens. 80 leaves margin without bloat.
 *   - `timeoutMs: 15_000` — classification is fast (~800ms typical).
 *     A 15s ceiling fails fast so the API route can return 5xx promptly
 *     instead of hanging the user for 30s.
 *
 * On any failure (timeout, schema reject, malformed JSON) the caller
 * receives the `OcrPipelineError` from the client wrapper. The pipeline
 * entry point in `index.ts` is responsible for deciding whether to
 * retry, fall back to "unknown", or surface the error.
 */
export async function classifyReceipt(
  imageBase64: string,
  opts: { onUsage?: (u: VisionUsage) => void } = {},
): Promise<Classification> {
  return callVisionModel({
    model: "gpt-4o-mini",
    userPrompt: CLASSIFIER_PROMPT,
    imageBase64,
    schema: classificationSchema,
    imageDetail: "auto",
    maxTokens: 80,
    timeoutMs: 15_000,
    onUsage: opts.onUsage,
  });
}
