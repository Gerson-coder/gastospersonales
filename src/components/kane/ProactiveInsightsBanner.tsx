/**
 * ProactiveInsightsBanner — banner sutil arriba del donut de "Distribución
 * de gastos" que muestra UN insight relevante basado en los datos del usuario.
 *
 * Regla clave: render null cuando no haya un signal fuerte. Mejor estar
 * invisible que ser ruido.
 *
 * Calcula 3 candidatos en orden de prioridad y muestra el primero que
 * pase su threshold:
 *   1. Categoría con mayor delta vs mes anterior — sube >30% Y representa
 *      al menos 10% del gasto del mes.
 *   2. Presupuesto cerca del límite — alguna categoría con presupuesto al
 *      85%+ del límite (lee budgets via listBudgets()).
 *   3. Promedio diario alto — ritmo del mes >25% sobre el del mes anterior
 *      (prorrateado al día actual).
 *
 * No fetchea transacciones — recibe los aggregates ya calculados desde el
 * padre (mismo patrón que DashboardBudgetsSection).
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  type CategoryBucket,
  type MonthBucket,
} from "@/hooks/use-transactions-window";
import { listBudgets, type Budget } from "@/lib/data/budgets";
import { cn } from "@/lib/utils";

const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

type Currency = "PEN" | "USD";

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

// Thresholds — cualquier signal por debajo se considera "ruido" y el banner
// se oculta. Tuneables sin tocar lógica.
const CATEGORY_DELTA_MIN = 0.3; // +30% vs mes anterior
const CATEGORY_SHARE_MIN = 0.1; // representa >=10% del gasto del mes
const BUDGET_RATIO_MIN = 0.85; // 85% del límite
const PACE_RATIO_MIN = 1.25; // 25% sobre ritmo previo

type InsightTone = "warning" | "info";

type InsightChoice = {
  tone: InsightTone;
  text: React.ReactNode;
  ctaHref: string;
  ctaLabel: string;
};

function formatAmount(amount: number, currency: Currency): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

/** Capitaliza la primera letra (los labels del hook vienen en minúscula). */
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type ProactiveInsightsBannerProps = {
  currency: Currency;
  monthTotals: MonthBucket[];
  byCategoryCurrentMonth: CategoryBucket[];
  expenseCurrentMonth: number;
  className?: string;
};

export function ProactiveInsightsBanner({
  currency,
  monthTotals,
  byCategoryCurrentMonth,
  expenseCurrentMonth,
  className,
}: ProactiveInsightsBannerProps) {
  const [budgets, setBudgets] = React.useState<Budget[]>([]);

  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listBudgets();
        if (!cancelled) setBudgets(list);
      } catch {
        // Soft-fail — sin presupuestos los otros candidatos siguen evaluándose.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const insight = React.useMemo<InsightChoice | null>(() => {
    // ── Candidate 1: categoría con mayor delta positivo. ──────────────────
    // El bucket trae `delta` como fracción signada (-0.18 = bajó 18%). Solo
    // miramos categorías con prior-amount real (delta >0 y <1 implica que
    // hubo gasto el mes pasado — un debut "from-zero" se marca como 1 que
    // queremos descartar para evitar el ruido del primer mes).
    if (expenseCurrentMonth > 0) {
      const ranked = byCategoryCurrentMonth
        .filter((b) => b.delta >= CATEGORY_DELTA_MIN && b.delta < 1)
        .filter((b) => b.amount / expenseCurrentMonth >= CATEGORY_SHARE_MIN)
        .sort((a, b) => b.delta - a.delta);
      const top = ranked[0];
      if (top) {
        const pct = Math.round(top.delta * 100);
        const prevLabel = monthTotalsPrevLabel(monthTotals);
        return {
          tone: "warning",
          text: (
            <>
              Este mes gastaste <strong>{pct}% más</strong> en{" "}
              <strong>{top.categoryName}</strong>
              {prevLabel ? ` vs ${prevLabel}` : ""}.
            </>
          ),
          ctaHref: "/insights",
          ctaLabel: "Ver detalle",
        };
      }
    }

    // ── Candidate 2: presupuesto cerca del límite. ───────────────────────
    // Mapeamos category_id -> spent del mes; buscamos el budget con mayor
    // ratio que pase el threshold.
    if (budgets.length > 0) {
      const spentByCategoryId = new Map<string, { name: string; spent: number }>();
      for (const b of byCategoryCurrentMonth) {
        if (!b.categoryId) continue;
        spentByCategoryId.set(b.categoryId, {
          name: b.categoryName,
          spent: b.amount,
        });
      }

      type RankedBudget = {
        ratio: number;
        spent: number;
        limit: number;
        name: string;
      };
      const matches: RankedBudget[] = [];
      for (const budget of budgets) {
        if (budget.currency !== currency) continue;
        const meta = spentByCategoryId.get(budget.category_id);
        if (!meta) continue;
        const limit = budget.limit_minor / 100;
        if (limit <= 0) continue;
        const ratio = meta.spent / limit;
        if (ratio >= BUDGET_RATIO_MIN) {
          matches.push({ ratio, spent: meta.spent, limit, name: meta.name });
        }
      }

      matches.sort((a, b) => b.ratio - a.ratio);
      const top = matches[0];
      if (top) {
        return {
          tone: "warning",
          text: (
            <>
              Estás cerca del límite de <strong>{top.name}</strong> (
              <span style={TNUM_STYLE}>
                {formatAmount(top.spent, currency)} /{" "}
                {formatAmount(top.limit, currency)}
              </span>
              ).
            </>
          ),
          ctaHref: "/budgets",
          ctaLabel: "Ver presupuesto",
        };
      }
    }

    // ── Candidate 3: promedio diario alto (proyección del mes). ──────────
    // Comparamos el ritmo prorrateado del mes en curso contra el promedio
    // diario del mes pasado completo. Si >25% por encima, mostramos la
    // proyección de cierre.
    const paceInsight = computePaceInsight(
      monthTotals,
      expenseCurrentMonth,
      currency,
    );
    if (paceInsight) return paceInsight;

    return null;
  }, [
    byCategoryCurrentMonth,
    budgets,
    currency,
    expenseCurrentMonth,
    monthTotals,
  ]);

  if (!insight) return null;

  const Icon = insight.tone === "warning" ? AlertTriangle : TrendingUp;
  const tintClasses =
    insight.tone === "warning"
      ? "bg-[oklch(0.94_0.04_70)] text-[oklch(0.50_0.16_70)] dark:bg-[oklch(0.30_0.05_70)] dark:text-[oklch(0.85_0.14_70)]"
      : "bg-[oklch(0.94_0.04_220)] text-[oklch(0.45_0.14_220)] dark:bg-[oklch(0.30_0.05_220)] dark:text-[oklch(0.85_0.12_220)]";

  return (
    <Card
      className={cn(
        "rounded-2xl border-border p-0 overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
            tintClasses,
          )}
        >
          <Icon size={16} />
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
          {insight.text}
        </p>
        <Link
          href={insight.ctaHref}
          className="flex items-center gap-0.5 text-[12px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 whitespace-nowrap"
        >
          {insight.ctaLabel}
          <ChevronRight size={14} aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function monthTotalsPrevLabel(monthTotals: MonthBucket[]): string | null {
  if (monthTotals.length < 2) return null;
  const prev = monthTotals[monthTotals.length - 2];
  return prev?.label ?? null;
}

/**
 * Ritmo prorrateado: gasto-del-mes / día-del-mes vs gasto-prev-mes-completo
 * / días-prev-mes. Si la razón supera PACE_RATIO_MIN, devolvemos un insight
 * con la proyección de cierre y el delta vs el total del mes anterior.
 *
 * Devuelve null cuando:
 *   - el mes en curso aún no tiene gasto.
 *   - no hay mes previo con datos para comparar (primer mes del usuario).
 *   - el ritmo no supera el threshold.
 */
function computePaceInsight(
  monthTotals: MonthBucket[],
  expenseCurrentMonth: number,
  currency: Currency,
): InsightChoice | null {
  if (expenseCurrentMonth <= 0) return null;
  if (monthTotals.length < 2) return null;
  const prev = monthTotals[monthTotals.length - 2];
  if (!prev || prev.spent <= 0) return null;

  const now = new Date();
  const dayOfMonth = now.getDate();
  if (dayOfMonth <= 0) return null;
  const daysInCurrentMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daysInPrevMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
  ).getDate();

  const currentDailyAvg = expenseCurrentMonth / dayOfMonth;
  const prevDailyAvg = prev.spent / daysInPrevMonth;
  if (prevDailyAvg <= 0) return null;

  const ratio = currentDailyAvg / prevDailyAvg;
  if (ratio < PACE_RATIO_MIN) return null;

  const projected = currentDailyAvg * daysInCurrentMonth;
  const delta = projected - prev.spent;
  if (delta <= 0) return null;

  return {
    tone: "info",
    text: (
      <>
        A este ritmo cerrarías el mes en{" "}
        <strong style={TNUM_STYLE}>{formatAmount(projected, currency)}</strong>,{" "}
        <span style={TNUM_STYLE}>{formatAmount(delta, currency)}</span> sobre{" "}
        {capitalize(prev.label)}.
      </>
    ),
    ctaHref: "/insights",
    ctaLabel: "Ver detalle",
  };
}

export default ProactiveInsightsBanner;
