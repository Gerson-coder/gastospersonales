/**
 * One-shot migration: localStorage budgets/goals → Supabase tables.
 *
 * Background: until migration 00023, budgets and goals were persisted in
 * `localStorage` keys `kane-budgets` / `kane-goals`. Now they live in the
 * `budgets` / `goals` Supabase tables (RLS, multi-tenant). This helper runs
 * once per device on first authenticated load and uploads any leftover local
 * rows to the server. After a successful run we drop a sentinel
 * (`kane-supabase-migration-done` = "1") so we never re-run.
 *
 * Behavior:
 *   - Bails silently if not authenticated, no Supabase env, or sentinel set.
 *   - Per-row error handling: a single bad row never aborts the whole batch.
 *     UNIQUE_VIOLATION (23505) on insert means the row already exists in DB
 *     from another device — silent skip. FK_VIOLATION (23503) means the
 *     referenced category was archived/deleted — silent skip but we surface
 *     a soft toast at the end.
 *   - Never throws; logs to `console.warn` for ops visibility.
 *
 * IDEMPOTENT: re-running with the sentinel set is a no-op. Even without the
 * sentinel, the unique index `(user_id, category_id, currency)` on budgets
 * + the silent skip on conflict means re-uploads don't duplicate.
 */
"use client";

import { toast } from "sonner";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { createBudget } from "@/lib/data/budgets";
import {
  contributeGoal,
  createGoal,
  type GoalIcon,
} from "@/lib/data/goals";
import type { Currency } from "@/lib/supabase/types";

const SENTINEL_KEY = "kane-supabase-migration-done";
const BUDGETS_KEY = "kane-budgets";
const GOALS_KEY = "kane-goals";

const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Legacy shapes (mirror what /budgets and /goals used to write) ────────
type LegacyBudget = {
  id: string;
  categoryId: string;
  limitMinor: number;
  currency: Currency;
  createdAt: string;
};

type LegacyGoal = {
  id: string;
  name: string;
  targetMinor: number;
  currentMinor: number;
  currency: Currency;
  deadlineISO: string | null;
  icon: GoalIcon;
  createdAt: string;
};

const VALID_GOAL_ICONS: ReadonlySet<GoalIcon> = new Set<GoalIcon>([
  "target",
  "plane",
  "home",
  "car",
  "graduation-cap",
  "heart",
  "gift",
  "piggy-bank",
  "sparkles",
]);

function isLegacyBudget(value: unknown): value is LegacyBudget {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.categoryId === "string" &&
    typeof v.limitMinor === "number" &&
    Number.isFinite(v.limitMinor) &&
    v.limitMinor > 0 &&
    (v.currency === "PEN" || v.currency === "USD")
  );
}

function isLegacyGoal(value: unknown): value is LegacyGoal {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.targetMinor === "number" &&
    Number.isFinite(v.targetMinor) &&
    v.targetMinor > 0 &&
    typeof v.currentMinor === "number" &&
    Number.isFinite(v.currentMinor) &&
    (v.currency === "PEN" || v.currency === "USD") &&
    (v.deadlineISO === null || typeof v.deadlineISO === "string") &&
    typeof v.icon === "string" &&
    VALID_GOAL_ICONS.has(v.icon as GoalIcon)
  );
}

function safeReadArray(key: string): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Quota / private mode — best effort.
  }
}

function safeSetSentinel(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SENTINEL_KEY, "1");
  } catch {
    // best effort
  }
}

function isSentinelSet(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SENTINEL_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget upload of any localStorage budgets/goals to Supabase.
 * Safe to call on every mount — bails on its own when there's nothing to do.
 */
export async function uploadLegacyLocalDataToSupabase(): Promise<void> {
  if (!SUPABASE_ENABLED) return;
  if (typeof window === "undefined") return;
  if (isSentinelSet()) return;

  try {
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      // Not authenticated — try again on a future load. Don't drop the
      // sentinel: we want the upload to happen post-login.
      return;
    }

    const rawBudgets = safeReadArray(BUDGETS_KEY).filter(isLegacyBudget);
    const rawGoals = safeReadArray(GOALS_KEY).filter(isLegacyGoal);

    let skippedDueToMissingCategory = 0;
    let budgetsOk = true;
    let goalsOk = true;

    // ─── Budgets ─────────────────────────────────────────────────────
    for (const b of rawBudgets) {
      try {
        await createBudget({
          categoryId: b.categoryId,
          limitMinor: b.limitMinor,
          currency: b.currency,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // UNIQUE_VIOLATION → already exists (multi-device user). Silent.
        if (
          /Ya tienes un presupuesto/i.test(msg) ||
          /already exists/i.test(msg)
        ) {
          continue;
        }
        // FK_VIOLATION → category was archived/deleted. Skip + soft-toast.
        if (/categor[ií]a/i.test(msg) && /no existe/i.test(msg)) {
          skippedDueToMissingCategory += 1;
          continue;
        }
        budgetsOk = false;
        console.warn("[storage→supabase] budget upload failed:", err);
      }
    }

    // ─── Goals ───────────────────────────────────────────────────────
    for (const g of rawGoals) {
      try {
        const created = await createGoal({
          name: g.name,
          targetMinor: g.targetMinor,
          currency: g.currency,
          deadlineISO: g.deadlineISO,
          icon: g.icon,
        });
        if (g.currentMinor > 0) {
          try {
            await contributeGoal(created.id, g.currentMinor, "add");
          } catch (err) {
            // Don't fail the whole goal — the row is created, only the
            // saved-amount didn't get applied. Log + continue.
            console.warn(
              "[storage→supabase] goal contribution failed:",
              err,
            );
          }
        }
      } catch (err) {
        goalsOk = false;
        console.warn("[storage→supabase] goal upload failed:", err);
      }
    }

    // ─── Cleanup ────────────────────────────────────────────────────
    // Only nuke the legacy keys if everything went through. Otherwise we
    // leave them in place and let the next load retry — IDEMPOTENT thanks
    // to the unique index on budgets and the user-controlled sentinel.
    if (budgetsOk) safeRemove(BUDGETS_KEY);
    if (goalsOk) safeRemove(GOALS_KEY);

    // Mark migration done regardless of partial failures — re-running won't
    // help if the failures are FK-violation type. The sentinel can be wiped
    // by the user via factory reset if they want a re-attempt.
    safeSetSentinel();

    if (skippedDueToMissingCategory > 0) {
      try {
        toast.info(
          "Algunos presupuestos antiguos no se pudieron migrar (categoría eliminada).",
        );
      } catch {
        // Toast subsystem not mounted yet — ignore.
      }
    }
  } catch (err) {
    // Top-level guard: never throw out of a fire-and-forget call.
    console.warn("[storage→supabase] migration top-level failure:", err);
  }
}
