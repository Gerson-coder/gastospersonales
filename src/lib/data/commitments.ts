/**
 * Commitments data layer — Supabase-backed CRUD.
 *
 * Compromisos financieros (recibos, alquileres, prestamos, cuotas) que
 * el user trackea. Para detalle del modelo ver
 * `supabase/migrations/00025_commitments.sql`.
 *
 * Mismo patron que budgets.ts / goals.ts:
 *   - "use client" — bundle del browser, RLS auto-scope por user.
 *   - Throws con mensajes en espanol neutral; UI catchea + toastea.
 *   - Soft-delete via archived_at; sin DELETE policy.
 *
 * Money: amount_minor en BIGINT cents, mismo convention que transactions.
 * El mapper toView() expone amount en major (numeric, S/. 89.50).
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Currency } from "@/lib/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────

export type CommitmentKind = "payment" | "income" | "lent" | "borrowed";

export type CommitmentRecurrence =
  | "none"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly";

export type CommitmentStatus = "pending" | "completed" | "cancelled";

/** Raw row from the DB (snake_case + amount_minor). */
export type CommitmentRow = {
  id: string;
  user_id: string;
  kind: CommitmentKind;
  title: string;
  amount_minor: number;
  currency: Currency;
  due_date: string;
  recurrence: CommitmentRecurrence;
  status: CommitmentStatus;
  category_id: string | null;
  account_id: string | null;
  counterparty: string | null;
  notes: string | null;
  last_completed_at: string | null;
  remind_days_before: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from nested SELECT.
  categories?: { name: string } | null;
  accounts?: { name: string } | null;
};

/** Shape consumed by the UI. amount in major, joined names flattened. */
export type CommitmentView = {
  id: string;
  kind: CommitmentKind;
  title: string;
  amount: number; // major (89.50)
  currency: Currency;
  dueDate: string;
  recurrence: CommitmentRecurrence;
  status: CommitmentStatus;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  counterparty: string | null;
  notes: string | null;
  lastCompletedAt: string | null;
  remindDaysBefore: number;
  createdAt: string;
  updatedAt: string;
};

/** Form-side draft for createCommitment. */
export type CommitmentDraft = {
  kind: CommitmentKind;
  title: string;
  amount: number; // major
  currency: Currency;
  /** "YYYY-MM-DD" — local date, no TZ. */
  dueDate: string;
  recurrence: CommitmentRecurrence;
  categoryId: string | null;
  accountId: string | null;
  counterparty: string | null;
  notes: string | null;
  remindDaysBefore: number;
};

export type CommitmentPatch = Partial<CommitmentDraft> & {
  status?: CommitmentStatus;
};

const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";
const BIGINT_MAX = 9_223_372_036_854_775_000;
export const MAX_COMMITMENT_AMOUNT = 9_999_999.99;

const SELECT_WITH_JOINS =
  "id, user_id, kind, title, amount_minor, currency, due_date, recurrence, status, category_id, account_id, counterparty, notes, last_completed_at, remind_days_before, archived_at, created_at, updated_at, categories(name), accounts(name)";

// ─── Mappers ──────────────────────────────────────────────────────────

export function toView(row: CommitmentRow): CommitmentView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    amount: row.amount_minor / 100,
    currency: row.currency,
    dueDate: row.due_date,
    recurrence: row.recurrence,
    status: row.status,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    accountId: row.account_id,
    accountName: row.accounts?.name ?? null,
    counterparty: row.counterparty,
    notes: row.notes,
    lastCompletedAt: row.last_completed_at,
    remindDaysBefore: row.remind_days_before,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Valida + convierte un draft a payload para INSERT/UPDATE.
 * Throws con mensajes neutros si algo falla.
 */
function toInsertPayload(draft: CommitmentDraft, userId: string) {
  if (!userId) {
    throw new Error("Inicia sesión para crear compromisos.");
  }
  const title = draft.title.trim();
  if (!title) {
    throw new Error("El compromiso necesita un título.");
  }
  if (title.length > 80) {
    throw new Error("El título es demasiado largo (máximo 80 caracteres).");
  }
  if (typeof draft.amount !== "number" || !Number.isFinite(draft.amount)) {
    throw new Error("El monto no es válido.");
  }
  if (draft.amount <= 0) {
    throw new Error("El monto debe ser mayor a cero.");
  }
  if (draft.amount > MAX_COMMITMENT_AMOUNT) {
    throw new Error(
      `El monto no puede superar ${MAX_COMMITMENT_AMOUNT.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }
  const amountMinor = Math.round(draft.amount * 100);
  if (amountMinor > BIGINT_MAX) {
    throw new Error("El monto es demasiado grande para registrarlo.");
  }
  if (draft.currency !== "PEN" && draft.currency !== "USD") {
    throw new Error("Moneda inválida.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) {
    throw new Error("La fecha no es válida.");
  }
  if (
    draft.kind !== "payment" &&
    draft.kind !== "income" &&
    draft.kind !== "lent" &&
    draft.kind !== "borrowed"
  ) {
    throw new Error("Tipo de compromiso inválido.");
  }
  if (
    draft.recurrence !== "none" &&
    draft.recurrence !== "weekly" &&
    draft.recurrence !== "biweekly" &&
    draft.recurrence !== "monthly" &&
    draft.recurrence !== "yearly"
  ) {
    throw new Error("Recurrencia inválida.");
  }
  if (
    !Number.isInteger(draft.remindDaysBefore) ||
    draft.remindDaysBefore < 0 ||
    draft.remindDaysBefore > 30
  ) {
    throw new Error("Los días de recordatorio deben estar entre 0 y 30.");
  }
  // Counterparty solo aplica a prestamos. Para payment/income lo
  // ignoramos silenciosamente (no rompe, pero no se persiste).
  const counterparty =
    draft.kind === "lent" || draft.kind === "borrowed"
      ? draft.counterparty?.trim() || null
      : null;

  return {
    user_id: userId,
    kind: draft.kind,
    title,
    amount_minor: amountMinor,
    currency: draft.currency,
    due_date: draft.dueDate,
    recurrence: draft.recurrence,
    category_id: draft.categoryId,
    account_id: draft.accountId,
    counterparty,
    notes: draft.notes?.trim() ? draft.notes.trim() : null,
    remind_days_before: draft.remindDaysBefore,
  };
}

// ─── Reads ────────────────────────────────────────────────────────────

/**
 * Lista todos los compromisos activos del user. La UI filtra/agrupa
 * client-side (vencidos / proximos / completados / por kind) — preferimos
 * un fetch unico sobre N queries con filtros distintos.
 *
 * Order: due_date asc — los proximos a vencer arriba.
 */
export async function listCommitments(): Promise<CommitmentView[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("commitments")
    .select(SELECT_WITH_JOINS)
    .is("archived_at", null)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "No pudimos cargar los compromisos.");
  }

  const rows = (data ?? []) as unknown as CommitmentRow[];
  return rows.map(toView);
}

/** Fetch un compromiso por id. null cuando RLS lo esconde o ya no existe. */
export async function getCommitmentById(
  id: string,
): Promise<CommitmentView | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("commitments")
    .select(SELECT_WITH_JOINS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    if (error.code === NO_ROWS) return null;
    throw new Error(error.message || "No pudimos cargar el compromiso.");
  }
  if (!data) return null;
  return toView(data as unknown as CommitmentRow);
}

// ─── Cross-component event bus ─────────────────────────────────────────

/**
 * Misma idea que TX_UPSERTED_EVENT en transactions.ts. Se dispara tras
 * cada write para que listas montadas en otras rutas (dashboard banner
 * de proximos compromisos, en PR2) refetchen sin esperar realtime.
 */
export const COMMITMENT_UPSERTED_EVENT = "commitment:upserted";

function emitUpserted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMMITMENT_UPSERTED_EVENT));
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function createCommitment(
  draft: CommitmentDraft,
): Promise<CommitmentView> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Inicia sesión para crear compromisos.");
  }

  const payload = toInsertPayload(draft, user.id);

  const { data, error } = await supabase
    .from("commitments")
    .insert(payload)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    if (error.code === FK_VIOLATION) {
      throw new Error("La categoría o cuenta seleccionada ya no existe.");
    }
    throw new Error(error.message || "No pudimos crear el compromiso.");
  }

  emitUpserted();
  return toView(data as unknown as CommitmentRow);
}

export async function updateCommitment(
  id: string,
  patch: CommitmentPatch,
): Promise<CommitmentView> {
  const supabase = createSupabaseClient();

  // Para reusar el validador, si el patch trae todos los campos del
  // draft, lo pasamos por toInsertPayload. Sino, construimos el update
  // manualmente con los pocos campos que vinieron.
  const updates: Record<string, unknown> = {};

  if (patch.kind !== undefined) updates.kind = patch.kind;
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("El compromiso necesita un título.");
    if (t.length > 80) throw new Error("El título es demasiado largo.");
    updates.title = t;
  }
  if (patch.amount !== undefined) {
    if (
      !Number.isFinite(patch.amount) ||
      patch.amount <= 0 ||
      patch.amount > MAX_COMMITMENT_AMOUNT
    ) {
      throw new Error("El monto debe ser mayor a cero.");
    }
    updates.amount_minor = Math.round(patch.amount * 100);
  }
  if (patch.currency !== undefined) {
    if (patch.currency !== "PEN" && patch.currency !== "USD") {
      throw new Error("Moneda inválida.");
    }
    updates.currency = patch.currency;
  }
  if (patch.dueDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) {
      throw new Error("La fecha no es válida.");
    }
    updates.due_date = patch.dueDate;
  }
  if (patch.recurrence !== undefined) updates.recurrence = patch.recurrence;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.categoryId !== undefined) updates.category_id = patch.categoryId;
  if (patch.accountId !== undefined) updates.account_id = patch.accountId;
  if (patch.counterparty !== undefined) {
    updates.counterparty = patch.counterparty?.trim() || null;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes?.trim() ? patch.notes.trim() : null;
  }
  if (patch.remindDaysBefore !== undefined) {
    if (
      !Number.isInteger(patch.remindDaysBefore) ||
      patch.remindDaysBefore < 0 ||
      patch.remindDaysBefore > 30
    ) {
      throw new Error("Los días de recordatorio deben estar entre 0 y 30.");
    }
    updates.remind_days_before = patch.remindDaysBefore;
  }

  const { data, error } = await supabase
    .from("commitments")
    .update(updates)
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    if (error.code === NO_ROWS) {
      throw new Error("Este compromiso ya no existe.");
    }
    if (error.code === FK_VIOLATION) {
      throw new Error("La categoría o cuenta seleccionada ya no existe.");
    }
    throw new Error(error.message || "No pudimos actualizar el compromiso.");
  }

  emitUpserted();
  return toView(data as unknown as CommitmentRow);
}

/**
 * Soft-delete. PR2 podra agregar unarchive si vale la pena (igual que
 * transactions). Por ahora un solo sentido.
 */
export async function archiveCommitment(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("commitments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No pudimos archivar el compromiso.");
  }
  if (!data) {
    throw new Error("Este compromiso ya no existe.");
  }
  emitUpserted();
}

export async function unarchiveCommitment(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("commitments")
    .update({ archived_at: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No pudimos restaurar el compromiso.");
  }
  if (!data) {
    throw new Error("Este compromiso ya no existe.");
  }
  emitUpserted();
}

/**
 * Marca el compromiso como completado. Para puntuales (recurrence='none')
 * deja el status='completed' y no toca due_date. Para recurrentes,
 * actualiza last_completed_at, deja status='pending', y rolla due_date
 * al siguiente periodo (mensual/semanal/etc).
 *
 * En PR2 esta funcion ademas creara una transaccion real linkeada al
 * compromiso (createTransaction precargado con la categoria/cuenta del
 * commitment). Por ahora solo cambia el status — al user ya le sirve
 * para marcar "ya pague Sedapal" sin crear la tx.
 */
export async function markCompleted(id: string): Promise<CommitmentView> {
  const current = await getCommitmentById(id);
  if (!current) {
    throw new Error("Este compromiso ya no existe.");
  }

  const supabase = createSupabaseClient();
  const now = new Date().toISOString();

  // Una sola query para los dos casos — solo cambia el shape del patch
  // y la due_date.
  const patch =
    current.recurrence === "none"
      ? {
          status: "completed" as const,
          last_completed_at: now,
        }
      : {
          status: "pending" as const,
          last_completed_at: now,
          due_date: rollForwardDueDate(current.dueDate, current.recurrence),
        };

  const { data, error } = await supabase
    .from("commitments")
    .update(patch)
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    if (error.code === NO_ROWS) {
      throw new Error("Este compromiso ya no existe.");
    }
    throw new Error(error.message || "No pudimos marcar como completado.");
  }
  emitUpserted();
  return toView(data as unknown as CommitmentRow);
}

/**
 * Calcula la siguiente due_date para un compromiso recurrente.
 * Date math en UTC para evitar problemas de DST. Input/output son
 * "YYYY-MM-DD" (local conceptual, sin tz).
 */
export function rollForwardDueDate(
  current: string,
  recurrence: CommitmentRecurrence,
): string {
  if (recurrence === "none") return current;

  const [y, m, d] = current.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  switch (recurrence) {
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case "biweekly":
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case "monthly":
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case "yearly":
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }

  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ─── Helpers para la UI ───────────────────────────────────────────────

/**
 * Estado derivado: "overdue" cuando un pending tiene due_date < hoy.
 * El status real en DB sigue siendo "pending" — overdue es solo una
 * etiqueta visual.
 */
export type CommitmentDerivedStatus =
  | "overdue"
  | "due-soon" // dentro de remindDaysBefore
  | "upcoming"
  | "completed"
  | "cancelled";

export function deriveStatus(c: CommitmentView): CommitmentDerivedStatus {
  if (c.status === "completed") return "completed";
  if (c.status === "cancelled") return "cancelled";

  // Comparar fechas en local. due_date es "YYYY-MM-DD".
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (c.dueDate < todayKey) return "overdue";

  // Dias hasta vencer.
  const [y, m, d] = c.dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const diffMs = due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= c.remindDaysBefore) return "due-soon";
  return "upcoming";
}

export const KIND_LABEL: Record<CommitmentKind, string> = {
  payment: "Por pagar",
  income: "Por cobrar",
  lent: "Préstamo otorgado",
  borrowed: "Préstamo recibido",
};

export const RECURRENCE_LABEL: Record<CommitmentRecurrence, string> = {
  none: "Una sola vez",
  weekly: "Cada semana",
  biweekly: "Cada 15 días",
  monthly: "Cada mes",
  yearly: "Cada año",
};
