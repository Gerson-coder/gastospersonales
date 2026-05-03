/**
 * MonthSummaryCard — Kane shared component
 *
 * Lifted from `src/app/(tabs)/movements/page.tsx` so both Dashboard and
 * Movements can render the same vertical "Este mes" hero card.
 *
 * Behavior:
 *   - NETO is the centered hero (sans + tabular-nums, oversized).
 *   - Two secondary KPI cells (Gasto / Ingreso) below a thin separator.
 *   - When `onFilterChange` is provided, the cells become tappable buttons.
 *     They toggle: tapping the active filter again returns to "all".
 *   - When `onFilterChange` is omitted, the cells render as static <div>s
 *     with no interactivity (used by Dashboard, which navigates instead).
 */

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { getMoneyDisplaySizeClass } from "@/lib/money";

// --- Public types ---------------------------------------------------------
export type MonthFilter = "all" | "expense" | "income";

export interface MonthSummaryCardProps {
  /** Period label shown in the top-LEFT corner, uppercase, e.g. "ABRIL 2026" */
  periodLabel?: string;
  /** Total expenses for the period (positive number) */
  spent: number;
  /** Total income for the period (positive number) */
  income: number;
  /** Currency for the displayed numbers */
  currency: "PEN" | "USD";
  /**
   * Optional currency switch (PEN/USD pill). When provided, it renders centered
   * inside the card between the separator and the Gasto/Ingreso row. The
   * Dashboard mounts the global `<CurrencySwitch />` here so the toggle lives
   * inside the hero rather than in the header.
   */
  currencySwitch?: React.ReactNode;
  /** Deltas vs previous period — fractional values (e.g. -0.12 for -12%). Currently unused; kept for API back-compat. */
  spentDelta?: number;
  incomeDelta?: number;
  /** Active filter (controls the visual pressed state of Gasto/Ingreso cells) */
  filter?: MonthFilter;
  /** When provided, Gasto/Ingreso cells become tappable buttons. */
  onFilterChange?: (filter: MonthFilter) => void;
  /** Deprecated — currency toggle now lives in the global header. Kept as a noop prop for back-compat. */
  onCurrencyToggle?: () => void;
  className?: string;
  /** Deprecated — eyebrow no longer rendered. Kept as a noop prop for back-compat. */
  eyebrow?: string;
  /** Deprecated — comparison no longer rendered. Kept as a noop prop for back-compat. */
  comparison?: string;
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
  forceSign: "−" | "";
  variant: "expense" | "income";
  ariaLabel?: string;
  pressed?: boolean;
  onClick?: () => void;
  /** Parent has stacked the row vertically (long amounts). When true both
   *  KPIs align left for symmetry. When false they push to opposite edges. */
  stacked?: boolean;
};

function HeroKpi({
  label,
  amount,
  currency,
  forceSign,
  variant,
  ariaLabel,
  pressed = false,
  onClick,
  stacked = false,
}: HeroKpiProps) {
  const interactive = typeof onClick === "function";
  // Subtle (non-saturated) tones: rose for gasto, emerald for ingreso. Use a
  // soft chroma + medium lightness so they read as colored without shouting.
  const numberColor =
    variant === "income"
      ? "text-[oklch(0.50_0.13_162)] dark:text-[oklch(0.82_0.13_162)]"
      : "text-[oklch(0.50_0.14_25)] dark:text-[oklch(0.82_0.12_25)]";
  const dotColor =
    variant === "income"
      ? "bg-[oklch(0.65_0.16_162)]"
      : "bg-[oklch(0.65_0.18_25)]";

  // Side-by-side: push expense left + income right (outer-edge alignment
  // gives natural breathing room in the middle). Stacked vertically: both
  // align left for symmetric reading flow. Desktop: always left.
  const isIncome = variant === "income";
  // Subtle tint background per variant — same hues as the dot/number text
  // but very low chroma so they read as gentle wash, not a saturated chip.
  // Light mode: pale tint at 60% alpha. Dark mode: deeper tint at 25% alpha.
  const tintBg = isIncome
    ? "bg-[oklch(0.93_0.10_162/0.95)] dark:bg-[oklch(0.30_0.13_162/0.65)]"
    : "bg-[oklch(0.93_0.10_25/0.95)] dark:bg-[oklch(0.30_0.13_25/0.65)]";
  const baseClass = cn(
    "flex min-h-[72px] w-full min-w-0 flex-col gap-2 rounded-xl px-4 py-3.5",
    tintBg,
    isIncome && !stacked
      ? "items-end text-right md:items-start md:text-left"
      : "items-start text-left",
    interactive && [
      "transition-colors duration-150 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      pressed
        ? "ring-1 ring-inset ring-foreground/15"
        : "hover:brightness-[0.98] dark:hover:brightness-110",
    ],
  );

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
          "block max-w-full font-semibold leading-none tracking-tight tabular-nums",
          // Predictable size tiers driven by formatted character count.
          // Pass 2 extra chars when forceSign is set ("− ") so the prefix
          // is included in the tier decision and we don't overflow the cell.
          getMoneyDisplaySizeClass(
            amount,
            currency,
            "secondary",
            forceSign ? 2 : 0,
          ),
          numberColor,
        )}
        style={{
          fontFeatureSettings: '"tnum","lnum"',
          // Keep the number on one line; the clamp() above prevents overflow.
          whiteSpace: "nowrap",
        }}
      >
        {forceSign ? `${forceSign} ` : ""}
        {formatMoney(amount, currency)}
      </span>
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
  periodLabel = "Abril 2026",
  spent,
  income,
  currency,
  filter = "all",
  onFilterChange,
  className,
  currencySwitch,
}: MonthSummaryCardProps) {
  const net = income - spent;
  const netPositive = net >= 0;

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
      {/* Top-LEFT period label — small + muted + UPPERCASE. The PEN/USD
          switch (when provided) is centered lower in the card, between the
          separator and the Gasto/Ingreso row. */}
      <div className="flex items-start justify-start">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {periodLabel}
        </span>
      </div>

      {/* HERO: SALDO ACTUAL. Centered, oversized, neutral color (no green/red
          shouting on the headline number — the user wants Saldo to read as
          "your reality" not as "good or bad"). Sign carries the only signal:
          "−" prefix when negative, no prefix when positive. */}
      <dl className="mt-3 flex flex-col items-center text-center md:mt-4">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Saldo actual
        </dt>
        <dd
          className={cn(
            "mt-3 max-w-full font-semibold leading-[0.95] tracking-tight tabular-nums whitespace-nowrap text-foreground",
            // Hero scale: shrinks predictably as the saldo grows. We pass
            // 2 extra chars when negative so the "− " prefix counts toward
            // the tier decision (otherwise tier 0 overflows the card).
            getMoneyDisplaySizeClass(
              Math.abs(net),
              currency,
              "hero",
              netPositive ? 0 : 2,
            ),
          )}
          style={{ fontFeatureSettings: '"tnum","lnum"' }}
        >
          {netPositive ? "" : "− "}
          {formatMoney(Math.abs(net), currency)}
        </dd>
      </dl>

      {/* Thin separator — restraint, not a heavy divider. */}
      <div
        aria-hidden="true"
        className="mx-auto mt-7 h-px w-full max-w-xs bg-border md:mt-9"
      />

      {/* Optional centered currency switch — lives between the separator and
          the Gasto/Ingreso row. Renders nothing when no switch is passed. */}
      {currencySwitch ? (
        <div className="mt-5 flex justify-center md:mt-6">{currencySwitch}</div>
      ) : null}

      {/* Secondary KPIs — Gasto / Ingreso. Side by side when both fit
          comfortably in half the card width; stacked vertically as soon as
          either amount crosses ~12 chars (≈ S/. 100,000+) — empirical
          threshold where text-xl tabular-nums starts overlapping the
          opposite cell. Desktop always grids — plenty of horizontal room. */}
      {(() => {
        const longest = Math.max(
          formatMoney(spent, currency).length,
          formatMoney(income, currency).length,
        );
        const stackOnMobile = longest > 12;
        return (
          <div
            className={cn(
              stackOnMobile
                ? "flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4"
                : "grid grid-cols-2 gap-2 md:gap-4",
              currencySwitch ? "mt-5 md:mt-6" : "mt-7 md:mt-9",
            )}
          >
            <HeroKpi
              label="Gasto"
              amount={spent}
              currency={currency}
              forceSign="−"
              variant="expense"
              stacked={stackOnMobile}
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
              forceSign=""
              variant="income"
              stacked={stackOnMobile}
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
        );
      })()}
    </Card>
  );
}

export default MonthSummaryCard;
