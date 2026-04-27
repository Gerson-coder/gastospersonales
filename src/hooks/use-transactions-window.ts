/**
 * `useTransactionsWindow` — fetch a rolling N-month transaction window once
 * and derive every aggregation the Dashboard and Insights pages consume.
 *
 * One fetch, many `useMemo` projections. The 6-month dataset is small (~600
 * rows for a heavy user — see spec `Performance · Aggregation budget`) so a
 * full pass per memo is cheap and we avoid a SQL RPC round-trip per widget.
 *
 * Aggregations are stable: same `rows` reference + same currency = same
 * outputs. Charts can rely on referential equality for transition keys.
 *
 * What we expose, mapped to the legacy mocks they replace:
 *   Dashboard:
 *     - `expenseCurrentMonth` / `incomeCurrentMonth` / `netoCurrentMonth`
 *       → MonthSummaryCard (`spent`, `income`, derived NETO)
 *     - `recentTransactions` (5 latest) → "Últimas transacciones" card
 *     - `weeklyExpenseBars` (last 7 days, Mon→Sun) → WeeklyBars component
 *     - `topCategoriesCurrentMonth` (% + amount per category)
 *       → CategoryBars on Dashboard
 *   Insights:
 *     - `monthTotals` (6 buckets `{monthKey, label, spent, income}`)
 *       → Cross-month comparison + HeroMetric prev-month delta
 *     - `byCategoryCurrentMonth` (`{categoryId, name, value%, amount, delta}`)
 *       → Insights "Por categoría" CategoryBars
 *     - `byDayCurrentMonth` (1..daysInMonth) → VelocityChart current line
 *     - `byDayPrevMonth` (1..daysInMonth-prev) → VelocityChart dashed line
 *     - `topMovementsCurrentMonth` (top 3 expense rows) → "Top movimientos"
 *
 * Out of scope (handled by other hooks):
 *   - `/movements` cursor pagination — uses `listTransactionsByCurrency`
 *     directly, NOT this hook.
 *   - Realtime invalidate — caller composes `useTransactionsRealtime` and
 *     passes `refetch` as `onEvent` (Dashboard only).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listTransactionsWindow,
  type TransactionView,
} from "@/lib/data/transactions";
import type { Currency } from "@/lib/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────

export type CategoryBucket = {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  /** Share of total expense in the bucket window (0–100). */
  value: number;
  /** Signed change vs the prior equally-sized window. -1..1 (e.g. -0.18). */
  delta: number;
};

export type MonthBucket = {
  /** "YYYY-MM" — stable key for diffs / chart slot identity. */
  monthKey: string;
  /** Short Spanish label, e.g. "abr". */
  label: string;
  spent: number;
  income: number;
};

export type DailyBucket = {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  amount: number;
};

export type WeeklyBucket = {
  /** Spanish 3-letter weekday label, "Lun".."Dom". */
  label: string;
  /** ISO date of the bar's day "YYYY-MM-DD". */
  date: string;
  amount: number;
};

export type UseTransactionsWindowOpts = {
  /** Rolling window size in months. Defaults to 6. */
  months?: number;
  currency: Currency;
  /**
   * Optional account filter — when set, all aggregations (current-month
   * scalars, category buckets, weekly bars, daily series, monthly totals,
   * recent + top movements) are computed from rows belonging to ONLY this
   * account. `null`/undefined keeps the previous behavior (aggregate across
   * all accounts).
   */
  accountId?: string | null;
};

export type TransactionsWindowResult = {
  rows: TransactionView[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;

  // ── Current-month scalars ────────────────────────────────────────────
  expenseCurrentMonth: number;
  incomeCurrentMonth: number;
  netoCurrentMonth: number;
  /** Spent delta vs previous month, signed fraction (-0.12 = down 12%). */
  spentDeltaVsPrevMonth: number | null;
  /** Income delta vs previous month, signed fraction. */
  incomeDeltaVsPrevMonth: number | null;

  // ── Lists ────────────────────────────────────────────────────────────
  /** Latest 5 transactions in the window (DESC by occurredAt). */
  recentTransactions: TransactionView[];
  /** Top 3 expense rows of the current month, DESC by amount. */
  topMovementsCurrentMonth: TransactionView[];

  // ── Per-category ─────────────────────────────────────────────────────
  byCategoryCurrentMonth: CategoryBucket[];
  /** Same shape, computed across the entire visible window. */
  topCategoriesAllWindow: CategoryBucket[];

  // ── Time series ──────────────────────────────────────────────────────
  /** N buckets ordered oldest → newest (last bucket is current month). */
  monthTotals: MonthBucket[];
  /** One entry per day of the current month so far. */
  byDayCurrentMonth: DailyBucket[];
  /** One entry per day of the previous month (full month). */
  byDayPrevMonth: DailyBucket[];
  /** Last 7 days of expense, Mon..Sun ordering. */
  weeklyExpenseBars: WeeklyBucket[];
};

// ─── Date helpers (no deps — JS Date is sufficient for these aggregations) ─
//
// All helpers operate in LOCAL time. We bucket by the user's wall-clock so a
// "Monday" feels like a Monday regardless of timezone — Supabase stores
// `occurred_at` as `timestamptz` which serializes to ISO with a "Z", and
// `new Date(iso)` re-anchors to local time on parse. Good enough for v1; if
// users span multiple zones we'll revisit.

/** First instant of the month containing `d`. */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/** First instant of `d`'s day. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * First instant of the Monday on or before `d`. We use Monday-start to match
 * the Spanish-locale dashboard ("Lun..Dom") and the existing WeeklyBars mock
 * which renders Lun → Dom left-to-right.
 */
function startOfWeekMon(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const offset = (day + 6) % 7; // 0=Mon..6=Sun
  const start = startOfDay(d);
  start.setDate(start.getDate() - offset);
  return start;
}

/** Push `n` calendar months. Negative `n` goes backwards. Day stays at 1. */
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0);
}

/** Number of days in the month containing `d` (handles leap years). */
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** "YYYY-MM-DD" in LOCAL time — avoids `toISOString()` UTC drift. */
function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM" key for month buckets. */
function monthKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const MONTH_LABELS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const WEEKDAY_LABELS_ES_MON_FIRST = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ─── Group / fold helpers ─────────────────────────────────────────────────

function sumExpense(rows: TransactionView[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.kind === "expense") total += r.amount;
  }
  return total;
}

function sumIncome(rows: TransactionView[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.kind === "income") total += r.amount;
  }
  return total;
}

/**
 * Roll a list of expense rows into a category bucket map keyed by
 * `categoryId ?? "__uncategorized__"` so a null category still groups.
 */
function aggregateByCategory(
  rows: TransactionView[],
  priorRows: TransactionView[],
): CategoryBucket[] {
  const totals = new Map<
    string,
    { id: string | null; name: string; amount: number; priorAmount: number }
  >();

  const fold = (
    list: TransactionView[],
    field: "amount" | "priorAmount",
  ): void => {
    for (const r of list) {
      if (r.kind !== "expense") continue;
      const key = r.categoryId ?? "__uncat__";
      const existing = totals.get(key);
      if (existing) {
        existing[field] += r.amount;
      } else {
        totals.set(key, {
          id: r.categoryId,
          name: r.categoryName ?? "Sin categoría",
          amount: field === "amount" ? r.amount : 0,
          priorAmount: field === "priorAmount" ? r.amount : 0,
        });
      }
    }
  };

  fold(rows, "amount");
  fold(priorRows, "priorAmount");

  const grandTotal = Array.from(totals.values()).reduce(
    (acc, b) => acc + b.amount,
    0,
  );

  const buckets: CategoryBucket[] = Array.from(totals.values())
    .filter((b) => b.amount > 0) // hide categories that only show in the prior window
    .map((b) => ({
      categoryId: b.id,
      categoryName: b.name,
      amount: b.amount,
      value: grandTotal > 0 ? Math.round((b.amount / grandTotal) * 100) : 0,
      delta:
        b.priorAmount > 0
          ? (b.amount - b.priorAmount) / b.priorAmount
          : b.amount > 0
            ? 1 // appearing-from-zero — surface as "fully up"
            : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return buckets;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useTransactionsWindow(
  opts: UseTransactionsWindowOpts,
): TransactionsWindowResult {
  const months = opts.months ?? 6;
  const { currency, accountId = null } = opts;

  const [rows, setRows] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  // Cheap refetch trigger — incrementing this re-runs the fetch effect.
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  // Compute `fromISO` (start of window). Memoized so it stays stable per
  // (months, currency, tick) tuple — without this, `new Date()` on every
  // render would re-trigger the fetch effect on every parent re-render.
  const fromISO = useMemo(() => {
    const now = new Date();
    const start = addMonths(startOfMonth(now), -(months - 1));
    return start.toISOString();
    // `tick` is intentionally part of the dep set: bumping it should produce
    // a fresh "now" anchor as well as restart the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, tick]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await listTransactionsWindow({ currency, fromISO });
        if (cancelled) return;
        setRows(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currency, fromISO]);

  // ── Account filter ─────────────────────────────────────────────────────
  // Applied BEFORE every aggregation so the dashboard can scope all numbers
  // (Saldo, Gasto, Ingreso, Distribución, Velocity, weekly bars, recent…) to
  // a single account when the user picks one in the chip strip. We keep the
  // unfiltered `rows` for the fetch so flipping the picker is instant — no
  // re-fetch, just a re-derive.
  const filteredRows = useMemo(() => {
    if (!accountId) return rows;
    return rows.filter((r) => r.accountId === accountId);
  }, [rows, accountId]);

  // ── Reference dates (memoized so derived memos don't churn) ────────────
  const refs = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const prevMonthStart = addMonths(currentMonthStart, -1);
    const nextMonthStart = addMonths(currentMonthStart, 1);
    return {
      now,
      currentMonthStart,
      prevMonthStart,
      nextMonthStart,
      currentMonthDays: daysInMonth(currentMonthStart),
      prevMonthDays: daysInMonth(prevMonthStart),
      // Last 7 days, Monday-first. We anchor on `now` so the rightmost bar is
      // always today; missing days fall through to amount=0.
      weekAnchorMonday: startOfWeekMon(now),
    };
  }, []);

  // ── Partition rows by month bucket (single pass) ───────────────────────
  const partition = useMemo(() => {
    const currentMonthRows: TransactionView[] = [];
    const prevMonthRows: TransactionView[] = [];
    for (const r of filteredRows) {
      const occurred = new Date(r.occurredAt);
      if (occurred >= refs.currentMonthStart && occurred < refs.nextMonthStart) {
        currentMonthRows.push(r);
      } else if (
        occurred >= refs.prevMonthStart &&
        occurred < refs.currentMonthStart
      ) {
        prevMonthRows.push(r);
      }
    }
    return { currentMonthRows, prevMonthRows };
  }, [filteredRows, refs]);

  // ── Current-month scalars ──────────────────────────────────────────────
  const expenseCurrentMonth = useMemo(
    () => sumExpense(partition.currentMonthRows),
    [partition],
  );
  const incomeCurrentMonth = useMemo(
    () => sumIncome(partition.currentMonthRows),
    [partition],
  );
  const netoCurrentMonth = incomeCurrentMonth - expenseCurrentMonth;

  const expensePrevMonth = useMemo(
    () => sumExpense(partition.prevMonthRows),
    [partition],
  );
  const incomePrevMonth = useMemo(
    () => sumIncome(partition.prevMonthRows),
    [partition],
  );

  const spentDeltaVsPrevMonth =
    expensePrevMonth > 0
      ? (expenseCurrentMonth - expensePrevMonth) / expensePrevMonth
      : null;
  const incomeDeltaVsPrevMonth =
    incomePrevMonth > 0
      ? (incomeCurrentMonth - incomePrevMonth) / incomePrevMonth
      : null;

  // ── Recent + top movements ─────────────────────────────────────────────
  const recentTransactions = useMemo(
    () => filteredRows.slice(0, 5),
    [filteredRows],
  );

  const topMovementsCurrentMonth = useMemo(() => {
    return [...partition.currentMonthRows]
      .filter((r) => r.kind === "expense")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }, [partition]);

  // ── Per-category (current month vs prev month) ─────────────────────────
  const byCategoryCurrentMonth = useMemo(
    () =>
      aggregateByCategory(
        partition.currentMonthRows,
        partition.prevMonthRows,
      ),
    [partition],
  );

  // Top categories across the entire visible window — Dashboard's
  // "Distribución" card uses this when the user wants a smoother distribution
  // than a single month can give.
  const topCategoriesAllWindow = useMemo(
    () => aggregateByCategory(filteredRows, []),
    [filteredRows],
  );

  // ── Monthly totals (oldest → newest) ───────────────────────────────────
  const monthTotals = useMemo<MonthBucket[]>(() => {
    const buckets = new Map<string, MonthBucket>();
    // Pre-seed the N expected buckets so months with zero rows still render.
    for (let i = months - 1; i >= 0; i--) {
      const ms = addMonths(refs.currentMonthStart, -i);
      const key = monthKeyOf(ms);
      buckets.set(key, {
        monthKey: key,
        label: MONTH_LABELS_ES[ms.getMonth()],
        spent: 0,
        income: 0,
      });
    }
    for (const r of filteredRows) {
      const key = monthKeyOf(new Date(r.occurredAt));
      const bucket = buckets.get(key);
      if (!bucket) continue; // outside the visible window — skip silently
      if (r.kind === "expense") bucket.spent += r.amount;
      else bucket.income += r.amount;
    }
    return Array.from(buckets.values());
  }, [filteredRows, months, refs]);

  // ── Daily series (current + previous month) ────────────────────────────
  const byDayCurrentMonth = useMemo<DailyBucket[]>(() => {
    const out: DailyBucket[] = [];
    for (let day = 1; day <= refs.currentMonthDays; day++) {
      const d = new Date(
        refs.currentMonthStart.getFullYear(),
        refs.currentMonthStart.getMonth(),
        day,
      );
      out.push({ date: formatISODate(d), amount: 0 });
    }
    for (const r of partition.currentMonthRows) {
      if (r.kind !== "expense") continue;
      const d = new Date(r.occurredAt);
      const idx = d.getDate() - 1;
      if (idx >= 0 && idx < out.length) out[idx].amount += r.amount;
    }
    return out;
  }, [partition, refs]);

  const byDayPrevMonth = useMemo<DailyBucket[]>(() => {
    const out: DailyBucket[] = [];
    for (let day = 1; day <= refs.prevMonthDays; day++) {
      const d = new Date(
        refs.prevMonthStart.getFullYear(),
        refs.prevMonthStart.getMonth(),
        day,
      );
      out.push({ date: formatISODate(d), amount: 0 });
    }
    for (const r of partition.prevMonthRows) {
      if (r.kind !== "expense") continue;
      const d = new Date(r.occurredAt);
      const idx = d.getDate() - 1;
      if (idx >= 0 && idx < out.length) out[idx].amount += r.amount;
    }
    return out;
  }, [partition, refs]);

  // ── Last-7-days expense bars (Monday-first to match WeeklyBars mock) ───
  const weeklyExpenseBars = useMemo<WeeklyBucket[]>(() => {
    const monday = refs.weekAnchorMonday;
    const out: WeeklyBucket[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + i,
      );
      out.push({
        label: WEEKDAY_LABELS_ES_MON_FIRST[i],
        date: formatISODate(d),
        amount: 0,
      });
    }
    // Index by ISO date for O(rows) fold rather than O(rows*7).
    const byDate = new Map<string, WeeklyBucket>();
    for (const b of out) byDate.set(b.date, b);
    for (const r of filteredRows) {
      if (r.kind !== "expense") continue;
      const key = formatISODate(new Date(r.occurredAt));
      const bucket = byDate.get(key);
      if (bucket) bucket.amount += r.amount;
    }
    return out;
  }, [filteredRows, refs]);

  return {
    rows,
    loading,
    error,
    refetch,
    expenseCurrentMonth,
    incomeCurrentMonth,
    netoCurrentMonth,
    spentDeltaVsPrevMonth,
    incomeDeltaVsPrevMonth,
    recentTransactions,
    topMovementsCurrentMonth,
    byCategoryCurrentMonth,
    topCategoriesAllWindow,
    monthTotals,
    byDayCurrentMonth,
    byDayPrevMonth,
    weeklyExpenseBars,
  };
}
