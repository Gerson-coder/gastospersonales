/**
 * MonthSummaryCard — Lumi shared component
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

  const baseClass = cn(
    "flex min-h-[72px] w-full min-w-0 flex-col items-start gap-2 rounded-xl px-4 py-3.5 text-left",
    interactive && [
      "transition-colors duration-150 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      pressed
        ? "bg-foreground/[0.06] ring-1 ring-inset ring-foreground/15"
        : "hover:bg-muted/60",
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
          // Fluid size: shrinks on small screens so long amounts (S/ 100,000.00)
          // stay on one line, scales up gracefully on wider viewports.
          "text-[clamp(0.95rem,4.6vw,1.25rem)] md:text-[26px]",
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
          className="mt-3 font-semibold leading-[0.95] tracking-tight tabular-nums whitespace-nowrap text-foreground text-[44px] md:text-[60px]"
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

      {/* Secondary KPIs — Gasto / Ingreso side by side. Subtle rose / emerald
          on the numbers themselves; labels stay muted. No deltas, no "+"
          prefix — the Lucide arrow indicators went away with the redesign. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-2 md:gap-4",
          currencySwitch ? "mt-5 md:mt-6" : "mt-7 md:mt-9",
        )}
      >
        <HeroKpi
          label="Gasto"
          amount={spent}
          currency={currency}
          forceSign="−"
          variant="expense"
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
