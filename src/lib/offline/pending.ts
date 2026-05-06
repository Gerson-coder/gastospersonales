"use client";

/**
 * Pending writes queue — public API for the offline write path (Fase 2).
 *
 * Lifecycle of a pending row:
 *
 *   user captures offline                            online again
 *           │                                              │
 *           ▼                                              ▼
 *   enqueueCreateTransaction()                  flushPendingTransactions()
 *   status: "pending"                                      │
 *           │                                              ▼
 *           │                                  markSyncing → replay
 *           │                                              │
 *           │                              success ◄───────┴───────► failure
 *           │                                  │                       │
 *           │                                  ▼                       ▼
 *           │                            removePending()         markFailed()
 *           │                                                          │
 *           │                                                          ▼
 *           │                                                user sees retry sheet
 *
 * Read merge contract:
 *   The data layer's read functions (`listTransactionsByCurrency`,
 *   `listTransactionsWindow`) prepend `pending` rows to the remote
 *   result so the user sees their just-captured movement immediately.
 *   Pending rows carry an id of shape `local-<uuid>` so the UI can flag
 *   them with a "Pendiente" badge and skip RLS-bound operations.
 *
 * Event bus:
 *   Every queue mutation fires `PENDING_CHANGED_EVENT` so reactive
 *   consumers (the SyncStatusPill, the /movements list refresh) update
 *   without polling. Same pattern as `TX_UPSERTED_EVENT` in transactions.
 */

import {
  offlineDb,
  type PendingOperation,
  type PendingStatus,
  type PendingTransactionRow,
} from "./db";

/** Fires whenever the pending queue mutates (enqueue / status change /
 *  remove). Listeners should `await listPendingTransactions()` for the
 *  fresh state instead of trusting the event detail. */
export const PENDING_CHANGED_EVENT = "kane:pending:changed";

/** Prefix used on local-only ids so consumers can tell optimistic rows
 *  apart from server-issued uuids. */
export const LOCAL_ID_PREFIX = "local-";

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

function emitPendingChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT));
}

/** Crypto-safe local id. Falls back to Math.random for ancient Safari
 *  (extremely unlikely path — installed PWAs run on modern Chromium). */
function newLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`;
  }
  // Fallback: Math.random-based v4-shaped id. Not crypto-strong but
  // adequate for a local row identifier (RLS protects all real data).
  const rand = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${LOCAL_ID_PREFIX}${rand()}-${rand()}`;
}

// ─── Enqueue ────────────────────────────────────────────────────────

/**
 * Append a `createTransaction` to the queue. Returns the generated
 * `localId` so the caller can build an optimistic `TransactionView`.
 *
 * `payload` is whatever the data-layer writer received — typically a
 * `TransactionDraft`. We don't validate it here; the sync replay does
 * (because the validation lives in `toInsertPayload`).
 */
export async function enqueueCreateTransaction(
  payload: unknown,
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("[offline] enqueueCreateTransaction called on server");
  }
  const db = offlineDb();
  const localId = newLocalId();
  const row: PendingTransactionRow = {
    localId,
    operation: "createTransaction",
    payload,
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.pendingTransactions.put(row);
  emitPendingChanged();
  return localId;
}

// ─── Read ────────────────────────────────────────────────────────────

/** All queued rows, ordered by `createdAt` ascending — the order they
 *  must replay in to keep balance math consistent. */
export async function listPendingTransactions(): Promise<
  PendingTransactionRow[]
> {
  if (typeof window === "undefined") return [];
  try {
    const db = offlineDb();
    return await db.pendingTransactions.orderBy("createdAt").toArray();
  } catch (err) {
    console.warn("[offline] listPendingTransactions failed:", err);
    return [];
  }
}

/** Fast count for the SyncStatusPill — avoids loading the full payloads
 *  on every event tick. Counts ALL non-removed rows (pending + syncing
 *  + failed), because the pill should surface failed-but-stuck items too. */
export async function countPendingTransactions(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    return await offlineDb().pendingTransactions.count();
  } catch {
    return 0;
  }
}

/** Filter helper used by the failed-rows sheet. */
export async function listFailedPendingTransactions(): Promise<
  PendingTransactionRow[]
> {
  if (typeof window === "undefined") return [];
  try {
    return await offlineDb()
      .pendingTransactions.where("status")
      .equals("failed" satisfies PendingStatus)
      .toArray();
  } catch {
    return [];
  }
}

// ─── Mutate ──────────────────────────────────────────────────────────

export async function markPendingSyncing(localId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingTransactions.get(localId);
    if (!row) return;
    await db.pendingTransactions.put({
      ...row,
      status: "syncing",
      attempts: row.attempts + 1,
      lastError: undefined,
    });
    emitPendingChanged();
  } catch (err) {
    console.warn("[offline] markPendingSyncing failed:", err);
  }
}

export async function markPendingFailed(
  localId: string,
  errorMessage: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingTransactions.get(localId);
    if (!row) return;
    await db.pendingTransactions.put({
      ...row,
      status: "failed",
      lastError: errorMessage,
    });
    emitPendingChanged();
  } catch (err) {
    console.warn("[offline] markPendingFailed failed:", err);
  }
}

/** Reset a `failed` row back to `pending` so the next sync attempt
 *  picks it up. Called from the retry sheet. */
export async function retryPending(localId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const row = await db.pendingTransactions.get(localId);
    if (!row) return;
    await db.pendingTransactions.put({
      ...row,
      status: "pending",
      lastError: undefined,
    });
    emitPendingChanged();
  } catch (err) {
    console.warn("[offline] retryPending failed:", err);
  }
}

/** Remove a row from the queue — called after a successful sync, or
 *  when the user discards a stuck failed row. */
export async function removePending(localId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await offlineDb().pendingTransactions.delete(localId);
    emitPendingChanged();
  } catch (err) {
    console.warn("[offline] removePending failed:", err);
  }
}

/** Re-export the operation type for callers that want to be exhaustive
 *  in switch statements when more operations land in v2.5. */
export type { PendingOperation, PendingStatus, PendingTransactionRow };
