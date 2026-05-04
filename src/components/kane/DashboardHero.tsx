"use client";

import * as React from "react";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHideBalances } from "@/hooks/use-hide-balances";

export type Period = "today" | "week" | "month";

export interface DashboardHeroProps {
  period: Period;
  onPeriodChange: (p: Period) => void;
  /** Monto gastado en el período seleccionado */
  spent: number;
  /** Saldo actual del período = ingreso − gasto. Puede ser negativo. */
  saldo: number;
  currency: "PEN" | "USD";
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

const TABULAR_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

// Char-length-based tiers — value-based tiers ignore the currency symbol,
// thousands separators and decimals which is what actually drives overflow.
// Each column gets ~130-150px on a 360px viewport so we shrink aggressively.
function getHeroAmountClass(formattedLength: number): string {
  if (formattedLength <= 8) return "text-2xl leading-tight";
  if (formattedLength <= 11) return "text-xl leading-tight";
  if (formattedLength <= 14) return "text-lg leading-tight";
  return "text-base leading-tight";
}

export function DashboardHero({
  period,
  spent,
  saldo,
  currency,
  className,
}: DashboardHeroProps) {
  // hideBalances persistido en kane-prefs — comparte el mismo flag que
  // el AccountCardCarousel mobile, así si el user oculta saldos en uno
  // u otro la preferencia respeta el switch entre breakpoints (desktop
  // ↔ mobile).
  const { hideBalances: hidden, toggleHideBalances } = useHideBalances();

  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency],
  );

  const negativeSaldo = saldo < 0;
  const spentText = hidden ? "••••••" : formatter.format(spent);
  // Display saldo with the symbol always positive in number; the prefix
  // carries the sign so a "−" never breaks the size tier estimate.
  const saldoDisplay = hidden
    ? "••••••"
    : formatter.format(Math.abs(saldo));
  // We render the sign as a literal prefix outside the tabular block so
  // tabular-nums alignment stays consistent across positive / negative.
  const saldoPrefix = !hidden && negativeSaldo ? "− " : "";
  const saldoLengthForTier = saldoDisplay.length + (saldoPrefix ? 2 : 0);
  const spentClass = getHeroAmountClass(spentText.length);
  const saldoClass = getHeroAmountClass(saldoLengthForTier);

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
          onClick={toggleHideBalances}
          aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
          className="text-primary-foreground/60 hover:text-primary-foreground transition-colors focus-visible:outline-none"
        >
          {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Two columns: gasto | saldo actual */}
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

        <div
          aria-hidden="true"
          className="h-12 w-px self-center bg-white/20"
        />

        <div className="min-w-0 flex-1 text-right">
          <p className="text-xs font-medium text-primary-foreground/80">
            Saldo actual
          </p>
          <p
            className={cn(
              "mt-1 max-w-full truncate font-semibold tabular-nums",
              saldoClass,
              negativeSaldo && "text-white/90",
            )}
            style={TABULAR_STYLE}
          >
            {saldoPrefix}
            {saldoDisplay}
          </p>
        </div>
      </div>
    </div>
  );
}

export default DashboardHero;
