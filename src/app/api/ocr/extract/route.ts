// eslint-disable-next-line no-restricted-imports -- service-role required to write receipts + storage.objects without exposing them via RLS-bound clients
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  extractFromImageStreaming,
  type SpeculationTelemetry,
} from "@/lib/ocr";
import {
  encodeSseEvent,
  type OcrStreamEvent,
} from "@/lib/ocr/stream-events";
import type { ExtractedReceipt, OcrModel, OcrSource } from "@/lib/ocr/types";
import type { Currency } from "@/lib/supabase/types";

// Runtime-only: uses Buffer, crypto.randomUUID, and the OpenAI fetch.
// Force Node runtime so we never get accidentally pushed onto Edge,
// and force dynamic so Next never tries to prerender or statically
// analyze this route at build time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ocr/extract — Server-Sent Events
 *
 * Body: { imageBase64: string }
 *   Either a `data:image/<jpeg|png|webp>;base64,...` URL or a raw
 *   base64 string (treated as JPEG by default).
 *
 * Response: `text/event-stream`. The wire format is defined in
 * `src/lib/ocr/stream-events.ts`. The endpoint emits, in order on the
 * happy path:
 *
 *   stage(uploading) → stage(classifying) → classified(...)
 *     → stage(extracting) → partial(...) × N → stage(validating)
 *     → stage(persisting) → result(ok=true) → done
 *
 * Recoverable model failures (LOW_CONFIDENCE, RATE_LIMIT, AUTH, etc.)
 * arrive as `result(ok=false, error)`. Hard transport errors are
 * surfaced as `error(message)`. Both flavors are followed by `done`.
 *
 * Side effects (always, even on failure where possible):
 *   - Upload to Supabase Storage `receipts` bucket at
 *     `{user_id}/{receipt_id}.jpg`.
 *   - Insert a `receipts` row with ocr_status 'completed' or 'failed'.
 *     Both the structured fields and the raw JSON (incl. speculation
 *     telemetry) are stored — structured for queries, raw for audit.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Cost-control rate limits — kept tight while we measure real usage.
const RATE_LIMIT_PER_MINUTE = 3;
const RATE_LIMIT_PER_DAY = 50;

// SSE keep-alive interval. 15s is well under typical proxy idle
// timeouts (Vercel ~30s, nginx default 60s) and keeps the browser
// from closing the connection during a slow OpenAI call.
const KEEPALIVE_MS = 15_000;

interface ParsedImage {
  mime: string;
  base64: string;
  byteLength: number;
}

function parseImageInput(input: string): ParsedImage | null {
  const dataUrlMatch = input.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  let mime: string;
  let base64: string;

  if (dataUrlMatch) {
    mime = dataUrlMatch[1].toLowerCase();
    base64 = dataUrlMatch[2];
  } else {
    mime = "image/jpeg";
    base64 = input;
  }

  if (!ALLOWED_MIMES.has(mime)) return null;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) return null;

  const byteLength = Math.floor(
    (base64.replace(/[\r\n]/g, "").length * 3) / 4,
  );
  return { mime, base64, byteLength };
}

interface RateLimitVerdict {
  ok: boolean;
  reason?: "per_minute" | "per_day";
}

async function checkOcrRateLimit(userId: string): Promise<RateLimitVerdict> {
  const admin = createAdminClient();
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [perMin, perDay] = await Promise.all([
    admin
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneMinAgo),
    admin
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo),
  ]);

  if ((perMin.count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, reason: "per_minute" };
  }
  if ((perDay.count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return { ok: false, reason: "per_day" };
  }
  return { ok: true };
}

interface UploadResult {
  ok: boolean;
  errorMessage?: string;
}

async function uploadReceiptToStorage(
  imagePath: string,
  buffer: Buffer,
  mime: string,
): Promise<UploadResult> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("receipts")
    .upload(imagePath, buffer, {
      contentType: mime,
      upsert: false,
    });
  if (error) {
    return { ok: false, errorMessage: error.message };
  }
  return { ok: true };
}

interface PersistOpts {
  receiptId: string;
  userId: string;
  imagePath: string;
  source: OcrSource;
  confidence: number;
  parsedMerchant: string | null;
  parsedTotalMinor: number | null;
  parsedCurrency: Currency | null;
  parsedOccurredAt: string | null;
  rawJson: Record<string, unknown>;
  modelUsed: OcrModel;
  status: "completed" | "failed";
  errorMessage: string | null;
}

async function persistReceipt(opts: PersistOpts): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("receipts").insert({
    id: opts.receiptId,
    user_id: opts.userId,
    image_path: opts.imagePath,
    ocr_status: opts.status,
    ocr_raw: opts.rawJson,
    parsed_merchant: opts.parsedMerchant,
    parsed_total_minor: opts.parsedTotalMinor,
    parsed_currency: opts.parsedCurrency,
    parsed_occurred_at: opts.parsedOccurredAt,
    confidence: opts.confidence,
    error_message: opts.errorMessage,
    source: opts.source,
    model_used: opts.modelUsed,
  });
  if (error) {
    console.error("[ocr/api] receipt_insert_failed", { code: error.code });
  }
}

/**
 * Best-effort cleanup. Used when we uploaded the image but then hit a
 * rate-limit / auth error and don't want orphan blobs in storage.
 */
async function bestEffortRemoveUpload(imagePath: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.storage.from("receipts").remove([imagePath]);
  } catch (err) {
    console.error("[ocr/api] storage_cleanup_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function POST(request: Request) {
  // ─── 1. Auth (sync, before opening the stream) ──────────────────────
  // We want to return a JSON 401 here, not a stream — the client can't
  // recover from a missing session by reading SSE frames.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Sesión expirada." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // ─── 2. Body parse + image validation (sync) ────────────────────────
  let body: { imageBase64?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "JSON inválido." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
    return new Response(
      JSON.stringify({ error: "Falta imageBase64." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const parsed = parseImageInput(body.imageBase64);
  if (!parsed) {
    return new Response(
      JSON.stringify({
        error: "Imagen inválida. Solo se aceptan JPEG, PNG o WebP.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (parsed.byteLength > MAX_IMAGE_BYTES) {
    return new Response(
      JSON.stringify({
        error: "La imagen es demasiado grande (máximo 10 MB).",
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }

  const userId = user.id;
  const imageBase64 = body.imageBase64;
  const receiptId = crypto.randomUUID();
  const imagePath = `${userId}/${receiptId}.jpg`;
  const buffer = Buffer.from(parsed.base64.replace(/[\r\n]/g, ""), "base64");

  // ─── 3. Open the SSE stream ─────────────────────────────────────────
  const encoder = new TextEncoder();
  // External controller propagates client disconnects (request.signal)
  // and stream cancellations (cancel callback below) to the OCR
  // pipeline so in-flight OpenAI fetches can drop.
  const workCtrl = new AbortController();
  if (request.signal.aborted) {
    workCtrl.abort();
  } else {
    request.signal.addEventListener("abort", () => workCtrl.abort(), {
      once: true,
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller already closed (likely client abort) — swallow.
          closed = true;
        }
      };
      const emit = (event: OcrStreamEvent) => {
        safeEnqueue(encoder.encode(encodeSseEvent(event)));
      };
      const emitKeepalive = () => {
        // SSE comment line — clients ignore, proxies see traffic.
        safeEnqueue(encoder.encode(":\n\n"));
      };

      const keepaliveHandle = setInterval(emitKeepalive, KEEPALIVE_MS);

      const finish = () => {
        if (closed) return;
        emit({ type: "done" });
        clearInterval(keepaliveHandle);
        try {
          controller.close();
        } catch {
          // already closed — ignore
        }
        closed = true;
      };

      try {
        // ─── 4. Rate-limit + Storage upload in parallel ────────────────
        // The rate-limit check (200–400ms) used to block the upload
        // (~500ms-1s on mobile uploads). Running them in parallel saves
        // ~200–400ms on the average path. On a rate-limited request we
        // wasted an upload — but rate-limit hits are rare (3/min, 50/day)
        // so the trade-off is worth it.
        emit({ type: "stage", stage: "uploading" });

        const [rateLimit, uploadResult] = await Promise.all([
          checkOcrRateLimit(userId),
          uploadReceiptToStorage(imagePath, buffer, parsed.mime),
        ]);

        if (!rateLimit.ok) {
          // Best-effort cleanup of the orphan upload (if it succeeded).
          if (uploadResult.ok) {
            await bestEffortRemoveUpload(imagePath);
          }
          const message =
            rateLimit.reason === "per_minute"
              ? "Demasiadas extracciones seguidas. Espera un minuto."
              : "Has alcanzado el límite diario de extracciones. Intenta mañana.";
          emit({
            type: "result",
            ok: false,
            error: { kind: "RATE_LIMIT", message },
          });
          finish();
          return;
        }

        if (!uploadResult.ok) {
          console.error("[ocr/api] storage_upload_failed", {
            message: uploadResult.errorMessage,
          });
          emit({
            type: "error",
            message: "No pudimos guardar la imagen. Intenta de nuevo.",
          });
          finish();
          return;
        }

        // Bail out early if the client already disconnected during
        // upload — no point hitting OpenAI for a stream nobody is
        // reading.
        if (workCtrl.signal.aborted) {
          finish();
          return;
        }

        // ─── 5. Run streaming OCR pipeline ─────────────────────────────
        const pipelineResult = await extractFromImageStreaming(
          imageBase64,
          emit,
          { signal: workCtrl.signal },
        );

        // If the client aborted mid-flight, don't persist or emit any
        // more — the stream is gone.
        if (workCtrl.signal.aborted) {
          finish();
          return;
        }

        // ─── 6. Persist + emit result ──────────────────────────────────
        emit({ type: "stage", stage: "persisting" });

        if (pipelineResult.ok) {
          await persistReceipt({
            receiptId,
            userId,
            imagePath,
            source: pipelineResult.data.source,
            confidence: pipelineResult.data.confidence,
            parsedMerchant: pipelineResult.data.counterparty?.name ?? null,
            parsedTotalMinor: pipelineResult.data.amount.minor,
            parsedCurrency: pipelineResult.data.amount.currency,
            parsedOccurredAt: pipelineResult.data.occurredAt,
            rawJson: rawJsonWithSpeculation(
              pipelineResult.data,
              pipelineResult.speculation,
            ),
            modelUsed: pipelineResult.data.modelUsed,
            status: "completed",
            errorMessage: null,
          });

          const enriched: ExtractedReceipt = {
            ...pipelineResult.data,
            receiptId,
          };
          emit({ type: "result", ok: true, data: enriched });
          finish();
          return;
        }

        // Error paths — persist a row for audit and emit a typed result.
        const err = pipelineResult.error;

        if (err.kind === "LOW_CONFIDENCE") {
          const partial = err.partial;
          await persistReceipt({
            receiptId,
            userId,
            imagePath,
            source: partial.source ?? "unknown",
            confidence: partial.confidence ?? 0,
            parsedMerchant: partial.counterparty?.name ?? null,
            parsedTotalMinor: partial.amount?.minor ?? null,
            parsedCurrency: partial.amount?.currency ?? null,
            parsedOccurredAt: partial.occurredAt ?? null,
            rawJson: rawJsonWithSpeculation(
              partial,
              pipelineResult.speculation,
            ),
            modelUsed: partial.modelUsed ?? "gpt-4o-mini",
            status: "failed",
            errorMessage: "low_confidence",
          });
          emit({
            type: "result",
            ok: false,
            error: {
              kind: "LOW_CONFIDENCE",
              message:
                "No tenemos suficiente confianza en el resultado. Revisa los datos.",
              partial: { ...partial, receiptId },
            },
          });
          finish();
          return;
        }

        // INVALID_IMAGE / MODEL_FAILURE — stub row so the storage
        // object is tied to a receipt for the cleanup cron.
        await persistReceipt({
          receiptId,
          userId,
          imagePath,
          source: "unknown",
          confidence: 0,
          parsedMerchant: null,
          parsedTotalMinor: null,
          parsedCurrency: null,
          parsedOccurredAt: null,
          rawJson: rawJsonWithSpeculation(
            { error: err },
            pipelineResult.speculation,
          ),
          modelUsed: "gpt-4o-mini",
          status: "failed",
          errorMessage: err.kind,
        });

        if (err.kind === "INVALID_IMAGE") {
          emit({
            type: "result",
            ok: false,
            error: {
              kind: "VALIDATION",
              message: err.message,
            },
          });
        } else {
          // MODEL_FAILURE
          emit({
            type: "result",
            ok: false,
            error: {
              kind: "INTERNAL",
              message: err.retryable
                ? "El servicio de OCR está saturado. Intenta de nuevo en unos segundos."
                : "No pudimos procesar la imagen. Intenta con otra foto.",
            },
          });
        }
        finish();
      } catch (caught) {
        // If the client aborted, this is expected — close cleanly.
        if (workCtrl.signal.aborted) {
          finish();
          return;
        }
        console.error("[ocr/api] unexpected_error", {
          message: caught instanceof Error ? caught.message : String(caught),
        });
        emit({
          type: "error",
          message: "Ocurrió un error inesperado. Intenta de nuevo.",
        });
        finish();
      }
    },
    cancel() {
      // Client disconnected mid-stream. Tell the pipeline to drop its
      // OpenAI fetches.
      workCtrl.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defeat nginx-style proxy buffering on any layer in front of
      // Vercel — without this, frames pile up until the response is
      // complete and the user sees nothing for ~2s.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Merges the speculation telemetry into the raw_json blob so we can
 * compute hit-rate later by querying `receipts.ocr_raw->>speculation`.
 * Keeps the data in the existing column — no schema change needed.
 */
function rawJsonWithSpeculation(
  payload: unknown,
  speculation: SpeculationTelemetry,
): Record<string, unknown> {
  const base =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : { value: payload };
  return { ...base, speculation };
}

