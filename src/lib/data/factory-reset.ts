/**
 * Factory reset — Kane
 *
 * Single entry point for the "Restablecer todo de fábrica" flow in /settings.
 * Soft-archives every piece of user-owned data (transactions, merchants,
 * accounts, categories) and clears local-only stores that don't belong on
 * the server (kane-budgets, kane-goals).
 *
 * Profile (display_name, avatar_url) is INTENTIONALLY untouched — the user
 * is not signing out, just wiping their financial state. Theme + currency
 * persisted under `kane-prefs` are preserved so the app keeps its look on
 * the next render.
 *
 * Order of archival is deliberate: transactions first so any in-flight
 * referential reads (e.g. dashboard) still resolve account/category names
 * even if the request crashes mid-way; categories last because they're the
 * smallest dataset and least likely to fail.
 *
 * No hard DELETE is performed anywhere — soft-delete via `archived_at` is
 * the project-wide rule (see AGENTS.md).
 */
"use client";

import { archiveAllUserAccounts } from "@/lib/data/accounts";
import { archiveAllUserCategories } from "@/lib/data/categories";
import { archiveAllUserMerchants } from "@/lib/data/merchants";
import { archiveAllUserTransactions } from "@/lib/data/transactions";

export type FactoryResetCounts = {
  transactions: number;
  merchants: number;
  accounts: number;
  categories: number;
};

/**
 * Wipe (archive) every piece of user-owned data and clear local-only
 * stores. Returns the per-table archived counts so the UI can show a
 * confirmation toast.
 */
export async function factoryReset(): Promise<FactoryResetCounts> {
  const transactions = await archiveAllUserTransactions();
  const merchants = await archiveAllUserMerchants();
  const accounts = await archiveAllUserAccounts();
  const categories = await archiveAllUserCategories();

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("kane-budgets");
      window.localStorage.removeItem("kane-goals");
    } catch {
      // Storage disabled (private mode / quota) — nothing actionable here.
    }
  }

  return { transactions, merchants, accounts, categories };
}
