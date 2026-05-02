import "server-only";

import { callVisionModel, type VisionUsage } from "../client";
import { BBVA_PROMPT } from "../prompts/bbva";
import { llmOutputSchema, type LlmOutput, type OcrModel } from "../types";

/**
 * BBVA Peru extractor.
 *
 * BBVA "Constancia de operación" screens are denser than Yape/Plin:
 * source account, destination account/CCI, beneficiary, optional
 * concept, operation number, timestamp. More text → `imageDetail:
 * "auto"` so the model sees enough resolution to read masked account
 * digits and operation numbers without bloating cost.
 *
 * `maxTokens: 800` accommodates the heavier rawText payload (a
 * constancia can have 15-20 visible labels vs Yape's ~6).
 */
export async function extractBbva(
  imageBase64: string,
  opts: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
  } = {},
): Promise<LlmOutput> {
  return callVisionModel({
    model: opts.model ?? "gpt-4o-mini",
    userPrompt: BBVA_PROMPT,
    imageBase64,
    schema: llmOutputSchema,
    imageDetail: "auto",
    maxTokens: 800,
    timeoutMs: 25_000,
    onUsage: opts.onUsage,
  });
}
