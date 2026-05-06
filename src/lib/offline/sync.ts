"use client";

/**
 * Sync engine — flushes the pending writes queue when connectivity
 * comes back.
 *
 * Design choices:
 *   - **Singleton scheduler**: only one flush in flight at a time. A
 *     concurrent flush would double-post rows on a flaky connection.
 *     `flushInFlight` gates it; subsequent calls are coalesced.
 *   - **Serial replay**: rows are replayed one at a time, in
 *     `createdAt` order. Two reasons: (a) downstream balance math
 *     depends on order; (b) Supabase rate limits frown on burst writes.
 *   - **Failure classification**: a sync attempt fails because of
 *     either a network blip (re-queue as `pending` for next event) or
 *     a semantic rejection (mark `failed` so the user can edit/retry).
 *   - **No automatic retries**: once a row is `failed`, it stays put
 *     until the user explicitly retries via the failed-rows sheet.
 *     Auto-retry on a permanently broken row spams Supabase.
 *
 * Wiring: `useOfflineSync()` (see `src/hooks/use-offline-sync.ts`)
 * calls `installSyncListeners()` once on app mount. After that, the
 * sync engine listens to `online` and `visibilitychange` events and
 * flushes opportunistically. Manual flush is exposed too for the
 * "intentar ahora" button on the status pill.
 */

import { isOfflineError } from "./cache";
import {
  listPendingTransactions,
  markPendingFailed,
  markPendingSyncing,
  removePending,
  PENDING_CHANGED_EVENT,
  type PendingTransactionRow,
} from "./pending";
import {
  listPendingReceipts,
  markReceiptFailed,
  markReceiptProcessing,
  markReceiptReady,
  RECEIPT_CHANGED_EVENT,
  type PendingReceiptRow,
} from "./receipts";

// ─── Singleton flush scheduler ──────────────────────────────────────

let flushInFlight: Promise<FlushResult> | null = null;
let listenersInstalled = false;

export type FlushResult = {
  /** Transactions queue counters — same shape since Fase 2. */
  attempted: number;
  succeeded: number;
  failed: number;
  remaining: number;
  /** Receipts queue counters (Fase 3). `readyCount` is how many are
   *  now waiting for user review after this flush. */
  receiptsAttempted: number;
  receiptsSucceeded: number;
  receiptsFailed: number;
  receiptsRemaining: number;
  receiptsReady: number;
};

/** Fires after every flush so the SyncStatusPill drops back to its
 *  resting state. The detail carries the FlushResult so consumers can
 *  surface a toast like "Sincronizamos 3 movimientos". */
export const SYNC_FINISHED_EVENT = "kane:sync:finished";

function emitSyncFinished(result: FlushResult): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SYNC_FINISHED_EVENT, { detail: result }),
  );
}

// ─── Replay ─────────────────────────────────────────────────────────

/**
 * Replay a single queued row against Supabase. Returns the outcome so
 * the caller can decide whether to remove, retry, or mark failed.
 */
/**
 * Replay a single pending receipt against `/api/ocr/extract`. The
 * route uses the user's session cookie for auth so we just POST the
 * compressed image. Outcomes:
 *   - 200 + ok:true   → mark `ready` with the result
 *   - 200 + ok:false  → semantic OCR failure (INVALID_IMAGE etc.).
 *                       Mark `failed` with the surfaced message.
 *   - 5xx / network   → re-queue, sync engine retries on next event.
 */
async function replayReceipt(
  row: PendingReceiptRow,
): Promise<
  | { ok: true; result: unknown }
  | { ok: false; networkErr: boolean; message: string }
> {
  try {
    const res = await fetch("/api/ocr/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: row.imageDataUrl }),
    });
    if (!res.ok) {
      // 5xx is treated as a transient/network-flavoured failure so
      // the row stays pending for the next attempt. 4xx is semantic.
      if (res.status >= 500) {
        return {
          ok: false,
          networkErr: true,
          message: `Servidor respondió ${res.status}`,
        };
      }
      let message = `OCR rechazó la imagen (${res.status})`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) message = j.error;
      } catch {
        /* keep default */
      }
      return { ok: false, networkErr: false, message };
    }
    const json = (await res.json()) as
      | { ok: true; data: unknown }
      | { ok: false; error: { kind: string; message?: string } };
    if (json.ok) return { ok: true, result: json.data };
    // The OCR route surfaces LOW_CONFIDENCE / INVALID_IMAGE /
    // MODEL_FAILURE as ok:false. Retryable model failures we treat
    // as network-ish (give it another shot); the rest are terminal.
    const errorKind = json.error.kind;
    const message = json.error.message ?? "El OCR no pudo leer la boleta.";
    const networkErr = errorKind === "MODEL_FAILURE";
    return { ok: false, networkErr, message };
  } catch (err) {
    return {
      ok: false,
      networkErr: true,
      message:
        err instanceof Error
          ? err.message
          : "No pudimos conectarnos con el OCR.",
    };
  }
}

async function replayRow(
  row: PendingTransactionRow,
): Promise<{ ok: true } | { ok: false; networkErr: boolean; message: string }> {
  // Lazy import to avoid an SSR-time cycle: transactions.ts pulls in
  // the data layer + supabase client; this module only loads in the
  // browser.
  const { createTransactionRemote } = await import(
    "@/lib/data/transactions"
  );

  try {
    if (row.operation === "createTransaction") {
      // Payload shape (set by `createTransaction`'s offline branch):
      //   { draft: TransactionDraft, view: TransactionView }
      // We replay the draft via the remote-only writer so a mid-flush
      // network blip does NOT re-enqueue the same row through the
      // offline-aware `createTransaction()`. `silent: true` defers
      // the `tx:upserted` broadcast — the caller (`flushPendingTransactions`)
      // emits it AFTER `removePending` has cleared the optimistic
      // row, so there's no flash of duplicate rows during refetch.
      const wrapper = row.payload as {
        draft: Parameters<typeof createTransactionRemote>[0];
      };
      await createTransactionRemote(wrapper.draft, { silent: true });
      return { ok: true };
    }
    return {
      ok: false,
      networkErr: false,
      message: `Operación desconocida: ${row.operation}`,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "No pudimos sincronizar este movimiento.";
    return {
      ok: false,
      networkErr: isOfflineError(err),
      message,
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Replay every pending transaction against Supabase. Coalesces
 * concurrent calls — only one flush runs at a time, additional
 * callers receive the same in-flight Promise.
 *
 * Returns a `FlushResult` with the outcome. Callers can ignore it;
 * the `SYNC_FINISHED_EVENT` already broadcasts the same shape.
 */
export function flushPendingTransactions(): Promise<FlushResult> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const result: FlushResult = {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      receiptsAttempted: 0,
      receiptsSucceeded: 0,
      receiptsFailed: 0,
      receiptsRemaining: 0,
      receiptsReady: 0,
    };
    try {
      // Skip the loop entirely if offline — saves a redundant
      // listPendingTransactions call when the user keeps tapping
      // "intentar ahora" without reconnecting.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const [allTx, allReceipts] = await Promise.all([
          listPendingTransactions(),
          listPendingReceipts(),
        ]);
        result.remaining = allTx.length;
        result.receiptsRemaining = allReceipts.length;
        result.receiptsReady = allReceipts.filter(
          (r) => r.status === "ready",
        ).length;
        return result;
      }

      // ─── Phase A: pending transactions ──────────────────────
      //
      // Only replay rows that aren't already permanently failed —
      // those wait on the user's explicit retry. `pending` AND
      // `syncing` (orphaned from a previous interrupted flush) both
      // qualify.
      const txQueue = (await listPendingTransactions()).filter(
        (r) => r.status !== "failed",
      );
      result.attempted = txQueue.length;

      // Lazy import the writer's broadcast helper so we can fire
      // `tx:upserted` AFTER `removePending` for each successful row.
      // See `replayRow` for the silent-emit rationale.
      const { emitTxUpserted } = await import("@/lib/data/transactions");

      let txNetworkBlackout = false;
      for (const row of txQueue) {
        await markPendingSyncing(row.localId);
        const outcome = await replayRow(row);
        if (outcome.ok) {
          await removePending(row.localId);
          // Now that the optimistic row is gone from the queue, tell
          // the UI to refetch so the real row replaces it cleanly.
          emitTxUpserted();
          result.succeeded += 1;
        } else if (outcome.networkErr) {
          // Network died mid-flush — abort tx phase and skip to
          // recount. We do NOT process receipts either: if the
          // connection is dead, OCR calls will all fail too.
          txNetworkBlackout = true;
          break;
        } else {
          await markPendingFailed(row.localId, outcome.message);
          result.failed += 1;
        }
      }

      // Re-count whatever's left in the tx queue.
      const txAfter = await listPendingTransactions();
      result.remaining = txAfter.length;

      // ─── Phase B: pending receipts (Fase 3) ─────────────────
      //
      // OCR calls are skipped entirely when the tx phase already
      // detected a network blackout. The next `online` event will
      // restart both phases.
      if (!txNetworkBlackout) {
        const receiptQueue = (await listPendingReceipts()).filter(
          (r) => r.status === "pending" || r.status === "processing",
        );
        result.receiptsAttempted = receiptQueue.length;

        for (const receipt of receiptQueue) {
          await markReceiptProcessing(receipt.localId);
          const outcome = await replayReceipt(receipt);
          if (outcome.ok) {
            await markReceiptReady(receipt.localId, outcome.result);
            result.receiptsSucceeded += 1;
          } else if (outcome.networkErr) {
            // Same blackout treatment as transactions.
            break;
          } else {
            await markReceiptFailed(receipt.localId, outcome.message);
            result.receiptsFailed += 1;
          }
        }
      }

      const receiptsAfter = await listPendingReceipts();
      result.receiptsRemaining = receiptsAfter.length;
      result.receiptsReady = receiptsAfter.filter(
        (r) => r.status === "ready",
      ).length;
    } finally {
      emitSyncFinished(result);
      flushInFlight = null;
    }
    return result;
  })();
  return flushInFlight;
}

/**
 * Wire up the global listeners that auto-flush on reconnect. Idempotent —
 * safe to call from multiple components; only installs once. Returns a
 * disposer for tests / strict-mode double-mount scenarios.
 */
export function installSyncListeners(): () => void {
  if (typeof window === "undefined") return () => {};
  if (listenersInstalled) return () => {};
  listenersInstalled = true;

  const onOnline = () => {
    void flushPendingTransactions();
  };

  const onVisibilityChange = () => {
    // PWAs on Android wake from background frequently; flush on
    // foreground to catch up if the device reconnected while the
    // tab was hidden.
    if (document.visibilityState === "visible" && navigator.onLine) {
      void flushPendingTransactions();
    }
  };

  const onPendingChanged = () => {
    // A new write or receipt was just enqueued. If we happen to be
    // online, flush right away so latency between capture and persist
    // is minimal — the user gets the toast / row update almost
    // instantly when their network is healthy.
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void flushPendingTransactions();
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener(PENDING_CHANGED_EVENT, onPendingChanged);
  // Receipts share the same auto-flush trigger — one event, two
  // queues, single coalesced flush.
  window.addEventListener(RECEIPT_CHANGED_EVENT, onPendingChanged);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener(PENDING_CHANGED_EVENT, onPendingChanged);
    window.removeEventListener(RECEIPT_CHANGED_EVENT, onPendingChanged);
    listenersInstalled = false;
  };
}
