/**
 * Categories data layer — Supabase-backed CRUD.
 *
 * All functions assume the caller is on the client (browser bundle) and that
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. The
 * UI layer is responsible for gating on `SUPABASE_ENABLED` so this module
 * never runs in demo mode.
 *
 * RLS contract (see `supabase/migrations/00002_rls.sql`):
 *   - SELECT: own rows OR system rows (user_id IS NULL).
 *   - INSERT/UPDATE: only own rows (user_id = auth.uid()).
 *   - No DELETE — soft-delete via `archived_at`.
 *
 * All functions throw on error; the UI catches and toasts.
 */
"use client";

import {
  cacheCategories,
  isOfflineError,
  readCategoriesCache,
} from "@/lib/offline/cache";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { CategoryKind } from "@/lib/supabase/types";

export type Category = {
  id: string;
  // NULL → system category visible to every authenticated user.
  user_id: string | null;
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoryDraft = {
  name: string;
  kind: CategoryKind;
  icon: string | null;
};

export type CategoryPatch = {
  name?: string;
  icon?: string | null;
};

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = "23505";

/**
 * List all visible categories: system rows (user_id IS NULL) + the current
 * user's own non-archived rows. System rows come first, then user rows
 * alphabetical by name (case-insensitive).
 *
 * The RLS policy already filters by current user, so we don't need to scope
 * by `user_id` in the query — we just exclude archived rows and let the
 * server return what the user can see.
 */
export async function listCategories(): Promise<Category[]> {
  const supabase = createSupabaseClient();
  try {
    const { data, error } = await supabase
      .from("categories")
      .select(
        "id,user_id,name,kind,color,icon,archived_at,created_at,updated_at",
      )
      .is("archived_at", null);

    if (error) {
      throw new Error(error.message || "No pudimos cargar las categorías.");
    }

    const rows = (data ?? []) as Category[];
    const sorted = rows.slice().sort((a, b) => {
      // System (user_id NULL) first.
      const aSystem = a.user_id === null ? 0 : 1;
      const bSystem = b.user_id === null ? 0 : 1;
      if (aSystem !== bSystem) return aSystem - bSystem;
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });
    // Mirror to offline cache (Fase 1). Fire-and-forget.
    void cacheCategories(sorted);
    return sorted;
  } catch (err) {
    if (isOfflineError(err)) {
      const cached = await readCategoriesCache<Category>();
      if (cached.length > 0) return cached;
    }
    throw err;
  }
}

/**
 * Insert a new user-owned category. The DB unique index covers
 * (user_id, name, kind) — on violation we surface a friendly Spanish message.
 *
 * `user_id` is set explicitly from the current session so the RLS INSERT
 * policy (`user_id = auth.uid()`) passes.
 */
export async function createCategory(draft: CategoryDraft): Promise<Category> {
  const supabase = createSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Necesitas iniciar sesión para crear categorías.");
  }

  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    throw new Error("El nombre de la categoría no puede estar vacío.");
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: trimmedName,
      kind: draft.kind,
      icon: draft.icon,
    })
    .select(
      "id,user_id,name,kind,color,icon,archived_at,created_at,updated_at",
    )
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error("Ya tienes una categoría con ese nombre.");
    }
    throw new Error(error.message || "No pudimos crear la categoría.");
  }

  return data as Category;
}

/**
 * Update a user-owned category. RLS rejects updates to system rows, but we
 * also short-circuit on the client to give a clearer error than a silent
 * 0-row response.
 */
export async function updateCategory(
  id: string,
  patch: CategoryPatch,
): Promise<Category> {
  const supabase = createSupabaseClient();

  const updates: { name?: string; icon?: string | null } = {};
  if (typeof patch.name === "string") {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      throw new Error("El nombre de la categoría no puede estar vacío.");
    }
    updates.name = trimmed;
  }
  if ("icon" in patch) {
    updates.icon = patch.icon ?? null;
  }

  const { data, error } = await supabase
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select(
      "id,user_id,name,kind,color,icon,archived_at,created_at,updated_at",
    )
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error("Ya tienes una categoría con ese nombre.");
    }
    // RLS returns no row when the update is not permitted — supabase-js
    // surfaces this as PGRST116 ("Results contain 0 rows"). Translate.
    if (error.code === "PGRST116") {
      throw new Error("No puedes editar las categorías del sistema.");
    }
    throw new Error(error.message || "No pudimos actualizar la categoría.");
  }

  return data as Category;
}

/**
 * Bulk soft-delete every user-owned (non-system) category in one round-trip.
 *
 * RLS already restricts UPDATE to rows where `user_id = auth.uid()`, so the
 * `.eq("user_id", user.id)` here is belt-and-suspenders against ever
 * accidentally touching system rows (which have `user_id IS NULL` and would
 * be filtered by RLS anyway). The `.is("archived_at", null)` filter avoids
 * stomping rows that were already archived from another device.
 *
 * Returns the count of rows archived. Used by the "Restablecer categorías"
 * affordance in /settings.
 */
export async function archiveAllUserCategories(): Promise<number> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error("Inicia sesión para continuar.");
  }

  const { data, error } = await supabase
    .from("categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message || "No pudimos restablecer las categorías.");
  }
  return (data ?? []).length;
}

/**
 * Soft-delete: set `archived_at = now()`. The list query filters these out
 * automatically. RLS prevents users from archiving system categories.
 */
export async function archiveCategory(id: string): Promise<void> {
  const supabase = createSupabaseClient();

  const { error, data } = await supabase
    .from("categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("No puedes archivar las categorías del sistema.");
    }
    throw new Error(error.message || "No pudimos archivar la categoría.");
  }

  if (!data) {
    // RLS quietly returned 0 rows — likely a system category.
    throw new Error("No puedes archivar las categorías del sistema.");
  }
}
