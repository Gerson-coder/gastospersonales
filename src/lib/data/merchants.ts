/**
 * Merchants data layer — Supabase-backed CRUD.
 *
 * All functions assume the caller is on the client (browser bundle) and that
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. The
 * UI layer is responsible for gating on `SUPABASE_ENABLED` so this module
 * never runs in demo mode.
 *
 * RLS contract (see `supabase/migrations/00006_merchants.sql`, mirrors the
 * `categories` policy set):
 *   - SELECT: own rows OR system rows (user_id IS NULL).
 *   - INSERT/UPDATE: only own rows (user_id = auth.uid()).
 *   - No DELETE — soft-delete via `archived_at`.
 *
 * Graceful degradation: this feature ships behind unmerged migrations.
 * Until `00006_merchants.sql` lands, the `merchants` table and the
 * `list_mru_merchants` RPC don't exist on the remote DB. Read-side calls
 * (`listMerchantsByCategory`, `listMRUMerchants`) catch the
 * "relation/function does not exist" Postgres error codes and return an
 * empty list with a single `console.warn`, so the UI never crashes during
 * the rollout window. Write-side calls throw a friendly Spanish error
 * pointing the user (or admin) at the missing migration.
 *
 * All functions throw on error; the UI catches and toasts.
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export type Merchant = {
  id: string;
  // NULL → system merchant visible to every authenticated user.
  user_id: string | null;
  category_id: string;
  name: string;
  // Filename stem (kebab-case) for the static SVG at
  // /public/logos/merchants/{logo_slug}.svg. NULL → render the deterministic
  // initials avatar at runtime. System seeds get slugs in 00008; user-created
  // merchants are NULL until we ship a logo upload feature.
  logo_slug: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MerchantDraft = {
  name: string;
  categoryId: string;
};

export type MerchantPatch = {
  name?: string;
};

/** Postgres unique-violation code (duplicate `(user_id, category_id, name)`). */
const UNIQUE_VIOLATION = "23505";
/** Postgres "undefined_table" — table doesn't exist (pre-migration). */
const UNDEFINED_TABLE = "42P01";
/** Postgres "undefined_function" — RPC doesn't exist (pre-migration). */
const UNDEFINED_FUNCTION = "42883";
/** Max merchant-name length, mirrors the DB CHECK constraint. */
const MAX_NAME_LENGTH = 64;

/**
 * Module-scoped guards so the "feature not deployed yet" warning fires
 * exactly once per session per code path. Reloading the page resets them,
 * which is the right cadence — we want to know once after each refresh,
 * not every time a chip re-renders.
 */
let warnedMissingTable = false;
let warnedMissingFunction = false;

function warnTableMissingOnce(operation: string): void {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(
    `[merchants] La tabla "merchants" todavía no existe en la base. ` +
      `${operation} devuelve una lista vacía hasta que se aplique la migración 00006_merchants.sql.`,
  );
}

function warnFunctionMissingOnce(): void {
  if (warnedMissingFunction) return;
  warnedMissingFunction = true;
  console.warn(
    `[merchants] La función "list_mru_merchants" todavía no existe en la base. ` +
      `MRU devuelve una lista vacía hasta que se aplique la migración 00006_merchants.sql.`,
  );
}

/**
 * Detect the family of "feature not yet deployed" errors. We treat
 * `undefined_table`, `undefined_function`, and the supabase-js shaped
 * 404 the same way: gracefully degrade to an empty list.
 */
function isMissingFeatureError(code: string | undefined): boolean {
  return code === UNDEFINED_TABLE || code === UNDEFINED_FUNCTION;
}

/**
 * List all visible merchants for a category: system rows (user_id IS NULL)
 * + the current user's own non-archived rows. System rows come first, then
 * user rows alphabetical by name (case-insensitive, Spanish collation).
 *
 * The RLS policy already filters by current user, so we don't need to
 * scope by `user_id` in the query — we just exclude archived rows and
 * narrow by category.
 */
export async function listMerchantsByCategory(
  categoryId: string,
): Promise<Merchant[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("merchants")
    .select("id,user_id,category_id,name,logo_slug,archived_at,created_at,updated_at")
    .eq("category_id", categoryId)
    .is("archived_at", null);

  if (error) {
    if (isMissingFeatureError(error.code)) {
      warnTableMissingOnce("listMerchantsByCategory");
      return [];
    }
    throw new Error(error.message || "No pudimos cargar los comercios.");
  }

  const rows = (data ?? []) as Merchant[];
  return rows.slice().sort((a, b) => {
    // System (user_id NULL) first.
    const aSystem = a.user_id === null ? 0 : 1;
    const bSystem = b.user_id === null ? 0 : 1;
    if (aSystem !== bSystem) return aSystem - bSystem;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}

/**
 * Most-recently-used merchants for a category, scored server-side over the
 * user's last 90 days of transactions. See migration 00006 for the SQL
 * (uses + last_used DESC, capped by `p_limit`).
 *
 * Pre-migration this RPC doesn't exist; we degrade silently to an empty
 * array so the picker simply shows no MRU chips — the "Ver más" drawer
 * still works because it goes through `listMerchantsByCategory`.
 */
export async function listMRUMerchants(
  categoryId: string,
  limit = 3,
): Promise<Merchant[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc("list_mru_merchants", {
    p_category_id: categoryId,
    p_limit: limit,
  });

  if (error) {
    if (isMissingFeatureError(error.code)) {
      warnFunctionMissingOnce();
      return [];
    }
    // Anything else is a real bug; loud warn so dev sees it but don't
    // block the capture flow — the picker has a valid empty state.
    console.warn(
      `[merchants] list_mru_merchants falló (${error.code ?? "sin código"}): ${error.message}`,
    );
    return [];
  }

  // logo_slug viene del RPC desde 00008 (CREATE OR REPLACE en la misma migración).
  return (data ?? []) as Merchant[];
}

/**
 * Insert a new user-owned merchant. The DB unique index covers
 * (user_id, category_id, name) — on violation we surface a friendly
 * Spanish message scoped to the category so it matches what the user
 * sees in the picker.
 *
 * `user_id` is set explicitly from the current session so the RLS INSERT
 * policy (`user_id = auth.uid()`) passes.
 */
export async function createMerchant(draft: MerchantDraft): Promise<Merchant> {
  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Necesitás iniciar sesión para crear comercios.");
  }

  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    throw new Error("El nombre del comercio no puede estar vacío.");
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw new Error(
      `El nombre del comercio no puede tener más de ${MAX_NAME_LENGTH} caracteres.`,
    );
  }
  if (!draft.categoryId) {
    throw new Error("Tienes que elegir una categoría para el comercio.");
  }

  const { data, error } = await supabase
    .from("merchants")
    .insert({
      user_id: user.id,
      category_id: draft.categoryId,
      name: trimmedName,
    })
    .select("id,user_id,category_id,name,logo_slug,archived_at,created_at,updated_at")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(
        "Ya tienes un comercio con ese nombre en esta categoría.",
      );
    }
    if (isMissingFeatureError(error.code)) {
      throw new Error(
        "El feature de comercios no está disponible todavía. Pide al admin que aplique las migraciones.",
      );
    }
    throw new Error(error.message || "No pudimos crear el comercio.");
  }

  return data as Merchant;
}

/**
 * Update a user-owned merchant. RLS rejects updates to system rows, but we
 * also short-circuit on the client to give a clearer error than a silent
 * 0-row response.
 */
export async function updateMerchant(
  id: string,
  patch: MerchantPatch,
): Promise<Merchant> {
  const supabase = createSupabaseClient();

  const updates: { name?: string } = {};
  if (typeof patch.name === "string") {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      throw new Error("El nombre del comercio no puede estar vacío.");
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new Error(
        `El nombre del comercio no puede tener más de ${MAX_NAME_LENGTH} caracteres.`,
      );
    }
    updates.name = trimmed;
  }

  const { data, error } = await supabase
    .from("merchants")
    .update(updates)
    .eq("id", id)
    .select("id,user_id,category_id,name,logo_slug,archived_at,created_at,updated_at")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(
        "Ya tienes un comercio con ese nombre en esta categoría.",
      );
    }
    // RLS returns no row when the update is not permitted — supabase-js
    // surfaces this as PGRST116 ("Results contain 0 rows"). Translate.
    if (error.code === "PGRST116") {
      throw new Error("No puedes editar los comercios del sistema.");
    }
    if (isMissingFeatureError(error.code)) {
      throw new Error(
        "El feature de comercios no está disponible todavía. Pide al admin que aplique las migraciones.",
      );
    }
    throw new Error(error.message || "No pudimos actualizar el comercio.");
  }

  return data as Merchant;
}

/**
 * Bulk soft-delete only the user's own merchants. System seeds (user_id IS
 * NULL) stay intact — RLS would block them anyway, but the explicit
 * `user_id` filter makes the intent obvious. Returns the count of rows
 * archived. Used by the factory-reset flow in /settings.
 *
 * If the merchants table doesn't exist yet (pre-migration 00006) this
 * gracefully returns 0 rather than throwing — the rest of the factory
 * reset still has work to do.
 */
export async function archiveAllUserMerchants(): Promise<number> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("merchants")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    if (isMissingFeatureError(error.code)) {
      warnTableMissingOnce("archiveAllUserMerchants");
      return 0;
    }
    throw new Error(error.message || "No pudimos restablecer los comercios.");
  }
  return (data ?? []).length;
}

/**
 * Soft-delete: set `archived_at = now()`. The list query filters these out
 * automatically. RLS prevents users from archiving system merchants.
 */
export async function archiveMerchant(id: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error, data } = await supabase
    .from("merchants")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("No puedes archivar los comercios del sistema.");
    }
    if (isMissingFeatureError(error.code)) {
      throw new Error(
        "El feature de comercios no está disponible todavía. Pide al admin que aplique las migraciones.",
      );
    }
    throw new Error(error.message || "No pudimos archivar el comercio.");
  }

  if (!data) {
    // RLS quietly returned 0 rows — likely a system merchant.
    throw new Error("No puedes archivar los comercios del sistema.");
  }
}
