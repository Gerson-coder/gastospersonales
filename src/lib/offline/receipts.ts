"use client";

/**
 * Pending OCR receipts queue (Fase 3).
 *
 * Mirrors the pattern in `./pending.ts` (transactions queue) but for
 * the OCR pipeline:
 *
 *   user shares image offline                   online again
 *           │                                          │
 *           ▼                                          ▼
 *   enqueuePendingReceipt()              flushPendingReceipts()
 *   status: "pending"                              │
 *                                                  ▼
 *                                        markReceiptProcessing
 *                                                  │
 *                                                  ▼
 *                                        POST /api/ocr/extract
 *                                                  │
 *                                  success ◄───────┴──────► failure
 *                                      │                       │
 *                                      ▼                       ▼
 *                                markReceiptReady       markReceiptFailed
 *                                (awaiting review)    (user retries / discards)
 *                                      │
 *                                      ▼
 *                                  /receipt loads it
 *                                  user reviews + saves
 *                                      │
 *                                      ▼
 *                                  removePendingReceipt
 *
 * Why a separate module from `pending.ts` (transactions):
 *   - Different lifecycle: receipts have a `ready` state (awaiting
 *     human review) that transactions don't have.
 *   - Different replay mechanics: transactions hit Supabase directly;
 *     receipts hit our `/api/ocr/extract` route which delegates to
 *     OpenAI.
 *   - Keeping them apart lets the status pill show two distinct
 *     counters and avoids mixing concepts in error reporting.
 */

import {
  offlineDb,
  type PendingReceiptRow,
  type PendingReceiptStatus,
} from "./db";

/** Fired whenever the receipts queue mutates. Listeners (the status
 *  pill, the receipt-page idle UI) re-read state on this. */
export const RECEIPT_CHANGED_EVENT = "kane:receipt:changed";

/** Prefix used on local-only ids — distinct from transactions
 *  (`local-`) so logs are unambiguous. */
export const LOCAL_RECEIPT_PREFIX = "local-receipt-";

function emitReceiptChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RECEIPT_CHANGED_EVENT));
}

function newLocalReceiptId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${LOCAL_RECEIPT_PREFIX}${crypto.randomUUID()}`;
  }
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${LOCAL_RECEIPT_PREFIX}${rand()}-${rand()}`;
}

// ─── Enqueue ────────────────────────────────────────────────────────

/**
 * Stash a captured receipt image so the sync engine can process it
 * once we're back online. Returns the generated `localId` so the
 * caller can correlate the queued row with the in-flow toast.
 *
 * Caller is responsible for compressing the image first
 * (`compressImageToDataUrl`) — we don't validate size here, but
 * IndexedDB quota will reject very large blobs.
 */
export async function enqueuePendingReceipt(input: {
  imageDataUrl: string;
  mime: string;
  fileName: string;
}): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("[offline] enqueuePendingReceipt called on server");
  }
  const localId = newLocalReceiptId();
  const row: PendingReceiptRow = {
    localId,
    status: "pending",
    imageDataUrl: input.imageDataUrl,
    mime: input.mime,
    fileName: input.fileName,
    createdAt: Date.now(),
    attempts: 0,
  };
  await offlineDb().pendingReceipts.put(row);
  emitReceiptChanged();
  return localId;
}

// ─── Read ────────────────────────────────────────────────────────────

export async function listPendingReceipts(): Promise<PendingReceiptRow[]> {
  if (typeof window === "undefined") return [];
  try {
    return await offlineDb().pendingReceipts.orderBy("createdAt").toArray();
  } catch (err) {
    console.warn("[offline] listPendingReceipts failed:", err);
    return [];
  }
}

/**
 * Receipts the sync engine has already processed and are now waiting
 * for the user to review + save. The /receipt page loads these on
 * mount so the user can pick up where the auto-OCR left off.
 */
export async function listReadyReceipts(): Promise<PendingReceiptRow[]> {
  if (typeof window === "undefined") return [];
  try {
    return await offlineDb()
      .pendingReceipts.where("status")
      .equals("ready" satisfies PendingReceiptStatus)
      .sortBy("createdAt");
  } catch {
    return [];
  }
}

export async function getPendingReceipt(
  localId: string,
): Promise<PendingReceiptRow | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    return await offlineDb().pendingReceipts.get(localId);
  } catch {
    return undefined;
  }
}

/**
 * Quick counts for the status pill. Returns counters by lifecycle so
 * the pill can render distinct states ("3 boletas por procesar" vs
 * "1 boleta lista para revisar").
 */
export async function countPendingReceipts(): Promise<{
  /** `pending` + `processing` + `failed` — items the user can't yet act on. */
  inFlight: number;
  /** `ready` — items waiting for user review + save. */
  ready: number;
}> {
  if (typeof window === "undefined") return { inFlight: 0, ready: 0 };
  try {
    const all = await offlineDb().pendingReceipts.toArray();
    let inFlight = 0;
    let ready = 0;
    for (const r of all) {
      if (r.status === "ready") ready += 1;
      else inFlight += 1;
    }
    return { inFlight, ready };
  } catch {
    return { inFlight: 0, ready: 0 };
  }
}

// ─── Mutate ──────────────────────────────────────────────────────────

export async function markReceiptProcessing(localId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingReceipts.get(localId);
    if (!row) return;
    await db.pendingReceipts.put({
      ...row,
      status: "processing",
      attempts: row.attempts + 1,
      lastError: undefined,
    });
    emitReceiptChanged();
  } catch (err) {
    console.warn("[offline] markReceiptProcessing failed:", err);
  }
}

export async function markReceiptReady(
  localId: string,
  result: unknown,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingReceipts.get(localId);
    if (!row) return;
    await db.pendingReceipts.put({
      ...row,
      status: "ready",
      result,
      lastError: undefined,
    });
    emitReceiptChanged();
  } catch (err) {
    console.warn("[offline] markReceiptReady failed:", err);
  }
}

export async function markReceiptFailed(
  localId: string,
  errorMessage: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingReceipts.get(localId);
    if (!row) return;
    await db.pendingReceipts.put({
      ...row,
      status: "failed",
      lastError: errorMessage,
    });
    emitReceiptChanged();
  } catch (err) {
    console.warn("[offline] markReceiptFailed failed:", err);
  }
}

/** Reset a `failed` receipt back to `pending` so the next sync picks
 *  it up. Called from the retry sheet. */
export async function retryReceipt(localId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingReceipts.get(localId);
    if (!row) return;
    await db.pendingReceipts.put({
      ...row,
      status: "pending",
      lastError: undefined,
    });
    emitReceiptChanged();
  } catch (err) {
    console.warn("[offline] retryReceipt failed:", err);
  }
}

/** Drop a receipt from the queue — called after the user reviews +
 *  saves a `ready` row, or explicitly discards a `failed` one. */
export async function removePendingReceipt(localId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await offlineDb().pendingReceipts.delete(localId);
    emitReceiptChanged();
  } catch (err) {
    console.warn("[offline] removePendingReceipt failed:", err);
  }
}

export type { PendingReceiptRow, PendingReceiptStatus };
