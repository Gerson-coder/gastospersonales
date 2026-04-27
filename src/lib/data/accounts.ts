/**
 * Accounts data layer — Lumi
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
import type { AccountType, Currency } from "@/lib/supabase/types";

export type AccountKind = AccountType; // alias for UI vocabulary
export type { Currency };

/** Shape returned to the UI. Mirrors the mock that previously lived inline. */
export type Account = {
  id: string;
  label: string;
  kind: AccountKind;
  currency: Currency;
};

export type CreateAccountInput = {
  label: string;
  kind: AccountKind;
  currency: Currency;
};

export type UpdateAccountInput = Partial<CreateAccountInput>;

// ─── Internal helpers ────────────────────────────────────────────────────
type DbAccountRow = {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
};

function toAccount(row: DbAccountRow): Account {
  return {
    id: row.id,
    label: row.name,
    kind: row.type,
    currency: row.currency,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────
/**
 * List the current user's active (non-archived) accounts. Ordered by
 * `created_at` ascending so the auto-created "Efectivo" stays first.
 */
export async function listAccounts(): Promise<Account[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type, currency, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) =>
    toAccount({ id: r.id, name: r.name, type: r.type, currency: r.currency }),
  );
}

/**
 * Insert a new account for the current user. We need `user_id` even though
 * RLS will validate it — the column is NOT NULL and has no default.
 */
export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const supabase = createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error("Iniciá sesión para crear una cuenta.");
  }

  const trimmed = input.label.trim();
  if (!trimmed) throw new Error("El nombre de la cuenta no puede estar vacío.");

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userData.user.id,
      name: trimmed,
      type: input.kind,
      currency: input.currency,
    })
    .select("id, name, type, currency")
    .single();

  if (error) throw friendlyAccountError(error);
  return toAccount(data);
}

/** Update the editable fields of an account. */
export async function updateAccount(
  id: string,
  patch: UpdateAccountInput,
): Promise<Account> {
  const supabase = createClient();

  const dbPatch: { name?: string; type?: AccountType; currency?: Currency } = {};
  if (patch.label !== undefined) {
    const trimmed = patch.label.trim();
    if (!trimmed) throw new Error("El nombre de la cuenta no puede estar vacío.");
    dbPatch.name = trimmed;
  }
  if (patch.kind !== undefined) dbPatch.type = patch.kind;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;

  const { data, error } = await supabase
    .from("accounts")
    .update(dbPatch)
    .eq("id", id)
    .select("id, name, type, currency")
    .single();

  if (error) throw friendlyAccountError(error);
  return toAccount(data);
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
 * movements (the auto-created "Efectivo" is the floor).
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
    throw new Error("Necesitás al menos una cuenta activa.");
  }

  const { error } = await supabase
    .from("accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
