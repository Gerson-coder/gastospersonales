/**
 * Templates data layer — Supabase-backed CRUD para gastos/ingresos
 * frecuentes (Starbucks S/ 18 en Comida con BCP Sueldo).
 *
 * Mismo patron que commitments.ts / budgets.ts:
 *   - "use client" — bundle del browser, RLS auto-scope por user.
 *   - Throws con mensajes en espanol neutral; UI catchea + toastea.
 *   - Soft-delete via archived_at; sin DELETE policy.
 *
 * El template no es una tx — es una receta. listTemplates() ordena por
 * usage_count desc para que el dashboard muestre los mas tappeados
 * arriba. Cada uso bumpea usage_count + last_used_at via
 * incrementTemplateUsage().
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Currency } from "@/lib/supabase/types";
import type {
  TransactionDraft,
  TransactionKind,
} from "@/lib/data/transactions";

// ─── Types ────────────────────────────────────────────────────────────

/** Raw row del DB (snake_case + amount_minor). */
export type TemplateRow = {
  id: string;
  user_id: string;
  title: string;
  kind: TransactionKind;
  amount_minor: number;
  currency: Currency;
  category_id: string | null;
  account_id: string | null;
  merchant_id: string | null;
  note: string | null;
  usage_count: number;
  last_used_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields.
  categories?: { name: string } | null;
  accounts?: { name: string } | null;
  merchants?: { name: string; logo_slug: string | null } | null;
};

/** Shape consumido por la UI. amount en major, joined names flat. */
export type TemplateView = {
  id: string;
  title: string;
  kind: TransactionKind;
  amount: number; // major
  currency: Currency;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  merchantId: string | null;
  merchantName: string | null;
  merchantLogoSlug: string | null;
  note: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Form-side draft para createTemplate. */
export type TemplateDraft = {
  title: string;
  kind: TransactionKind;
  amount: number; // major
  currency: Currency;
  categoryId: string | null;
  accountId: string | null;
  merchantId: string | null;
  note: string | null;
};

export type TemplatePatch = Partial<TemplateDraft>;

const NO_ROWS = "PGRST116";
const FK_VIOLATION = "23503";
const BIGINT_MAX = 9_223_372_036_854_775_000;
export const MAX_TEMPLATE_AMOUNT = 999_999.99;

const SELECT_WITH_JOINS =
  "id, user_id, kind, title, amount_minor, currency, category_id, account_id, merchant_id, note, usage_count, last_used_at, archived_at, created_at, updated_at, categories(name), accounts(name), merchants(name, logo_slug)";

// ─── Mappers ──────────────────────────────────────────────────────────

export function toView(row: TemplateRow): TemplateView {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    amount: row.amount_minor / 100,
    currency: row.currency,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    accountId: row.account_id,
    accountName: row.accounts?.name ?? null,
    merchantId: row.merchant_id,
    merchantName: row.merchants?.name ?? null,
    merchantLogoSlug: row.merchants?.logo_slug ?? null,
    note: row.note,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertPayload(draft: TemplateDraft, userId: string) {
  if (!userId) {
    throw new Error("Inicia sesión para crear templates.");
  }
  const title = draft.title.trim();
  if (!title) {
    throw new Error("El template necesita un título.");
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
  if (draft.amount > MAX_TEMPLATE_AMOUNT) {
    throw new Error(
      `El monto no puede superar ${MAX_TEMPLATE_AMOUNT.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }
  const amountMinor = Math.round(draft.amount * 100);
  if (amountMinor > BIGINT_MAX) {
    throw new Error("El monto es demasiado grande para registrarlo.");
  }
  if (draft.currency !== "PEN" && draft.currency !== "USD") {
    throw new Error("Moneda inválida.");
  }
  if (draft.kind !== "expense" && draft.kind !== "income") {
    throw new Error("Tipo de movimiento inválido.");
  }

  return {
    user_id: userId,
    title,
    kind: draft.kind,
    amount_minor: amountMinor,
    currency: draft.currency,
    category_id: draft.categoryId,
    account_id: draft.accountId,
    merchant_id: draft.merchantId,
    note: draft.note?.trim() ? draft.note.trim() : null,
  };
}

// ─── Reads ────────────────────────────────────────────────────────────

/**
 * Lista todos los templates activos del user, ordenados por uso
 * (usage_count desc, last_used_at desc nulls last). El dashboard usa
 * este orden directo sin re-ordenar — los mas tappeados quedan arriba.
 */
export async function listTemplates(): Promise<TemplateView[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transaction_templates")
    .select(SELECT_WITH_JOINS)
    .is("archived_at", null)
    .order("usage_count", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(error.message || "No pudimos cargar los templates.");
  }
  const rows = (data ?? []) as unknown as TemplateRow[];
  return rows.map(toView);
}

export async function getTemplateById(
  id: string,
): Promise<TemplateView | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transaction_templates")
    .select(SELECT_WITH_JOINS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    if (error.code === NO_ROWS) return null;
    throw new Error(error.message || "No pudimos cargar el template.");
  }
  if (!data) return null;
  return toView(data as unknown as TemplateRow);
}

// ─── Cross-component event bus ─────────────────────────────────────────

/**
 * Misma idea que TX_UPSERTED_EVENT / COMMITMENT_UPSERTED_EVENT.
 * El dashboard quick row escucha este evento para refetchear cuando
 * el user crea/edita/usa un template desde otra ruta.
 */
export const TEMPLATE_UPSERTED_EVENT = "template:upserted";

function emitUpserted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TEMPLATE_UPSERTED_EVENT));
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function createTemplate(
  draft: TemplateDraft,
): Promise<TemplateView> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Inicia sesión para crear templates.");
  }

  const payload = toInsertPayload(draft, user.id);

  const { data, error } = await supabase
    .from("transaction_templates")
    .insert(payload)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    if (error.code === FK_VIOLATION) {
      throw new Error("La categoría, cuenta o comercio ya no existe.");
    }
    throw new Error(error.message || "No pudimos crear el template.");
  }
  emitUpserted();
  return toView(data as unknown as TemplateRow);
}

export async function updateTemplate(
  id: string,
  patch: TemplatePatch,
): Promise<TemplateView> {
  const supabase = createSupabaseClient();

  // Shape inline (no Record<string, unknown>) para que postgrest-js
  // v2.45+ no tipe el .update como never.
  const updates: {
    title?: string;
    kind?: TransactionKind;
    amount_minor?: number;
    currency?: Currency;
    category_id?: string | null;
    account_id?: string | null;
    merchant_id?: string | null;
    note?: string | null;
  } = {};

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("El template necesita un título.");
    if (t.length > 80) throw new Error("El título es demasiado largo.");
    updates.title = t;
  }
  if (patch.kind !== undefined) {
    if (patch.kind !== "expense" && patch.kind !== "income") {
      throw new Error("Tipo de movimiento inválido.");
    }
    updates.kind = patch.kind;
  }
  if (patch.amount !== undefined) {
    if (
      !Number.isFinite(patch.amount) ||
      patch.amount <= 0 ||
      patch.amount > MAX_TEMPLATE_AMOUNT
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
  if (patch.categoryId !== undefined) updates.category_id = patch.categoryId;
  if (patch.accountId !== undefined) updates.account_id = patch.accountId;
  if (patch.merchantId !== undefined) updates.merchant_id = patch.merchantId;
  if (patch.note !== undefined) {
    updates.note = patch.note?.trim() ? patch.note.trim() : null;
  }

  const { data, error } = await supabase
    .from("transaction_templates")
    .update(updates)
    .eq("id", id)
    .is("archived_at", null)
    .select(SELECT_WITH_JOINS)
    .single();

  if (error) {
    if (error.code === NO_ROWS) {
      throw new Error("Este template ya no existe.");
    }
    if (error.code === FK_VIOLATION) {
      throw new Error("La categoría, cuenta o comercio ya no existe.");
    }
    throw new Error(error.message || "No pudimos actualizar el template.");
  }
  emitUpserted();
  return toView(data as unknown as TemplateRow);
}

export async function archiveTemplate(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transaction_templates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No pudimos archivar el template.");
  }
  if (!data) {
    throw new Error("Este template ya no existe.");
  }
  emitUpserted();
}

export async function unarchiveTemplate(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("transaction_templates")
    .update({ archived_at: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No pudimos restaurar el template.");
  }
  if (!data) {
    throw new Error("Este template ya no existe.");
  }
  emitUpserted();
}

/**
 * Bump usage_count + last_used_at. Llamada desde el handler del quick
 * row del dashboard tras crear la transaccion. Best-effort: si falla,
 * no rompe el flujo — la tx ya quedo creada, el orden del row ya se
 * recalcula la proxima vez.
 */
export async function incrementTemplateUsage(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  // Lee el actual + escribe el +1. Una RPC `bump_template_usage` seria
  // mas atomica pero mientras no hay race contention vale la pena
  // mantener el scope de la migration minimo.
  const current = await getTemplateById(id);
  if (!current) return;
  const { error } = await supabase
    .from("transaction_templates")
    .update({
      usage_count: current.usageCount + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("archived_at", null);

  if (error) {
    // Silenciamos — el bump es metadata, no datos del user.
    console.warn("incrementTemplateUsage failed:", error.message);
    return;
  }
  emitUpserted();
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Convierte un Template a un TransactionDraft listo para
 * `createTransaction`. Pure helper — no I/O.
 */
export function templateToTransactionDraft(
  t: TemplateView,
): TransactionDraft | null {
  // Sin accountId no podemos crear la tx (es required). El UI debe
  // bloquear el tap o redirigir a /capture pre-llenado. Devolvemos
  // null para que el caller decida.
  if (!t.accountId) return null;
  return {
    amount: t.amount,
    currency: t.currency,
    kind: t.kind,
    categoryId: t.categoryId,
    merchantId: t.merchantId,
    accountId: t.accountId,
    note: t.note,
    source: "manual",
  };
}
