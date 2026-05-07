import "server-only";

import { callVisionModel, type VisionUsage } from "../client";
import { YAPE_PROMPT } from "../prompts/yape";
import { llmOutputSchema, type LlmOutput, type OcrModel } from "../types";

/**
 * Yape extractor.
 *
 * Yape screenshots are minimal: bold amount on top, short counterparty
 * line, small operation code, optional memo. Layout is identical across
 * host banks (BCP, Interbank, Scotiabank, BBVA, Mibanco) because it's
 * the Yape app UI rendered by all of them.
 *
 * Tuning:
 *   - `imageDetail: "low"` — Yape UI is high contrast, big fonts. The
 *     512×512 internal crop OpenAI applies on `low` keeps everything
 *     readable and saves ~3× on vision tokens vs `auto`.
 *   - `maxTokens: 600` — output is ~250 tokens with rawText included.
 *     600 leaves margin for chatty memos.
 *   - `timeoutMs: 25_000` — same as other extractors. 4o (escalation
 *     path) is slower than mini, so the budget covers both.
 */
export async function extractYape(
  imageBase64: string,
  opts: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
    signal?: AbortSignal;
  } = {},
): Promise<LlmOutput> {
  return callVisionModel({
    model: opts.model ?? "gpt-4o-mini",
    userPrompt: YAPE_PROMPT,
    imageBase64,
    schema: llmOutputSchema,
    imageDetail: "low",
    maxTokens: 600,
    timeoutMs: 25_000,
    onUsage: opts.onUsage,
    signal: opts.signal,
  });
}
