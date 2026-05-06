/**
 * UpcomingCommitmentsCard — banner del dashboard con los compromisos
 * que vencen pronto.
 *
 * Comportamiento:
 *   - Fetchea listCommitments() al montar y refetchea cuando cualquier
 *     write dispara COMMITMENT_UPSERTED_EVENT (mismo bus que usa la
 *     pagina /commitments).
 *   - Filtra a los pending dentro de la ventana "vencido OR proximos
 *     7 dias". Ordena por due_date asc — los vencidos quedan arriba
 *     porque sus fechas son las mas chicas.
 *   - Muestra top 3. "Ver todos" linkea a /commitments.
 *   - Render null cuando no hay nada que mostrar (no nos cargamos
 *     espacio en el dashboard si el user no tiene compromisos).
 *
 * Aislada del dashboard a proposito: tiene su propio fetch + listener
 * para no obligar al dashboard a saber del modelo de commitments.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  HandCoins,
  HandHeart,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  COMMITMENT_UPSERTED_EVENT,
  deriveStatus,
  listCommitments,
  type CommitmentKind,
  type CommitmentView,
} from "@/lib/data/commitments";
import { cn } from "@/lib/utils";

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

const KIND_ICON: Record<
  CommitmentKind,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  payment: ArrowUpFromLine,
  income: ArrowDownToLine,
  lent: HandHeart,
  borrowed: HandCoins,
};

const KIND_TINT: Record<CommitmentKind, { bg: string; text: string }> = {
  payment: {
    bg: "bg-[oklch(0.94_0.04_30)] dark:bg-[oklch(0.30_0.05_30)]",
    text: "text-[oklch(0.50_0.16_30)] dark:text-[oklch(0.85_0.14_30)]",
  },
  income: {
    bg: "bg-[oklch(0.94_0.04_162)] dark:bg-[oklch(0.30_0.05_162)]",
    text: "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
  },
  lent: {
    bg: "bg-[oklch(0.94_0.04_270)] dark:bg-[oklch(0.30_0.05_270)]",
    text: "text-[oklch(0.45_0.14_270)] dark:text-[oklch(0.85_0.12_270)]",
  },
  borrowed: {
    bg: "bg-[oklch(0.94_0.04_70)] dark:bg-[oklch(0.30_0.05_70)]",
    text: "text-[oklch(0.50_0.14_70)] dark:text-[oklch(0.85_0.12_70)]",
  },
};

function formatAmount(amount: number, currency: "PEN" | "USD"): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

/** "Hoy" / "Mañana" / "En 3 días" / "Hace 2 días" — copia identica a
 *  la de /commitments para que la lectura sea consistente cuando el
 *  user salta del dashboard a la lista completa. */
function formatRelativeDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const diffMs = due.getTime() - todayMid.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days < 0) return `Hace ${Math.abs(days)} días`;
  if (days < 7) return `En ${days} días`;
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" })
    .format(due)
    .replace(/\./g, "");
}

const VISIBLE_LIMIT = 3;
/** Días hacia adelante que cuentan como "próximo". Vencidos siempre se
 *  muestran sin importar cuán lejanos sean. */
const UPCOMING_WINDOW_DAYS = 7;

export type UpcomingCommitmentsCardProps = {
  className?: string;
};

export function UpcomingCommitmentsCard({
  className,
}: UpcomingCommitmentsCardProps) {
  const [items, setItems] = React.useState<CommitmentView[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  // Initial fetch + refetch on cross-component event.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listCommitments();
        if (!cancelled) setItems(rows);
      } catch {
        // Soft-fail — la card simplemente no se muestra. No queremos
        // un toast en el dashboard por algo que ya tiene su propia
        // pagina con error state.
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();

    const handler = () => void load();
    globalThis.addEventListener(COMMITMENT_UPSERTED_EVENT, handler);
    return () => {
      cancelled = true;
      globalThis.removeEventListener(COMMITMENT_UPSERTED_EVENT, handler);
    };
  }, []);

  const visible = React.useMemo(() => {
    const today = new Date();
    const todayMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const cutoff = new Date(todayMid);
    cutoff.setDate(cutoff.getDate() + UPCOMING_WINDOW_DAYS);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const filtered = items.filter((c) => {
      const status = deriveStatus(c);
      if (status === "completed" || status === "cancelled") return false;
      if (status === "overdue") return true; // siempre incluir vencidos
      // upcoming + due-soon: solo dentro de la ventana
      return c.dueDate <= cutoffKey;
    });
    // listCommitments ya viene ordenado por due_date asc, asi que no
    // necesitamos resort.
    return filtered.slice(0, VISIBLE_LIMIT);
  }, [items]);

  // Total pendientes (no solo los visibles) — la card muestra el conteo
  // global para que el user sepa si hay mas atras de los 3.
  const totalPending = React.useMemo(() => {
    return items.filter((c) => {
      const status = deriveStatus(c);
      return status === "overdue" || status === "due-soon" || status === "upcoming";
    }).length;
  }, [items]);

  // No render mientras carga (evita flash de empty state) ni cuando no
  // hay items a mostrar.
  if (!loaded || visible.length === 0) return null;

  const hiddenCount = totalPending - visible.length;

  return (
    <Card
      className={cn(
        "rounded-2xl border-border p-0 overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <h3 className="text-[14px] font-bold text-foreground">
            Próximos compromisos
          </h3>
          <p className="text-[11.5px] text-muted-foreground">
            {totalPending === 1
              ? "1 pendiente"
              : `${totalPending} pendientes`}
            {hiddenCount > 0 ? ` · mostrando ${visible.length}` : null}
          </p>
        </div>
        <Link
          href="/commitments"
          className="text-[12.5px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
        >
          Ver todos
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((c) => {
          const Icon = KIND_ICON[c.kind];
          const tint = KIND_TINT[c.kind];
          const status = deriveStatus(c);
          return (
            <li key={c.id}>
              <Link
                href="/commitments"
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                    tint.bg,
                    tint.text,
                  )}
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-foreground">
                    {c.title}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 truncate text-[11.5px]",
                      status === "overdue"
                        ? "text-destructive font-semibold"
                        : status === "due-soon"
                          ? "text-amber-600 dark:text-amber-400 font-semibold"
                          : "text-muted-foreground",
                    )}
                  >
                    {formatRelativeDue(c.dueDate)}
                  </div>
                </div>
                <span
                  className="text-[13px] font-bold tabular-nums text-foreground whitespace-nowrap"
                  style={TNUM_STYLE}
                >
                  {formatAmount(c.amount, c.currency)}
                </span>
                <ChevronRight
                  size={14}
                  aria-hidden
                  className="text-muted-foreground"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default UpcomingCommitmentsCard;
