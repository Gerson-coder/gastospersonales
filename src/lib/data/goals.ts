/**
 * Goals data layer — Supabase-backed CRUD.
 *
 * Mirror of `budgets.ts` / `categories.ts` patterns:
 *   - Browser bundle ("use client"); UI gates on SUPABASE_ENABLED.
 *   - Throws on error with friendly neutral-Spanish messages; UI catches + toasts.
 *
 * RLS contract (see `supabase/migrations/00023_budgets_goals.sql`):
 *   - SELECT/INSERT/UPDATE: only own rows (auth.uid() = user_id).
 *   - No DELETE policy — soft-delete via `archived_at`.
 *
 * Money is stored as `target_minor` / `current_minor` (BIGINT, integer cents)
 * consistent with the rest of the schema. The UI consumes `_minor` directly
 * (matches the existing goals UI and the project-wide convention).
 *
 * `contributeGoal` does a fetch-then-update WITHOUT optimistic concurrency.
 * Tradeoff: simultaneous contributions from two devices could lose a delta.
 * Acceptable for the personal-finance use case where a single user typically
 * only edits from one device at a time. If we ever see drift in production,
 * promote this to a SECURITY DEFINER RPC that does the math atomically.
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Currency } from "@/lib/supabase/types";

export type GoalIcon =
  | "target"
  | "plane"
  | "home"
  | "car"
  | "graduation-cap"
  | "heart"
  | "gift"
  | "piggy-bank"
  | "sparkles";

export type Goal = {
  id: string;
  user_id: string;
  name: string;
  target_minor: number;
  current_minor: number;
  currency: Currency;
  /** ISO date (YYYY-MM-DD) or null. */
  deadline: string | null;
  icon: GoalIcon;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalDraft = {
  name: string;
  targetMinor: number;
  currency: Currency;
  deadlineISO: string | null;
  icon: GoalIcon;
};

export type GoalPatch = Partial<GoalDraft>;

const NO_ROWS = "PGRST116";
const SELECT_COLS =
  "id,user_id,name,target_minor,current_minor,currency,deadline,icon,archived_at,created_at,updated_at";

const NAME_MAX = 80;

/**
 * List all non-archived goals visible to the current user. The UI filters
 * by active currency client-side.
 */
export async function listGoals(): Promise<Goal[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("goals")
    .select(SELECT_COLS)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "No pudimos cargar las metas.");
  }
  return (data ?? []) as Goal[];
}

function validateDraft(
  draft: Partial<GoalDraft>,
  options: { allowMissing?: boolean } = {},
): void {
  const { allowMissing = false } = options;

  if (!allowMissing || typeof draft.name === "string") {
    const trimmed = (draft.name ?? "").trim();
    if (!trimmed) throw new Error("Asigna un nombre a tu meta.");
    if (trimmed.length > NAME_MAX) {
      throw new Error(`El nombre no puede superar ${NAME_MAX} caracteres.`);
    }
  }
  if (!allowMissing || typeof draft.targetMinor === "number") {
    const v = draft.targetMinor;
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v <= 0 ||
      !Number.isInteger(v)
    ) {
      throw new Error("Ingresa un monto objetivo mayor a cero.");
    }
  }
  if (!allowMissing || draft.currency !== undefined) {
    if (draft.currency !== "PEN" && draft.currency !== "USD") {
      throw new Error("Moneda inválida.");
    }
  }
  if (!allowMissing || draft.icon !== undefined) {
    if (typeof draft.icon !== "string") {
      throw new Error("Ícono inválido.");
    }
  }
}

/**
 * Insert a new goal. `current_minor` defaults to 0 server-side.
 */
export async function createGoal(draft: GoalDraft): Promise<Goal> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Necesitas iniciar sesión para crear metas.");
  }

  validateDraft(draft);

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: user.id,
      name: draft.name.trim(),
      target_minor: draft.targetMinor,
      currency: draft.currency,
      deadline: draft.deadlineISO,
      icon: draft.icon,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    throw new Error(error.message || "No pudimos crear la meta.");
  }

  return data as Goal;
}

/**
 * Update a user-owned goal. RLS hides rows the user doesn't own.
 */
export async function updateGoal(id: string, patch: GoalPatch): Promise<Goal> {
  const supabase = createSupabaseClient();
  validateDraft(patch, { allowMissing: true });

  const updates: {
    name?: string;
    target_minor?: number;
    currency?: Currency;
    deadline?: string | null;
    icon?: GoalIcon;
  } = {};
  if (typeof patch.name === "string") updates.name = patch.name.trim();
  if (typeof patch.targetMinor === "number")
    updates.target_minor = patch.targetMinor;
  if (patch.currency) updates.currency = patch.currency;
  if (patch.deadlineISO !== undefined) updates.deadline = patch.deadlineISO;
  if (patch.icon) updates.icon = patch.icon;

  const { data, error } = await supabase
    .from("goals")
    .update(updates)
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === NO_ROWS) {
      throw new Error("Esta meta ya no existe.");
    }
    throw new Error(error.message || "No pudimos actualizar la meta.");
  }
  return data as Goal;
}

/**
 * Atomically (best-effort) update `current_minor` by `deltaMinor` in the
 * given direction. Reads the current value, computes
 * `Math.max(0, current +/- delta)`, then writes it back.
 *
 * Race-condition note: two simultaneous contributions from two devices
 * could lose a delta. Acceptable for the single-user-personal-finance
 * model — see module-level comment.
 */
export async function contributeGoal(
  id: string,
  deltaMinor: number,
  mode: "add" | "subtract",
): Promise<Goal> {
  if (
    !Number.isFinite(deltaMinor) ||
    deltaMinor <= 0 ||
    !Number.isInteger(deltaMinor)
  ) {
    throw new Error("Ingresa un monto mayor a cero.");
  }

  const supabase = createSupabaseClient();

  const { data: existing, error: readErr } = await supabase
    .from("goals")
    .select("current_minor")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (readErr) {
    throw new Error(readErr.message || "No pudimos leer la meta.");
  }
  if (!existing) {
    throw new Error("Esta meta ya no existe.");
  }

  const change = mode === "add" ? deltaMinor : -deltaMinor;
  const next = Math.max(0, existing.current_minor + change);

  const { data, error } = await supabase
    .from("goals")
    .update({ current_minor: next })
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (error.code === NO_ROWS) {
      throw new Error("Esta meta ya no existe.");
    }
    throw new Error(error.message || "No pudimos registrar el aporte.");
  }
  return data as Goal;
}

/**
 * Soft-delete a goal.
 */
export async function archiveGoal(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No pudimos archivar la meta.");
  }
  if (!data) {
    throw new Error("Esta meta ya no existe.");
  }
}

/**
 * Bulk soft-delete every active goal owned by the current user. Used by the
 * factory-reset flow in /settings.
 */
export async function archiveAllUserGoals(): Promise<number> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message || "No pudimos restablecer las metas.");
  }
  return (data ?? []).length;
}
