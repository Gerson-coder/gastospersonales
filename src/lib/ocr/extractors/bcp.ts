import "server-only";

import { callVisionModel, type VisionUsage } from "../client";
import { BCP_PROMPT } from "../prompts/bcp";
import { llmOutputSchema, type LlmOutput, type OcrModel } from "../types";

/**
 * BCP extractor.
 *
 * BCP "Constancia" screens have the same density as BBVA constancias —
 * full account context plus operation metadata. Same tuning as BBVA
 * (auto detail, 800 tokens, 25s) for parity.
 *
 * Note: Yape inside the BCP app classifies upstream as "yape" and
 * routes to extractYape, NOT here. This extractor only handles native
 * BCP transfer/payment receipts.
 */
export async function extractBcp(
  imageBase64: string,
  opts: {
    model?: OcrModel;
    onUsage?: (u: VisionUsage) => void;
  } = {},
): Promise<LlmOutput> {
  return callVisionModel({
    model: opts.model ?? "gpt-4o-mini",
    userPrompt: BCP_PROMPT,
    imageBase64,
    schema: llmOutputSchema,
    imageDetail: "auto",
    maxTokens: 800,
    timeoutMs: 25_000,
    onUsage: opts.onUsage,
  });
}
