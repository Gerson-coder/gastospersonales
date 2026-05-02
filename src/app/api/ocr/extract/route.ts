import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to write receipts + storage.objects without exposing them via RLS-bound clients
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { extractFromImage } from "@/lib/ocr";
import type { ExtractedReceipt, OcrModel, OcrSource } from "@/lib/ocr/types";
import type { Currency } from "@/lib/supabase/types";

// Runtime-only: uses Buffer, crypto.randomUUID, and the OpenAI fetch.
// Force Node runtime so we never get accidentally pushed onto Edge,
// and force dynamic so Next never tries to prerender or statically
// analyze this route at build time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ocr/extract
 *
 * Body: { imageBase64: string }
 *   Either a `data:image/<jpeg|png|webp>;base64,...` URL or a raw
 *   base64 string (treated as JPEG by default).
 *
 * Response:
 *   200 ok=true       → { ok: true,  data: ExtractedReceipt, issues: [] }
 *   200 LOW_CONF      → { ok: false, error: { kind, partial } }
 *   400 INVALID_IMAGE → { ok: false, error }
 *   401 unauth        → { error: "Sesión expirada." }
 *   413 too large     → { error: "..." }
 *   429 rate-limited  → { error: "..." }
 *   500 storage fail  → { error: "..." }
 *   502 model fail    → { ok: false, error }
 *   503 transient     → { ok: false, error }
 *
 * Side effects (always, even on failure):
 *   - Upload to Supabase Storage `receipts` bucket at
 *     `{user_id}/{receipt_id}.jpg`.
 *   - Insert a `receipts` row with ocr_status 'completed' or 'failed'.
 *     Both the structured fields (parsed_*) and the raw JSON (ocr_raw)
 *     are stored — structured for queries, raw for audit/reprocess.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Cost-control rate limits — kept tight while we measure real usage.
const RATE_LIMIT_PER_MINUTE = 3;
const RATE_LIMIT_PER_DAY = 50;

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

async function checkOcrRateLimit(
  userId: string,
): Promise<{ ok: boolean; reason?: "per_minute" | "per_day" }> {
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

export async function POST(request: Request) {
  // ─── 1. Auth ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  // ─── 2. Body parse + image validation ───────────────────────────────
  let body: { imageBase64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
    return NextResponse.json({ error: "Falta imageBase64." }, { status: 400 });
  }

  const parsed = parseImageInput(body.imageBase64);
  if (!parsed) {
    return NextResponse.json(
      { error: "Imagen inválida. Solo se aceptan JPEG, PNG o WebP." },
      { status: 400 },
    );
  }

  if (parsed.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "La imagen es demasiado grande (máximo 10 MB)." },
      { status: 413 },
    );
  }

  // ─── 3. Rate limit ──────────────────────────────────────────────────
  const rateLimit = await checkOcrRateLimit(user.id);
  if (!rateLimit.ok) {
    const message =
      rateLimit.reason === "per_minute"
        ? "Demasiadas extracciones seguidas. Espera un minuto."
        : "Has alcanzado el límite diario de extracciones. Intenta mañana.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  // ─── 4. Upload to Storage ───────────────────────────────────────────
  const admin = createAdminClient();
  const receiptId = crypto.randomUUID();
  const imagePath = `${user.id}/${receiptId}.jpg`;
  const buffer = Buffer.from(parsed.base64.replace(/[\r\n]/g, ""), "base64");

  const { error: uploadErr } = await admin.storage
    .from("receipts")
    .upload(imagePath, buffer, {
      contentType: parsed.mime,
      upsert: false,
    });
  if (uploadErr) {
    console.error("[ocr/api] storage_upload_failed", {
      message: uploadErr.message,
    });
    return NextResponse.json(
      { error: "No pudimos guardar la imagen. Intenta de nuevo." },
      { status: 500 },
    );
  }

  // ─── 5. Run OCR pipeline ────────────────────────────────────────────
  const result = await extractFromImage(body.imageBase64);

  // ─── 6. Persist + respond ───────────────────────────────────────────
  if (result.ok) {
    await persistReceipt({
      receiptId,
      userId: user.id,
      imagePath,
      source: result.data.source,
      confidence: result.data.confidence,
      parsedMerchant: result.data.counterparty?.name ?? null,
      parsedTotalMinor: result.data.amount.minor,
      parsedCurrency: result.data.amount.currency,
      parsedOccurredAt: result.data.occurredAt,
      rawJson: result.data as unknown as Record<string, unknown>,
      modelUsed: result.data.modelUsed,
      status: "completed",
      errorMessage: null,
    });

    const enriched: ExtractedReceipt = { ...result.data, receiptId };
    return NextResponse.json({
      ok: true,
      data: enriched,
      issues: result.issues,
    });
  }

  // Error paths — always persist a row for audit.
  const err = result.error;

  if (err.kind === "LOW_CONFIDENCE") {
    const partial = err.partial;
    await persistReceipt({
      receiptId,
      userId: user.id,
      imagePath,
      source: partial.source ?? "unknown",
      confidence: partial.confidence ?? 0,
      parsedMerchant: partial.counterparty?.name ?? null,
      parsedTotalMinor: partial.amount?.minor ?? null,
      parsedCurrency: partial.amount?.currency ?? null,
      parsedOccurredAt: partial.occurredAt ?? null,
      rawJson: partial as unknown as Record<string, unknown>,
      modelUsed: partial.modelUsed ?? "gpt-4o-mini",
      status: "failed",
      errorMessage: "low_confidence",
    });
    return NextResponse.json({
      ok: false,
      error: {
        kind: "LOW_CONFIDENCE",
        partial: { ...partial, receiptId },
      },
    });
  }

  // INVALID_IMAGE / MODEL_FAILURE — stub row so the storage object is
  // tied to a receipt for the cleanup cron.
  await persistReceipt({
    receiptId,
    userId: user.id,
    imagePath,
    source: "unknown",
    confidence: 0,
    parsedMerchant: null,
    parsedTotalMinor: null,
    parsedCurrency: null,
    parsedOccurredAt: null,
    rawJson: { error: err },
    modelUsed: "gpt-4o-mini",
    status: "failed",
    errorMessage: err.kind,
  });

  if (err.kind === "INVALID_IMAGE") {
    return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  return NextResponse.json(
    { ok: false, error: err },
    { status: err.retryable ? 503 : 502 },
  );
}
