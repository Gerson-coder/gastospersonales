"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface CategoryDonutItem {
  id: string;
  label: string;
  value: number; // porcentaje 0-100
  amount: number; // monto absoluto
  color: string; // CSS color (e.g. "var(--color-chart-1)")
}

export interface CategoryDonutProps {
  items: CategoryDonutItem[];
  currency?: "PEN" | "USD";
  periodLabel?: string;
  className?: string;
  variant?: "semicircle" | "full"; // default: "semicircle"
  totalLabel?: string; // label debajo del monto en el centro, default: "Total"
}

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

function describeArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const x1 = cx + rOuter * Math.cos(startAngle);
  const y1 = cy + rOuter * Math.sin(startAngle);
  const x2 = cx + rOuter * Math.cos(endAngle);
  const y2 = cy + rOuter * Math.sin(endAngle);
  const x3 = cx + rInner * Math.cos(endAngle);
  const y3 = cy + rInner * Math.sin(endAngle);
  const x4 = cx + rInner * Math.cos(startAngle);
  const y4 = cy + rInner * Math.sin(startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

function formatAmount(amount: number, currency: "PEN" | "USD"): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

export function CategoryDonut({
  items,
  currency = "PEN",
  periodLabel = "Este mes",
  className,
  variant = "semicircle",
  totalLabel,
}: CategoryDonutProps) {
  const hasItems = items.length > 0;
  const total = items.reduce((acc, it) => acc + Math.max(0, it.value), 0);

  // gap visual entre slices (en radianes) — ~1.5°
  const GAP = (1.5 * Math.PI) / 180;

  const isFullCircle = variant === "full";

  // Construimos slices solo si hay items con valor > 0
  const slices = React.useMemo(() => {
    if (!hasItems || total <= 0) return [] as Array<{
      id: string;
      d: string;
      color: string;
    }>;

    const rOuter = isFullCircle ? 85 : 90;
    const rInner = isFullCircle ? 52 : 60;
    const totalAngle = isFullCircle ? 2 * Math.PI : Math.PI;

    const result: Array<{ id: string; d: string; color: string }> = [];
    let cursor = isFullCircle ? -Math.PI / 2 : -Math.PI;

    for (const item of items) {
      const fraction = Math.max(0, item.value) / total;
      const span = fraction * totalAngle;
      if (span <= 0) continue;

      const start = cursor;
      const end = cursor + span;
      // Aplicar gap solo si el slice es lo suficientemente grande
      const gapApplied = span > GAP * 2 ? GAP / 2 : 0;
      const drawStart = start + gapApplied;
      const drawEnd = end - gapApplied;

      if (drawEnd > drawStart) {
        result.push({
          id: item.id,
          d: describeArc(100, 100, rOuter, rInner, drawStart, drawEnd),
          color: item.color,
        });
      }
      cursor = end;
    }
    return result;
  }, [items, total, hasItems, GAP, isFullCircle]);

  const totalAmount = items.reduce((acc, it) => acc + it.amount, 0);

  return (
    <Card
      className={cn(
        "rounded-2xl bg-card border-border p-5 md:p-6",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Distribución de gastos
        </h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {periodLabel}
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {!hasItems || total <= 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Sin gastos para mostrar
        </div>
      ) : (
        <div className="flex items-center gap-4 md:gap-5">
          {/* SVG donut — 40% */}
          <div className="w-[34%] shrink-0 md:w-[42%]">
            {isFullCircle ? (
              <svg
                viewBox="0 0 200 200"
                className="w-full h-auto"
                role="img"
                aria-label="Gráfico circular de distribución de gastos por categoría"
              >
                {slices.map((s) => (
                  <path key={s.id} d={s.d} fill={s.color} />
                ))}
                <text
                  x="100"
                  y="96"
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fontFamily="var(--font-sans)"
                  fill="currentColor"
                  style={{ fontFeatureSettings: '"tnum","lnum"' }}
                >
                  {formatAmount(totalAmount, currency)}
                </text>
                <text
                  x="100"
                  y="112"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="500"
                  fontFamily="var(--font-sans)"
                  fill="currentColor"
                  opacity={0.6}
                >
                  {totalLabel ?? "Total"}
                </text>
              </svg>
            ) : (
              <svg
                viewBox="0 0 200 110"
                className="w-full h-auto"
                role="img"
                aria-label="Gráfico semicircular de distribución de gastos por categoría"
              >
                {slices.map((s) => (
                  <path key={s.id} d={s.d} fill={s.color} />
                ))}
              </svg>
            )}
          </div>

          {/* Leyenda — 60% */}
          <ul className="flex-1 min-w-0 space-y-2.5">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-2.5"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: it.color }}
                  aria-hidden
                />
                <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
                  {it.label}
                </span>
                <span
                  className="text-[11.5px] font-medium text-muted-foreground tabular-nums shrink-0 w-7 text-right"
                  style={TNUM_STYLE}
                >
                  {Math.round(it.value)}%
                </span>
                <span
                  className="text-[12px] font-semibold text-foreground tabular-nums shrink-0 text-right"
                  style={TNUM_STYLE}
                >
                  {formatAmount(it.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
