import "server-only";

import { callVisionModel, type VisionUsage } from "../client";
import { GENERIC_PROMPT } from "../prompts/generic";
import { llmOutputSchema, type LlmOutput, type OcrModel } from "../types";

/**
 * Generic fallback extractor for `source: "unknown"`.
 *
 * Used when the classifier doesn't recognize the receipt as one of the
 * known sources (Interbank/Scotia apps, paper receipts, POS prints,
 * physical invoices, etc.). The prompt itself caps confidence at 0.7
 * so the pipeline routes most of these through the LOW_CONFIDENCE path
 * — user reviews + confirms manually.
 *
 * Tuning:
 *   - `imageDetail: "low"` — el client comprime las fotos a 1024×1024
 *     JPEG q80 antes de subirlas, asi que la version que llega al modelo
 *     ya esta normalizada. `low` cuts cost ~3× y para imagenes
 *     pre-comprimidas la perdida de detalle es minima. Si caen muchos
 *     parses con LOW_CONFIDENCE en recibos densos, considerar volver a
 *     `auto` solo para `unknown` (no para Yape/Plin/etc).
 *   - `maxTokens: 1000` — paper receipts/invoices may have many line
 *     items; we want the rawText to capture them in case the user
 *     wants to look at the verbatim text.
 *   - `timeoutMs: 30_000` — full default. Paper receipts can be denser
 *     and slower for the model to process.
 */
export async function extractGeneric(
  imageBase64: string,
  opts: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
  } = {},
): Promise<LlmOutput> {
  return callVisionModel({
    model: opts.model ?? "gpt-4o-mini",
    userPrompt: GENERIC_PROMPT,
    imageBase64,
    schema: llmOutputSchema,
    imageDetail: "low",
    maxTokens: 1000,
    timeoutMs: 30_000,
    onUsage: opts.onUsage,
  });
}
