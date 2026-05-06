"use client";

/**
 * Cache helpers for the offline read-only mirror (Fase 1).
 *
 * Pattern used by the data layer:
 *
 *   export async function listAccounts(): Promise<Account[]> {
 *     try {
 *       const rows = await fetchFromSupabase();
 *       cacheAccounts(rows);          // fire-and-forget, await not required
 *       return rows;
 *     } catch (err) {
 *       if (isOfflineError(err)) {
 *         const cached = await readAccountsCache();
 *         if (cached.length > 0) return cached;
 *       }
 *       throw err;
 *     }
 *   }
 *
 * Why this shape:
 *   - The contract of `listAccounts()` etc. doesn't change — same return
 *     type, same throws-on-error. Callers don't need to know about the
 *     cache at all.
 *   - The cache write is fire-and-forget: a slow IndexedDB write must
 *     never delay the UI getting fresh data.
 *   - Falling back to cache only on network errors (not on RLS/auth
 *     errors) keeps semantic errors loud instead of silently serving
 *     stale data.
 */

import {
  offlineDb,
  type CachedAccountRow,
  type CachedCategoryRow,
  type CachedMerchantRow,
  type CachedTransactionRow,
} from "./db";

// ─── Online detection ─────────────────────────────────────────────────

/**
 * Loose check — does this error look like a network outage rather than a
 * 4xx/5xx semantic error? We want to fall back to cache for the former
 * and surface the latter loudly.
 *
 * Supabase-js wraps fetch errors as `TypeError: Failed to fetch` (Chrome),
 * `NetworkError` (Firefox/Safari), and similar. AbortError shows up when
 * the user navigates away mid-call. We also treat `navigator.onLine === false`
 * as a network error regardless of the actual error shape.
 */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (err instanceof TypeError) {
    // "Failed to fetch", "Network request failed", "Load failed"
    return /fetch|network|load failed/i.test(err.message);
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if (err.name === "NetworkError") return true;
  }
  return false;
}

// ─── Accounts ────────────────────────────────────────────────────────

/**
 * Replace the entire accounts cache with the given rows. Done atomically
 * inside a Dexie transaction so a partial failure can't leave the cache
 * desynced. We `clear` first because the source-of-truth fetch already
 * reflects soft-deletes/archives — if a row was archived server-side, we
 * want it gone from the cache too.
 */
export async function cacheAccounts<T extends { id: string }>(
  rows: T[],
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const now = Date.now();
    await db.transaction("rw", db.accounts, db.meta, async () => {
      await db.accounts.clear();
      if (rows.length > 0) {
        const cachedRows: CachedAccountRow[] = rows.map((r) => ({
          id: r.id,
          cachedAt: now,
          payload: r,
        }));
        await db.accounts.bulkPut(cachedRows);
      }
      await db.meta.put({ key: "sync:accounts", updatedAt: now });
    });
  } catch (err) {
    // Cache write must never break the user flow — log and move on.
    console.warn("[offline] cacheAccounts failed (non-fatal):", err);
  }
}

/**
 * Read all cached accounts. Returns `[]` when the cache is empty, when
 * IndexedDB is unavailable, or on error — the consumer surfaces the
 * "still loading" empty state.
 */
export async function readAccountsCache<T>(): Promise<T[]> {
  if (typeof window === "undefined") return [];
  try {
    const rows = await offlineDb().accounts.toArray();
    return rows.map((r) => r.payload as T);
  } catch (err) {
    console.warn("[offline] readAccountsCache failed (non-fatal):", err);
    return [];
  }
}

// ─── Categories ──────────────────────────────────────────────────────

export async function cacheCategories<T extends { id: string }>(
  rows: T[],
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const now = Date.now();
    await db.transaction("rw", db.categories, db.meta, async () => {
      await db.categories.clear();
      if (rows.length > 0) {
        const cachedRows: CachedCategoryRow[] = rows.map((r) => ({
          id: r.id,
          cachedAt: now,
          payload: r,
        }));
        await db.categories.bulkPut(cachedRows);
      }
      await db.meta.put({ key: "sync:categories", updatedAt: now });
    });
  } catch (err) {
    console.warn("[offline] cacheCategories failed (non-fatal):", err);
  }
}

export async function readCategoriesCache<T>(): Promise<T[]> {
  if (typeof window === "undefined") return [];
  try {
    const rows = await offlineDb().categories.toArray();
    return rows.map((r) => r.payload as T);
  } catch (err) {
    console.warn("[offline] readCategoriesCache failed (non-fatal):", err);
    return [];
  }
}

// ─── Merchants (per category) ────────────────────────────────────────

/**
 * Replace the merchants cache for a single category. Other categories'
 * caches are NOT touched — merchants are loaded lazily per category via
 * `listMerchantsByCategory(catId)`, so we maintain one slice per call.
 */
export async function cacheMerchantsByCategory<
  T extends { id: string; category_id: string },
>(categoryId: string, rows: T[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = offlineDb();
    const now = Date.now();
    await db.transaction("rw", db.merchants, db.meta, async () => {
      // Wipe the slice for this category, then re-populate. Other
      // categories' merchants stay put.
      await db.merchants.where("categoryId").equals(categoryId).delete();
      if (rows.length > 0) {
        const cachedRows: CachedMerchantRow[] = rows.map((r) => ({
          id: r.id,
          categoryId: r.category_id,
          cachedAt: now,
          payload: r,
        }));
        await db.merchants.bulkPut(cachedRows);
      }
      await db.meta.put({
        key: `sync:merchants:${categoryId}`,
        updatedAt: now,
      });
    });
  } catch (err) {
    console.warn(
      "[offline] cacheMerchantsByCategory failed (non-fatal):",
      err,
    );
  }
}

export async function readMerchantsCacheByCategory<T>(
  categoryId: string,
): Promise<T[]> {
  if (typeof window === "undefined") return [];
  try {
    const rows = await offlineDb()
      .merchants.where("categoryId")
      .equals(categoryId)
      .toArray();
    return rows.map((r) => r.payload as T);
  } catch (err) {
    console.warn(
      "[offline] readMerchantsCacheByCategory failed (non-fatal):",
      err,
    );
    return [];
  }
}

// ─── Transactions ────────────────────────────────────────────────────
//
// Different write strategy from accounts/categories: we DON'T `clear()`
// before bulkPut because reads are paginated. A page-2 fetch shouldn't
// wipe the page-1 cache. Instead we upsert (Dexie's `bulkPut` upserts
// by primary key) and let the offline reader query by date window.
//
// We also evict rows older than the freshly-fetched window's lower
// bound IF the caller passes one — that keeps the cache from growing
// unbounded over months of use, while staying consistent with what the
// online query would return for the same window.

export async function cacheTransactions<
  T extends { id: string; currency: string; occurredAt: string },
>(rows: T[]): Promise<void> {
  if (typeof window === "undefined") return;
  if (rows.length === 0) return;
  try {
    const db = offlineDb();
    const now = Date.now();
    const cachedRows: CachedTransactionRow[] = rows.map((r) => ({
      id: r.id,
      currency: r.currency,
      occurredAt: r.occurredAt,
      cachedAt: now,
      payload: r,
    }));
    await db.transaction("rw", db.transactions, db.meta, async () => {
      await db.transactions.bulkPut(cachedRows);
      await db.meta.put({ key: "sync:transactions", updatedAt: now });
    });
  } catch (err) {
    console.warn("[offline] cacheTransactions failed (non-fatal):", err);
  }
}

/**
 * Read cached transactions for a currency, optionally bounded by a
 * date window. Returns rows in the same order as the remote query
 * (`occurred_at DESC, id DESC`) so the consumer can paginate against
 * them with the same cursor semantics.
 */
export async function readTransactionsCache<T>(opts: {
  currency: string;
  fromISO?: string;
  toISO?: string;
}): Promise<T[]> {
  if (typeof window === "undefined") return [];
  try {
    let collection = offlineDb()
      .transactions.where("currency")
      .equals(opts.currency);
    if (opts.fromISO || opts.toISO) {
      collection = collection.filter((row) => {
        if (opts.fromISO && row.occurredAt < opts.fromISO) return false;
        if (opts.toISO && row.occurredAt >= opts.toISO) return false;
        return true;
      });
    }
    const rows = await collection.toArray();
    rows.sort((a, b) => {
      if (a.occurredAt !== b.occurredAt) {
        return a.occurredAt > b.occurredAt ? -1 : 1;
      }
      return a.id > b.id ? -1 : 1;
    });
    return rows.map((r) => r.payload as T);
  } catch (err) {
    console.warn("[offline] readTransactionsCache failed (non-fatal):", err);
    return [];
  }
}

// ─── Sync metadata ───────────────────────────────────────────────────

/**
 * Read the most-recent sync timestamp for a given table. Returns `null`
 * when no sync has happened yet (or IDB is unavailable). The
 * OfflineIndicator uses this to surface "última sincronización: hace X"
 * when the user opens the offline detail sheet.
 */
export async function readLastSync(key: string): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const row = await offlineDb().meta.get(key);
    return row?.updatedAt ?? null;
  } catch {
    return null;
  }
}
