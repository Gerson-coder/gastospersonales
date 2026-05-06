/**
 * CategoryDrillDownSheet — drill-down de una categoría del CategoryDonut.
 *
 * Aparece cuando el usuario tap en una fila de la leyenda (o en un slice
 * del donut). Muestra los comercios que contribuyeron al gasto de esa
 * categoría en el período actual, con monto y última fecha. El footer
 * compara contra el mes anterior y enlaza a /movements para el detalle
 * por transacción.
 *
 * Es un componente PRESENTACIONAL: no toca Supabase, no agrega. El
 * dashboard prepara los buckets (memoizando sobre filteredRows) y se los
 * pasa por props. Esto mantiene el sheet barato de montar/desmontar y
 * deja la lógica de agregación cerca de la fuente de datos.
 *
 * Layout: vaul Drawer (mobile bottom-sheet, desktop centered) — mismo
 * vehículo visual que MerchantsDrawer y CategoryDrawer para coherencia.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MerchantAvatar } from "@/components/kane/MerchantAvatar";
import { formatTxDate } from "@/lib/format-tx-date";
import type { Currency } from "@/lib/data/transactions";
import { cn } from "@/lib/utils";

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

/** Una fila del drill-down — un comercio con sus métricas en el período. */
export type CategoryDrillDownRow = {
  /** null cuando el bucket es "(sin comercio)" — transacciones sin merchant_id. */
  merchantId: string | null;
  merchantName: string;
  /** Slug del logo SVG si el merchant tiene uno preparado. null → fallback a iniciales. */
  logoSlug: string | null;
  /** Cantidad de transacciones del comercio en el período. */
  count: number;
  /** Monto total en unidades mayores (S/ 89.50). */
  amount: number;
  /** ISO de la última transacción — usada para el subtítulo "Hoy / Ayer / 12 May". */
  lastOccurredAt: string;
};

export type CategoryDrillDownSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nombre de la categoría — header del drawer. */
  categoryName: string;
  /** Color de la categoría (var(--chart-N) o hex). Tinte del dot del header. */
  categoryColor: string;
  /** Período mostrado — "Este mes" / "Mayo 2026" — solo cosmético. */
  periodLabel: string;
  /** Total gastado por la categoría en el período. */
  totalAmount: number;
  /** Número total de pagos del período. Calculado por el padre porque
   *  ya tiene la lista filtrada — evita re-sumar en el sheet. */
  totalCount: number;
  /** Monto del mes anterior para la comparativa del footer. null cuando
   *  no se puede comparar (primer mes con datos). */
  prevTotalAmount: number | null;
  /** Filas pre-agregadas, ordenadas DESC por monto desde el padre. */
  rows: CategoryDrillDownRow[];
  /** Moneda activa — usada para el símbolo (S/ vs $). */
  currency: Currency;
};

function formatAmount(amount: number, currency: Currency): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

/**
 * Subtítulo de la fila: "3 pagos · Hoy 14:20" / "1 pago · 12 May 09:15".
 * Singular vs plural en español para que se sienta natural en es-PE.
 */
function formatRowSubtitle(count: number, lastOccurredAt: string): string {
  const noun = count === 1 ? "pago" : "pagos";
  return `${count} ${noun} · ${formatTxDate(lastOccurredAt)}`;
}

export function CategoryDrillDownSheet({
  open,
  onOpenChange,
  categoryName,
  categoryColor,
  periodLabel,
  totalAmount,
  totalCount,
  prevTotalAmount,
  rows,
  currency,
}: CategoryDrillDownSheetProps) {
  // Delta vs mes anterior: signo (>0 = subió), magnitud absoluta. null
  // significa "no hay base comparable" (mes anterior sin gasto en esta
  // categoría). En ese caso ocultamos la comparativa para no inventar.
  const delta = React.useMemo(() => {
    if (prevTotalAmount == null || prevTotalAmount <= 0) return null;
    const diff = totalAmount - prevTotalAmount;
    const fraction = diff / prevTotalAmount;
    return { diff, fraction };
  }, [totalAmount, prevTotalAmount]);

  const paymentsLabel = totalCount === 1 ? "pago" : "pagos";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="category-drilldown-desc"
        className="bg-background md:!max-w-2xl"
      >
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-8 w-8 rounded-full ring-2 ring-card flex-shrink-0"
              style={{ backgroundColor: categoryColor }}
            />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="font-sans not-italic text-base font-semibold truncate">
                {categoryName}
              </DrawerTitle>
              <DrawerDescription
                id="category-drilldown-desc"
                className="text-[12px]"
              >
                <span className="tabular-nums" style={TNUM_STYLE}>
                  {formatAmount(totalAmount, currency)}
                </span>
                <span> · {periodLabel.toLowerCase()} · </span>
                <span className="tabular-nums" style={TNUM_STYLE}>
                  {totalCount} {paymentsLabel}
                </span>
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="max-h-[55vh] overflow-y-auto px-2">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              Sin pagos en esta categoría para el período seleccionado.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 pb-2">
              {rows.map((row) => (
                <li key={row.merchantId ?? "__no_merchant__"}>
                  <div
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5",
                    )}
                  >
                    <MerchantAvatar
                      name={row.merchantName}
                      logoSlug={row.logoSlug}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-foreground">
                        {row.merchantName}
                      </div>
                      <div
                        className="truncate text-[11.5px] text-muted-foreground tabular-nums"
                        style={TNUM_STYLE}
                      >
                        {formatRowSubtitle(row.count, row.lastOccurredAt)}
                      </div>
                    </div>
                    <span
                      className="text-[13.5px] font-semibold text-foreground tabular-nums shrink-0"
                      style={TNUM_STYLE}
                    >
                      {formatAmount(row.amount, currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-background px-4 py-3 space-y-2">
          {delta ? (
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Comparado con el mes anterior</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold tabular-nums",
                  delta.diff > 0
                    ? "text-amber-500 dark:text-amber-400"
                    : delta.diff < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                )}
                style={TNUM_STYLE}
              >
                {delta.diff > 0 ? (
                  <ArrowUpRight size={14} aria-hidden />
                ) : delta.diff < 0 ? (
                  <ArrowDownRight size={14} aria-hidden />
                ) : (
                  <Minus size={14} aria-hidden />
                )}
                {delta.diff > 0 ? "+" : delta.diff < 0 ? "−" : ""}
                {formatAmount(delta.diff, currency)}
                <span className="text-muted-foreground font-normal">
                  ({delta.fraction > 0 ? "+" : ""}
                  {(delta.fraction * 100).toFixed(0)}%)
                </span>
              </span>
            </div>
          ) : null}
          <Link
            href="/movements?filter=gastos"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-card text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todos los movimientos
          </Link>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default CategoryDrillDownSheet;
