/**
 * Budgets data layer — Supabase-backed CRUD.
 *
 * Mirror of `categories.ts` / `merchants.ts` patterns:
 *   - Browser bundle ("use client"); UI gates on SUPABASE_ENABLED.
 *   - Throws on error with friendly neutral-Spanish messages; UI catches + toasts.
 *
 * RLS contract (see `supabase/migrations/00023_budgets_goals.sql`):
 *   - SELECT/INSERT/UPDATE: only own rows (auth.uid() = user_id).
 *   - No DELETE policy — soft-delete via `archived_at`.
 *
 * Money is stored as `limit_minor` (BIGINT, integer cents) consistent with
 * the rest of the schema. The UI consumes `_minor` directly (matches the
 * existing budgets/goals UI and the `categories.ts` "expose snake_case"
 * convention) — no per-row mapper needed at this layer.
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Currency } from "@/lib/supabase/types";

export type Budget = {
  id: string;
  user_id: string;
  category_id: string;
  limit_minor: number;
  currency: Currency;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetDraft = {
  categoryId: string;
  limitMinor: number;
  currency: Currency;
};

export type BudgetPatch = Partial<BudgetDraft>;

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key violation code. */
const FK_VIOLATION = "23503";

const SELECT_COLS =
  "id,user_id,category_id,limit_minor,currency,archived_at,created_at,updated_at";

/**
 * List all non-archived budgets visible to the current user. The UI filters
 * by active currency client-side so this fetch works for both PEN/USD switches
 * without re-firing.
 */
export async function listBudgets(): Promise<Budget[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("budgets")
    .select(SELECT_COLS)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "No pudimos cargar los presupuestos.");
  }
  return (data ?? []) as Budget[];
}

/**
 * Insert a new budget. The DB unique index covers
 * `(user_id, category_id, currency)` for non-archived rows — on violation we
 * surface a friendly Spanish message.
 */
export async function createBudget(draft: BudgetDraft): Promise<Budget> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Necesitas iniciar sesión para crear presupuestos.");
  }
  if (!draft.categoryId) {
    throw new Error("Elige una categoría para el presupuesto.");
  }
  if (
    !Number.isFinite(draft.limitMinor) ||
    draft.limitMinor <= 0 ||
    !Number.isInteger(draft.limitMinor)
  ) {
    throw new Error("El monto del presupuesto debe ser mayor a cero.");
  }
  if (draft.currency !== "PEN" && draft.currency !== "USD") {
    throw new Error("Moneda inválida.");
  }

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      user_id: user.id,
      category_id: draft.categoryId,
      limit_minor: draft.limitMinor,
      currency: draft.currency,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(
        "Ya tienes un presupuesto para esta categoría en esta moneda.",
      );
    }
    if (error.code === FK_VIOLATION) {
      throw new Error("La categoría seleccionada ya no existe.");
    }
    throw new Error(error.message || "No pudimos crear el presupuesto.");
  }

  return data as Budget;
}

/**
 * Update a user-owned budget. RLS hides rows the user doesn't own.
 */
export async function updateBudget(
  id: string,
  patch: BudgetPatch,
): Promise<Budget> {
  const supabase = createSupabaseClient();
  const updates: {
    category_id?: string;
    limit_minor?: number;
    currency?: Currency;
  } = {};

  if (typeof patch.categoryId === "string") {
    if (!patch.categoryId) {
      throw new Error("Elige una categoría para el presupuesto.");
    }
    updates.category_id = patch.categoryId;
  }
  if (typeof patch.limitMinor === "number") {
    if (
      !Number.isFinite(patch.limitMinor) ||
      patch.limitMinor <= 0 ||
      !Number.isInteger(patch.limitMinor)
    ) {
      throw new Error("El monto del presupuesto debe ser mayor a cero.");
    }
    updates.limit_minor = patch.limitMinor;
  }
  if (patch.currency) {
    if (patch.currency !== "PEN" && patch.currency !== "USD") {
      throw new Error("Moneda inválida.");
    }
    updates.currency = patch.currency;
  }

  const { data, error } = await supabase
    .from("budgets")
    .update(updates)
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(
        "Ya tienes un presupuesto para esta categoría en esta moneda.",
      );
    }
    if (error.code === FK_VIOLATION) {
      throw new Error("La categoría seleccionada ya no existe.");
    }
    if (error.code === "PGRST116") {
      throw new Error("Este presupuesto ya no existe.");
    }
    throw new Error(error.message || "No pudimos actualizar el presupuesto.");
  }

  return data as Budget;
}

/**
 * Soft-delete a budget. Reads filter out archived rows.
 */
export async function archiveBudget(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("budgets")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No pudimos archivar el presupuesto.");
  }
  if (!data) {
    throw new Error("Este presupuesto ya no existe.");
  }
}

/**
 * Bulk soft-delete every active budget owned by the current user. Used by the
 * factory-reset flow in /settings. RLS scopes UPDATE to the user's own rows;
 * we add an explicit `user_id` filter as defense in depth.
 */
export async function archiveAllUserBudgets(): Promise<number> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("budgets")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message || "No pudimos restablecer los presupuestos.");
  }
  return (data ?? []).length;
}
