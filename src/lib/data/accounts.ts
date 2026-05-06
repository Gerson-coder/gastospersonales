/**
 * Accounts data layer — Kane
 *
 * Thin wrapper around the Supabase `accounts` table for the browser. All
 * functions assume the user is authenticated; RLS in `00002_rls.sql` enforces
 * isolation so we never need to filter by `user_id` here — the policy does it.
 *
 * The DB columns are `name` and `type`; we expose them to the UI as `label`
 * and `kind` to match the UI vocabulary already used across the screens
 * (capture/accounts mocks). The mapping is hand-rolled here so callers don't
 * leak DB naming.
 *
 * All functions throw on error. Callers wrap with try/catch + toast.
 */

import { createClient } from "@/lib/supabase/client";
import {
  cacheAccounts,
  isOfflineError,
  readAccountsCache,
} from "@/lib/offline/cache";
import type {
  AccountSubtype,
  AccountType,
  Currency,
} from "@/lib/supabase/types";

export type AccountKind = AccountType; // alias for UI vocabulary
export type { AccountSubtype, Currency };

/**
 * Hard ceiling on how many ACTIVE accounts a single user can have. Keeps
 * the dashboard's account-card carousel readable (8+ slides means tiny
 * pagination dots and lots of swiping) and the capture-flow account picker
 * scannable. The limit is enforced at the writer (`createAccount`) so the
 * /accounts UI surfaces a friendly toast when the user tries to add an
 * 11th. Bump this if the user base outgrows the constraint.
 */
export const MAX_ACTIVE_ACCOUNTS = 10;

// ─── Cross-tab event bus ────────────────────────────────────────────────
//
// Mirrors `TX_UPSERTED_EVENT` in transactions.ts. Any writer (create /
// update / archive) fires this so listeners in OTHER routes — most
// importantly /dashboard, which caches `accounts` on first mount — can
// refetch without waiting on a realtime broadcast or a tab refocus.
// Same-tab synchronous → the dashboard sees the new account on the very
// next render after the user lands back on it.

export const ACCOUNT_UPSERTED_EVENT = "account:upserted";

function emitAccountUpserted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACCOUNT_UPSERTED_EVENT));
}

/** Shape returned to the UI. Mirrors the mock that previously lived inline. */
export type Account = {
  id: string;
  /** auth.users.id del owner. Necesario para que la UI pueda
   *  distinguir owner vs partner cuando una cuenta esta compartida
   *  (ver SharedAccountPanel + migration 00027). */
  userId: string;
  label: string;
  kind: AccountKind;
  currency: Currency;
  /** Product type within an institution (sueldo, dólares, etc.). Null when
   * the user keeps just one account at this bank — the UI hides the chip
   * in that case. See migration 00013_account_subtype.sql. */
  subtype: AccountSubtype | null;
  /** True cuando la cuenta esta compartida con un partner. Habilita
   *  los joins de RLS para transactions/commitments. Ver migration
   *  00027_account_partnerships.sql. */
  sharedWithPartner: boolean;
};

export type CreateAccountInput = {
  label: string;
  kind: AccountKind;
  currency: Currency;
  subtype?: AccountSubtype | null;
};

export type UpdateAccountInput = Partial<CreateAccountInput>;

// ─── Internal helpers ────────────────────────────────────────────────────
type DbAccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  subtype: AccountSubtype | null;
  shared_with_partner?: boolean | null;
};

function toAccount(row: DbAccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.name,
    kind: row.type,
    currency: row.currency,
    subtype: row.subtype ?? null,
    sharedWithPartner: row.shared_with_partner === true,
  };
}

/** UI labels for the optional product subtype. Mirrors migration 00013. */
export const ACCOUNT_SUBTYPE_LABEL: Record<AccountSubtype, string> = {
  sueldo: "Sueldo",
  corriente: "Corriente",
  ahorro: "Ahorro",
  dolares: "Dólares",
  credito: "Crédito",
  debito: "Débito",
};

/** Ordered list for picker rendering (most-common first). */
export const ACCOUNT_SUBTYPE_OPTIONS: ReadonlyArray<AccountSubtype> = [
  "sueldo",
  "corriente",
  "ahorro",
  "dolares",
  "credito",
  "debito",
];

/**
 * Compose the user-facing label for an account. When a subtype is set
 * we append it after a thin "·" separator; otherwise the account label
 * stands alone. Centralised here so the dashboard chip, the account
 * list row and the capture drawer all read the same string.
 */
export function accountDisplayLabel(account: Account): string {
  if (!account.subtype) return account.label;
  return `${account.label} · ${ACCOUNT_SUBTYPE_LABEL[account.subtype]}`;
}

// ─── Public API ──────────────────────────────────────────────────────────
/**
 * List the current user's active (non-archived) accounts. Ordered by
 * `created_at` ascending so the user's first-created account stays at
 * the top of the list (stable order across reloads).
 *
 * Offline behavior (see `src/lib/offline/cache.ts`): on a successful
 * fetch, we mirror the result to IndexedDB. If the network is down we
 * return the last-cached snapshot so the dashboard, picker, and capture
 * flow still render the user's accounts. Semantic errors (RLS, schema)
 * are NOT swallowed — only fetch/network failures fall back.
 */
export async function listAccounts(): Promise<Account[]> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("accounts")
      .select(
        "id, user_id, name, type, currency, subtype, shared_with_partner, created_at",
      )
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    const accounts = (data ?? []).map((r) =>
      toAccount({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        type: r.type,
        currency: r.currency,
        subtype: (r as { subtype?: AccountSubtype | null }).subtype ?? null,
        shared_with_partner: (r as { shared_with_partner?: boolean | null })
          .shared_with_partner,
      }),
    );
    // Mirror to offline cache. Fire-and-forget — a slow IDB write must
    // not delay the UI getting the freshest data.
    void cacheAccounts(accounts);
    return accounts;
  } catch (err) {
    if (isOfflineError(err)) {
      const cached = await readAccountsCache<Account>();
      if (cached.length > 0) return cached;
    }
    throw err;
  }
}

/**
 * Insert a new account for the current user. We need `user_id` even though
 * RLS will validate it — the column is NOT NULL and has no default.
 */
export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const supabase = createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error("Inicia sesión para crear una cuenta.");
  }

  const trimmed = input.label.trim();
  if (!trimmed) throw new Error("El nombre de la cuenta no puede estar vacío.");

  // Hard cap — count the user's active accounts BEFORE the insert. Done
  // client-side under RLS (no need to trust the count: RLS scopes the
  // query to this user's rows). Race window of a few ms is acceptable —
  // a malicious user could double-tap to land on 11; we'd archive on the
  // next sweep. Centralised here so both the /accounts create sheet and
  // the dashboard's CTA hit the same guard.
  const { count, error: countErr } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= MAX_ACTIVE_ACCOUNTS) {
    throw new Error(
      `Llegaste al máximo de ${MAX_ACTIVE_ACCOUNTS} cuentas activas. Archiva una para crear otra.`,
    );
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userData.user.id,
      name: trimmed,
      type: input.kind,
      currency: input.currency,
      subtype: input.subtype ?? null,
    })
    .select("id, user_id, name, type, currency, subtype, shared_with_partner")
    .single();

  if (error) throw friendlyAccountError(error);
  emitAccountUpserted();
  return toAccount(data as DbAccountRow);
}

/** Update the editable fields of an account. */
export async function updateAccount(
  id: string,
  patch: UpdateAccountInput,
): Promise<Account> {
  const supabase = createClient();

  const dbPatch: {
    name?: string;
    type?: AccountType;
    currency?: Currency;
    subtype?: AccountSubtype | null;
  } = {};
  if (patch.label !== undefined) {
    const trimmed = patch.label.trim();
    if (!trimmed) throw new Error("El nombre de la cuenta no puede estar vacío.");
    dbPatch.name = trimmed;
  }
  if (patch.kind !== undefined) dbPatch.type = patch.kind;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;
  if ("subtype" in patch) dbPatch.subtype = patch.subtype ?? null;

  const { data, error } = await supabase
    .from("accounts")
    .update(dbPatch)
    .eq("id", id)
    .select("id, user_id, name, type, currency, subtype, shared_with_partner")
    .single();

  if (error) throw friendlyAccountError(error);
  emitAccountUpserted();
  return toAccount(data as DbAccountRow);
}

/**
 * Translate Postgres/Supabase errors into user-friendly Spanish messages for
 * the accounts table. Falls back to the raw `message` for anything we don't
 * recognize so we don't accidentally swallow real signal.
 *
 * Known codes:
 *   - 23514 (check_violation) on `accounts_type_check`: the remote DB hasn't
 *     applied migration 00011 yet, so kinds `yape`/`plin` are rejected.
 */
function friendlyAccountError(err: { code?: string; message: string }): Error {
  const code = err.code ?? "";
  const msg = err.message ?? "";
  if (code === "23514" && /accounts_type_check/i.test(msg)) {
    return new Error(
      "Yape y Plin todavía no están habilitados. El admin debe aplicar la migración pendiente.",
    );
  }
  return new Error(msg || "No se pudo guardar la cuenta.");
}

/**
 * Soft-delete an account by setting `archived_at = now()`. Refuses to archive
 * the user's last active account so the app always has somewhere to record
 * movements — once the user is down to a single account they have to create
 * a replacement before archiving the current one.
 */
export async function archiveAccount(id: string): Promise<void> {
  const supabase = createClient();

  // Count active accounts under RLS (returns only the user's own rows).
  const { count, error: countErr } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);

  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) <= 1) {
    throw new Error("Necesitas al menos una cuenta activa.");
  }

  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
  emitAccountUpserted();
}

/**
 * Bulk soft-delete EVERY active account owned by the current user. Unlike
 * `archiveAccount`, this does NOT enforce the "keep at least one active
 * account" floor — it's intended for factory-reset / "Restablecer cuentas"
 * flows where the user is intentionally wiping their setup. The next account
 * creation re-seeds the floor.
 *
 * RLS scopes UPDATE to the user's own rows; we still filter by `user_id`
 * explicitly as defense in depth. Returns the count of rows archived.
 */
export async function archiveAllUserAccounts(): Promise<number> {
  const supabase = createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userData.user.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message || "No pudimos restablecer las cuentas.");
  }
  emitAccountUpserted();
  return (data ?? []).length;
}

/**
 * Bulk soft-delete every active account of a specific kind (cash / card /
 * bank / yape / plin). Same "no floor" semantics as `archiveAllUserAccounts`.
 * Returns the count of rows archived.
 */
export async function archiveUserAccountsByKind(
  kind: AccountKind,
): Promise<number> {
  const supabase = createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userData.user.id)
    .eq("type", kind)
    .is("archived_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message || "No pudimos restablecer las cuentas.");
  }
  emitAccountUpserted();
  return (data ?? []).length;
}
