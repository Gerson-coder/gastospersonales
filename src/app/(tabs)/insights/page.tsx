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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 80% 0%, oklch(0.72 0.18 162 / 0.10) 0%, transparent 60%)",
        }}
      />
      <div className="relative">
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
  const w = 320;
  const h = 160;
  const padTop = 16;
  const padBottom = 28;
  const padX = 8;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const max = Math.max(...months.map((m) => Math.max(m.spent, m.income)));
  const slot = innerW / months.length;
  const barW = Math.min(14, slot * 0.32);
  const gap = 4;

  const ariaLabel = `Comparativa de gasto e ingreso de los últimos ${months.length} meses. Mes actual: ${formatMoneyCompact(months[months.length - 1].spent, currency)} de gasto.`;

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
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
        const isCurrent = i === months.length - 1;
        return (
          <g key={m.monthKey}>
            {/* Income (lighter, behind) */}
            <rect
              x={cx - barW - gap / 2}
              y={h - padBottom - incomeH}
              width={barW}
              height={incomeH}
              rx="2"
              fill="var(--color-muted)"
              opacity={isCurrent ? 0.9 : 0.6}
            />
            {/* Spent */}
            <rect
              x={cx + gap / 2}
              y={h - padBottom - spentH}
              width={barW}
              height={spentH}
              rx="2"
              fill="var(--color-primary)"
              opacity={isCurrent ? 1 : 0.55}
            />
            <text
              x={cx}
              y={h - padBottom + 14}
              textAnchor="middle"
              fontSize="10"
              className={cn(
                "fill-muted-foreground",
                isCurrent && "fill-foreground font-semibold",
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
        const widthPct = (c.value / max) * 100;
        const amt = (c.value / 100) * total;
        return (
          <li key={c.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
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
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
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
export default function InsightsPage() {
  const [period, setPeriod] = React.useState<Period>("month");

  const currency: Currency = "PEN";
  const current = MONTH_TOTALS[CURRENT_INDEX];
  const previous = MONTH_TOTALS[PREV_INDEX];

  // Slice months according to selected period.
  const visibleMonths = React.useMemo(() => {
    if (period === "month") return MONTH_TOTALS.slice(-3);
    if (period === "q3") return MONTH_TOTALS.slice(-3);
    return MONTH_TOTALS;
  }, [period]);

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
          : "Cocinaste más en casa esta semana. Seguí así.",
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
          : "Revisá si hay un patrón nuevo (más viajes nocturnos, otra zona).",
        tone: stable ? "neutral" : transport.delta > 0 ? "negative" : "positive",
        Icon: Car,
      });
    }
    items.push({
      id: "savings",
      title: `Llevás ${formatMoney(saved, currency)} ahorrados — ${savedPct.toFixed(0)}% del ingreso`,
      body: "Mantenés un margen sano para abril. Buen ritmo.",
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
          : "Revisá las categorías que más subieron.",
      tone: current.spent < previous.spent ? "positive" : "negative",
      Icon: Sparkles,
    });
    return items.slice(0, 4);
  }, [current, previous, currency]);

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* Header */}
        <header className="px-5 pt-3 md:px-0 md:pt-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            abril · 2026
          </div>
          <h1 className="mt-1 text-[22px] font-bold md:text-3xl">Análisis</h1>
        </header>

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
          <Card className="mx-4 mt-4 rounded-2xl border-border p-5 md:mx-0 md:mt-0 md:p-6">
            <div className="flex items-baseline justify-between pb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Comparativa mensual
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                {visibleMonths.length} meses
              </div>
            </div>
            <MonthBars months={visibleMonths} currency={currency} />
            <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
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
          </Card>

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
