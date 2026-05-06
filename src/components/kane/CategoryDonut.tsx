"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  /**
   * Cuando se setea, cada fila de la leyenda y cada slice del donut se
   * convierten en botones que disparan este callback al tap. El padre
   * decide qué hacer (típicamente abrir un drill-down). Si la fila tiene
   * id sentinel "__uncat__" la pasamos igual — el padre filtra si quiere.
   */
  onItemClick?: (item: CategoryDonutItem) => void;
  /**
   * @deprecated Kept for backwards-compat with callers that still
   * pass it; the chart no longer renders a centre label.
   */
  totalLabel?: string;
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
  onItemClick,
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

    // Thinner ring + tighter gap reads more like a "tag-cloud" of
    // categories than a heavy pie. The full circle uses an outer of
    // 88 / inner of 64 (gap 24) — semicircle keeps the original
    // proportion since it has less canvas to play with.
    const rOuter = isFullCircle ? 88 : 90;
    const rInner = isFullCircle ? 64 : 60;
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
                {/* Drop a subtle inner stroke so adjacent slices keep their
                    visual separation even with the brand-tinted palette
                    (some hues are too close to read otherwise). */}
                {slices.map((s) => {
                  const item = items.find((it) => it.id === s.id);
                  const clickable = Boolean(onItemClick && item);
                  return (
                    <path
                      key={s.id}
                      d={s.d}
                      fill={s.color}
                      stroke="var(--card)"
                      strokeWidth="1"
                      strokeLinejoin="round"
                      className={
                        clickable
                          ? "cursor-pointer transition-opacity hover:opacity-80 focus:outline-none"
                          : undefined
                      }
                      onClick={
                        clickable && item
                          ? () => onItemClick?.(item)
                          : undefined
                      }
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={
                        clickable && item
                          ? `Ver detalle de ${item.label}`
                          : undefined
                      }
                      onKeyDown={
                        clickable && item
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onItemClick?.(item);
                              }
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </svg>
            ) : (
              <svg
                viewBox="0 0 200 110"
                className="w-full h-auto"
                role="img"
                aria-label="Gráfico semicircular de distribución de gastos por categoría"
              >
                {slices.map((s) => {
                  const item = items.find((it) => it.id === s.id);
                  const clickable = Boolean(onItemClick && item);
                  return (
                    <path
                      key={s.id}
                      d={s.d}
                      fill={s.color}
                      className={
                        clickable
                          ? "cursor-pointer transition-opacity hover:opacity-80 focus:outline-none"
                          : undefined
                      }
                      onClick={
                        clickable && item
                          ? () => onItemClick?.(item)
                          : undefined
                      }
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={
                        clickable && item
                          ? `Ver detalle de ${item.label}`
                          : undefined
                      }
                      onKeyDown={
                        clickable && item
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onItemClick?.(item);
                              }
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </svg>
            )}
          </div>

          {/* Leyenda — 60%. Sólo etiqueta + monto: el porcentaje quedaba
              redundante con el peso visual del slice y empujaba el monto
              contra el borde derecho en cards angostas.

              Cuando hay onItemClick, cada fila es un <button> con chevron
              al final para señalar el affordance de drill-down. Sin
              onItemClick mantenemos el layout original (li + flex) para
              no introducir regresiones visuales en callers heredados. */}
          <ul
            className={cn(
              "flex-1 min-w-0",
              onItemClick ? "space-y-1" : "space-y-3",
            )}
          >
            {items.map((it) => {
              const clickable = Boolean(onItemClick);
              const content = (
                <>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-card"
                    style={{ backgroundColor: it.color }}
                    aria-hidden
                  />
                  <span className="text-[13.5px] font-medium text-foreground truncate flex-1 min-w-0 text-left">
                    {it.label}
                  </span>
                  <span
                    className="text-[12.5px] font-semibold text-foreground tabular-nums shrink-0 text-right"
                    style={TNUM_STYLE}
                  >
                    {formatAmount(it.amount, currency)}
                  </span>
                  {clickable ? (
                    <ChevronRight
                      className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                      aria-hidden
                    />
                  ) : null}
                </>
              );
              return (
                <li key={it.id}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => onItemClick?.(it)}
                      aria-label={`Ver detalle de ${it.label}`}
                      className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 -mx-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
