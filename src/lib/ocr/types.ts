/**
 * OCR pipeline types + Zod schemas.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the shape of an
 * extracted receipt. All schemas are Zod-first: the runtime validators
 * are declared, and TypeScript types are inferred via `z.infer<>`. This
 * way the validator and the type CAN'T drift out of sync — adding a
 * field to the schema instantly widens the type, and removing one
 * narrows it.
 *
 * Why runtime validation matters here: the LLM is an untrusted source.
 * It can hallucinate fields, return malformed JSON, or invent currency
 * codes we don't support. EVERY LLM output goes through `llmOutputSchema`
 * before being persisted or sent to the client. If the validator
 * rejects, the caller treats it as `MODEL_FAILURE` and escalates to 4o.
 *
 * Three schemas, three audiences:
 *   - `classificationSchema`  — what the classifier model returns
 *                               (source + confidence only, lightweight).
 *   - `llmOutputSchema`       — what each per-source extractor returns.
 *                               No `receiptId` or `modelUsed` yet — the
 *                               server adds those after the DB insert.
 *   - `extractedReceiptSchema`— the final shape the client receives.
 *                               LLM output + server-assigned fields.
 *
 * Keep `OCR_SOURCES` and `OCR_MODELS` in sync with the CHECK constraints
 * in supabase/migrations/00022_receipts.sql — adding a new source here
 * without an `ALTER TABLE ... CHECK` will fail the DB insert at runtime.
 */
import { z } from "zod";

// Below this, the API route re-runs extraction with GPT-4o. Above, the
// mini result is trusted and returned to the client.
export const OCR_CONFIDENCE_THRESHOLD = 0.6;

// Whitelist of source apps/banks we have a specialized extractor for.
// `unknown` is the catch-all that triggers the generic prompt + lower
// confidence ceiling.
export const OCR_SOURCES = [
  "yape",
  "plin",
  "bbva",
  "bcp",
  "unknown",
] as const;

export const OCR_MODELS = ["gpt-4o-mini", "gpt-4o"] as const;

// Reusing the project's `kind` convention (see src/lib/data/transactions.ts)
// so the OCR output drops straight into the Capture form's draft state
// without any remap step.
export const ocrSourceSchema = z.enum(OCR_SOURCES);
export const ocrModelSchema = z.enum(OCR_MODELS);
export const currencySchema = z.enum(["PEN", "USD"]);
export const kindSchema = z.enum(["expense", "income"]);

export const amountSchema = z.object({
  // Minor units (céntimos for PEN, cents for USD). Always int ≥ 0.
  // The `kind` field on the parent carries the sign; amount itself is
  // unsigned to match the DB column.
  minor: z.number().int().min(0),
  currency: currencySchema,
});

export const counterpartySchema = z.object({
  name: z.string().min(1),
  // DNI, RUC, account mask — whatever document the receipt shows for
  // the other party. Free-form because formats vary (8-digit DNI, 11-
  // digit RUC, "Cta. ****1234" mask, etc.).
  document: z.string().optional(),
});

// Output of the lightweight classifier model. Used to dispatch to the
// correct specialized extractor. `confidence` here is the classifier's
// confidence in the SOURCE label, not the eventual extraction.
export const classificationSchema = z.object({
  source: ocrSourceSchema,
  confidence: z.number().min(0).max(1),
});

// Output of an extractor. Untrusted — all fields validated, no extras
// allowed. `rawText` is always populated so the UI has a fallback to
// show when structured fields are partial.
export const llmOutputSchema = z
  .object({
    source: ocrSourceSchema,
    confidence: z.number().min(0).max(1),
    kind: kindSchema,
    amount: amountSchema,
    // ISO 8601. The extractor is responsible for converting whatever
    // local format the receipt uses (e.g. "21 Mar 2026, 14:32") into a
    // UTC ISO string before returning.
    occurredAt: z.iso.datetime(),
    counterparty: counterpartySchema.optional(),
    // Operation code / transfer ID. Validated against per-source regex
    // in src/lib/ocr/validators/operation-codes.ts; failing validation
    // does NOT reject the parse — it only lowers confidence.
    reference: z.string().optional(),
    memo: z.string().optional(),
    rawText: z.string(),
  })
  .strict();

// Final shape returned to the client. Server enriches the LLM output
// with the persisted receipt id and the model that produced it.
export const extractedReceiptSchema = llmOutputSchema.extend({
  receiptId: z.string().uuid(),
  modelUsed: ocrModelSchema,
});

// Discriminated union — the API route returns one of these on failure
// modes the OCR module itself can produce. Transport-layer errors
// (auth, rate-limit, storage) are handled by the API route directly
// and don't pass through this type.
export const ocrErrorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("INVALID_IMAGE"),
    message: z.string(),
  }),
  z.object({
    kind: z.literal("MODEL_FAILURE"),
    // True when retrying with the same input might succeed (5xx,
    // timeout). False for permanent failures (malformed JSON output
    // from the model after both attempts).
    retryable: z.boolean(),
  }),
  z.object({
    kind: z.literal("LOW_CONFIDENCE"),
    // Whatever the model managed to extract. The UI uses this to
    // pre-fill the form fields it CAN, then asks the user to fill the
    // rest manually.
    partial: extractedReceiptSchema.partial(),
  }),
]);

export type OcrSource = z.infer<typeof ocrSourceSchema>;
export type OcrModel = z.infer<typeof ocrModelSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type TxKind = z.infer<typeof kindSchema>;
export type Amount = z.infer<typeof amountSchema>;
export type Counterparty = z.infer<typeof counterpartySchema>;
export type Classification = z.infer<typeof classificationSchema>;
export type LlmOutput = z.infer<typeof llmOutputSchema>;
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;
export type OcrError = z.infer<typeof ocrErrorSchema>;
