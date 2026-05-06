"use client";

/**
 * Kane offline cache — Dexie/IndexedDB schema (Fase 1).
 *
 * Read-only mirror of the user's reference data so the app boots and
 * navigates while offline. NOT a write queue — that lands in Fase 2 with
 * `pending_transactions` and the sync engine. Keep the schema bumpable:
 * any change here requires a `version()` upgrade.
 *
 * Scope rule (important):
 *   - The cache is NOT scoped by user_id at the row level — it's a
 *     single-user-per-device assumption. We invalidate everything on
 *     `signOut()` (see `clearAllCaches()` below) so a different user
 *     logging in on the same device never sees the previous user's data.
 *   - If we later support fast user-switching without a full logout, we
 *     add a `userId` column to each table and bump the schema.
 *
 * Why payload-as-blob and not flat columns:
 *   - The data layer types (Account / Category / Merchant) evolve.
 *     Storing a JSON-serializable `payload` blob keeps the schema stable
 *     while letting us add fields freely. We pay a small read cost
 *     (cloning the object) which is negligible at our row counts.
 *   - The only fields we promote to indexed columns are the ones we
 *     query by — `id` (primary key) and `categoryId` for merchants.
 *
 * Storage estimate (worst case, single user):
 *   - 10 accounts × ~300B = 3 KB
 *   - 50 categories × ~250B = 12.5 KB
 *   - 500 merchants × ~200B = 100 KB
 *   - Total: ~115 KB. Way under the IndexedDB quota (typ. 50% of free disk).
 */

import Dexie, { type Table } from "dexie";

// ─── Row shapes ────────────────────────────────────────────────────────
//
// Each table stores `payload` as the original DB row (or its UI shape) so
// the consumer can pass it straight through. `cachedAt` is an epoch ms
// timestamp — used by the data layer to surface "ultima sync" hints and
// (later) to evict stale entries.

export type CachedAccountRow = {
  /** Account uuid — primary key. */
  id: string;
  /** Epoch ms when this row was last cached. */
  cachedAt: number;
  /** Full Account payload as returned by `listAccounts()`. */
  payload: unknown;
};

export type CachedCategoryRow = {
  /** Category uuid — primary key. */
  id: string;
  cachedAt: number;
  /** Full Category payload as returned by `listCategories()`. */
  payload: unknown;
};

export type CachedMerchantRow = {
  /** Merchant uuid — primary key. */
  id: string;
  /** category_id of the merchant — secondary index for per-category reads. */
  categoryId: string;
  cachedAt: number;
  /** Full Merchant payload as returned by `listMerchantsByCategory()`. */
  payload: unknown;
};

export type CachedTransactionRow = {
  /** Transaction uuid — primary key. */
  id: string;
  /** Currency promoted to a top-level field so we can index by it
   *  (the /movements page filters by active currency). */
  currency: string;
  /** ISO timestamp promoted for date-window queries (cursor pagination
   *  + period filters in /movements / /dashboard). */
  occurredAt: string;
  cachedAt: number;
  /** Full `TransactionView` payload — already mapped to UI shape so
   *  consumers don't need the DB row → view conversion at read time. */
  payload: unknown;
};

export type CachedMetaRow = {
  /** Meta key, e.g. `"sync:accounts"` or `"sync:categories"`. */
  key: string;
  /** Epoch ms when the keyed event last happened. */
  updatedAt: number;
  /** Optional payload — e.g. the last-known userId. */
  value?: unknown;
};

// ─── Pending writes queue (Fase 2) ─────────────────────────────────────
//
// One row per offline write the user performed. The sync engine walks
// this table on reconnect, replays each operation against Supabase, and
// either removes the row (success) or marks it `failed` with the error
// message (semantic rejection — RLS, validation, balance overdraft).
//
// Network-flavoured errors during sync leave the row as `pending` so
// the next online event retries it.

/** What kind of operation the queued row represents. Phase 2 only ships
 *  `createTransaction`; updates/archives require a server-known id and
 *  add tricky merge cases — they remain online-only for now. */
export type PendingOperation = "createTransaction";

/** Lifecycle state of a queued write. */
export type PendingStatus = "pending" | "syncing" | "failed";

export type PendingTransactionRow = {
  /** Local-only id, prefixed `local-` so reads can distinguish it from
   *  real Postgres uuids when merging optimistic rows into the list. */
  localId: string;
  /** Operation discriminator — extensible for Fase 2.5 (updates, archives). */
  operation: PendingOperation;
  /** Original `TransactionDraft` (or analog) the user submitted. Stored
   *  as a structured-cloned object so we can replay it verbatim. */
  payload: unknown;
  /** Epoch ms when the user captured this write. The sync engine
   *  replays in chronological order so balance math stays consistent. */
  createdAt: number;
  /** Lifecycle. `failed` rows surface to the user via a sheet so they
   *  can edit + retry, or discard. */
  status: PendingStatus;
  /** Retry counter — incremented on every sync attempt. UI uses this
   *  to surface "intentado 3 veces" warnings on stuck rows. */
  attempts: number;
  /** Last error message when `status === "failed"`. Localized Spanish. */
  lastError?: string;
};

// ─── Pending receipts queue (Fase 3) ───────────────────────────────────
//
// One row per receipt image the user captured offline. The OCR pipeline
// is server-side (calls OpenAI), so offline capture stashes the image
// here and the sync engine replays it when connectivity returns.
//
// Lifecycle:
//   pending     → image stashed, awaiting OCR call
//   processing  → /api/ocr/extract in flight
//   ready       → OCR done; awaiting user review + save in /receipt
//   failed      → semantic OCR failure (INVALID_IMAGE, model rejection)
//
// `ready` is intentionally NOT counted in "actions in flight" — it's a
// user-action item ("review and save"), distinct from "background work
// pending". The status pill surfaces them as a separate counter.

export type PendingReceiptStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

export type PendingReceiptRow = {
  /** Local-only id, prefixed `local-receipt-` so logs / read paths can
   *  tell receipts apart from pending transactions at a glance. */
  localId: string;
  status: PendingReceiptStatus;
  /** Pre-compressed JPEG data URL (1024px, q80) — same shape as the
   *  online OCR call already uploads. Sized so 5-10 receipts fit
   *  comfortably under the IndexedDB origin quota. */
  imageDataUrl: string;
  mime: string;
  fileName: string;
  createdAt: number;
  attempts: number;
  /** Last error when `status === "failed"`. Surfaced in the retry UX. */
  lastError?: string;
  /** OCR result payload once `status === "ready"`. Shape matches the
   *  successful response of `/api/ocr/extract` — the receipt page
   *  consumes it directly without re-calling the API. */
  result?: unknown;
};

// ─── Database ──────────────────────────────────────────────────────────

class KaneOfflineDB extends Dexie {
  accounts!: Table<CachedAccountRow, string>;
  categories!: Table<CachedCategoryRow, string>;
  merchants!: Table<CachedMerchantRow, string>;
  transactions!: Table<CachedTransactionRow, string>;
  meta!: Table<CachedMetaRow, string>;
  pendingTransactions!: Table<PendingTransactionRow, string>;
  pendingReceipts!: Table<PendingReceiptRow, string>;

  constructor() {
    super("kane-offline-cache");
    // v1 — initial schema. The string after each table is the index list:
    //   "primaryKey, secondaryIndex1, secondaryIndex2, ..."
    // Compound indexes use bracket notation: [colA+colB].
    this.version(1).stores({
      accounts: "id",
      categories: "id",
      merchants: "id, categoryId",
      meta: "key",
    });
    // v2 — pending writes queue (Fase 2). Indexes:
    //   - `localId` is the primary key (string, prefixed "local-")
    //   - `status` lets the sync engine query "where status = pending"
    //   - `createdAt` keeps replay in chronological order
    this.version(2).stores({
      accounts: "id",
      categories: "id",
      merchants: "id, categoryId",
      meta: "key",
      pendingTransactions: "localId, status, createdAt",
    });
    // v3 — pending OCR receipts (Fase 3). Same index pattern as
    // pendingTransactions: localId PK + status + createdAt for queries.
    this.version(3).stores({
      accounts: "id",
      categories: "id",
      merchants: "id, categoryId",
      meta: "key",
      pendingTransactions: "localId, status, createdAt",
      pendingReceipts: "localId, status, createdAt",
    });
    // v4 — transactions cache. The /movements + /dashboard reads bail
    // out without this when offline; caching them by id (with currency
    // and occurredAt promoted to indexed columns) lets us answer the
    // same date-window queries from local storage. No upper bound at
    // this layer — callers that need to cap retention should evict.
    this.version(4).stores({
      accounts: "id",
      categories: "id",
      merchants: "id, categoryId",
      transactions: "id, currency, occurredAt",
      meta: "key",
      pendingTransactions: "localId, status, createdAt",
      pendingReceipts: "localId, status, createdAt",
    });
  }
}

let _instance: KaneOfflineDB | null = null;

/**
 * Lazy singleton accessor for the offline DB. Throws if called from a
 * non-browser environment — the data layer is `"use client"` so this is
 * a defensive guard against accidental SSR imports.
 */
export function offlineDb(): KaneOfflineDB {
  if (typeof window === "undefined") {
    throw new Error(
      "[offline] offlineDb() must only be called in the browser",
    );
  }
  if (!_instance) {
    _instance = new KaneOfflineDB();
  }
  return _instance;
}

/**
 * Wipe every cache table. Called from the sign-out flow so the next user
 * on this device never sees the previous user's data. Safe to call from
 * server contexts too — no-ops outside the browser.
 */
export async function clearAllCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    await db.transaction(
      "rw",
      [
        db.accounts,
        db.categories,
        db.merchants,
        db.transactions,
        db.meta,
        db.pendingTransactions,
        db.pendingReceipts,
      ],
      async () => {
        await Promise.all([
          db.accounts.clear(),
          db.categories.clear(),
          db.merchants.clear(),
          db.transactions.clear(),
          db.meta.clear(),
          db.pendingTransactions.clear(),
          db.pendingReceipts.clear(),
        ]);
      },
    );
  } catch (err) {
    // If IndexedDB is disabled (privacy mode, low storage, etc.) we don't
    // want to break the sign-out flow. Log and move on.
    console.warn("[offline] clearAllCaches failed (non-fatal):", err);
  }
}
