/**
 * `useAccountStats` — derive per-account stats (saldo, gasto del mes, delta)
 * from a transactions window result.
 *
 * Why a hook instead of a util? The dashboard already pays the cost of
 * `useTransactionsWindow` (one fetch, ~600 rows for a heavy user); we just
 * project the rows we already have into per-account aggregates. Doing this
 * in a `useMemo`-backed hook keeps the projection stable and avoids a per-
 * render scan of the rows.
 *
 * Saldo semantics — IMPORTANT
 *   "Saldo actual" = SUM(income) − SUM(expense) for the account, over the
 *   visible window (default 6 months). This is an APPROXIMATION:
 *     - It misses transactions older than the window. For a brand-new app
 *       this is fine because nobody has older history yet. If a user runs
 *       the app for >6 months without raising the window size, the displayed
 *       saldo will drift away from the real running balance.
 *     - When that becomes a real problem, replace the closure-scoped sum
 *       below with a one-shot all-time aggregation per account (server-side
 *       view or a lightweight RPC). The component contract doesn't change.
 *
 *   The carousel passes `accounts` and the full window; we fold once and
 *   return the stats per-account in a Map keyed by accountId.
 */

"use client";

import * as React from "react";

import type { TransactionView } from "@/lib/data/transactions";

export type AccountStats = {
  /** Net flow over the window: income − expense. May be negative. */
  saldoActual: number;
  /** Sum of expense rows in the current calendar month. >= 0. */
  gastadoMes: number;
  /** Sum of expense rows in the previous calendar month. >= 0. */
  gastadoMesAnterior: number;
  /**
   * Signed fraction (e.g. -0.72 = down 72%, +0.15 = up 15%). `null` when
   * `gastadoMesAnterior === 0` so the UI knows to hide the delta pill
   * instead of rendering "+∞%".
   */
  deltaPctVsPrevMonth: number | null;
};

const ZERO_STATS: AccountStats = {
  saldoActual: 0,
  gastadoMes: 0,
  gastadoMesAnterior: 0,
  deltaPctVsPrevMonth: null,
};

/**
 * Project a window of transactions into a stats Map keyed by accountId.
 * Pure — no Supabase fetch here. Caller passes already-fetched rows.
 *
 * @param rows  Transaction rows in the window (must include `accountId`).
 * @param accountIds  Accounts the carousel will render — we pre-seed every
 *   id with ZERO_STATS so a brand-new account with no movements still
 *   shows up with S/ 0.00 instead of disappearing.
 */
export function useAccountStats(
  rows: TransactionView[],
  accountIds: string[],
): Map<string, AccountStats> {
  return React.useMemo(() => {
    const stats = new Map<string, AccountStats>();
    for (const id of accountIds) stats.set(id, { ...ZERO_STATS });

    // Reference dates — computed inside the memo so a calendar month rollover
    // refreshes on the next render. Same trick as `useTransactionsWindow`.
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    for (const r of rows) {
      const acctId = r.accountId;
      if (!acctId) continue;
      const bucket = stats.get(acctId);
      // Account not in the carousel set — could happen if a row points at an
      // archived account. Skip silently; the dashboard will eventually catch
      // the orphan when the account list refreshes.
      if (!bucket) continue;

      const occurred = new Date(r.occurredAt).getTime();

      if (r.kind === "expense") {
        bucket.saldoActual -= r.amount;
        if (occurred >= currentMonthStart) {
          bucket.gastadoMes += r.amount;
        } else if (occurred >= prevMonthStart && occurred < currentMonthStart) {
          bucket.gastadoMesAnterior += r.amount;
        }
      } else if (r.kind === "income") {
        bucket.saldoActual += r.amount;
      }
    }

    // Delta pass — done after the fold so we have both numerator and denominator.
    for (const bucket of stats.values()) {
      if (bucket.gastadoMesAnterior > 0) {
        bucket.deltaPctVsPrevMonth =
          (bucket.gastadoMes - bucket.gastadoMesAnterior) / bucket.gastadoMesAnterior;
      } else {
        // No prior-month spending => the comparison is degenerate. We hide
        // the pill rather than show "+∞%" or a misleading "+100%".
        bucket.deltaPctVsPrevMonth = null;
      }
    }

    return stats;
  }, [rows, accountIds]);
}

/** Look up stats for a single account, with a safe fallback. */
export function getStatsFor(
  map: Map<string, AccountStats>,
  accountId: string,
): AccountStats {
  return map.get(accountId) ?? ZERO_STATS;
}
