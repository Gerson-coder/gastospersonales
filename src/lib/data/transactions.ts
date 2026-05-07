/**
 * Transactions data layer — Supabase-backed CRUD + mapper.
 *
 * Mirror of the patterns in `accounts.ts` / `categories.ts` / `merchants.ts`:
 *   - Browser bundle ("use client"); UI gates on SUPABASE_ENABLED.
 *   - Throws on error with friendly Spanish messages; UI catches + toasts.
 *
 * RLS contract (see `supabase/migrations/00002_rls.sql`):
 *   - SELECT/INSERT/UPDATE: only own rows (user_id = auth.uid()).
 *   - No DELETE policy — soft-delete via `archived_at`.
 *
 * This module is the SINGLE point where DB shape (`amount_minor: bigint`,
 * FK columns, joined names) is converted to UI shape (`amount: number major`,
 * `categoryName`, `merchantName`, `accountName`). UI components MUST NOT
 * touch `amount_minor` directly — go through `toView` / `toInsertPayload`.
 *
 * Cursor pagination uses the index `transactions_user_occurred_idx`
 * `(user_id, occurred_at DESC)` for stable paging under concurrent inserts.
 */
"use client";

import { isOfflineError } from "@/lib/offline/cache";
import {
  enqueueCreateTransaction,
  listPendingTransactions,
} from "@/lib/offline/pending";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type {
  Currency,
  CategoryKind,
  TransactionSource,
} from "@/lib/supabase/types";

import {
  cacheTransactions,
  readAccountsCache,
  readCategoriesCache,
  readMerchantsCacheByCategory,
  readTransactionsCache,
} from "@/lib/offline/cache";

// `transactions.kind` reuses the `expense | income` literal in the DB schema,
// which is also the shape of `CategoryKind`. Re-export with a domain-specific
// name so call sites read naturally and don't have to import the alias.
export type TransactionKind = CategoryKind;
export type { Currency };

/** Postgres "no rows" — surfaced by `.single()` when RLS hides a row. */
const NO_ROWS = "PGRST116";
/**
 * Postgres `bigint` upper bound (2^63 - 1). The mapper rejects values that
 * would overflow on insert before we ever hit the DB.
 */
const BIGINT_MAX = 9_223_372_036_854_775_000;

/** Máximo absoluto permitido (mayor a este valor = typo más probable que gasto real). */
export const MAX_TRANSACTION_AMOUNT = 999_999.99;

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Raw row shape returned by SELECT queries with embedded joins. Joined fields
 * are optional because the embed may be absent in some queries (and `null`
 * when the FK is null or the joined row was archived/deleted).
 */
export type TransactionRow = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  merchant_id: string | null;
  kind: TransactionKind;
  /** bigint serialized as JS number; safe up to ~9e15 (way above any real-world amount). */
  amount_minor: number;
  currency: Currency;
  occurred_at: string;
  note: string | null;
  source: "manual" | "ocr";
  receipt_id: string | null;
  transfer_group_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from nested SELECT.
  categories?: { name: string } | null;
  merchants?: { name: string; logo_slug: string | null } | null;
  accounts?: { name: string } | null;
};

/** Shape consumed by the UI. Major-unit amount, flattened joined names. */
export type TransactionView = {
  id: string;
  /** Major units (e.g. 25.50). Centralized conversion via `toView`. */
  amount: number;
  currency: Currency;
  kind: TransactionKind;
  /** True for rows that exist only in the local offline queue (Fase 2).
   *  The UI flags these with a "Pendiente" badge and skips operations
   *  that need a server-issued id (edit, archive). Always `false` /
   *  `undefined` for rows fetched from Supabase. */
  pending?: boolean;
  /** Last sync error for a `pending` row that ended up failed. UI
   *  surfaces this in the retry sheet. */
  pendingError?: string;
  categoryId: string | null;
  categoryName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  /** Filename stem for /public/logos/merchants/{slug}.svg. Null when the
   *  merchant has no hand-prepared logo (or no merchant at all) — the row
   *  then renders the deterministic initials avatar. */
  merchantLogoSlug: string | null;
  accountId: string;
  accountName: string | null;
  note: string | null;
  occurredAt: string;
  /**
   * When non-null, this row is one leg (expense or income) of an
   * inter-account transfer. The matching counterpart row carries the
   * same uuid. UI uses this as a flag to render the row with transfer
   * affordances (icon, "Transferencia" label) instead of merchant /
   * category framing.
   */
  transferGroupId: string | null;
};

/** Form-side draft from /capture. `occurredAt` defaults to server `now()`. */
export type TransactionDraft = {
  amount: number;
  currency: Currency;
  kind: TransactionKind;
  categoryId: string | null;
  merchantId: string | null;
  accountId: string;
  note: string | null;
  occurredAt?: string;
  /**
   * When set, the new transaction is linked to this receipts row.
   * `source` defaults to "manual" but flips to "ocr" automatically
   * when receiptId is present, so callers don't have to remember to
   * set both.
   */
  receiptId?: string | null;
  /** Override the default `source: "manual"`. Useful for OCR flows. */
  source?: TransactionSource;
};

/** Opaque pagination cursor: `(occurred_at DESC, id DESC)` tuple. */
export type ListCursor = { occurredAt: string; id: string };
export type ListResult = {
  rows: TransactionView[];
  nextCursor: ListCursor | null;
};

/** Insert payload shape — exactly what we send to `supabase.from('transactions').insert(...)`. */
export type TransactionInsertPayload = {
  user_id: string;
  account_id: string;
  category_id: string | null;
  merchant_id: string | null;
  kind: TransactionKind;
  amount_minor: number;
  currency: Currency;
  note: string | null;
  occurred_at?: string;
  source: TransactionSource;
  receipt_id?: string | null;
};

// ─── Mappers ──────────────────────────────────────────────────────────────

/**
 * Convert a DB row (with nested joins) to a UI view. Centralizes the
 * `amount_minor → amount` divide and flattens joined names so callers never
 * see DB column naming.
 */
export function toView(row: TransactionRow): TransactionView {
  return {
    id: row.id,
    amount: row.amount_minor / 100,
    currency: row.currency,
    kind: row.kind,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    merchantId: row.merchant_id,
    merchantName: row.merchants?.name ?? null,
    merchantLogoSlug: row.merchants?.logo_slug ?? null,
    accountId: row.account_id,
    accountName: row.accounts?.name ?? null,
    note: row.note,
    occurredAt: row.occurred_at,
    transferGroupId: row.transfer_group_id,
  };
}

/**
 * Convert a UI draft to an insert payload. Validates basic invariants up
 * front (amount > 0, kind/currency literals, accountId required) so the user
 * gets an actionable Spanish message before we round-trip to Postgres.
 *
 * Overflow guard: rejects `amount_minor > BIGINT_MAX` to prevent a loss-of-
 * precision insert that would silently corrupt the row.
 */
export function toInsertPayload(
  draft: TransactionDraft,
  userId: string,
): TransactionInsertPayload {
  if (!userId) {
    throw new Error("Necesitás iniciar sesión para registrar movimientos.");
  }
  if (typeof draft.amount !== "number" || !Number.isFinite(draft.amount)) {
    throw new Error("El monto no es válido.");
  }
  if (draft.amount <= 0) {
    throw new Error("El monto debe ser mayor a cero.");
  }
  if (draft.amount > MAX_TRANSACTION_AMOUNT) {
    throw new Error(
      `El monto no puede superar ${MAX_TRANSACTION_AMOUNT.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }
  if (draft.kind !== "expense" && draft.kind !== "income") {
    throw new Error("Tipo de movimiento inválido.");
  }
  if (draft.currency !== "PEN" && draft.currency !== "USD") {
    throw new Error("Moneda inválida.");
  }
  if (!draft.accountId) {
    throw new Error("Tienes que elegir una cuenta.");
  }

  const amountMinor = Math.round(draft.amount * 100);
  if (amountMinor > BIGINT_MAX) {
    throw new Error("El monto es demasiado grande para registrarlo.");
  }

  // If the draft is linked to a receipt, default the source to "ocr"
  // so callers don't have to set both. Explicit `draft.source` still
  // wins (e.g. for tests or future flows).
  const inferredSource: TransactionSource =
    draft.source ?? (draft.receiptId ? "ocr" : "manual");

  const payload: TransactionInsertPayload = {
    user_id: userId,
    account_id: draft.accountId,
    category_id: draft.categoryId,
    merchant_id: draft.merchantId,
    kind: draft.kind,
    amount_minor: amountMinor,
    currency: draft.currency,
    note: draft.note?.trim() ? draft.note.trim() : null,
    source: inferredSource,
    receipt_id: draft.receiptId ?? null,
  };
  if (draft.occurredAt) {
    payload.occurred_at = draft.occurredAt;
  }
  return payload;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Columns + nested joins fetched everywhere we return a `TransactionView`.
 * Keep in one place so list/get/create/update never drift in the join shape.
 *
 * `accounts(name)` matches the DB column; the mapper aliases it to
 * `accountName` for the UI.
 */
const SELECT_WITH_JOINS =
  "id, user_id, account_id, category_id, merchant_id, kind, amount_minor, currency, occurred_at, note, source, receipt_id, transfer_group_id, archived_at, created_at, updated_at, categories(name), merchants(name, logo_slug), accounts(name)";

/**
 * Map a Supabase error to a friendly Spanish message. PGRST116 means the
 * row was hidden by RLS (or simply doesn't exist anymore); we surface the
 * "doesn't exist" framing because that's the user's mental model — the row
 * was archived from another device, or was never theirs to begin with.
 */
function describeWriteError(error: { code?: string; message?: string }): string {
  if (error.code === NO_ROWS) return "Este movimiento ya no existe.";
  return error.message || "No pudimos guardar el movimiento.";
}

// ─── Reads ────────────────────────────────────────────────────────────────

/**
 * Cursor-paginated list for a single currency, ordered `(occurred_at DESC, id DESC)`.
 * Excludes archived rows. RLS auto-scopes by user_id.
 *
 * The `limit + 1` trick fetches one extra row to detect whether there is
 * a next page without a separate count query. If we got more than `limit`
 * rows, the `(limit+1)`th becomes `nextCursor`.
 *
 * Cursor predicate uses `.or()` to express the strict tuple comparison
 * `(occurred_at, id) < (cursor.occurredAt, cursor.id)` because PostgREST
 * doesn't expose row-tuple operators directly.
 */
export async function listTransactionsByCurrency(opts: {
  currency: Currency;
  cursor?: ListCursor;
  limit?: number;
  /**
   * Optional inclusive lower bound for `occurred_at`. ISO timestamp.
   * /movements usa esto para acotar la lista al rango que el user
   * eligio en el PeriodPicker. Compatible con cursor — el cursor solo
   * angosta el upper edge dentro de la ventana.
   */
  fromISO?: string;
  /** Optional exclusive upper bound for `occurred_at`. ISO timestamp. */
  toISO?: string;
  /**
   * Server-side filters (auditoria perf 2026-05-07). Antes /movements
   * filtraba en cliente sobre el set ya cargado: si el ultimo gasto en
   * la categoria X era de hace 4 meses, el user veia "sin resultados"
   * hasta hacer "Cargar mas" varias veces. Pasar el filtro al server
   * usa los indices `transactions_user_category_occurred_idx` y
   * `transactions_user_account_occurred_idx` (ver migracion 00001).
   */
  /** Filtrar por id de categoria. `null` se trata como "todas". */
  categoryId?: string | null;
  /** Filtrar por id de cuenta. `null` se trata como "todas". */
  accountId?: string | null;
  /** Filtrar por tipo de movimiento. */
  kind?: TransactionKind;
  /** True => solo filas que son una pierna de transferencia. */
  transferOnly?: boolean;
  /** True => excluir filas que son piernas de transferencia. */
  excludeTransfers?: boolean;
}): Promise<ListResult> {
  const limit = opts.limit ?? 50;
  const supabase = createSupabaseClient();

  try {
    let query = supabase
      .from("transactions")
      .select(SELECT_WITH_JOINS)
      .is("archived_at", null)
      .eq("currency", opts.currency)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (opts.fromISO) {
      query = query.gte("occurred_at", opts.fromISO);
    }
    if (opts.toISO) {
      query = query.lt("occurred_at", opts.toISO);
    }
    if (opts.categoryId) {
      query = query.eq("category_id", opts.categoryId);
    }
    if (opts.accountId) {
      query = query.eq("account_id", opts.accountId);
    }
    if (opts.kind) {
      query = query.eq("kind", opts.kind);
    }
    if (opts.transferOnly) {
      query = query.not("transfer_group_id", "is", null);
    } else if (opts.excludeTransfers) {
      query = query.is("transfer_group_id", null);
    }

    if (opts.cursor) {
      // Strict tuple inequality: occurred_at < cursor.occurredAt
      //   OR (occurred_at = cursor.occurredAt AND id < cursor.id)
      const tieBreaker = `and(occurred_at.eq.${opts.cursor.occurredAt},id.lt.${opts.cursor.id})`;
      query = query.or(
        `occurred_at.lt.${opts.cursor.occurredAt},${tieBreaker}`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "No pudimos cargar los movimientos.");
    }

    const rows = (data ?? []) as unknown as TransactionRow[];
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor: ListCursor | null = hasMore
      ? {
          occurredAt: sliced[sliced.length - 1].occurred_at,
          id: sliced[sliced.length - 1].id,
        }
      : null;

    const baseRows = sliced.map(toView);
    // Mirror to offline cache (Fase 1 expansion) — fire-and-forget so a
    // slow IDB write never delays the UI. We cache the whole sliced
    // page so cursor pagination through the same window is hot.
    void cacheTransactions(baseRows);

    const viewFilter: ViewFilter = {
      currency: opts.currency,
      fromISO: opts.fromISO,
      toISO: opts.toISO,
      categoryId: opts.categoryId ?? null,
      accountId: opts.accountId ?? null,
      kind: opts.kind,
      transferOnly: opts.transferOnly,
      excludeTransfers: opts.excludeTransfers,
    };

    // Read merge (Fase 2): pending rows are the freshest by definition,
    // so we prepend them to page 1 only. On paginated calls (cursor !=
    // null) we're paginating into the past; pending rows already showed
    // up on page 1 — re-emitting them here would double-render.
    const merged = opts.cursor
      ? baseRows
      : [
          ...(await readPendingViewsForCurrency(viewFilter)),
          ...baseRows,
        ];

    return {
      rows: merged,
      nextCursor,
    };
  } catch (err) {
    // Offline fallback — read from IndexedDB cache. Same shape as the
    // online return so the consumer doesn't need to branch.
    if (isOfflineError(err)) {
      const viewFilter: ViewFilter = {
        currency: opts.currency,
        fromISO: opts.fromISO,
        toISO: opts.toISO,
        categoryId: opts.categoryId ?? null,
        accountId: opts.accountId ?? null,
        kind: opts.kind,
        transferOnly: opts.transferOnly,
        excludeTransfers: opts.excludeTransfers,
      };
      const cached = await readTransactionsCache<TransactionView>({
        currency: opts.currency,
        fromISO: opts.fromISO,
        toISO: opts.toISO,
      });
      // Aplicar el resto de los filtros del server (categoryId, accountId,
      // kind, transferOnly/excludeTransfers) sobre el cache para mantener
      // paridad online/offline.
      const cachedFiltered = cached.filter((r) =>
        matchesViewFilter(r, viewFilter),
      );
      // Apply cursor predicate locally so /movements pagination keeps
      // working offline against the cache.
      const filtered = opts.cursor
        ? cachedFiltered.filter(
            (r) =>
              r.occurredAt < opts.cursor!.occurredAt ||
              (r.occurredAt === opts.cursor!.occurredAt &&
                r.id < opts.cursor!.id),
          )
        : cachedFiltered;
      const sliced = filtered.slice(0, limit);
      const hasMore = filtered.length > limit;
      const nextCursor: ListCursor | null = hasMore
        ? {
            occurredAt: sliced[sliced.length - 1].occurredAt,
            id: sliced[sliced.length - 1].id,
          }
        : null;
      const merged = opts.cursor
        ? sliced
        : [
            ...(await readPendingViewsForCurrency(viewFilter)),
            ...sliced,
          ];
      return { rows: merged, nextCursor };
    }
    throw err;
  }
}

/**
 * Predicado compartido entre el query online y los fallbacks offline /
 * pending queue. Mantiene la paridad: si el server filtra por categoria
 * X, el cache cliente y la pending queue tambien filtran por categoria X
 * antes de mergear.
 */
type ViewFilter = {
  currency: Currency;
  fromISO?: string;
  toISO?: string;
  categoryId?: string | null;
  accountId?: string | null;
  kind?: TransactionKind;
  transferOnly?: boolean;
  excludeTransfers?: boolean;
};

function matchesViewFilter(view: TransactionView, f: ViewFilter): boolean {
  if (view.currency !== f.currency) return false;
  if (f.fromISO && view.occurredAt < f.fromISO) return false;
  if (f.toISO && view.occurredAt >= f.toISO) return false;
  if (f.categoryId && view.categoryId !== f.categoryId) return false;
  if (f.accountId && view.accountId !== f.accountId) return false;
  if (f.kind && view.kind !== f.kind) return false;
  if (f.transferOnly && view.transferGroupId === null) return false;
  if (f.excludeTransfers && view.transferGroupId !== null) return false;
  return true;
}

/**
 * Pull pending-queue rows that match the currency filter + optional
 * date window, in `occurred_at DESC` order. Used by the read-merge
 * branches in `listTransactionsByCurrency` and `listTransactionsWindow`
 * so the user sees their offline captures immediately.
 *
 * Each row is enriched with `pending: true` and (when applicable)
 * `pendingError` for failed rows so the UI can render the right badge.
 */
async function readPendingViewsForCurrency(
  filter: ViewFilter,
): Promise<TransactionView[]> {
  if (typeof window === "undefined") return [];
  const queue = await listPendingTransactions();
  const views: TransactionView[] = [];
  for (const row of queue) {
    if (row.operation !== "createTransaction") continue;
    const wrapper = row.payload as { view?: TransactionView };
    if (!wrapper?.view) continue;
    if (!matchesViewFilter(wrapper.view, filter)) continue;
    views.push({
      ...wrapper.view,
      id: row.localId,
      pending: true,
      pendingError: row.status === "failed" ? row.lastError : undefined,
    });
  }
  // occurred_at DESC, then id DESC — same order as the remote query
  return views.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) {
      return a.occurredAt > b.occurredAt ? -1 : 1;
    }
    return a.id > b.id ? -1 : 1;
  });
}

/**
 * In-memory cache compartido entre llamadas a `listTransactionsWindow`.
 * Auditoria perf 2026-05-07: dashboard (6mo) y /insights (12mo) montan
 * cada uno su propio `useTransactionsWindow` y refetcheaban a Supabase
 * en cada navegacion entre tabs aunque la data fuera la misma. Un cache
 * en memoria con TTL corto deduplica los refetch sin tocar la logica
 * del hook ni introducir SWR/React-Query como dep.
 *
 * Llave: `currency:fromISO`. Si dashboard pidio "PEN, hace 6 meses" y
 * el user va a /insights ("PEN, hace 12 meses"), las llaves difieren =>
 * miss => fetch fresh. Cuando el user vuelve a /dashboard dentro del
 * TTL, hit => no network.
 *
 * Solo cacheamos las filas remotas (server). Las pending del offline
 * queue se mergean al hit con el cache para que el set siempre incluya
 * las captures locales mas frescas.
 *
 * Invalidacion: TTL natural + `emitTxUpserted` la limpia explicitamente
 * para que cualquier write reciente fuerce el siguiente fetch.
 */
type WindowCacheEntry = {
  rows: TransactionView[];
  fetchedAt: number;
};
const WINDOW_CACHE_TTL_MS = 60_000;
const windowCache = new Map<string, WindowCacheEntry>();

function windowCacheKey(currency: Currency, fromISO: string): string {
  return `${currency}:${fromISO}`;
}

function readWindowCache(
  currency: Currency,
  fromISO: string,
): TransactionView[] | null {
  const entry = windowCache.get(windowCacheKey(currency, fromISO));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > WINDOW_CACHE_TTL_MS) {
    windowCache.delete(windowCacheKey(currency, fromISO));
    return null;
  }
  return entry.rows;
}

function writeWindowCache(
  currency: Currency,
  fromISO: string,
  rows: TransactionView[],
): void {
  windowCache.set(windowCacheKey(currency, fromISO), {
    rows,
    fetchedAt: Date.now(),
  });
}

/** Limpia el cache en memoria. Llamado por `emitTxUpserted` para que
 *  los writes invaliden el set inmediatamente. Tambien expuesto por si
 *  un futuro flujo necesita forzar refetch. */
export function invalidateTransactionsWindowCache(): void {
  windowCache.clear();
}

/**
 * Fetch a window of transactions from `fromISO` to now (no upper bound).
 * Used by aggregations (`useTransactionsWindow`) where we want the whole
 * 6-month dataset client-side, no pagination. Filters by currency +
 * non-archived; RLS auto-scopes by user.
 */
export async function listTransactionsWindow(opts: {
  currency: Currency;
  fromISO: string;
}): Promise<TransactionView[]> {
  // Cache hit en memoria — dedup tab-to-tab dentro del TTL. Las pending
  // siguen leyendose fresh para que un capture offline reciente nunca
  // quede invisible detras de un cache stale.
  const cached = readWindowCache(opts.currency, opts.fromISO);
  if (cached) {
    const pending = await readPendingViewsForCurrency({
      currency: opts.currency,
      fromISO: opts.fromISO,
    });
    return [...pending, ...cached];
  }

  const supabase = createSupabaseClient();
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(SELECT_WITH_JOINS)
      .is("archived_at", null)
      .eq("currency", opts.currency)
      .gte("occurred_at", opts.fromISO)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      // Log detallado al console asi DevTools captura code/details/hint
      // de Postgres. El throw solo lleva message human-friendly al UI;
      // el resto queda en logs para diagnosticar bugs intermitentes
      // como "No pudimos cargar tu reporte" sin contexto.
      console.error("[listTransactionsWindow] supabase error", {
        currency: opts.currency,
        fromISO: opts.fromISO,
        code: (error as { code?: string }).code,
        message: error.message,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
      });
      const codeStr = (error as { code?: string }).code;
      const suffix = codeStr ? ` (${codeStr})` : "";
      throw new Error(
        (error.message || "No pudimos cargar los movimientos.") + suffix,
      );
    }

    const rows = (data ?? []) as unknown as TransactionRow[];
    const baseRows = rows.map(toView);
    // Mirror to offline cache.
    void cacheTransactions(baseRows);
    writeWindowCache(opts.currency, opts.fromISO, baseRows);
    // Read merge (Fase 2) — see `readPendingViewsForCurrency`.
    const pending = await readPendingViewsForCurrency({
      currency: opts.currency,
      fromISO: opts.fromISO,
    });
    return [...pending, ...baseRows];
  } catch (err) {
    if (isOfflineError(err)) {
      const cachedIDB = await readTransactionsCache<TransactionView>({
        currency: opts.currency,
        fromISO: opts.fromISO,
      });
      const pending = await readPendingViewsForCurrency({
        currency: opts.currency,
        fromISO: opts.fromISO,
      });
      return [...pending, ...cachedIDB];
    }
    throw err;
  }
}

/**
 * Fetch one transaction by id. Returns `null` if the row was archived,
 * deleted, or hidden by RLS — the caller (e.g. `/capture?edit=<id>`)
 * decides whether to redirect or show an error.
 */
export async function getTransactionById(
  id: string,
): Promise<TransactionView | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(SELECT_WITH_JOINS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    if (error.code === NO_ROWS) return null;
    throw new Error(error.message || "No pudimos cargar el movimiento.");
  }
  if (!data) return null;
  return toView(data as unknown as TransactionRow);
}

/**
 * Per-account net balance for the active currency. Computed across ALL
 * non-archived transactions (saldo is an all-time concept, not windowed —
 * matches the user's mental model of "how much is in this account").
 *
 * Returned in MAJOR units (e.g. soles, dollars) to match the rest of the UI
 * — `TransactionView.amount` is also major, so callers can compare directly
 * (`balances[id] < draft.amount`) without unit conversions. Accounts with
 * no movements are absent from the map; treat absence as zero.
 *
 * Implementacion: invoca el RPC `get_account_balances` (migracion 00033)
 * que hace `SUM(...) GROUP BY account_id` server-side. Antes el cliente
 * traia `(account_id, kind, amount_minor)` de TODAS las filas no archivadas
 * y sumaba en JS — para usuarios con anios de historial eran miles de filas
 * por la red en cada mount del dashboard / cambio de currency / tx:upserted.
 *
 * Fallback: si el RPC no esta deployado todavia (codigo en prod antes que
 * la migracion), degradamos al SELECT + sum cliente del comportamiento
 * previo. Asi el deploy de Vercel + el `db push` manual pueden ir en
 * cualquier orden sin romper el saldo guard.
 */
export async function getAccountBalances(
  currency: TransactionDraft["currency"],
): Promise<Record<string, number>> {
  const supabase = createSupabaseClient();
  try {
    // Cast el .rpc en un binding tipado a mano. El tipo Database
    // generado por `supabase gen types` aun no incluye
    // `get_account_balances` (migracion 00033 recien creada). En lugar
    // de regenerar tipos en el repo, usamos un cast localizado para
    // que el codigo compile y siga siendo type-safe en su uso interno.
    type GetAccountBalancesRow = {
      account_id: string;
      balance_minor: number | string;
    };
    type RpcFn = (
      name: "get_account_balances",
      args: { p_currency: string },
    ) => Promise<{
      data: GetAccountBalancesRow[] | null;
      error: { message?: string; code?: string } | null;
    }>;
    const rpc = supabase.rpc as unknown as RpcFn;
    const { data, error } = await rpc("get_account_balances", {
      p_currency: currency,
    });

    if (error) {
      // CUALQUIER error del RPC -> fallback al fold cliente. Antes solo
      // catcheabamos 42883/PGRST202 (function not found), pero en
      // produccion otros codigos tambien tiraban silent-empty balances
      // (permission denied tras grant cambios, schema cache stale,
      // PGRST116 transient en cold start, etc.). Resultado: dashboard
      // muestra S/ 0.00 en todas las cuentas y el user pierde toda
      // visibilidad de su saldo. Mejor pagar los ~50ms extra del fold
      // cliente que dejar el saldo en negro. El fold tambien aplica
      // RLS via supabase.from(transactions), asi que mantiene la misma
      // garantia de seguridad que el RPC con security invoker.
      console.error("[getAccountBalances] RPC error, falling back to client fold:", error);
      return await getAccountBalancesClientFold(currency);
    }

    const balances: Record<string, number> = {};
    for (const row of data ?? []) {
      // bigint de Postgres puede serializarse como string en algunos
      // adapters; aceptamos ambos para no depender del runtime exacto.
      const minor =
        typeof row.balance_minor === "string"
          ? Number(row.balance_minor)
          : row.balance_minor;
      balances[row.account_id] = minor / 100;
    }
    return balances;
  } catch (err) {
    if (isOfflineError(err)) {
      // Offline fallback: recompute from the cached transactions (which
      // are already mapped to major units in the View). Pending rows
      // also count — the user's mental balance includes captures they
      // made while offline. Best-effort: if the cache is empty (first
      // visit while offline) we return {} so the consumer treats every
      // account as zero, matching pre-cache behavior.
      const cached = await readTransactionsCache<TransactionView>({
        currency,
      });
      const pending = await readPendingViewsForCurrency({ currency });
      const balances: Record<string, number> = {};
      for (const r of [...cached, ...pending]) {
        const sign = r.kind === "income" ? 1 : -1;
        balances[r.accountId] = (balances[r.accountId] ?? 0) + sign * r.amount;
      }
      return balances;
    }
    throw err;
  }
}

/**
 * Fallback usado cuando el RPC `get_account_balances` no esta deployado
 * (codigo en prod antes que la migracion 00033). Equivale al fetch
 * directo + fold cliente que existia antes de la optimizacion.
 *
 * NO uses esto fuera del fallback — es proporcionalmente mas lento para
 * usuarios con historial extenso. Existe solo para zero-downtime durante
 * la transicion al RPC.
 */
async function getAccountBalancesClientFold(
  currency: TransactionDraft["currency"],
): Promise<Record<string, number>> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("account_id, kind, amount_minor")
    .is("archived_at", null)
    .eq("currency", currency);

  if (error) {
    throw new Error(error.message || "No pudimos calcular el saldo.");
  }

  const minor: Record<string, number> = {};
  type Row = {
    account_id: string;
    kind: "income" | "expense";
    amount_minor: number;
  };
  for (const row of (data ?? []) as Row[]) {
    const sign = row.kind === "income" ? 1 : -1;
    minor[row.account_id] =
      (minor[row.account_id] ?? 0) + sign * row.amount_minor;
  }
  const balances: Record<string, number> = {};
  for (const id in minor) balances[id] = minor[id] / 100;
  return balances;
}

/**
 * Cross-component cue that a transaction was just changed (insert,
 * update, archive, or unarchive). Fires SYNCHRONOUSLY after the
 * Supabase ACK so any mounted listener (e.g. /dashboard, /movements)
 * refetches without waiting for the realtime broadcast (~500-1500ms).
 * Realtime + visibility refetch still cover the case where the change
 * came from another tab/device.
 *
 * Name kept as `TX_UPSERTED_EVENT` for backwards compat — semantically
 * it now means "tx changed somehow". Archive flows fire it too so that
 * /movements (which is NOT subscribed to realtime) can stay in sync
 * after an archive triggered from /dashboard's detail drawer.
 */
export const TX_UPSERTED_EVENT = "tx:upserted";
/**
 * Re-emite el evento `tx:upserted` para que el dashboard y /movements
 * refetcheen. Las funciones de escritura (`createTransaction`,
 * `updateTransaction`, `archiveTransaction`, `createTransfer`) ya lo
 * disparan internamente; exponer esta función permite a flujos con
 * navegación retrasada (ej. /receipt con su banner "Guardado" de 900ms)
 * re-emitir el evento justo antes de `router.push()` para cubrir el caso
 * en que el listener del destino aún no estaba montado cuando el write
 * resolvió.
 */
export function emitTxUpserted(): void {
  // Invalidar cache en memoria del window — sin esto, dos refetch
  // consecutivos dentro del TTL devolverian la misma data stale al
  // dashboard / insights aunque acabamos de escribir una tx nueva.
  invalidateTransactionsWindowCache();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TX_UPSERTED_EVENT));
}

// ─── Writes ───────────────────────────────────────────────────────────────

/**
 * Insert a new transaction. Pessimistic: awaits the server ACK + reselect
 * (with joins) so the caller can append the hydrated row to local state
 * without re-fetching the list.
 */
export async function createTransaction(
  draft: TransactionDraft,
): Promise<TransactionView> {
  // Validate up front so offline + online paths reject the same way —
  // a bad amount / kind / accountId never lands in the queue. The
  // validator throws an actionable Spanish error the capture flow
  // toasts. We don't have user.id yet but the validator's userId
  // check only requires a non-empty sentinel; the real writer below
  // re-reads it from auth.
  toInsertPayload(draft, "validation-only");

  try {
    return await createTransactionRemote(draft);
  } catch (err) {
    if (isOfflineError(err)) {
      // Offline path: build an optimistic view from cached reference
      // data, drop the draft into the pending queue, and return the
      // synthetic row to the caller. The capture flow renders it the
      // same way as a real row, but with a "Pendiente" badge.
      const view = await buildOptimisticView(draft);
      const localId = await enqueueCreateTransaction({ draft, view });
      // Reuse the localId as the row id so consumers correlating
      // optimistic and synced rows have a stable handle.
      const finalView: TransactionView = { ...view, id: localId };
      emitTxUpserted();
      return finalView;
    }
    throw err;
  }
}

/**
 * Online-only variant of `createTransaction`. Throws on network errors
 * instead of falling back to the offline queue. Used by the sync engine
 * (`src/lib/offline/sync.ts`) when replaying a pending row — if the
 * network drops mid-replay, the engine re-queues the SAME row instead
 * of creating a duplicate via the offline branch.
 *
 * `opts.silent`: skip the `tx:upserted` broadcast. The sync engine
 * uses this so it can emit the broadcast AFTER `removePending` has
 * cleared the optimistic row, avoiding a flash of (real + pending)
 * rows during a refetch race.
 */
export async function createTransactionRemote(
  draft: TransactionDraft,
  opts: { silent?: boolean } = {},
): Promise<TransactionView> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Necesitás iniciar sesión para registrar movimientos.");
  }

  const payload = toInsertPayload(draft, user.id);

  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    throw new Error(describeWriteError(error));
  }

  if (!opts.silent) emitTxUpserted();
  return toView(data as unknown as TransactionRow);
}

/**
 * Build a `TransactionView` from a `TransactionDraft` using the local
 * caches for the joined names (account / category / merchant). Used to
 * surface the optimistic row immediately when capture happens offline.
 *
 * Names that aren't in the cache fall back to `null` — the UI handles
 * that (the row just shows "Sin categoría" / "Sin comercio") which is
 * better than refusing to display the optimistic row at all.
 */
async function buildOptimisticView(
  draft: TransactionDraft,
): Promise<TransactionView> {
  const [accounts, categories] = await Promise.all([
    readAccountsCache<{ id: string; label: string }>(),
    readCategoriesCache<{ id: string; name: string }>(),
  ]);
  const accountName =
    accounts.find((a) => a.id === draft.accountId)?.label ?? null;
  const categoryName = draft.categoryId
    ? (categories.find((c) => c.id === draft.categoryId)?.name ?? null)
    : null;
  let merchantName: string | null = null;
  let merchantLogoSlug: string | null = null;
  if (draft.merchantId && draft.categoryId) {
    const merchants = await readMerchantsCacheByCategory<{
      id: string;
      name: string;
      logo_slug: string | null;
    }>(draft.categoryId);
    const m = merchants.find((mm) => mm.id === draft.merchantId);
    if (m) {
      merchantName = m.name;
      merchantLogoSlug = m.logo_slug;
    }
  }
  return {
    id: "pending-placeholder",
    amount: draft.amount,
    currency: draft.currency,
    kind: draft.kind,
    pending: true,
    categoryId: draft.categoryId,
    categoryName,
    merchantId: draft.merchantId,
    merchantName,
    merchantLogoSlug,
    accountId: draft.accountId,
    accountName,
    note: draft.note,
    occurredAt: draft.occurredAt ?? new Date().toISOString(),
    transferGroupId: null,
  };
}

/**
 * Update an existing transaction. RLS hides rows the user doesn't own and
 * surfaces them as `PGRST116` ("no rows") — we translate to "ya no existe"
 * because that matches the user's mental model.
 */
export async function updateTransaction(
  id: string,
  draft: TransactionDraft,
): Promise<TransactionView> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Necesitás iniciar sesión para registrar movimientos.");
  }

  const payload = toInsertPayload(draft, user.id);
  // user_id and source are immutable post-creation — strip them from the
  // update patch so we don't ever rewrite ownership or change a manual row
  // into an OCR row by accident.
  const {
    user_id: _userId,
    source: _source,
    ...updatePatch
  } = payload;
  void _userId;
  void _source;

  const { data, error } = await supabase
    .from("transactions")
    .update(updatePatch)
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    throw new Error(describeWriteError(error));
  }

  emitTxUpserted();
  return toView(data as unknown as TransactionRow);
}

/**
 * Soft-delete a transaction by setting `archived_at = now()`. Reads
 * everywhere filter out archived rows. Pairs with `unarchiveTransaction`
 * for the 5-second undo affordance.
 */
export async function archiveTransaction(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(describeWriteError(error));
  }
  if (!data) {
    // RLS quietly returned 0 rows, or the row was already archived.
    throw new Error("Este movimiento ya no existe.");
  }
  emitTxUpserted();
}

/**
 * Bulk soft-delete EVERY active transaction owned by the current user. RLS
 * scopes the UPDATE to `user_id = auth.uid()`; we add an explicit `user_id`
 * filter as defense in depth. Returns the count of rows archived. Used by
 * the factory-reset flow in /settings.
 */
export async function archiveAllUserTransactions(): Promise<number> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("transactions")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message || "No pudimos restablecer los movimientos.");
  }
  return (data ?? []).length;
}

// ─── Transfers ────────────────────────────────────────────────────────────

/** Args for `createTransfer`. Same-currency only in v1 (see body). */
export type CreateTransferInput = {
  sourceAccountId: string;
  destAccountId: string;
  amount: number;
  currency: Currency;
  /** Optional ISO timestamp; defaults to DB `now()` on both legs. */
  occurredAt?: string;
  /** Optional shared note applied to both legs. */
  note?: string | null;
};

/**
 * Create a transfer between two accounts owned by the current user.
 *
 * Implementation: a transfer is two `transactions` rows linked by a shared
 * `transfer_group_id` uuid. The source-account row is `kind: "expense"` and
 * the destination-account row is `kind: "income"`. Same currency, same
 * `occurred_at`, no category, no merchant.
 *
 * Atomicity: Supabase / PostgREST does not give us a transactional bundle
 * for two independent inserts from the client. We insert sequentially and,
 * if the second leg fails, soft-archive the first leg so the DB stays
 * consistent (no orphan single-leg "ghost" expense). The RLS policy set
 * grants UPDATE on own rows, so the rollback path works under normal
 * permissions. If even the rollback fails (rare — network drop between
 * the two writes), the user can manually archive the orphan from
 * /movements.
 *
 * Validations (Spanish-neutral copy, surfaced via toasts):
 *   - both account ids required and distinct
 *   - amount > 0 and within MAX_TRANSACTION_AMOUNT
 *   - both accounts must exist (and belong to the current user — RLS
 *     enforces this anyway, but we check up front to give a clear message)
 *   - same currency on both accounts (v1 limitation)
 *   - source balance must cover the amount
 *
 * Returns `[expenseRow, incomeRow]` in that order so the caller can
 * choose which leg to surface (e.g. show "Transferencia enviada" against
 * the source).
 */
export async function createTransfer(
  opts: CreateTransferInput,
): Promise<[TransactionView, TransactionView]> {
  if (!opts.sourceAccountId || !opts.destAccountId) {
    throw new Error("Selecciona la cuenta de origen y la de destino.");
  }
  if (opts.sourceAccountId === opts.destAccountId) {
    throw new Error("La cuenta de origen y la de destino deben ser distintas.");
  }
  if (typeof opts.amount !== "number" || !Number.isFinite(opts.amount)) {
    throw new Error("El monto no es válido.");
  }
  if (opts.amount <= 0) {
    throw new Error("El monto debe ser mayor a cero.");
  }
  if (opts.amount > MAX_TRANSACTION_AMOUNT) {
    throw new Error(
      `El monto no puede superar ${MAX_TRANSACTION_AMOUNT.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }
  if (opts.currency !== "PEN" && opts.currency !== "USD") {
    throw new Error("Moneda inválida.");
  }

  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Inicia sesión para registrar la transferencia.");
  }

  // Verify both accounts: existence, ownership (RLS), and currency match.
  // Two queries instead of one so a missing/foreign id surfaces a precise
  // message ("origen" vs "destino") instead of a vague "una cuenta no existe".
  const [{ data: sourceAcc, error: sourceErr }, { data: destAcc, error: destErr }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, currency, archived_at")
        .eq("id", opts.sourceAccountId)
        .is("archived_at", null)
        .maybeSingle(),
      supabase
        .from("accounts")
        .select("id, currency, archived_at")
        .eq("id", opts.destAccountId)
        .is("archived_at", null)
        .maybeSingle(),
    ]);

  if (sourceErr) {
    throw new Error(sourceErr.message || "No pudimos verificar la cuenta de origen.");
  }
  if (destErr) {
    throw new Error(destErr.message || "No pudimos verificar la cuenta de destino.");
  }
  if (!sourceAcc) {
    throw new Error("La cuenta de origen no existe o no es tuya.");
  }
  if (!destAcc) {
    throw new Error("La cuenta de destino no existe o no es tuya.");
  }
  if (sourceAcc.currency !== opts.currency || destAcc.currency !== opts.currency) {
    throw new Error(
      "Por ahora solo se permiten transferencias entre cuentas de la misma moneda.",
    );
  }

  // Saldo guard — checked against the active currency. `getAccountBalances`
  // already filters by currency, so we only need to look up the source.
  const balances = await getAccountBalances(opts.currency);
  const sourceBalance = balances[opts.sourceAccountId] ?? 0;
  if (sourceBalance < opts.amount) {
    throw new Error("La cuenta de origen no tiene saldo suficiente para esta transferencia.");
  }

  const amountMinor = Math.round(opts.amount * 100);
  if (amountMinor > BIGINT_MAX) {
    throw new Error("El monto es demasiado grande para registrarlo.");
  }

  const transferGroupId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const sharedNote = opts.note?.trim() ? opts.note.trim() : null;

  type TransferLeg = TransactionInsertPayload & { transfer_group_id: string };
  const expenseLeg: TransferLeg = {
    user_id: user.id,
    account_id: opts.sourceAccountId,
    category_id: null,
    merchant_id: null,
    kind: "expense",
    amount_minor: amountMinor,
    currency: opts.currency,
    note: sharedNote,
    source: "manual",
    receipt_id: null,
    transfer_group_id: transferGroupId,
    ...(opts.occurredAt ? { occurred_at: opts.occurredAt } : {}),
  };
  const incomeLeg: TransferLeg = {
    ...expenseLeg,
    account_id: opts.destAccountId,
    kind: "income",
  };

  // Leg 1 — source / expense.
  const { data: expenseData, error: expenseErr } = await supabase
    .from("transactions")
    .insert(expenseLeg)
    .select(SELECT_WITH_JOINS)
    .single();

  if (expenseErr || !expenseData) {
    throw new Error(
      expenseErr ? describeWriteError(expenseErr) : "No pudimos registrar la transferencia.",
    );
  }

  // Leg 2 — destination / income. Same `occurred_at` to keep both legs
  // grouped on the day timeline.
  const expenseRow = expenseData as unknown as TransactionRow;
  const incomeLegWithTs: TransferLeg = {
    ...incomeLeg,
    occurred_at: expenseRow.occurred_at,
  };
  const { data: incomeData, error: incomeErr } = await supabase
    .from("transactions")
    .insert(incomeLegWithTs)
    .select(SELECT_WITH_JOINS)
    .single();

  if (incomeErr || !incomeData) {
    // Best-effort rollback of leg 1 so the user doesn't end up with a
    // dangling expense row. Soft-archive (RLS allows UPDATE) — there is
    // no DELETE policy on `transactions`.
    try {
      await supabase
        .from("transactions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", expenseRow.id);
    } catch {
      // Swallow — we surface the original error to the user below; if
      // the rollback also fails there's a stranded row in /movements
      // they can archive manually. Rare.
    }
    throw new Error(
      incomeErr ? describeWriteError(incomeErr) : "No pudimos completar la transferencia.",
    );
  }

  emitTxUpserted();
  return [
    toView(expenseRow),
    toView(incomeData as unknown as TransactionRow),
  ];
}

/**
 * Restore a soft-deleted transaction. Used by the undo toast within the
 * 5-second window after `archiveTransaction`.
 */
export async function unarchiveTransaction(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .update({ archived_at: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(describeWriteError(error));
  }
  if (!data) {
    throw new Error("Este movimiento ya no existe.");
  }
  emitTxUpserted();
}
