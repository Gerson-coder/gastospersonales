import "server-only";

import { callVisionModel, type VisionUsage } from "../client";
import { BBVA_PROMPT } from "../prompts/bbva";
import { llmOutputSchema, type LlmOutput, type OcrModel } from "../types";

/**
 * BBVA Peru extractor.
 *
 * BBVA "Constancia de operación" screens are denser than Yape/Plin:
 * source account, destination account/CCI, beneficiary, optional
 * concept, operation number, timestamp. Aun con esa densidad, el
 * cliente ya comprime la imagen a 1024×1024 antes de subirla y la UI
 * de BBVA usa fuentes legibles; `imageDetail: "low"` reduce el costo
 * ~3× sin afectar el parse en los tests reales.
 *
 * `maxTokens: 800` accommodates the heavier rawText payload (a
 * constancia can have 15-20 visible labels vs Yape's ~6).
 */
export async function extractBbva(
  imageBase64: string,
  opts: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
    signal?: AbortSignal;
  } = {},
): Promise<LlmOutput> {
  return callVisionModel({
    model: opts.model ?? "gpt-4o-mini",
    userPrompt: BBVA_PROMPT,
    imageBase64,
    schema: llmOutputSchema,
    imageDetail: "low",
    maxTokens: 800,
    timeoutMs: 25_000,
    onUsage: opts.onUsage,
    signal: opts.signal,
  });
}
