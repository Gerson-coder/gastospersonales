/**
 * MovementsFiltersBar — barra de filtros + KPI summary para /movements.
 *
 * Componentiza:
 *   1. Una fila de 4 chips (Todo / Gastos / Ingresos / Transferencias).
 *   2. Una segunda fila de 3 pills-dropdown (Período · Categoría · Cuenta)
 *      con scroll horizontal en mobile cuando los labels crecen.
 *   3. Una card con 3 KPIs (Ingresos · Gastos · Balance) calculados sobre
 *      las filas que el padre ya filtró.
 *
 * Es PRESENTACIONAL: el padre maneja el estado y dispara los sheets
 * (PeriodPickerSheet, CategoryFilterPicker, AccountFilterPicker). Esta
 * separación deja la barra barata de re-renderizar (los sheets viven en
 * lazy chunks que se cargan al primer tap).
 */
"use client";

import * as React from "react";
import { Calendar, ChevronDown, Tag, Wallet, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/data/transactions";

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

export type MovementsFilter =
  | "todo"
  | "gastos"
  | "ingresos"
  | "transferencias";

const FILTER_CHIPS: ReadonlyArray<{ id: MovementsFilter; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "gastos", label: "Gastos" },
  { id: "ingresos", label: "Ingresos" },
  { id: "transferencias", label: "Transferencias" },
];

export type MovementsFiltersBarProps = {
  // Estado controlado.
  filter: MovementsFilter;
  onFilterChange: (next: MovementsFilter) => void;

  periodLabel: string; // "Mayo 2026" / "Hoy" / "Personalizado"
  onOpenPeriod: () => void;

  categoryLabel: string | null; // null → "Categoría"
  onOpenCategory: () => void;
  /** Limpia categoría sin abrir el sheet (X en el pill cuando hay valor). */
  onClearCategory: () => void;

  accountLabel: string | null; // null → "Cuenta"
  onOpenAccount: () => void;
  onClearAccount: () => void;

  // KPIs derivados por el padre desde las filas ya filtradas.
  totalIncome: number;
  totalExpense: number;
  /** Cantidad de movimientos en el filtro — feed para el subtitulo. */
  totalCount: number;
  currency: Currency;
};

/**
 * Formato compacto para que la celda KPI quepa en una sola linea aun
 * cuando los montos crecen. Estrategia:
 *
 *   - >= 1,000,000 -> "S/ 1.4M" (1 decimal). Si >= 100M, sin decimales.
 *   - >= 10,000    -> "S/ 10.2K" (1 decimal). Si >= 100K, sin decimales.
 *   - <  10,000    -> "S/ 9,999.99" (full, dos decimales).
 *
 * El umbral 10K para empezar a abreviar matchea el viewport mobile
 * angosto donde la celda mide ~110px y "S/ 12,345.67" empuja a
 * wrap. Por debajo de 10K caben 6 chars (incluyendo separadores),
 * suficiente para rendear completo.
 */
function formatAmountCompact(amount: number, currency: Currency): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const abs = Math.abs(amount);

  if (abs >= 1_000_000) {
    const value = abs / 1_000_000;
    return `${symbol} ${value.toFixed(value >= 100 ? 0 : 1)}M`;
  }
  if (abs >= 10_000) {
    const value = abs / 1_000;
    return `${symbol} ${value.toFixed(value >= 100 ? 0 : 1)}K`;
  }
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return `${symbol} ${formatted}`;
}

export function MovementsFiltersBar({
  filter,
  onFilterChange,
  periodLabel,
  onOpenPeriod,
  categoryLabel,
  onOpenCategory,
  onClearCategory,
  accountLabel,
  onOpenAccount,
  onClearAccount,
  totalIncome,
  totalExpense,
  totalCount,
  currency,
}: MovementsFiltersBarProps) {
  const movementsLabel = totalCount === 1 ? "movimiento" : "movimientos";

  return (
    <div className="flex flex-col gap-3">
      {/* Fila 1 — chips de tipo. flex-wrap permite que "Transferencias"
          baje a una segunda linea en viewports angostos en lugar de
          desbordar el ancho de la pagina. min-w-0 sobre el wrapper para
          que el flex-col padre no le pase ancho intrinseco-content. */}
      <div
        role="radiogroup"
        aria-label="Filtrar por tipo de movimiento"
        className="flex flex-wrap gap-2 min-w-0"
      >
        {FILTER_CHIPS.map((c) => {
          const selected = c.id === filter;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onFilterChange(c.id)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border bg-transparent text-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Fila 2 — pills-dropdown. Mismo flex-wrap para que cuando los
          labels crecen (ej: "Mayo 2026" + "Servicios" + "BCP Sueldo ·
          Sueldo") no fuercen scroll horizontal del viewport. */}
      <div className="flex flex-wrap gap-2 min-w-0">
        <DropdownPill
          icon={<Calendar size={14} aria-hidden />}
          label={periodLabel}
          active
          onClick={onOpenPeriod}
        />
        <DropdownPill
          icon={<Tag size={14} aria-hidden />}
          label={categoryLabel ?? "Categoría"}
          active={categoryLabel !== null}
          onClick={onOpenCategory}
          onClear={categoryLabel !== null ? onClearCategory : undefined}
        />
        <DropdownPill
          icon={<Wallet size={14} aria-hidden />}
          label={accountLabel ?? "Cuenta"}
          active={accountLabel !== null}
          onClick={onOpenAccount}
          onClear={accountLabel !== null ? onClearAccount : undefined}
        />
      </div>

      {/* KPI summary — 2 columnas (Ingresos | Gastos). El user pidio
          quitar Balance porque lo va a implementar como vista propia
          mas adelante (probablemente en /insights o un dashboard). */}
      <Card className="rounded-2xl border-border p-0 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border">
          <KpiCell
            label="Ingresos"
            amount={totalIncome}
            currency={currency}
            tone="positive"
          />
          <KpiCell
            label="Gastos"
            amount={totalExpense}
            currency={currency}
            tone="negative"
          />
        </div>
        <div className="border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground tabular-nums" style={TNUM_STYLE}>
          {totalCount} {movementsLabel} en este rango
        </div>
      </Card>
    </div>
  );
}

// ─── Internos ──────────────────────────────────────────────────────────

type DropdownPillProps = {
  icon: React.ReactNode;
  label: string;
  /** Tinta el pill cuando hay valor activo distinto del default. */
  active: boolean;
  onClick: () => void;
  /** Cuando se pasa, aparece una X al final que limpia el filtro sin
   *  abrir el sheet. */
  onClear?: () => void;
};

function DropdownPill({ icon, label, active, onClick, onClear }: DropdownPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pl-3 pr-1 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-foreground/30 bg-muted text-foreground"
          : "border-border bg-transparent text-foreground hover:bg-muted",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-full"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown size={12} aria-hidden className="text-muted-foreground" />
      </button>
      {onClear ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Quitar filtro ${label}`}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

type KpiCellProps = {
  label: string;
  amount: number;
  currency: Currency;
  tone: "positive" | "negative" | "default";
};

function KpiCell({ label, amount, currency, tone }: KpiCellProps) {
  const isZero = amount === 0;
  return (
    <div className="min-w-0 px-3 py-3.5 text-left">
      <div className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          // truncate + whitespace-nowrap garantizan 1 sola linea aun
          // cuando los montos llegan al limite del formato compacto
          // ("S/ 999.9K", "S/ 1.4M") en celdas estrechas.
          "mt-1 truncate whitespace-nowrap text-[15px] font-bold leading-tight tabular-nums",
          isZero
            ? "text-muted-foreground"
            : tone === "positive"
              ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
              : tone === "negative"
                ? "text-destructive"
                : "text-foreground",
        )}
        style={TNUM_STYLE}
      >
        {formatAmountCompact(amount, currency)}
      </div>
    </div>
  );
}

export default MovementsFiltersBar;
