"use client";

/**
 * `useOfflineSync` — single source of truth for the sync UI state.
 *
 * Responsibilities:
 *   1. Installs the global sync listeners on first mount (idempotent;
 *      re-mounts in strict-mode dev are safe).
 *   2. Tracks the pending-queue count + the "is a flush in flight"
 *      flag so the SyncStatusPill can render the right state.
 *   3. Exposes a manual `flush()` for the "intentar ahora" button.
 *
 * Subscribed to:
 *   - `PENDING_CHANGED_EVENT` → recount the queue
 *   - `SYNC_FINISHED_EVENT`   → flip `syncing` off + recount
 *   - `online` / `offline`    → recount; flush is auto-triggered by
 *                               `installSyncListeners` itself
 *
 * Returned object is a stable shape so consumers can destructure
 * without effect dep churn.
 */

import * as React from "react";

import { useOnline } from "@/hooks/use-online";
import {
  countPendingTransactions,
  PENDING_CHANGED_EVENT,
} from "@/lib/offline/pending";
import {
  countPendingReceipts,
  RECEIPT_CHANGED_EVENT,
} from "@/lib/offline/receipts";
import {
  flushPendingTransactions,
  installSyncListeners,
  SYNC_FINISHED_EVENT,
  type FlushResult,
} from "@/lib/offline/sync";

export type OfflineSyncState = {
  /** `navigator.onLine`, reactive. */
  online: boolean;
  /** Total queued transaction rows (pending + failed) — surfaces the
   *  badge in the status pill. Failed rows still count as "pending
   *  action" from the user's perspective. */
  pending: number;
  /** OCR receipts in flight (`pending` / `processing` / `failed`) —
   *  background work the user can't yet act on. */
  receiptsInFlight: number;
  /** OCR receipts the engine processed offline — waiting for the user
   *  to review + save in /receipt. Distinct from `pending` because the
   *  next step is a human action, not background sync. */
  receiptsReady: number;
  /** True while a flush is in flight (tab woke up, online came back,
   *  or the user tapped retry). The pill flips to "Sincronizando…". */
  syncing: boolean;
  /** Manually trigger a flush — exposed for the retry sheet. Coalesced
   *  with the global scheduler so concurrent calls don't double-post. */
  flush: () => Promise<FlushResult>;
};

export function useOfflineSync(): OfflineSyncState {
  const online = useOnline();
  const [pending, setPending] = React.useState<number>(0);
  const [receiptsInFlight, setReceiptsInFlight] = React.useState<number>(0);
  const [receiptsReady, setReceiptsReady] = React.useState<number>(0);
  const [syncing, setSyncing] = React.useState<boolean>(false);

  // Install global listeners exactly once. The function itself is
  // idempotent so a strict-mode double-mount is harmless.
  React.useEffect(() => {
    const dispose = installSyncListeners();
    return dispose;
  }, []);

  // Track pending counts (transactions + receipts). We re-poll on the
  // various events; counting both queues every tick is cheap (Dexie
  // count is O(1) on indexed tables).
  React.useEffect(() => {
    let cancelled = false;
    async function recount() {
      const [n, receipts] = await Promise.all([
        countPendingTransactions(),
        countPendingReceipts(),
      ]);
      if (cancelled) return;
      setPending(n);
      setReceiptsInFlight(receipts.inFlight);
      setReceiptsReady(receipts.ready);
    }
    void recount();

    const onChanged = () => void recount();
    const onSyncFinished = () => {
      setSyncing(false);
      void recount();
    };
    const onOnline = () => {
      // The sync engine auto-triggers a flush on `online`. Flip the
      // syncing flag eagerly so the UI doesn't lag the actual work
      // — it'll flip back when SYNC_FINISHED_EVENT lands.
      setSyncing(true);
      void recount();
    };

    window.addEventListener(PENDING_CHANGED_EVENT, onChanged);
    window.addEventListener(RECEIPT_CHANGED_EVENT, onChanged);
    window.addEventListener(SYNC_FINISHED_EVENT, onSyncFinished);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener(PENDING_CHANGED_EVENT, onChanged);
      window.removeEventListener(RECEIPT_CHANGED_EVENT, onChanged);
      window.removeEventListener(SYNC_FINISHED_EVENT, onSyncFinished);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const flush = React.useCallback(async () => {
    setSyncing(true);
    try {
      const result = await flushPendingTransactions();
      return result;
    } finally {
      // SYNC_FINISHED_EVENT will also flip this; this is just the
      // local belt-and-suspenders for the manual flush path.
      setSyncing(false);
    }
  }, []);

  return {
    online,
    pending,
    receiptsInFlight,
    receiptsReady,
    syncing,
    flush,
  };
}
