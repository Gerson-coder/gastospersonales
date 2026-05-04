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

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type {
  Currency,
  CategoryKind,
  TransactionSource,
} from "@/lib/supabase/types";

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
}): Promise<ListResult> {
  const limit = opts.limit ?? 50;
  const supabase = createSupabaseClient();

  let query = supabase
    .from("transactions")
    .select(SELECT_WITH_JOINS)
    .is("archived_at", null)
    .eq("currency", opts.currency)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (opts.cursor) {
    // Strict tuple inequality: occurred_at < cursor.occurredAt
    //   OR (occurred_at = cursor.occurredAt AND id < cursor.id)
    const tieBreaker = `and(occurred_at.eq.${opts.cursor.occurredAt},id.lt.${opts.cursor.id})`;
    query = query.or(`occurred_at.lt.${opts.cursor.occurredAt},${tieBreaker}`);
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

  return {
    rows: sliced.map(toView),
    nextCursor,
  };
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
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(SELECT_WITH_JOINS)
    .is("archived_at", null)
    .eq("currency", opts.currency)
    .gte("occurred_at", opts.fromISO)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error(error.message || "No pudimos cargar los movimientos.");
  }

  const rows = (data ?? []) as unknown as TransactionRow[];
  return rows.map(toView);
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
 */
export async function getAccountBalances(
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
  type Row = { account_id: string; kind: "income" | "expense"; amount_minor: number };
  for (const row of (data ?? []) as Row[]) {
    const sign = row.kind === "income" ? 1 : -1;
    minor[row.account_id] = (minor[row.account_id] ?? 0) + sign * row.amount_minor;
  }
  // Convert to major in a second pass — keeps the inner sum on integers
  // (no float drift) and only divides once per account.
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
function emitTxUpserted(): void {
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

  emitTxUpserted();
  return toView(data as unknown as TransactionRow);
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
