/**
 * Insights route — Lumi
 *
 * Deeper analytics: cross-month comparison, category breakdown, spending
 * velocity vs previous month, auto-generated observations, top movements.
 *
 * Wave 6 of `transactions-persistence`: all mock arrays removed. Data flows
 * exclusively from `useTransactionsWindow` (a single 6-month fetch with
 * memoized projections). NO realtime subscription on this page (per design
 * decision D1 — only Dashboard subscribes to respect the Supabase Pro
 * 200-channel cap). Insights refreshes on mount and on currency change.
 *
 * Source of truth for visuals: Lumi UI-kit `TabScreens.jsx` → `InsightsScreen`.
 * Adapted to project conventions:
 *   - All charts hand-rolled SVG (no recharts/chart.js, per Lumi rules).
 *   - All SVG ids/gradient ids are prefixed `lumi-insights-` to avoid
 *     collisions with the Dashboard route's SVGs (`lumi-dashboard-*`).
 */

"use client";

import * as React from "react";
import Link from "next/link";
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
  Smartphone,
  Tv,
  PawPrint,
  Scissors,
  Shirt,
  Gift,
  ScrollText,
  Circle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  PiggyBank,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/lumi/AppHeader";
import { getMoneyDisplaySizeClass, CURRENCY_LABEL } from "@/lib/money";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import {
  useTransactionsWindow,
  type CategoryBucket,
  type MonthBucket,
} from "@/hooks/use-transactions-window";
import type { TransactionView } from "@/lib/data/transactions";
import type { Currency } from "@/lib/supabase/types";

// ─── Types ─────────────────────────────────────────────────────────────────
type CategoryId =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "phone"
  | "subscriptions"
  | "pets"
  | "personal-care"
  | "clothing"
  | "gifts"
  | "taxes"
  | "home"
  | "edu"
  | "work"
  | "other";

type Period = "month" | "q3" | "year";

// Local time-window for the "Comparativa mensual" card. Independent from the
// page-level `Period` because users may want to scope the bar chart while
// keeping the rest of the page on the current month.
type CompareRange = "3m" | "6m";

// View-shape adapter for the visual category bar. The hook returns a
// data-shaped `CategoryBucket`; this is the presentation extension with the
// resolved icon-id, label, color, and pre-computed amount used by the SVG.
type CategoryBarItem = {
  id: CategoryId;
  label: string;
  value: number; // percent share (0-100)
  amount: number;
  color: string;
  delta: number; // signed fraction vs prior window
};

// ─── Category visuals (pure mappings — no data) ───────────────────────────
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
  phone: Smartphone,
  subscriptions: Tv,
  pets: PawPrint,
  "personal-care": Scissors,
  clothing: Shirt,
  gifts: Gift,
  taxes: ScrollText,
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
  phone: "Telefonía",
  subscriptions: "Suscripciones",
  pets: "Mascotas",
  "personal-care": "Cuidado personal",
  clothing: "Vestimenta",
  gifts: "Regalos",
  taxes: "Impuestos",
  home: "Hogar",
  edu: "Educación",
  work: "Trabajo",
  other: "Otros",
};

// Subtle, unified tint palette — shared with Dashboard, Movements, Settings.
// High lightness + low chroma per hue, NOT a rainbow.
const CATEGORY_TINT: Record<CategoryId, { bg: string; text: string }> = {
  food: { bg: "bg-[oklch(0.92_0.04_30)]", text: "text-[oklch(0.45_0.10_30)]" },
  transport: { bg: "bg-[oklch(0.92_0.03_220)]", text: "text-[oklch(0.45_0.10_220)]" },
  market: { bg: "bg-[oklch(0.92_0.04_280)]", text: "text-[oklch(0.45_0.10_280)]" },
  health: { bg: "bg-[oklch(0.92_0.04_10)]", text: "text-[oklch(0.50_0.12_10)]" },
  fun: { bg: "bg-[oklch(0.92_0.04_310)]", text: "text-[oklch(0.45_0.10_310)]" },
  utilities: { bg: "bg-[oklch(0.92_0.04_70)]", text: "text-[oklch(0.45_0.10_70)]" },
  phone: { bg: "bg-[oklch(0.92_0.04_50)]", text: "text-[oklch(0.45_0.12_50)]" },
  // New categories from migration 00017. Hue picks pulled from the DB
  // color column for visual continuity with the rest of the kit.
  subscriptions: { bg: "bg-[oklch(0.92_0.04_295)]", text: "text-[oklch(0.45_0.12_295)]" },
  pets: { bg: "bg-[oklch(0.92_0.04_55)]", text: "text-[oklch(0.45_0.12_55)]" },
  "personal-care": { bg: "bg-[oklch(0.92_0.04_345)]", text: "text-[oklch(0.45_0.12_345)]" },
  clothing: { bg: "bg-[oklch(0.92_0.04_205)]", text: "text-[oklch(0.45_0.10_205)]" },
  gifts: { bg: "bg-[oklch(0.92_0.04_120)]", text: "text-[oklch(0.45_0.10_120)]" },
  taxes: { bg: "bg-[oklch(0.92_0.02_250)]", text: "text-[oklch(0.45_0.06_250)]" },
  home: { bg: "bg-[oklch(0.92_0.04_162)]", text: "text-[oklch(0.45_0.10_162)]" },
  edu: { bg: "bg-[oklch(0.92_0.03_180)]", text: "text-[oklch(0.45_0.10_180)]" },
  work: { bg: "bg-[oklch(0.92_0.03_140)]", text: "text-[oklch(0.45_0.10_140)]" },
  other: { bg: "bg-[oklch(0.92_0_95)]", text: "text-[oklch(0.45_0_95)]" },
};

// Chart palette — assigned in display order so the same N colors are used
// regardless of which categories the user actually has.
const CATEGORY_CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

/**
 * Best-effort mapping from a free-form `categoryName` (Supabase column) to
 * the visual `CategoryId` enum. The DB doesn't store a slug, but seed names
 * follow the Spanish labels above. Anything we can't recognize falls back
 * to `"other"` so it still renders with the neutral tint instead of crashing.
 *
 * Strategy: lowercase + strip accents, then check known synonyms. We accept
 * both the Spanish display name and a few common variants (e.g. "comida"
 * matches "food") so manually-renamed categories don't drop their icon.
 */
function categoryNameToId(name: string | null | undefined): CategoryId {
  if (!name) return "other";
  const norm = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  if (/(comida|food|restaurant|delivery)/.test(norm)) return "food";
  if (/(transporte|transport|uber|taxi|combustible|gasolina)/.test(norm))
    return "transport";
  if (/(mercado|market|super|grocer)/.test(norm)) return "market";
  if (/(salud|health|farmac|clinic)/.test(norm)) return "health";
  if (/(entreten|fun|cine|ocio)/.test(norm)) return "fun";
  // Order matters — more specific terms first. Suscripciones (Netflix,
  // Spotify, etc.) used to fall through to "fun" / "ocio" via the
  // streaming keyword; promote it to its own bucket now that the
  // category exists.
  if (/(suscrip|streaming|netflix|spotify|disney|hbo|prime)/.test(norm))
    return "subscriptions";
  if (/(mascota|pet|veterinari|veterin)/.test(norm)) return "pets";
  if (/(cuidado personal|peluquer|barber|gimnasio|cosmetic|spa)/.test(norm))
    return "personal-care";
  if (/(vestiment|ropa|calzado|zapato)/.test(norm)) return "clothing";
  if (/(regalo|gift|cumple|aniversario|navidad)/.test(norm)) return "gifts";
  if (/(impuesto|sunat|sunarp|peaje|multa|tramite)/.test(norm))
    return "taxes";
  // Telefonía must be checked before "servicio" / "utilit" so the category
  // doesn't collapse into the lightning-bolt utilities bucket.
  if (/(telefon|recarga|postpago|movistar|claro|entel|bitel)/.test(norm))
    return "phone";
  if (/(servicio|utilit|luz|agua|gas|internet)/.test(norm))
    return "utilities";
  if (/(hogar|home|alquiler|renta)/.test(norm)) return "home";
  if (/(educa|edu|study|school|curso)/.test(norm)) return "edu";
  if (/(trabajo|work|sueldo|salario|payroll|freelance)/.test(norm))
    return "work";
  return "other";
}

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
      aria-label="Período del reporte"
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
/**
 * Promoted from "spent + tiny saved caption" to a real comparativa:
 *  - Hero is the *net* (saldo), tinted by sign so the most relevant number
 *    of the month is the one in lights.
 *  - A single proportion bar shows what % of income was spent vs kept,
 *    capping at 100% with a red overflow indicator when the user spent
 *    more than they earned.
 *  - Two side-by-side stat tiles surface the raw spent + income figures
 *    so the card actually reads as the comparison its title promises.
 *  - Delta vs prev month moves to a chip in the corner — secondary info.
 */
function HeroMetric({
  spent,
  income,
  prevSpent,
  currency,
  monthLabel,
  prevMonthLabel,
}: {
  spent: number;
  income: number;
  prevSpent: number;
  currency: Currency;
  monthLabel: string;
  prevMonthLabel: string;
}) {
  const net = income - spent;
  const heroPositive = net >= 0;
  const ratio =
    income > 0 ? Math.min(spent / income, 1) : spent > 0 ? 1 : 0;
  const ratioPct = Math.round(ratio * 100);
  const savedPct =
    income > 0 ? Math.max(0, Math.round((net / income) * 100)) : 0;
  const overspent = !heroPositive;

  const delta = prevSpent > 0 ? (spent - prevSpent) / prevSpent : 0;
  const deltaPositive = delta < 0; // spending less = good
  const DeltaIcon =
    delta === 0 ? Minus : deltaPositive ? ArrowDownRight : ArrowUpRight;
  const deltaPalette =
    prevSpent <= 0 || delta === 0
      ? "bg-muted text-muted-foreground"
      : deltaPositive
        ? "bg-[oklch(0.94_0.05_162)] text-[oklch(0.40_0.14_162)] dark:bg-[oklch(0.30_0.06_162)] dark:text-[oklch(0.85_0.14_162)]"
        : "bg-[oklch(0.94_0.04_30)] text-[oklch(0.45_0.14_30)] dark:bg-[oklch(0.30_0.05_30)] dark:text-[oklch(0.85_0.12_30)]";
  const heroToneClass = heroPositive
    ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
    : "text-destructive";
  const sign = heroPositive ? "+ " : "− ";
  // Bar width must be at least a sliver when there's any spend — a 0% bar
  // disappears entirely and the user can't tell the bar is even there.
  const barWidthPct = spent > 0 ? Math.max(2, ratioPct) : 0;

  return (
    <Card className="relative overflow-hidden rounded-3xl border-border p-5 md:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: heroPositive
            ? "linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, var(--destructive) 50%, transparent 100%)",
          opacity: 0.55,
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Gasto vs ingreso · {monthLabel}
        </div>
        {prevSpent > 0 && (
          <span
            className={cn(
              "inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums whitespace-nowrap",
              deltaPalette,
            )}
          >
            <DeltaIcon size={12} aria-hidden="true" strokeWidth={2.5} />
            {delta === 0
              ? "Igual"
              : `${Math.abs(delta * 100).toFixed(0)}% vs ${prevMonthLabel}`}
          </span>
        )}
      </div>

      {/* Hero: net (saldo). Tinted so the sign is immediately legible. */}
      <div className="mt-3 min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {heroPositive ? "Ahorrado este mes" : "Gastaste de más"}
        </div>
        <div
          className={cn(
            "mt-1 flex min-w-0 items-baseline font-semibold leading-none tracking-tight tabular-nums",
            getMoneyDisplaySizeClass(Math.abs(net), currency, "hero", 2),
            heroToneClass,
          )}
          style={{ fontFeatureSettings: '"tnum","lnum"' }}
        >
          <span className="max-w-full truncate">
            {sign}
            {formatMoney(Math.abs(net), currency)}
          </span>
        </div>
        {income > 0 && (
          <div className="mt-1.5 text-[12px] text-muted-foreground">
            {heroPositive
              ? `${savedPct}% de tus ingresos`
              : `Excede tu ingreso de ${formatMoney(income, currency)}`}
          </div>
        )}
      </div>

      {/* Proportion bar: what fraction of income went out. */}
      {income > 0 && (
        <div className="mt-4">
          <div
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="presentation"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${barWidthPct}%`,
                background: overspent
                  ? "var(--destructive)"
                  : "var(--color-primary)",
                transition: "width 600ms cubic-bezier(0.32,0.72,0,1)",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-medium tabular-nums text-muted-foreground">
            <span>{ratioPct}% gastado</span>
            <span>Tope {formatMoneyCompact(income, currency)}</span>
          </div>
        </div>
      )}

      {/* Tiles: raw figures so the card actually compares two numbers. */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <ArrowDownRight
              size={11}
              aria-hidden="true"
              strokeWidth={2.5}
              className="text-destructive"
            />
            Gasto
          </div>
          <div
            className={cn(
              "mt-1 truncate font-semibold leading-none tabular-nums",
              getMoneyDisplaySizeClass(spent, currency, "secondary"),
            )}
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {formatMoney(spent, currency)}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <ArrowUpRight
              size={11}
              aria-hidden="true"
              strokeWidth={2.5}
              className="text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
            />
            Ingreso
          </div>
          <div
            className={cn(
              "mt-1 truncate font-semibold leading-none tabular-nums",
              getMoneyDisplaySizeClass(income, currency, "secondary"),
            )}
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {formatMoney(income, currency)}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Cross-month comparison bar chart ─────────────────────────────────────
function MonthBars({ months, currency }: { months: MonthBucket[]; currency: Currency }) {
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
  // Guard against an all-zero window so we don't end up dividing by zero
  // (which would make every bar height NaN). If there's nothing to plot we
  // collapse the bars to height 0 — the chart renders empty but legible.
  const max = Math.max(1, ...months.map((m) => Math.max(m.spent, m.income)));
  const slot = innerW / Math.max(months.length, 1);
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
      aria-label="Comparativa mensual de gastos — toca un mes para ver el monto"
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
            {/* Income — warm accent so it sits visually next to the
                emerald "spent" bar instead of fading into the card.
                The previous muted gray was nearly invisible on light
                mode cards and made comparison impossible. */}
            <rect
              x={cx - barW - gap / 2}
              y={h - padBottom - incomeH}
              width={barW}
              height={incomeH}
              rx="2"
              fill="var(--accent)"
              opacity={isActive ? 1 : 0.7}
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
                fontFamily="var(--font-sans)"
                fontWeight={700}
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
 * Composes an average-spend hero, a 3M/6M range chip group, the bar chart,
 * and a deterministic micro-insight footer line. The hook returns a window
 * pre-seeded to N months so empty months still render at zero — no special
 * handling required here.
 */
function MonthCompareCard({
  allMonths,
  currency,
}: {
  allMonths: MonthBucket[];
  currency: Currency;
}) {
  const [range, setRange] = React.useState<CompareRange>("6m");

  // Slice the visible window AND a same-sized prior window for the delta.
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
    visibleMonths.reduce((acc, m) => acc + m.spent, 0) /
    Math.max(visibleMonths.length, 1);
  const priorAvg =
    priorMonths.length > 0
      ? priorMonths.reduce((acc, m) => acc + m.spent, 0) / priorMonths.length
      : undefined;
  const deltaPctInt =
    priorAvg !== undefined && priorAvg > 0
      ? Math.round(((avgSpent - priorAvg) / priorAvg) * 100)
      : undefined;
  const deltaTone: "positive" | "negative" | "neutral" =
    deltaPctInt === undefined
      ? "neutral"
      : deltaPctInt < 0
        ? "positive"
        : deltaPctInt > 0
          ? "negative"
          : "neutral";

  // Micro-insight: pick deterministically from a priority list.
  const microInsight = React.useMemo<string | null>(() => {
    if (visibleMonths.length < 2) return null;
    // Skip if the visible window has zero spend overall — nothing meaningful to say.
    const totalSpent = visibleMonths.reduce((a, m) => a + m.spent, 0);
    if (totalSpent <= 0) return null;

    let falling = 0;
    for (let i = visibleMonths.length - 1; i > 0; i--) {
      if (visibleMonths[i].spent < visibleMonths[i - 1].spent) falling++;
      else break;
    }
    if (falling >= 2) {
      return `Tu gasto viene bajando ${falling} meses seguidos. Buen ritmo.`;
    }

    let rising = 0;
    for (let i = visibleMonths.length - 1; i > 0; i--) {
      if (visibleMonths[i].spent > visibleMonths[i - 1].spent) rising++;
      else break;
    }
    if (rising >= 2) {
      return `Llevas ${rising} meses subiendo el gasto. Ojo.`;
    }

    const peak = visibleMonths.reduce((p, m) => (m.spent > p.spent ? m : p));
    if (peak.spent <= 0) return null;
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
    <Card className="relative overflow-hidden rounded-2xl border-border p-5 md:p-6">
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
        <div className="min-w-0 flex-1">
          <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Comparativa mensual
          </div>
          <div className="mt-2 flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Promedio
            </span>
            <span
              className={cn(
                "min-w-0 max-w-full truncate font-semibold leading-none tracking-tight tabular-nums",
                getMoneyDisplaySizeClass(avgSpent, currency, "secondary"),
              )}
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
            style={{ background: "var(--accent)" }}
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

// ─── Balance mensual card (diverging bars) ───────────────────────────────
/**
 * Complementary cross-month view to MonthCompareCard. That card shows raw
 * spend vs income side-by-side; this one collapses each month to a single
 * signed scalar — net saldo — and renders it as a horizontal bar diverging
 * from a center axis. Green right = saved, red left = overspent.
 *
 * Different visual layer (rows, not vertical bars) and different question
 * (am I net-positive month over month?) so the two cards complement
 * instead of duplicate.
 */
function MonthSavingsCard({
  allMonths,
  currency,
}: {
  allMonths: MonthBucket[];
  currency: Currency;
}) {
  const [range, setRange] = React.useState<CompareRange>("6m");

  const visibleMonths = React.useMemo(() => {
    const opt = COMPARE_RANGE_OPTIONS.find((o) => o.id === range);
    const n = opt ? opt.months : 6;
    return allMonths.slice(-Math.min(n, allMonths.length));
  }, [allMonths, range]);

  const items = React.useMemo(
    () => visibleMonths.map((m) => ({ ...m, net: m.income - m.spent })),
    [visibleMonths],
  );

  // Symmetric scale around the center axis: bars never escape their slot
  // even when one month is dramatically deeper in the red than another is
  // in the green.
  const absMax = Math.max(1, ...items.map((m) => Math.abs(m.net)));
  const totalNet = items.reduce((acc, m) => acc + m.net, 0);
  const totalNetPositive = totalNet >= 0;
  const positiveCount = items.filter((m) => m.net > 0).length;

  const positiveTone =
    "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]";

  return (
    <Card className="relative overflow-hidden rounded-2xl border-border p-5 md:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: totalNetPositive
            ? "linear-gradient(90deg, transparent 0%, var(--color-primary) 50%, transparent 100%)"
            : "linear-gradient(90deg, transparent 0%, var(--destructive) 50%, transparent 100%)",
          opacity: 0.45,
        }}
      />

      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Balance mensual
          </div>
          <div className="mt-2 flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Acumulado
            </span>
            <span
              className={cn(
                "min-w-0 max-w-full truncate font-semibold leading-none tracking-tight tabular-nums",
                getMoneyDisplaySizeClass(
                  Math.abs(totalNet),
                  currency,
                  "secondary",
                  2,
                ),
                totalNetPositive ? positiveTone : "text-destructive",
              )}
              style={{ fontFeatureSettings: '"tnum","lnum"' }}
            >
              {totalNetPositive ? "+ " : "− "}
              {formatMoney(Math.abs(totalNet), currency)}
            </span>
          </div>
          {items.length > 0 && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {positiveCount} de {items.length}{" "}
              {items.length === 1 ? "mes" : "meses"} en positivo
            </div>
          )}
        </div>
        <CompareRangeChips value={range} onChange={setRange} />
      </div>

      <ul className="mt-2 flex flex-col gap-2.5" aria-label="Saldo por mes">
        {items.map((m) => {
          const isPos = m.net >= 0;
          // Half-slot scale: a bar at absMax fills 50% of the row (one full
          // side of the axis). Min 1.5% so a tiny non-zero net is still
          // visible; pure 0 collapses to nothing.
          const widthPct =
            Math.abs(m.net) === 0
              ? 0
              : Math.max(1.5, (Math.abs(m.net) / absMax) * 50);
          const barColor = isPos
            ? "var(--color-primary)"
            : "var(--destructive)";
          return (
            <li
              key={m.monthKey}
              className="grid grid-cols-[36px_1fr_auto] items-center gap-3"
              aria-label={`${m.label}: ${
                isPos ? "ahorraste" : "gastaste de más"
              } ${formatMoney(Math.abs(m.net), currency)}`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                {m.label.slice(0, 3)}
              </span>
              <div className="relative h-2.5 w-full rounded-full bg-muted/60">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
                />
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    left: isPos ? "50%" : `${50 - widthPct}%`,
                    background: barColor,
                    transition: "width 500ms cubic-bezier(0.32,0.72,0,1)",
                  }}
                />
              </div>
              <span
                className={cn(
                  "min-w-[78px] flex-shrink-0 text-right text-[12px] font-semibold tabular-nums",
                  isPos ? positiveTone : "text-destructive",
                )}
                style={{ fontFeatureSettings: '"tnum","lnum"' }}
              >
                {isPos ? "+" : "−"}
                {formatMoneyCompact(Math.abs(m.net), currency)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm"
            style={{ background: "var(--color-primary)" }}
          />
          Ahorro
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm"
            style={{ background: "var(--destructive)" }}
          />
          Sobregasto
        </span>
      </div>
    </Card>
  );
}

// ─── Category horizontal bars ─────────────────────────────────────────────
function CategoryBars({
  items,
  total,
  currency,
}: {
  items: CategoryBarItem[];
  total: number;
  currency: Currency;
}) {
  // Same all-zero guard as MonthBars — without it, a fresh user with one tiny
  // expense across one category still gets a meaningful bar (max === value).
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((c) => {
        const Icon = CATEGORY_ICONS[c.id];
        const tint = CATEGORY_TINT[c.id];
        const widthPct = (c.value / max) * 100;
        // Prefer the bucket's actual amount over a pct-of-total reconstruction:
        // hook-side amounts are exact, while percent rounding loses cents.
        const amt = c.amount > 0 ? c.amount : (c.value / 100) * total;
        return (
          <li key={c.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] font-semibold">{c.label}</span>
                <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
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
            <span className="max-w-[40vw] truncate text-[13px] font-semibold tabular-nums sm:max-w-none">
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

  const max = Math.max(
    1,
    cumPrev[cumPrev.length - 1] ?? 0,
    cumCurr[cumCurr.length - 1] ?? 0,
  );
  const stepX = innerW / Math.max(daysInMonth - 1, 1);

  const buildPath = (data: number[]) =>
    data
      .map((p, i) => {
        const x = padX + i * stepX;
        const y = h - padBottom - (p / max) * innerH;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const currPath = cumCurr.length > 0 ? buildPath(cumCurr) : "";
  const prevPath = cumPrev.length > 0 ? buildPath(cumPrev) : "";

  const lastCurrIdx = Math.max(cumCurr.length - 1, 0);
  const lastCurrX = padX + lastCurrIdx * stepX;
  const lastCurrY =
    cumCurr.length > 0
      ? h - padBottom - ((cumCurr[lastCurrIdx] ?? 0) / max) * innerH
      : h - padBottom;

  const areaPath =
    cumCurr.length > 0
      ? `${currPath} L ${lastCurrX.toFixed(1)} ${(h - padBottom).toFixed(1)} L ${padX.toFixed(1)} ${(h - padBottom).toFixed(1)} Z`
      : "";

  const ariaLabel = `Velocidad de gasto del mes. Acumulado actual: ${formatMoney(cumCurr[cumCurr.length - 1] ?? 0, currency)} en ${cumCurr.length} días. Mes anterior al mismo punto: ${formatMoney(cumPrev[lastCurrIdx] ?? 0, currency)}.`;

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
      <line
        x1={padX}
        x2={w - padX}
        y1={h - padBottom + 0.5}
        y2={h - padBottom + 0.5}
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      {prevPath && (
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
      )}
      {areaPath && <path d={areaPath} fill="url(#lumi-insights-velocity-grad)" />}
      {currPath && (
        <path
          d={currPath}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {cumCurr.length > 0 && (
        <circle cx={lastCurrX} cy={lastCurrY} r="3" fill="var(--color-primary)" />
      )}
      {[
        0,
        Math.floor(daysInMonth / 4),
        Math.floor(daysInMonth / 2),
        Math.floor((daysInMonth * 3) / 4),
        daysInMonth - 1,
      ].map((d) => (
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
      ))}
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
    neutral: "text-muted-foreground bg-muted",
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
function TopMovementRow({
  t,
  rank,
}: {
  t: TransactionView;
  rank: number;
}) {
  const catId = categoryNameToId(t.categoryName);
  const Icon = CATEGORY_ICONS[catId];
  const tint = CATEGORY_TINT[catId];
  const merchantLabel = t.merchantName ?? t.note ?? "Sin descripción";
  const categoryLabel = t.categoryName ?? CATEGORY_LABEL[catId];
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center font-mono text-[11px] font-semibold tabular-nums text-muted-foreground"
      >
        {rank}
      </span>
      {t.merchantLogoSlug ? (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs in /public */}
          <img
            src={`/logos/merchants/${t.merchantLogoSlug}.svg`}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-contain"
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
        >
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{merchantLabel}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{categoryLabel}</div>
      </div>
      <span
        className="max-w-[40vw] flex-shrink-0 truncate text-[15px] font-semibold tabular-nums sm:max-w-none"
        style={{ fontFeatureSettings: '"tnum","lnum"' }}
      >
        {formatMoney(t.amount, t.currency)}
      </span>
    </div>
  );
}

// ─── Loading / empty / error states ───────────────────────────────────────

function CardSkeleton({ height = 180 }: { height?: number }) {
  return (
    <Card className="rounded-2xl border-border p-5 md:p-6">
      <div className="flex items-baseline justify-between pb-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="w-full rounded-xl" style={{ height }} />
    </Card>
  );
}

function HeroSkeleton() {
  return (
    <Card className="rounded-3xl border-border p-5 md:p-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-12 w-56 md:h-16 md:w-72" />
      <div className="mt-4 flex gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
    </Card>
  );
}

function EmptyInsightsCard({ currency }: { currency: Currency }) {
  return (
    <Card className="rounded-2xl border-border bg-[var(--color-card)] p-5 text-center md:p-6">
      <div className="mx-auto flex flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.94_0.05_162)] text-primary dark:bg-[oklch(0.30_0.06_162)]">
          <Sparkles size={22} aria-hidden="true" strokeWidth={2.2} />
        </span>
        <h2 className="mt-5 text-[18px] font-bold tracking-tight md:text-[20px]">
          Aún no hay datos para analizar
        </h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
          Sin movimientos en {CURRENCY_LABEL[currency]} para mostrar
          comparativas. Registra tu primer movimiento y vuelve aquí.
        </p>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/capture"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Registrar movimiento
          </Link>
        </div>
      </div>
    </Card>
  );
}

function ErrorInsightsCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-5 text-center md:p-6">
      <h2 className="text-[15px] font-semibold text-destructive">
        No pudimos cargar tu reporte
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Reintentar
      </button>
    </Card>
  );
}

/**
 * HistoryNotice — soft banner that explains which reports unlock at which
 * history milestone. Renders nothing once the user has 12+ months of data
 * (the deepest tier we currently surface). Copy is calm and informative —
 * no modal, no blocking state, just context next to the hero metric.
 */
function HistoryNotice({ months }: { months: number }) {
  if (months >= 12) return null;

  const isStarter = months < 3;
  const remainingForYear = Math.max(0, 12 - months);

  let title: string;
  let body: string;
  if (months === 0) {
    title = "Tu reporte se construye solo";
    body =
      "Aún no registras movimientos. Cuando empieces a capturar gastos e ingresos, los reportes se rellenan al instante. Las tendencias trimestrales se desbloquean a los 3 meses y la comparativa anual a los 12.";
  } else if (isStarter) {
    title = "Estás empezando — sigue así";
    body = `Llevas ${months} ${months === 1 ? "mes" : "meses"} registrando. Las tendencias trimestrales (cómo evoluciona tu gasto entre periodos) se desbloquean cuando tengas al menos 3 meses de historial. La comparativa anual completa, a los 12 meses.`;
  } else {
    title = "Tu historial sigue creciendo";
    body = `Llevas ${months} meses registrando. La comparativa anual completa se desbloquea cuando tengas 12 meses (te falta${remainingForYear === 1 ? "" : "n"} ${remainingForYear} ${remainingForYear === 1 ? "mes" : "meses"}).`;
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <Sparkles size={16} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight text-foreground">
            {title}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
            {body}
          </p>
        </div>
      </div>
    </Card>
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

  // Currency comes from the global pref so /dashboard, /movements, and
  // /insights stay in sync. Insights does NOT subscribe to realtime — D1
  // says only Dashboard does, to respect the 200-channel Supabase Pro cap.
  const { currency } = useActiveCurrency();
  // 12-month window (vs the dashboard's 6) so the year-over-year comparison
  // and the "Necesitas un año de historial" banner have enough data to
  // tell the difference between a 6-month and a 12-month user.
  const win = useTransactionsWindow({ months: 12, currency });

  // Derive presentation-ready labels from the hook's monthTotals. The last
  // bucket is always the current month; the previous one (if it exists) is
  // the comparison anchor. We avoid `new Date()` inside JSX so SSR + first
  // client render line up.
  const monthTotals = win.monthTotals;
  const currentBucket = monthTotals[monthTotals.length - 1];

  // History length — number of months in the visible 12-month window that
  // actually have at least one tx. Drives the HistoryNotice banner: under
  // 3 → "starter" copy; 3–11 → "year-comparison unlocks at 12" copy; 12+
  // hides the banner. Pre-seeded zero buckets are excluded by the filter.
  const monthsOfHistory = React.useMemo(
    () =>
      monthTotals.filter((m) => m.spent > 0 || m.income > 0).length,
    [monthTotals],
  );
  const prevBucket: MonthBucket | undefined =
    monthTotals.length >= 2 ? monthTotals[monthTotals.length - 2] : undefined;

  // Map hook category buckets → CategoryBarItem[] for the visual layer.
  // Color is positional (top category gets chart-1) so the chart palette is
  // stable regardless of which categories the user actually has.
  const categoryItems = React.useMemo<CategoryBarItem[]>(() => {
    return win.byCategoryCurrentMonth.map((b: CategoryBucket, i) => {
      const id = categoryNameToId(b.categoryName);
      return {
        id,
        label: b.categoryName ?? CATEGORY_LABEL[id],
        value: b.value,
        amount: b.amount,
        color: CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length],
        delta: b.delta,
      };
    });
  }, [win.byCategoryCurrentMonth]);

  // Velocity chart consumes plain number[] (incremental amounts per day).
  const monthDailyValues = React.useMemo(
    () => win.byDayCurrentMonth.map((d) => d.amount),
    [win.byDayCurrentMonth],
  );
  const prevMonthDailyValues = React.useMemo(
    () => win.byDayPrevMonth.map((d) => d.amount),
    [win.byDayPrevMonth],
  );
  const currentDaysInMonth = win.byDayCurrentMonth.length;
  // Last day (1-indexed) with any expense activity so far this month.
  // `0` means the user has nothing recorded yet this month — the velocity
  // card flips to a "Sin gastos este mes aún" copy in that case rather
  // than rendering a misleading "día 31 de 31".
  const daysWithActivity = React.useMemo(() => {
    let last = 0;
    for (let i = 0; i < win.byDayCurrentMonth.length; i++) {
      if (win.byDayCurrentMonth[i].amount > 0) last = i + 1;
    }
    return last;
  }, [win.byDayCurrentMonth]);

  // Auto-generated observation cards — derived from real aggregations now.
  const insights = React.useMemo<InsightItem[]>(() => {
    if (!currentBucket) return [];
    const items: InsightItem[] = [];
    const food = win.byCategoryCurrentMonth.find(
      (c) => categoryNameToId(c.categoryName) === "food",
    );
    const transport = win.byCategoryCurrentMonth.find(
      (c) => categoryNameToId(c.categoryName) === "transport",
    );
    const saved = currentBucket.income - currentBucket.spent;
    const savedPct =
      currentBucket.income > 0 ? (saved / currentBucket.income) * 100 : 0;

    if (food && Math.abs(food.delta) > 0) {
      const pct = Math.round(Math.abs(food.delta) * 100);
      const up = food.delta > 0;
      items.push({
        id: "food",
        title: up
          ? `Gastaste ${pct}% más en ${food.categoryName ?? "Comida"} este mes`
          : `Bajaste ${pct}% el gasto en ${food.categoryName ?? "Comida"}`,
        body: up
          ? "Subió el ticket promedio — buen momento para revisar suscripciones."
          : "Sigue así.",
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
          : "Revisa si hay un patrón nuevo.",
        tone: stable ? "neutral" : transport.delta > 0 ? "negative" : "positive",
        Icon: Car,
      });
    }
    if (currentBucket.income > 0) {
      items.push({
        id: "savings",
        title: `Llevas ${formatMoney(saved, currency)} ahorrados — ${savedPct.toFixed(0)}% de los ingresos`,
        body:
          saved > 0
            ? "Mantienes un margen sano. Buen ritmo."
            : "Estás gastando por encima de tus ingresos este mes.",
        tone: saved > 0 ? "positive" : "negative",
        Icon: PiggyBank,
      });
    }
    if (prevBucket && prevBucket.spent > 0) {
      const less = currentBucket.spent < prevBucket.spent;
      const pct = Math.round(
        Math.abs((currentBucket.spent - prevBucket.spent) / prevBucket.spent) * 100,
      );
      items.push({
        id: "vs-prev",
        title: less
          ? `Este mes gastaste ${pct}% menos que en ${prevBucket.label}`
          : `Este mes gastaste ${pct}% más que en ${prevBucket.label}`,
        body: less
          ? "Mantén el ritmo en las próximas semanas."
          : "Revisa las categorías que más subieron.",
        tone: less ? "positive" : "negative",
        Icon: Sparkles,
      });
    }
    return items.slice(0, 4);
  }, [currentBucket, prevBucket, win.byCategoryCurrentMonth, currency]);

  const monthLabel = currentBucket?.label ?? "—";
  const prevMonthLabel = prevBucket?.label ?? "mes anterior";

  // Branch state: error > loading > empty > ready. Empty is "no rows in this
  // currency" — distinct from loading (still fetching) so the user gets a
  // concrete CTA instead of a spinner forever.
  const showError = !!win.error;
  const showLoading = win.loading && win.rows.length === 0 && !win.error;
  const showEmpty =
    !win.loading && !win.error && win.rows.length === 0;

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-5xl md:space-y-10 md:px-8 md:pt-10">
        {/* Header */}
        <AppHeader
          eyebrow={
            currentBucket
              ? `${monthLabel} · ${currentBucket.monthKey.slice(0, 4)}`
              : "Reportes"
          }
          title="Reportes"
          titleStyle="page"
          className="px-0 pt-0"
        />

        {/* Period selector */}
        <div>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        {showError && (
          <ErrorInsightsCard
            message={win.error?.message ?? "Hubo un problema cargando los datos."}
            onRetry={win.refetch}
          />
        )}

        {!showError && showLoading && (
          <>
            <HeroSkeleton />
            <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
              <CardSkeleton />
              <CardSkeleton />
              <div className="md:col-span-2">
                <CardSkeleton height={220} />
              </div>
            </div>
          </>
        )}

        {!showError && !showLoading && showEmpty && (
          <EmptyInsightsCard currency={currency} />
        )}

        {!showError && !showLoading && !showEmpty && currentBucket && (
          <>
            {/* History-length notice — explains when quarterly / annual
                comparisons unlock. Hides itself once the user has 12+
                months of recorded activity. */}
            <HistoryNotice months={monthsOfHistory} />

            {/* Hero metric */}
            <HeroMetric
              spent={currentBucket.spent}
              income={currentBucket.income}
              prevSpent={prevBucket?.spent ?? 0}
              currency={currency}
              monthLabel={monthLabel}
              prevMonthLabel={prevMonthLabel}
            />

            {/* Charts grid */}
            <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
              {/* Cross-month comparison — gasto vs ingreso por mes */}
              <MonthCompareCard allMonths={monthTotals} currency={currency} />

              {/* Cross-month balance — saldo neto por mes (complementario) */}
              <MonthSavingsCard allMonths={monthTotals} currency={currency} />

              {/* Spending velocity */}
              <Card className="rounded-2xl border-border p-5 md:col-span-2 md:p-6">
                <div className="flex items-baseline justify-between pb-3">
                  <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Velocidad de gasto
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {daysWithActivity > 0
                      ? `día ${daysWithActivity} de ${currentDaysInMonth}`
                      : "Sin gastos este mes aún"}
                  </div>
                </div>
                <VelocityChart
                  current={monthDailyValues}
                  previous={prevMonthDailyValues}
                  daysInMonth={currentDaysInMonth}
                  currency={currency}
                />
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
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
                    {prevMonthLabel}
                  </span>
                </div>
              </Card>

              {/* Category breakdown */}
              <Card className="rounded-2xl border-border p-5 md:col-span-2 md:p-6">
                <div className="flex items-baseline justify-between pb-3">
                  <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Por categoría
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Top {categoryItems.length}
                  </div>
                </div>
                {categoryItems.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Aún no hay categorías para este mes.
                  </p>
                ) : (
                  <CategoryBars
                    items={categoryItems}
                    total={currentBucket.spent}
                    currency={currency}
                  />
                )}
              </Card>

              {/* Insights cards */}
              {insights.length > 0 && (
                <section
                  aria-label="Observaciones del período"
                  className="md:col-span-2"
                >
                  <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Observaciones
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {insights.map((it) => (
                      <InsightCard key={it.id} item={it} />
                    ))}
                  </div>
                </section>
              )}

              {/* Top movements */}
              {win.topMovementsCurrentMonth.length > 0 && (
                <Card className="rounded-2xl border-border p-0 md:col-span-2">
                  <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Top movimientos
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {win.topMovementsCurrentMonth.length} mayores
                    </div>
                  </div>
                  <ol>
                    {win.topMovementsCurrentMonth.map((t, i) => (
                      <li
                        key={t.id}
                        className={i ? "border-t border-border" : ""}
                      >
                        <TopMovementRow t={t} rank={i + 1} />
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
