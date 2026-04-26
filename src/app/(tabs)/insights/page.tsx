// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
// TODO: replace mock totals/series with real Supabase aggregations once persistence lands.
/**
 * Insights route — Lumi
 *
 * Deeper analytics: cross-month comparison, category breakdown, spending
 * velocity vs previous month, auto-generated observations, top movements.
 *
 * Mobile-first; scales to a 2-col grid on md+. All copy in es-PE.
 *
 * Source of truth: Lumi UI-kit `TabScreens.jsx` → `InsightsScreen` (lines
 * 87–143). Adapted to project conventions:
 *   - No `window.LUMI_*` globals — local consts.
 *   - All charts hand-rolled SVG (no recharts/chart.js, per Lumi rules).
 *   - All SVG ids/gradient ids are prefixed `lumi-insights-` to avoid
 *     collisions with the Dashboard route's SVGs (`lumi-dashboard-*`).
 *   - No `new Date()` in render — a documented `MOCK_TODAY` constant is
 *     used only for derived mock series day-counts. Removed when Supabase
 *     lands.
 */

"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  UtensilsCrossed,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  Home,
  GraduationCap,
  Briefcase,
  Circle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  PiggyBank,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AppHeader } from "@/components/lumi/AppHeader";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";

type CategoryId =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "home"
  | "edu"
  | "work"
  | "other";

type Period = "month" | "q3" | "year";

// Local time-window for the "Comparativa mensual" card. Independent from the
// page-level `Period` because users may want to scope the bar chart while
// keeping the rest of the page on the current month.
type CompareRange = "3m" | "6m";

type Transaction = {
  id: string;
  amount: number;
  currency: Currency;
  kind: "expense" | "income";
  categoryId: CategoryId;
  merchant: string;
  occurredAt: string;
};

type CategoryBreakdown = {
  id: CategoryId;
  label: string;
  value: number; // percentage (0-100)
  amount: number; // PEN
  color: string;
  delta: number; // -1..1, vs previous period
};

type MonthTotal = {
  monthKey: string; // e.g. "2026-04"
  label: string; // short, "abr"
  spent: number;
  income: number;
};

// ─── Mock data ────────────────────────────────────────────────────────────
// MOCK_TODAY: anchor for day-of-month derivations in mock series. This is
// intentionally a constant string (no `new Date()` in render to keep SSR
// deterministic). Remove this and the references to it when Supabase lands
// and real `occurredAt` data drives the velocity chart.
const MOCK_TODAY = { year: 2026, month: 4, day: 24, daysInMonth: 30 };

const MONTH_TOTALS: MonthTotal[] = [
  { monthKey: "2025-11", label: "nov", spent: 2410.5, income: 4100.0 },
  { monthKey: "2025-12", label: "dic", spent: 3120.7, income: 4400.0 },
  { monthKey: "2026-01", label: "ene", spent: 2680.4, income: 4200.0 },
  { monthKey: "2026-02", label: "feb", spent: 2890.2, income: 4200.0 },
  { monthKey: "2026-03", label: "mar", spent: 2470.0, income: 4200.0 },
  { monthKey: "2026-04", label: "abr", spent: 2180.4, income: 4200.0 },
];

const CURRENT_INDEX = MONTH_TOTALS.length - 1; // april
const PREV_INDEX = CURRENT_INDEX - 1; // march

const CATEGORY_BREAKDOWN: CategoryBreakdown[] = [
  {
    id: "fun",
    label: "Entretenimiento",
    value: 32,
    amount: 697.73,
    color: "var(--color-chart-2)",
    delta: -0.18,
  },
  {
    id: "food",
    label: "Comida",
    value: 22,
    amount: 479.69,
    color: "var(--color-chart-1)",
    delta: 0.23,
  },
  {
    id: "transport",
    label: "Transporte",
    value: 16,
    amount: 348.86,
    color: "var(--color-chart-3)",
    delta: 0.02,
  },
  {
    id: "market",
    label: "Mercado",
    value: 12,
    amount: 261.65,
    color: "var(--color-chart-4)",
    delta: -0.05,
  },
  {
    id: "utilities",
    label: "Servicios",
    value: 10,
    amount: 218.04,
    color: "var(--color-chart-5)",
    delta: 0.0,
  },
  {
    id: "other",
    label: "Otros",
    value: 8,
    amount: 174.43,
    color: "var(--color-chart-6)",
    delta: -0.12,
  },
];

// Daily incremental spend for the current month (24 days, MOCK_TODAY).
const MONTH_DAILY = [
  12, 18, 8, 22, 6, 42, 15, 28, 10, 16, 32, 9, 24, 18, 14, 38, 12, 20, 8, 16,
  28, 42, 18, 24,
];

// Daily incremental spend for the previous month (30 days).
const PREV_MONTH_DAILY = [
  18, 22, 14, 8, 30, 12, 26, 16, 20, 28, 14, 18, 22, 10, 32, 18, 24, 16, 12, 28,
  20, 14, 26, 18, 30, 22, 16, 24, 18, 14,
];

const TOP_MOVEMENTS: Transaction[] = [
  {
    id: "t3",
    amount: 189.4,
    currency: "PEN",
    kind: "expense",
    categoryId: "market",
    merchant: "Wong San Isidro",
    occurredAt: "2026-04-24T19:08:00",
  },
  {
    id: "t9",
    amount: 142.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "fun",
    merchant: "Restaurante La Mar",
    occurredAt: "2026-04-18T21:30:00",
  },
  {
    id: "t12",
    amount: 89.9,
    currency: "PEN",
    kind: "expense",
    categoryId: "utilities",
    merchant: "Movistar plan mensual",
    occurredAt: "2026-04-10T09:00:00",
  },
];

const CATEGORY_ICONS: Record<
  CategoryId,
  React.ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>
> = {
  food: UtensilsCrossed,
  transport: Car,
  market: ShoppingCart,
  health: Heart,
  fun: Film,
  utilities: Zap,
  home: Home,
  edu: GraduationCap,
  work: Briefcase,
  other: Circle,
};

const CATEGORY_LABEL: Record<CategoryId, string> = {
  food: "Comida",
  transport: "Transporte",
  market: "Mercado",
  health: "Salud",
  fun: "Entretenimiento",
  utilities: "Servicios",
  home: "Hogar",
  edu: "Educación",
  work: "Trabajo",
  other: "Otros",
};

// Subtle, unified tint palette — same map shared with Dashboard, Movements,
// and Settings. High lightness + low chroma per hue, NOT a rainbow.
const CATEGORY_TINT: Record<CategoryId, { bg: string; text: string }> = {
  food: { bg: "bg-[oklch(0.92_0.04_30)]", text: "text-[oklch(0.45_0.10_30)]" },
  transport: { bg: "bg-[oklch(0.92_0.03_220)]", text: "text-[oklch(0.45_0.10_220)]" },
  market: { bg: "bg-[oklch(0.92_0.04_280)]", text: "text-[oklch(0.45_0.10_280)]" },
  health: { bg: "bg-[oklch(0.92_0.04_10)]", text: "text-[oklch(0.50_0.12_10)]" },
  fun: { bg: "bg-[oklch(0.92_0.04_310)]", text: "text-[oklch(0.45_0.10_310)]" },
  utilities: { bg: "bg-[oklch(0.92_0.04_70)]", text: "text-[oklch(0.45_0.10_70)]" },
  home: { bg: "bg-[oklch(0.92_0.04_162)]", text: "text-[oklch(0.45_0.10_162)]" },
  edu: { bg: "bg-[oklch(0.92_0.03_180)]", text: "text-[oklch(0.45_0.10_180)]" },
  work: { bg: "bg-[oklch(0.92_0.03_140)]", text: "text-[oklch(0.45_0.10_140)]" },
  other: { bg: "bg-[oklch(0.92_0_95)]", text: "text-[oklch(0.45_0_95)]" },
};

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "month", label: "Mes actual" },
  { id: "q3", label: "Últimos 3 meses" },
  { id: "year", label: "Año" },
];

// ─── Money formatting ─────────────────────────────────────────────────────
// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatMoneyCompact(amount: number, currency: Currency = "PEN"): string {
  // Whole-number rendering for chart axis labels (e.g. "S/ 2.180").
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Period selector chips ────────────────────────────────────────────────
function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Período del análisis"
      className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PERIOD_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Hero metric: gasto vs ingreso ────────────────────────────────────────
function HeroMetric({
  spent,
  income,
  prevSpent,
  currency,
}: {
  spent: number;
  income: number;
  prevSpent: number;
  currency: Currency;
}) {
  const net = income - spent;
  const delta = prevSpent > 0 ? (spent - prevSpent) / prevSpent : 0;
  const positive = delta < 0; // spending less = good
  const DeltaIcon = delta === 0 ? Minus : positive ? ArrowDownRight : ArrowUpRight;
  const deltaToneClass = positive
    ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
    : delta === 0
      ? "text-muted-foreground"
      : "text-destructive";

  return (
    <Card className="rounded-3xl border-border p-6 md:p-8">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Gasto vs ingreso · abril
        </div>
        <div className="mt-1.5 flex items-baseline gap-3">
          <span
            className="font-display italic tabular-nums leading-none tracking-tight text-[44px] md:text-[64px]"
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {formatMoney(spent, currency)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-semibold",
              deltaToneClass,
            )}
          >
            <DeltaIcon size={14} aria-hidden="true" />
            {delta === 0
              ? "sin cambios"
              : `${Math.abs(delta * 100).toFixed(1)}% vs marzo`}
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">
            Ahorrado {formatMoney(net, currency)}
          </span>
        </div>
      </div>
    </Card>
  );
}

// ─── Cross-month comparison bar chart ─────────────────────────────────────
function MonthBars({ months, currency }: { months: MonthTotal[]; currency: Currency }) {
  const currentIdx = months.length - 1;
  // null = no explicit selection → falls back to the most recent month so the
  // chart always shows a value above the active bar without forcing user input.
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);
  const activeIdx = selectedIdx ?? currentIdx;

  const w = 320;
  const h = 160;
  const padTop = 22;
  const padBottom = 28;
  const padX = 8;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const max = Math.max(...months.map((m) => Math.max(m.spent, m.income)));
  const slot = innerW / months.length;
  const barW = Math.min(14, slot * 0.32);
  const gap = 4;

  const toggle = (i: number) => {
    setSelectedIdx((curr) => (curr === i ? null : i));
  };

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Comparativa mensual de gastos — tocá un mes para ver el monto"
    >
      <defs>
        <linearGradient id="lumi-insights-month-current" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="lumi-insights-month-selected" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0.50" />
        </linearGradient>
      </defs>

      {/* Baseline */}
      <line
        x1={padX}
        x2={w - padX}
        y1={h - padBottom + 0.5}
        y2={h - padBottom + 0.5}
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      {months.map((m, i) => {
        const cx = padX + slot * i + slot / 2;
        const spentH = (m.spent / max) * innerH;
        const incomeH = (m.income / max) * innerH;
        const isCurrent = i === currentIdx;
        const isActive = i === activeIdx;
        const spentX = cx + gap / 2;
        const spentY = h - padBottom - spentH;
        // Selected (non-current) uses a neutral foreground gradient so users can
        // tell selection apart from the brand-emerald "current month" emphasis.
        const spentFill = isActive
          ? isCurrent
            ? "url(#lumi-insights-month-current)"
            : "url(#lumi-insights-month-selected)"
          : "var(--color-primary)";
        const spentOpacity = isActive ? 1 : 0.55;
        return (
          <g
            key={m.monthKey}
            onClick={() => toggle(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(i);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={`${m.label}: ${formatMoney(m.spent, currency)}`}
            style={{ cursor: "pointer" }}
            className="focus:outline-none"
          >
            {/* Transparent hit area covering the full slot — drawn first so it
                sits behind the visible bars and provides a forgiving tap target
                on small mobile widths where bars are only ~14px wide. */}
            <rect
              x={padX + slot * i}
              y={padTop}
              width={slot}
              height={innerH + 6}
              fill="transparent"
            />
            {/* Income (lighter, behind) */}
            <rect
              x={cx - barW - gap / 2}
              y={h - padBottom - incomeH}
              width={barW}
              height={incomeH}
              rx="2"
              fill="var(--color-muted)"
              opacity={isActive ? 0.9 : 0.6}
            />
            {/* Spent */}
            <rect
              x={spentX}
              y={spentY}
              width={barW}
              height={spentH}
              rx="2"
              fill={spentFill}
              opacity={spentOpacity}
              style={{ transition: "fill 150ms ease-out, opacity 150ms ease-out" }}
            />
            {isActive && (
              <text
                x={cx}
                y={Math.max(spentY - 6, 10)}
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--font-display)"
                fontStyle="italic"
                className="fill-foreground"
                style={{ fontFeatureSettings: '"tnum","lnum"' }}
              >
                {formatMoneyCompact(m.spent, currency)}
              </text>
            )}
            <text
              x={cx}
              y={h - padBottom + 14}
              textAnchor="middle"
              fontSize="10"
              className={cn(
                "fill-muted-foreground",
                isActive && "fill-foreground font-semibold",
              )}
              fontFamily="var(--font-sans)"
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Range chips for the Comparativa mensual card ────────────────────────
const COMPARE_RANGE_OPTIONS: { id: CompareRange; label: string; months: number }[] = [
  { id: "3m", label: "3M", months: 3 },
  { id: "6m", label: "6M", months: 6 },
];

function CompareRangeChips({
  value,
  onChange,
}: {
  value: CompareRange;
  onChange: (r: CompareRange) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rango de meses a comparar"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5"
    >
      {COMPARE_RANGE_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex h-6 min-w-9 items-center justify-center rounded-full px-2 text-[11px] font-semibold tabular-nums transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Comparativa mensual card ─────────────────────────────────────────────
/**
 * Composes:
 *   1) A hero stat row: average monthly spend across the visible window in
 *      font-display italic + a DeltaChip vs the prior equally-sized window.
 *   2) Local 3M/6M range chips so the user can scope the bar chart without
 *      affecting the rest of the page (page-level period stays independent).
 *   3) A deterministic footer micro-insight surfacing ONE pattern from the
 *      visible months (longest streak, peak month, falling streak, etc.).
 *
 * Why deterministic rotation: SSR + no client-only randomness. We pick the
 * insight that matches the data shape, falling through a small priority list
 * so the same visible window always shows the same line — predictable, no
 * hydration mismatch risk.
 */
function MonthCompareCard({
  allMonths,
  currency,
}: {
  allMonths: MonthTotal[];
  currency: Currency;
}) {
  const [range, setRange] = React.useState<CompareRange>("6m");

  // Slice the visible window AND a same-sized prior window for the delta.
  // We clamp to whatever data exists so a 6-month range still works on a
  // shorter dataset (no negative-index slicing).
  const { visibleMonths, priorMonths } = React.useMemo(() => {
    const opt = COMPARE_RANGE_OPTIONS.find((o) => o.id === range);
    const n = opt ? opt.months : 6;
    const clamped = Math.min(n, allMonths.length);
    const visible = allMonths.slice(-clamped);
    const priorEnd = allMonths.length - clamped;
    const prior =
      priorEnd > 0 ? allMonths.slice(Math.max(0, priorEnd - clamped), priorEnd) : [];
    return { visibleMonths: visible, priorMonths: prior };
  }, [allMonths, range]);

  const avgSpent =
    visibleMonths.reduce((acc, m) => acc + m.spent, 0) / Math.max(visibleMonths.length, 1);
  const priorAvg =
    priorMonths.length > 0
      ? priorMonths.reduce((acc, m) => acc + m.spent, 0) / priorMonths.length
      : undefined;
  const deltaPctInt =
    priorAvg !== undefined && priorAvg > 0
      ? Math.round(((avgSpent - priorAvg) / priorAvg) * 100)
      : undefined;
  // Semantic tone: spending less is "positive" for the user.
  const deltaTone: "positive" | "negative" | "neutral" =
    deltaPctInt === undefined
      ? "neutral"
      : deltaPctInt < 0
        ? "positive"
        : deltaPctInt > 0
          ? "negative"
          : "neutral";

  // Micro-insight: pick deterministically from a priority list. Each branch
  // checks if its pattern is meaningful given the visible data; the first
  // truthy branch wins. This keeps the line stable per render.
  const microInsight = React.useMemo<string | null>(() => {
    if (visibleMonths.length < 2) return null;

    // 1) Falling streak: how many CONSECUTIVE most-recent months have a
    //    strictly lower spent than the previous month.
    let falling = 0;
    for (let i = visibleMonths.length - 1; i > 0; i--) {
      if (visibleMonths[i].spent < visibleMonths[i - 1].spent) falling++;
      else break;
    }
    if (falling >= 2) {
      return `Tu gasto viene bajando ${falling} meses seguidos. Buen ritmo.`;
    }

    // 2) Rising streak.
    let rising = 0;
    for (let i = visibleMonths.length - 1; i > 0; i--) {
      if (visibleMonths[i].spent > visibleMonths[i - 1].spent) rising++;
      else break;
    }
    if (rising >= 2) {
      return `Llevas ${rising} meses subiendo el gasto. Ojo.`;
    }

    // 3) Peak month callout.
    const peak = visibleMonths.reduce((p, m) => (m.spent > p.spent ? m : p));
    const peakLabel = peak.label.charAt(0).toUpperCase() + peak.label.slice(1);
    return `${peakLabel} fue tu mes más fuerte: ${formatMoneyCompact(peak.spent, currency)}.`;
  }, [visibleMonths, currency]);

  const DeltaIcon =
    deltaPctInt === undefined || deltaPctInt === 0
      ? Minus
      : deltaPctInt < 0
        ? TrendingDown
        : TrendingUp;
  const deltaPalette =
    deltaTone === "positive"
      ? "bg-[oklch(0.94_0.05_162)] text-[oklch(0.40_0.14_162)] dark:bg-[oklch(0.30_0.06_162)] dark:text-[oklch(0.85_0.14_162)]"
      : deltaTone === "negative"
        ? "bg-[oklch(0.94_0.04_30)] text-[oklch(0.45_0.14_30)] dark:bg-[oklch(0.30_0.05_30)] dark:text-[oklch(0.85_0.12_30)]"
        : "bg-muted text-muted-foreground";

  return (
    <Card className="relative mx-4 mt-4 overflow-hidden rounded-2xl border-border p-5 md:mx-0 md:mt-0 md:p-6">
      {/* Subtle top accent bar — visual differentiation from sibling cards
          without a heavy frame. Keeps the Lumi calm vibe (primary tint, low
          opacity, 2px). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%)",
          opacity: 0.5,
        }}
      />

      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Comparativa mensual
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Promedio
            </span>
            <span
              className="font-display italic leading-none tracking-tight tabular-nums text-[26px] md:text-[30px]"
              style={{ fontFeatureSettings: '"tnum","lnum"' }}
            >
              {formatMoney(avgSpent, currency)}
            </span>
          </div>
          {deltaPctInt !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums whitespace-nowrap",
                  deltaPalette,
                )}
              >
                <DeltaIcon size={12} aria-hidden="true" strokeWidth={2.5} />
                {Math.abs(deltaPctInt)}%
              </span>
              <span className="text-[11px] text-muted-foreground">
                vs período anterior
              </span>
            </div>
          )}
        </div>
        <CompareRangeChips value={range} onChange={setRange} />
      </div>

      <MonthBars months={visibleMonths} currency={currency} />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm"
            style={{ background: "var(--color-muted)" }}
          />
          Ingreso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm"
            style={{ background: "var(--color-primary)" }}
          />
          Gasto
        </span>
      </div>

      {microInsight && (
        <p className="mt-3 border-t border-border/60 pt-3 text-[12px] leading-snug text-muted-foreground">
          {microInsight}
        </p>
      )}
    </Card>
  );
}

// ─── Category horizontal bars ─────────────────────────────────────────────
function CategoryBars({
  items,
  total,
  currency,
}: {
  items: CategoryBreakdown[];
  total: number;
  currency: Currency;
}) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((c) => {
        const Icon = CATEGORY_ICONS[c.id];
        const tint = CATEGORY_TINT[c.id];
        const widthPct = (c.value / max) * 100;
        const amt = (c.value / 100) * total;
        return (
          <li key={c.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold">{c.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {c.value}%
                </span>
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    background: c.color,
                    transition: "width 500ms cubic-bezier(0.32,0.72,0,1)",
                  }}
                />
              </div>
            </div>
            <span className="font-display text-[13px] italic tabular-nums">
              {formatMoney(amt, currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Spending velocity (cumulative current vs prev month) ────────────────
function VelocityChart({
  current,
  previous,
  daysInMonth,
  currency,
}: {
  current: number[];
  previous: number[];
  daysInMonth: number;
  currency: Currency;
}) {
  const w = 320;
  const h = 160;
  const padX = 8;
  const padTop = 12;
  const padBottom = 24;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;

  const cumCurr = React.useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const v of current) {
      acc += v;
      out.push(acc);
    }
    return out;
  }, [current]);

  const cumPrev = React.useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const v of previous) {
      acc += v;
      out.push(acc);
    }
    return out;
  }, [previous]);

  const max = Math.max(cumPrev[cumPrev.length - 1] ?? 1, cumCurr[cumCurr.length - 1] ?? 1);
  const stepX = innerW / (daysInMonth - 1);

  const buildPath = (data: number[]) =>
    data
      .map((p, i) => {
        const x = padX + i * stepX;
        const y = h - padBottom - (p / max) * innerH;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const currPath = buildPath(cumCurr);
  const prevPath = buildPath(cumPrev);

  const lastCurrX = padX + (cumCurr.length - 1) * stepX;
  const lastCurrY = h - padBottom - (cumCurr[cumCurr.length - 1] / max) * innerH;

  const areaPath = `${currPath} L ${lastCurrX.toFixed(1)} ${(h - padBottom).toFixed(1)} L ${padX.toFixed(1)} ${(h - padBottom).toFixed(1)} Z`;

  const ariaLabel = `Velocidad de gasto del mes. Acumulado actual: ${formatMoney(cumCurr[cumCurr.length - 1] ?? 0, currency)} en ${cumCurr.length} días. Mes anterior al mismo punto: ${formatMoney(cumPrev[cumCurr.length - 1] ?? 0, currency)}.`;

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient
          id="lumi-insights-velocity-grad"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Baseline */}
      <line
        x1={padX}
        x2={w - padX}
        y1={h - padBottom + 0.5}
        y2={h - padBottom + 0.5}
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      {/* Previous month — dashed muted line */}
      <path
        d={prevPath}
        fill="none"
        stroke="var(--color-muted-foreground)"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Current month area + line */}
      <path d={areaPath} fill="url(#lumi-insights-velocity-grad)" />
      <path
        d={currPath}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastCurrX} cy={lastCurrY} r="3" fill="var(--color-primary)" />
      {/* Day labels */}
      {[0, Math.floor(daysInMonth / 4), Math.floor(daysInMonth / 2), Math.floor((daysInMonth * 3) / 4), daysInMonth - 1].map(
        (d) => (
          <text
            key={d}
            x={padX + d * stepX}
            y={h - padBottom + 14}
            textAnchor="middle"
            fontSize="10"
            className="fill-muted-foreground"
            fontFamily="var(--font-sans)"
          >
            {d + 1}
          </text>
        ),
      )}
    </svg>
  );
}

// ─── Insight card ─────────────────────────────────────────────────────────
type InsightTone = "positive" | "negative" | "neutral";
type InsightItem = {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
  Icon: React.ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>;
};

function InsightCard({ item }: { item: InsightItem }) {
  const toneClass = {
    positive:
      "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)] bg-[oklch(0.95_0.04_162)] dark:bg-[oklch(0.28_0.07_162)]",
    negative:
      "text-destructive bg-[oklch(0.95_0.05_25)] dark:bg-[oklch(0.30_0.10_25)]",
    neutral:
      "text-muted-foreground bg-muted",
  }[item.tone];
  const Icon = item.Icon;
  return (
    <article className="flex gap-3 rounded-2xl border border-border bg-card p-4">
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
          toneClass,
        )}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-tight text-foreground">
          {item.title}
        </h3>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {item.body}
        </p>
      </div>
    </article>
  );
}

// ─── Top movement row ─────────────────────────────────────────────────────
function TopMovementRow({ t, rank }: { t: Transaction; rank: number }) {
  const Icon = CATEGORY_ICONS[t.categoryId];
  const tint = CATEGORY_TINT[t.categoryId];
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center font-mono text-[11px] font-semibold tabular-nums text-muted-foreground"
      >
        {rank}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{t.merchant}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {CATEGORY_LABEL[t.categoryId]}
        </div>
      </div>
      <span
        className="font-display text-[15px] italic tabular-nums"
        style={{ fontFeatureSettings: '"tnum","lnum"' }}
      >
        {formatMoney(t.amount, t.currency)}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
const PERIOD_STORAGE_KEY = "lumi-pref-insights-period";
const DEFAULT_PERIOD: Period = "month";

export default function InsightsPage() {
  const [period, setPeriod] = React.useState<Period>(DEFAULT_PERIOD);
  const [periodHydrated, setPeriodHydrated] = React.useState(false);

  // Hydrate period from localStorage AFTER mount — never during SSR.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PERIOD_STORAGE_KEY);
      if (raw === "month" || raw === "q3" || raw === "year") setPeriod(raw);
    } catch {
      // Corrupted value or storage disabled — stay on default.
    }
    setPeriodHydrated(true);
  }, []);

  // Persist period whenever it changes AFTER hydration. Skipping pre-hydration
  // writes prevents the default from clobbering whatever was on disk.
  React.useEffect(() => {
    if (!periodHydrated) return;
    try {
      window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
    } catch {
      // Quota exceeded or storage disabled — nothing actionable here.
    }
  }, [period, periodHydrated]);

  const currency: Currency = "PEN";
  const current = MONTH_TOTALS[CURRENT_INDEX];
  const previous = MONTH_TOTALS[PREV_INDEX];

  // Auto-generated observation cards (mock — derived from constants only).
  const insights: InsightItem[] = React.useMemo(() => {
    const food = CATEGORY_BREAKDOWN.find((c) => c.id === "food");
    const transport = CATEGORY_BREAKDOWN.find((c) => c.id === "transport");
    const saved = current.income - current.spent;
    const savedPct = current.income > 0 ? (saved / current.income) * 100 : 0;
    const items: InsightItem[] = [];

    if (food) {
      const pct = Math.round(Math.abs(food.delta) * 100);
      const up = food.delta > 0;
      items.push({
        id: "food",
        title: up
          ? `Gastaste ${pct}% más en Comida este mes`
          : `Bajaste ${pct}% el gasto en Comida`,
        body: up
          ? "Subió el ticket promedio en delivery — buen momento para revisar suscripciones."
          : "Cocinaste más en casa esta semana. Sigue así.",
        tone: up ? "negative" : "positive",
        Icon: up ? TrendingUp : TrendingDown,
      });
    }
    if (transport) {
      const pct = Math.round(Math.abs(transport.delta) * 100);
      const stable = pct < 5;
      items.push({
        id: "transport",
        title: stable
          ? "Transporte se mantuvo estable"
          : transport.delta > 0
            ? `Transporte subió ${pct}%`
            : `Transporte bajó ${pct}%`,
        body: stable
          ? "Misma frecuencia de viajes que el mes anterior."
          : "Revisa si hay un patrón nuevo (más viajes nocturnos, otra zona).",
        tone: stable ? "neutral" : transport.delta > 0 ? "negative" : "positive",
        Icon: Car,
      });
    }
    items.push({
      id: "savings",
      title: `Llevas ${formatMoney(saved, currency)} ahorrados — ${savedPct.toFixed(0)}% de los ingresos`,
      body: "Mantienes un margen sano para abril. Buen ritmo.",
      tone: "positive",
      Icon: PiggyBank,
    });
    items.push({
      id: "vs-prev",
      title:
        current.spent < previous.spent
          ? `Este mes gastaste ${Math.round(((previous.spent - current.spent) / previous.spent) * 100)}% menos que en marzo`
          : `Este mes gastaste ${Math.round(((current.spent - previous.spent) / previous.spent) * 100)}% más que en marzo`,
      body:
        current.spent < previous.spent
          ? "La mayor reducción se observa en entretenimiento."
          : "Revisa las categorías que más subieron.",
      tone: current.spent < previous.spent ? "positive" : "negative",
      Icon: Sparkles,
    });
    return items.slice(0, 4);
  }, [current, previous, currency]);

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* Header */}
        <AppHeader
          eyebrow="abril · 2026"
          title="Análisis"
          titleStyle="display"
        />

        {/* Period selector */}
        <div className="mt-4 px-4 md:mt-6 md:px-0">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {/* Hero metric */}
        <div className="mx-4 mt-4 md:mx-0 md:mt-6">
          <HeroMetric
            spent={current.spent}
            income={current.income}
            prevSpent={previous.spent}
            currency={currency}
          />
        </div>

        {/* Charts grid */}
        <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6">
          {/* Cross-month comparison */}
          <MonthCompareCard allMonths={MONTH_TOTALS} currency={currency} />

          {/* Spending velocity */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-5 md:mx-0 md:mt-0 md:p-6">
            <div className="flex items-baseline justify-between pb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Velocidad de gasto
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                día {MOCK_TODAY.day} de {MOCK_TODAY.daysInMonth}
              </div>
            </div>
            <VelocityChart
              current={MONTH_DAILY}
              previous={PREV_MONTH_DAILY}
              daysInMonth={MOCK_TODAY.daysInMonth}
              currency={currency}
            />
            <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-[2px] w-4 rounded-full"
                  style={{ background: "var(--color-primary)" }}
                />
                Este mes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-[2px] w-4 rounded-full border-t-2 border-dashed"
                  style={{ borderColor: "var(--color-muted-foreground)" }}
                />
                Marzo
              </span>
            </div>
          </Card>

          {/* Category breakdown */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-5 md:mx-0 md:mt-0 md:col-span-2 md:p-6">
            <div className="flex items-baseline justify-between pb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Por categoría
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                Top {CATEGORY_BREAKDOWN.length}
              </div>
            </div>
            <CategoryBars
              items={CATEGORY_BREAKDOWN}
              total={current.spent}
              currency={currency}
            />
          </Card>

          {/* Insights cards */}
          <section
            aria-label="Observaciones del período"
            className="mx-4 mt-4 md:mx-0 md:mt-0 md:col-span-2"
          >
            <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Observaciones
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {insights.map((it) => (
                <InsightCard key={it.id} item={it} />
              ))}
            </div>
          </section>

          {/* Top movements */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-0 md:mx-0 md:mt-0 md:col-span-2">
            <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Top movimientos
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                3 mayores
              </div>
            </div>
            <ol>
              {TOP_MOVEMENTS.map((t, i) => (
                <li
                  key={t.id}
                  className={i ? "border-t border-border" : ""}
                >
                  <TopMovementRow t={t} rank={i + 1} />
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Bottom spacer so TabBar doesn't overlap last card on mobile */}
        <div className="h-24 md:h-0" aria-hidden="true" />
      </div>
    </div>
  );
}
