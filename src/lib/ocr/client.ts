import "server-only";

import type { z } from "zod";

import { serverEnv } from "@/lib/env";

/**
 * Thin OpenAI Vision client.
 *
 * Why a custom wrapper instead of the `openai` SDK:
 *   - Zero new dependency (less bundle surface, less to audit, less to
 *     keep updated against CVEs).
 *   - Total control over timeout, retry, headers — we'd have wrapped
 *     the SDK anyway to enforce those.
 *   - The /v1/chat/completions REST API is stable; we trade "auto-
 *     update breaking changes" for "explicit version pinning by
 *     reading the docs ourselves".
 *
 * Contract:
 *   - All callers go through `callVisionModel(...)`.
 *   - Output is JSON-only (`response_format: json_object`), validated
 *     against the caller's Zod schema before returning. Anything that
 *     doesn't parse → throws `OcrPipelineError` with `retryable: true`.
 *   - 1 retry on 5xx / timeout / schema-reject with 500ms backoff.
 *     4xx never retries (auth, malformed payload — won't fix itself).
 *   - `temperature: 0` for deterministic extraction.
 *
 * NOTE: the prompt MUST mention "JSON" (or set up a system message
 * that does) — OpenAI rejects `response_format: json_object` otherwise.
 * That's a prompt-layer concern, not this module's.
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 500;
const DEFAULT_MAX_TOKENS = 800;

export type OcrPipelineErrorKind =
  | "MISSING_KEY"      // OPENAI_API_KEY not configured
  | "TIMEOUT"          // request exceeded timeoutMs
  | "HTTP_5XX"         // OpenAI server error
  | "HTTP_4XX"         // auth / malformed / quota
  | "EMPTY_RESPONSE"   // model returned no content
  | "INVALID_JSON"     // content was not valid JSON
  | "SCHEMA_REJECT";   // valid JSON but failed Zod validation

export class OcrPipelineError extends Error {
  constructor(
    public readonly kind: OcrPipelineErrorKind,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OcrPipelineError";
  }
}

export interface VisionUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CallVisionModelOpts<T> {
  model: "gpt-4o-mini" | "gpt-4o";
  /** Optional system message. Useful for setting role + JSON contract. */
  systemPrompt?: string;
  /** User-facing prompt. Sent alongside the image in the same message. */
  userPrompt: string;
  /** Raw base64 OR a `data:image/...;base64,...` URL. We normalize. */
  imageBase64: string;
  /** Zod schema the model output is validated against. */
  schema: z.ZodType<T>;
  /** `auto` lets the model decide. `low` cuts cost ~3×, fine for clean
   *  screenshots like Yape/Plin. `high` for blurry/dense receipts. */
  imageDetail?: "auto" | "low" | "high";
  maxTokens?: number;
  timeoutMs?: number;
  /** Called once per attempt with token usage. Use for cost telemetry. */
  onUsage?: (usage: VisionUsage) => void;
  /**
   * External abort signal. Linked to the per-attempt timeout controller
   * so the upstream caller (e.g. the SSE route on client disconnect, or
   * the speculative-Yape canceller) can drop the in-flight OpenAI fetch
   * without waiting for the timeout. AbortError is surfaced as
   * `OcrPipelineError("TIMEOUT", ...)` to keep the retry path uniform.
   */
  signal?: AbortSignal;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export async function callVisionModel<T>(
  opts: CallVisionModelOpts<T>,
): Promise<T> {
  if (!serverEnv.OPENAI_API_KEY) {
    throw new OcrPipelineError(
      "MISSING_KEY",
      "OPENAI_API_KEY is not set — OCR pipeline cannot run",
      false,
    );
  }

  const dataUrl = opts.imageBase64.startsWith("data:")
    ? opts.imageBase64
    : `data:image/jpeg;base64,${opts.imageBase64}`;

  const messages: Array<unknown> = [];
  if (opts.systemPrompt) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  messages.push({
    role: "user",
    content: [
      { type: "text", text: opts.userPrompt },
      {
        type: "image_url",
        image_url: { url: dataUrl, detail: opts.imageDetail ?? "auto" },
      },
    ],
  });

  const requestBody = JSON.stringify({
    model: opts.model,
    messages,
    response_format: { type: "json_object" },
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0,
  });

  const attempt = async (): Promise<T> => {
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    // Forward an external abort (caller cancellation) onto the same
    // controller. We don't replace the timeout — both reasons to abort
    // funnel through one signal so the fetch sees a single cancellation.
    const onExternalAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) {
        controller.abort();
      } else {
        opts.signal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    try {
      const res = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });

      if (!res.ok) {
        const retryable = res.status >= 500;
        throw new OcrPipelineError(
          retryable ? "HTTP_5XX" : "HTTP_4XX",
          `OpenAI ${res.status} ${res.statusText}`,
          retryable,
        );
      }

      const json = (await res.json()) as OpenAIChatResponse;

      if (json.usage && opts.onUsage) {
        opts.onUsage({
          promptTokens: json.usage.prompt_tokens ?? 0,
          completionTokens: json.usage.completion_tokens ?? 0,
        });
      }

      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new OcrPipelineError(
          "EMPTY_RESPONSE",
          "model returned no content",
          true,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new OcrPipelineError(
          "INVALID_JSON",
          "model returned non-JSON content",
          true,
        );
      }

      const result = opts.schema.safeParse(parsed);
      if (!result.success) {
        // Issues are logged server-side; we don't surface them to the
        // client to avoid leaking schema internals.
        console.error("[ocr/client] schema_reject", {
          model: opts.model,
          issueCount: result.error.issues.length,
        });
        throw new OcrPipelineError(
          "SCHEMA_REJECT",
          "model output did not match schema",
          true,
        );
      }

      return result.data;
    } catch (err) {
      // AbortController throws DOMException with name "AbortError" on
      // timeout — normalize to our error type so the caller can branch.
      if (err instanceof Error && err.name === "AbortError") {
        throw new OcrPipelineError(
          "TIMEOUT",
          `OpenAI request exceeded ${timeoutMs}ms`,
          true,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
      if (opts.signal) {
        opts.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof OcrPipelineError && err.retryable) {
      await sleep(RETRY_DELAY_MS);
      return await attempt();
    }
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
