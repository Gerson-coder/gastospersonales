import "server-only";

import { callVisionModel, type VisionUsage } from "../client";
import { PLIN_PROMPT } from "../prompts/plin";
import { llmOutputSchema, type LlmOutput, type OcrModel } from "../types";

/**
 * Plin extractor.
 *
 * Plin screenshots are similar in density to Yape — minimal UI, bold
 * amount, short metadata block. The 11-character alphanumeric code is
 * the main differentiator from Yape's 9-digit code.
 *
 * Tuning matches Yape (low detail, 600 max tokens, 25s timeout) since
 * both are sparse mobile-wallet receipts.
 */
export async function extractPlin(
  imageBase64: string,
  opts: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
    signal?: AbortSignal;
  } = {},
): Promise<LlmOutput> {
  return callVisionModel({
    model: opts.model ?? "gpt-4o-mini",
    userPrompt: PLIN_PROMPT,
    imageBase64,
    schema: llmOutputSchema,
    imageDetail: "low",
    maxTokens: 600,
    timeoutMs: 25_000,
    onUsage: opts.onUsage,
    signal: opts.signal,
  });
}
