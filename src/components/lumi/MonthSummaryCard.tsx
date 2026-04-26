/**
 * MonthSummaryCard — Lumi shared component
 *
 * Lifted from `src/app/(tabs)/movements/page.tsx` so both Dashboard and
 * Movements can render the same vertical "Este mes" hero card.
 *
 * Behavior:
 *   - NETO is the centered hero (font-display italic, oversized).
 *   - Two secondary KPI cells (Gasto / Ingreso) below a thin separator.
 *   - When `onFilterChange` is provided, the cells become tappable buttons.
 *     They toggle: tapping the active filter again returns to "all".
 *   - When `onFilterChange` is omitted, the cells render as static <div>s
 *     with no interactivity (used by Dashboard, which navigates instead).
 */

"use client";

import * as React from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// --- Public types ---------------------------------------------------------
export type MonthFilter = "all" | "expense" | "income";

export interface MonthSummaryCardProps {
  /** Eyebrow label, e.g. "Este mes · abril" */
  eyebrow?: string;
  /** Comparison label, e.g. "comparado con marzo" */
  comparison?: string;
  /** Total expenses for the period (positive number) */
  spent: number;
  /** Total income for the period (positive number) */
  income: number;
  /** Currency for the displayed numbers */
  currency: "PEN" | "USD";
  /** Deltas vs previous period — fractional values (e.g. -0.12 for -12%) */
  spentDelta?: number;
  incomeDelta?: number;
  /** Active filter (controls the visual pressed state of Gasto/Ingreso cells) */
  filter?: MonthFilter;
  /** When provided, Gasto/Ingreso cells become tappable buttons. */
  onFilterChange?: (filter: MonthFilter) => void;
  className?: string;
}

// --- Money formatting -----------------------------------------------------
// TODO: replace with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: "PEN" | "USD" = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Shared min-width so spent / income / net land on aligned right edges.
const MONEY_COL_MIN_WIDTH = "108px";

// --- Delta chip -----------------------------------------------------------
/**
 * Compact, single-line delta chip. Icon + percentage only; the comparison
 * label ("comparado con marzo") lives once in the eyebrow so the chip never
 * wraps inside narrow cells.
 *
 * `tone` is semantic, not raw sign: "positive" = good news for the user
 * (gasto bajó, ingreso subió, ahorro positivo) → emerald.
 */
function DeltaChip({
  pct,
  tone,
}: {
  pct: number;
  tone: "positive" | "negative" | "neutral";
}) {
  const Icon = pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const palette =
    tone === "positive"
      ? "bg-[oklch(0.94_0.05_162)] text-[oklch(0.40_0.14_162)] dark:bg-[oklch(0.30_0.06_162)] dark:text-[oklch(0.85_0.14_162)]"
      : tone === "negative"
        ? "bg-[oklch(0.94_0.04_30)] text-[oklch(0.45_0.14_30)] dark:bg-[oklch(0.30_0.05_30)] dark:text-[oklch(0.85_0.12_30)]"
        : "bg-muted text-muted-foreground";
  // Always show absolute %; the icon carries the direction.
  const display = `${Math.abs(pct)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums whitespace-nowrap",
        palette,
      )}
    >
      <Icon size={12} aria-hidden="true" strokeWidth={2.5} />
      {display}
    </span>
  );
}

// --- KPI cell -------------------------------------------------------------
/**
 * Secondary KPI cell (Gasto / Ingreso). Renders as a real <button> when
 * interactive, or a static <div> when read-only. Active state mirrors
 * aria-pressed for screen readers AND uses a subtle bg + inset ring so the
 * active filter is obvious without shouting.
 */
type HeroKpiProps = {
  label: string;
  amount: number;
  currency: "PEN" | "USD";
  forceSign: "+" | "−";
  variant: "expense" | "income";
  pct?: number;
  ariaLabel?: string;
  pressed?: boolean;
  onClick?: () => void;
};

function HeroKpi({
  label,
  amount,
  currency,
  forceSign,
  variant,
  pct,
  ariaLabel,
  pressed = false,
  onClick,
}: HeroKpiProps) {
  const interactive = typeof onClick === "function";
  const numberColor =
    variant === "income"
      ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
      : "text-foreground";
  const dotColor =
    variant === "income" ? "bg-[oklch(0.65_0.16_162)]" : "bg-foreground/40";
  // Semantic tone: gasto bajó (pct < 0) = positive; ingreso subió (pct > 0) = positive.
  const tone: "positive" | "negative" | "neutral" =
    pct === undefined
      ? "neutral"
      : variant === "expense"
        ? pct <= 0
          ? "positive"
          : "negative"
        : pct >= 0
          ? "positive"
          : "negative";

  const baseClass = cn(
    "flex min-h-[64px] w-full flex-col items-start gap-1.5 rounded-xl px-3.5 py-3 text-left",
    interactive && [
      "transition-colors duration-150 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      pressed
        ? "bg-foreground/[0.06] ring-1 ring-inset ring-foreground/15"
        : "hover:bg-muted/60",
    ],
  );

  // For non-interactive percent rendering we still want fractional inputs to
  // render as integer percentages (e.g. -0.12 → 12%). The DeltaChip already
  // takes a raw integer, so callers pass the fractional value here and we
  // round on render below.
  const pctInt = pct === undefined ? undefined : Math.round(pct * 100);

  const content = (
    <>
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("inline-block h-1.5 w-1.5 rounded-full", dotColor)}
        />
        {label}
      </span>
      <span
        className={cn(
          "font-display italic leading-none tracking-tight text-[22px] md:text-[26px] tabular-nums whitespace-nowrap",
          numberColor,
          pressed && "font-semibold",
        )}
        style={{
          fontFeatureSettings: '"tnum","lnum"',
          minWidth: MONEY_COL_MIN_WIDTH,
        }}
      >
        {forceSign} {formatMoney(amount, currency)}
      </span>
      {pctInt !== undefined && <DeltaChip pct={pctInt} tone={tone} />}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        className={baseClass}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={baseClass} aria-label={ariaLabel}>
      {content}
    </div>
  );
}

// --- Public component -----------------------------------------------------
export function MonthSummaryCard({
  eyebrow = "Este mes · abril",
  comparison = "comparado con marzo",
  spent,
  income,
  currency,
  spentDelta,
  incomeDelta,
  filter = "all",
  onFilterChange,
  className,
}: MonthSummaryCardProps) {
  const net = income - spent;
  const netPositive = net >= 0;
  const netTone: "positive" | "negative" = netPositive ? "positive" : "negative";
  const netColor = netPositive
    ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
    : "text-destructive";

  // Compute net delta from the spent/income deltas only when both are
  // provided; otherwise omit. We treat positive net-direction as "good".
  const netPctInt = (() => {
    if (spentDelta === undefined || incomeDelta === undefined) return undefined;
    // Approximate prior-period reconstruction: reverse the fractional change.
    // prior = current / (1 + delta). Guard against divide-by-zero.
    const priorIncome = income / (1 + incomeDelta);
    const priorSpent = spent / (1 + spentDelta);
    const priorNet = priorIncome - priorSpent;
    if (priorNet === 0) return undefined;
    const change = (net - priorNet) / Math.abs(priorNet);
    return Math.round(change * 100);
  })();

  // Tap-to-filter: tapping the active cell again returns to "all" so the
  // card is a true toggle, not a one-way switch.
  const toggle = (next: MonthFilter) => {
    if (!onFilterChange) return;
    onFilterChange(filter === next ? "all" : next);
  };

  return (
    <Card
      className={cn(
        "mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-6 md:p-10",
        className,
      )}
    >
      {/* Eyebrow — also carries the comparison ("comparado con marzo") so the
          delta chips below stay compact (icon + %) and never line-wrap. */}
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-px w-6 bg-border" />
          {eyebrow}
        </span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
          {comparison}
        </span>
      </div>

      {/* HERO: NETO. The single most important number — "how am I doing this
          month?". Centered, oversized, font-display italic. Renders as <dl>
          for semantic structure (label + value pair, not a control). */}
      <dl className="mt-6 flex flex-col items-center text-center md:mt-8">
        <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              netPositive ? "bg-[oklch(0.65_0.16_162)]" : "bg-destructive",
            )}
          />
          Neto
        </dt>
        <dd
          className={cn(
            "mt-2 font-display italic leading-[0.95] tracking-tight tabular-nums whitespace-nowrap",
            "text-[40px] md:text-[56px]",
            netColor,
          )}
          style={{ fontFeatureSettings: '"tnum","lnum"' }}
        >
          {netPositive ? "+" : "−"} {formatMoney(Math.abs(net), currency)}
        </dd>
        {netPctInt !== undefined && (
          <div className="mt-3">
            <DeltaChip pct={netPctInt} tone={netTone} />
          </div>
        )}
      </dl>

      {/* Thin separator — restraint, not a heavy divider. */}
      <div
        aria-hidden="true"
        className="mx-auto my-6 h-px w-full max-w-xs bg-border md:my-8"
      />

      {/* Secondary KPIs — only TWO cells (no cramped 3-col), so the numbers
          + delta chips never wrap. Each cell is a tappable filter when
          `onFilterChange` is provided. */}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <HeroKpi
          label="Gasto"
          amount={spent}
          currency={currency}
          forceSign="−"
          variant="expense"
          pct={spentDelta}
          ariaLabel={
            onFilterChange
              ? filter === "expense"
                ? "Quitar filtro de gastos"
                : "Filtrar por gastos"
              : `Gasto del mes ${formatMoney(spent, currency)}`
          }
          pressed={filter === "expense"}
          onClick={onFilterChange ? () => toggle("expense") : undefined}
        />
        <HeroKpi
          label="Ingreso"
          amount={income}
          currency={currency}
          forceSign="+"
          variant="income"
          pct={incomeDelta}
          ariaLabel={
            onFilterChange
              ? filter === "income"
                ? "Quitar filtro de ingresos"
                : "Filtrar por ingresos"
              : `Ingreso del mes ${formatMoney(income, currency)}`
          }
          pressed={filter === "income"}
          onClick={onFilterChange ? () => toggle("income") : undefined}
        />
      </div>
    </Card>
  );
}

export default MonthSummaryCard;
