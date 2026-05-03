/**
 * Export user data — Kane
 *
 * Bundles every piece of user-owned data (accounts, categories, merchants,
 * transactions) plus relevant local-only stores into a single JSON Blob.
 * Intended as a safety net before destructive operations like factory
 * reset, and as a "give me my data" affordance.
 *
 * RLS scopes every read to the current user; we still pass an explicit
 * `user_id` filter on the user-only tables (`categories`, `merchants`) so
 * we don't include system seeds in the export — those aren't the user's
 * data and bloat the file unnecessarily.
 *
 * The resulting Blob is `application/json`. The caller is responsible for
 * triggering the download via `URL.createObjectURL` + an anchor click.
 */
"use client";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

export async function exportUserData(): Promise<Blob> {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Inicia sesión para exportar tus datos.");
  }

  // Pull every table in parallel. RLS scopes to the current user — the
  // explicit `user_id` filters on categories/merchants exclude system seeds
  // (which are visible via SELECT but aren't the user's data).
  const [accountsRes, categoriesRes, merchantsRes, transactionsRes] =
    await Promise.all([
      supabase.from("accounts").select("*"),
      supabase.from("categories").select("*").eq("user_id", user.id),
      supabase.from("merchants").select("*").eq("user_id", user.id),
      supabase.from("transactions").select("*"),
    ]);

  // Collect any error that isn't a "feature not deployed yet" (merchants
  // table may not exist pre-migration 00006). We don't want a missing
  // optional table to block a user from exporting the rest of their data.
  const errors = [
    accountsRes.error,
    categoriesRes.error,
    transactionsRes.error,
  ].filter(Boolean);
  if (errors.length > 0) {
    throw new Error(errors[0]?.message || "No pudimos exportar tus datos.");
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    userId: user.id,
    accounts: accountsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    merchants: merchantsRes.error ? [] : (merchantsRes.data ?? []),
    transactions: transactionsRes.data ?? [],
    // Local-only stores so the export is genuinely complete.
    localStorage:
      typeof window === "undefined"
        ? {}
        : {
            "kane-budgets": safeRead("kane-budgets"),
            "kane-goals": safeRead("kane-goals"),
            "kane-prefs": safeRead("kane-prefs"),
          },
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

/**
 * Local-only export for demo mode (no Supabase env). Returns a Blob with
 * just the localStorage contents — useful when SUPABASE_ENABLED is false
 * but we still want the "Descargar mis datos" affordance to do something.
 */
export function exportLocalOnly(): Blob {
  const payload = {
    exportedAt: new Date().toISOString(),
    accounts: [],
    categories: [],
    merchants: [],
    transactions: [],
    localStorage:
      typeof window === "undefined"
        ? {}
        : {
            "kane-budgets": safeRead("kane-budgets"),
            "kane-goals": safeRead("kane-goals"),
            "kane-prefs": safeRead("kane-prefs"),
          },
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

function safeRead(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
