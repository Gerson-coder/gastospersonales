"use client";

import * as React from "react";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type Period = "today" | "week" | "month";

export interface DashboardHeroProps {
  period: Period;
  onPeriodChange: (p: Period) => void;
  /** Monto gastado en el período seleccionado */
  spent: number;
  /** Monto restante; null cuando no hay presupuesto definido */
  remaining: number | null;
  /** Presupuesto del período; null cuando no hay ingresos para derivarlo */
  budget: number | null;
  currency: "PEN" | "USD";
  /** @deprecated Ya no se usa — el CTA fue removido del hero. */
  onAddExpense?: () => void;
  className?: string;
}

const PERIOD_TITLE: Record<Period, string> = {
  today: "de hoy",
  week: "de la semana",
  month: "del mes",
};

const SPENT_LABEL: Record<Period, string> = {
  today: "Gastaste hoy",
  week: "Gastaste esta semana",
  month: "Gastaste este mes",
};

const BUDGET_LABEL: Record<Period, string> = {
  today: "Presupuesto diario",
  week: "Presupuesto semanal",
  month: "Presupuesto mensual",
};

const TABULAR_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

// Char-length-based tiers — value-based tiers ignore the currency symbol,
// thousands separators and decimals which is what actually drives overflow.
// `twoColumn` is set when the hero is split into Spent | Remaining (budget
// path). Each column gets ~130-150px on a 360px viewport so we shrink
// aggressively. Single-column path gets the full card content width.
function getHeroAmountClass(formattedLength: number, twoColumn: boolean): string {
  if (twoColumn) {
    if (formattedLength <= 8)  return "text-2xl leading-tight";
    if (formattedLength <= 11) return "text-xl leading-tight";
    if (formattedLength <= 14) return "text-lg leading-tight";
    return "text-base leading-tight";
  }
  if (formattedLength <= 11) return "text-3xl leading-tight";
  if (formattedLength <= 14) return "text-2xl leading-tight";
  if (formattedLength <= 17) return "text-xl leading-tight";
  return "text-lg leading-tight";
}

export function DashboardHero({
  period,
  spent,
  remaining,
  budget,
  currency,
  className,
}: DashboardHeroProps) {
  const [hidden, setHidden] = React.useState(false);

  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency],
  );

  const hasBudget = budget !== null && budget > 0;
  const rawPct = hasBudget ? (spent / (budget as number)) * 100 : 0;
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  const overBudget = hasBudget && spent > (budget as number);
  const pctLabel = `${Math.round(rawPct)}% utilizado`;
  // Pre-format both sides so we can size against the actual rendered string
  // length (tier helper is char-based, not value-based).
  const twoColumn = hasBudget && remaining !== null;
  const spentText = hidden ? "••••••" : formatter.format(spent);
  const remainingText = hidden
    ? "••••••"
    : formatter.format(Math.max(0, remaining ?? 0));
  const spentClass = getHeroAmountClass(spentText.length, twoColumn);
  const remainingClass = getHeroAmountClass(remainingText.length, twoColumn);

  // Animar progress bar al montar (de 0 → valor real)
  const [animatedPct, setAnimatedPct] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setAnimatedPct(clampedPct));
    return () => cancelAnimationFrame(id);
  }, [clampedPct]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {/* Wallet decorativo */}
      <Wallet
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-2 opacity-15"
        size={120}
        strokeWidth={1.5}
      />

      {/* Top row: título de período + toggle visibilidad */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-primary-foreground/90">
            Resumen {PERIOD_TITLE[period]}
          </span>
          <Eye size={14} className="text-primary-foreground/60" aria-hidden />
        </div>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
          className="text-primary-foreground/60 hover:text-primary-foreground transition-colors focus-visible:outline-none"
        >
          {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Two columns */}
      <div className="relative mt-5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-primary-foreground/80">
            {SPENT_LABEL[period]}
          </p>
          <p
            className={cn(
              "mt-1 max-w-full truncate font-semibold tabular-nums",
              spentClass,
            )}
            style={TABULAR_STYLE}
          >
            {spentText}
          </p>
        </div>

        {twoColumn ? (
          <>
            <div
              aria-hidden="true"
              className="h-12 w-px self-center bg-white/20"
            />
            <div className="min-w-0 flex-1 text-right">
              <p className="text-xs font-medium text-primary-foreground/80">
                Te quedan
              </p>
              <p
                className={cn(
                  "mt-1 max-w-full truncate font-semibold tabular-nums",
                  remainingClass,
                  overBudget && "text-white/90",
                )}
                style={TABULAR_STYLE}
              >
                {remainingText}
              </p>
            </div>
          </>
        ) : null}
      </div>

      {/* Progress bar + bottom row (solo si hay presupuesto) */}
      {hasBudget ? (
        <>
          <div
            role="progressbar"
            aria-label="Avance del presupuesto"
            aria-valuenow={Math.round(clampedPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative mt-5 h-2 w-full overflow-hidden rounded-full bg-white/20"
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
              style={{ width: `${animatedPct}%` }}
            />
          </div>

          <div className="relative mt-2 flex items-center justify-between gap-2 text-xs text-primary-foreground/80">
            <span style={TABULAR_STYLE} className="min-w-0 truncate tabular-nums">
              {BUDGET_LABEL[period]}: {formatter.format(budget as number)}
            </span>
            <span
              style={TABULAR_STYLE}
              className="shrink-0 tabular-nums"
            >
              {pctLabel}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default DashboardHero;
