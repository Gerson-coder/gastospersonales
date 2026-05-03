/**
 * Asesor IA — `/advisor`
 *
 * Calm, useful insights about the user's spending derived from their real
 * Supabase transactions via simple in-browser rules. NO LLM call: we keep
 * OCR token spend low while the chat-with-advisor experience is still on
 * the roadmap. The hero teases that capability is coming soon.
 *
 * The page is purely read-only: it pulls the latest 50 transactions for the
 * active currency (this month + last month), runs a small rules engine, and
 * renders 3-5 calm insight cards. No mutations, no realtime — by design.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  Lightbulb,
  MessageSquare,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AppHeader } from "@/components/kane/AppHeader";
import { AdvisorCard } from "@/components/kane/AdvisorCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { useUserName } from "@/lib/use-user-name";
import {
  listTransactionsByCurrency,
  type TransactionView,
} from "@/lib/data/transactions";
import { listCategories, type Category } from "@/lib/data/categories";
import type { Currency } from "@/lib/supabase/types";

// ─── Demo mode flag (mirrors the rest of the tabs) ────────────────────────
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Types ────────────────────────────────────────────────────────────────

type Sentiment = "positive" | "warning" | "alert" | "neutral";

type InsightIcon = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

type Insight = {
  id: string;
  title: string;
  body: string;
  sentiment: Sentiment;
  icon: InsightIcon;
};

// ─── Visual helpers ───────────────────────────────────────────────────────

const SENTIMENT_TILE: Record<Sentiment, string> = {
  positive: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]/20 text-[var(--color-warning-foreground)]",
  alert: "bg-destructive/15 text-destructive",
  neutral: "bg-primary/10 text-primary",
};

// ─── Greeting ─────────────────────────────────────────────────────────────

function greetingForHour(hour: number): string {
  if (hour < 12) return "Hola";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

// ─── Insight engine ───────────────────────────────────────────────────────

/**
 * Compute up to 5 insights from the latest transactions. Pure function — no
 * side effects, deterministic for a given input. The view's `amount` is in
 * major units (per the centralized `toView` mapper); we convert to minor by
 * `Math.round(amount * 100)` so all sums stay integer-safe.
 */
function computeInsights(
  transactions: TransactionView[],
  categories: Category[],
  currency: Currency,
): Insight[] {
  // Empty-state short-circuit — single neutral insight, no noise.
  if (transactions.length === 0) {
    return [
      {
        id: "empty",
        title: "Sin datos aún",
        body: "Aún no hay datos del mes. Registra un par de movimientos para que pueda analizar tus hábitos.",
        sentiment: "neutral",
        icon: Bot,
      },
    ];
  }

  const now = new Date();
  const thisMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
    0,
    0,
    0,
    0,
  );
  const lastMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const dayOfMonth = now.getDate();

  // Filter by `kind === "expense"` and the date windows. `occurredAt` is an
  // ISO string from the mapper; `new Date(iso)` is monotonic enough for our
  // month-boundary buckets even when the user's timezone shifts at DST.
  const thisMonth: TransactionView[] = [];
  const lastMonth: TransactionView[] = [];
  for (const t of transactions) {
    if (t.kind !== "expense") continue;
    const at = new Date(t.occurredAt);
    if (at >= thisMonthStart) {
      thisMonth.push(t);
    } else if (at >= lastMonthStart && at <= lastMonthEnd) {
      lastMonth.push(t);
    }
  }

  // Empty-state short-circuit specifically for this month even if last month
  // has data — without this-month figures the rules below produce nothing
  // actionable.
  if (thisMonth.length === 0) {
    return [
      {
        id: "empty-month",
        title: "Sin movimientos este mes",
        body: "Aún no hay datos del mes. Registra un par de movimientos para que pueda analizar tus hábitos.",
        sentiment: "neutral",
        icon: Bot,
      },
    ];
  }

  const toMinor = (amountMajor: number): number =>
    Math.round(amountMajor * 100);

  const thisTotal = thisMonth.reduce((acc, t) => acc + toMinor(t.amount), 0);
  const lastTotal = lastMonth.reduce((acc, t) => acc + toMinor(t.amount), 0);

  // Group thisMonth expenses by categoryId. Null category gets bucketed
  // under a synthetic "uncategorized" key so we still get a sensible top.
  const byCategory = new Map<string, number>();
  for (const t of thisMonth) {
    const key = t.categoryId ?? "__uncategorized__";
    byCategory.set(key, (byCategory.get(key) ?? 0) + toMinor(t.amount));
  }

  // Resolve top category — name from the categories list, fallback to the
  // joined `categoryName` from the view, or "Otros" as last resort.
  let topCategoryKey: string | null = null;
  let topCategoryMinor = 0;
  for (const [key, value] of byCategory) {
    if (value > topCategoryMinor) {
      topCategoryMinor = value;
      topCategoryKey = key;
    }
  }
  const topCategoryName = (() => {
    if (!topCategoryKey || topCategoryKey === "__uncategorized__") {
      return "Sin categoría";
    }
    const fromList = categories.find((c) => c.id === topCategoryKey);
    if (fromList) return fromList.name;
    const fromView = thisMonth.find((t) => t.categoryId === topCategoryKey);
    return fromView?.categoryName ?? "Otros";
  })();

  const insights: Insight[] = [];

  // Rule 1 — Top spending category. Always emitted when we have any expense.
  insights.push({
    id: "top-category",
    title: "Categoría principal",
    body: `Tu mayor gasto este mes es ${topCategoryName}: ${formatMoney(topCategoryMinor, currency)}.`,
    sentiment: "neutral",
    icon: Lightbulb,
  });

  // Rule 2 — Month-over-month delta (needs both totals > 0).
  if (thisTotal > 0 && lastTotal > 0) {
    const ratio = thisTotal / lastTotal;
    if (ratio > 1.15) {
      const pct = Math.round((ratio - 1) * 100);
      insights.push({
        id: "mom-up",
        title: "Mes con más gasto",
        body: `Llevas un +${pct}% más que el mes pasado en gastos. Revisa categorías clave.`,
        sentiment: "warning",
        icon: TrendingUp,
      });
    } else if (ratio < 0.85) {
      const pct = Math.round((1 - ratio) * 100);
      insights.push({
        id: "mom-down",
        title: "Buen ritmo",
        body: `Vas ${pct}% por debajo del mes pasado. ¡Buen ritmo de ahorro!`,
        sentiment: "positive",
        icon: TrendingDown,
      });
    }
  }

  // Rule 3 — Daily-pace projection (only meaningful past day 5 of the month).
  if (dayOfMonth >= 5 && thisTotal > 0) {
    const projection = Math.round(thisTotal * (daysInMonth / dayOfMonth));
    if (lastTotal > 0 && projection > lastTotal * 1.1) {
      insights.push({
        id: "pace",
        title: "Proyección del mes",
        body: `Si sigues a este ritmo, cerrarás el mes con ~${formatMoney(projection, currency)} en gastos.`,
        sentiment: "warning",
        icon: AlertTriangle,
      });
    }
  }

  // Rule 4 — Concentrated spend (top category ≥ 40% of this month).
  if (thisTotal > 0 && topCategoryMinor / thisTotal >= 0.4) {
    const pct = Math.round((topCategoryMinor / thisTotal) * 100);
    insights.push({
      id: "concentration",
      title: "Gasto concentrado",
      body: `${topCategoryName} representa el ${pct}% de tu gasto. Considera diversificar tus consumos o poner un tope.`,
      sentiment: "warning",
      icon: Target,
    });
  }

  // Rule 6 — Encouragement (only when there's a real registration habit).
  if (transactions.length >= 3) {
    insights.push({
      id: "encouragement",
      title: "Buen hábito",
      body: `Llevas ${transactions.length} movimientos registrados. Cada gasto registrado mejora tus decisiones.`,
      sentiment: "positive",
      icon: Sparkles,
    });
  }

  // Cap at 5 — the priority order above (1, 2, 3, 4, 6) is preserved by
  // insertion order, so a simple slice is enough.
  return insights.slice(0, 5);
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AdvisorPage(): React.ReactElement {
  const { currency, hydrated: currencyHydrated } = useActiveCurrency();
  const { name } = useUserName();

  const [transactions, setTransactions] = React.useState<TransactionView[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [demoFallback, setDemoFallback] = React.useState(false);

  // Fetch transactions + categories whenever the currency switches. We pull
  // the first page (50 rows) — that comfortably covers this month + last
  // month for any realistic personal-finance volume.
  React.useEffect(() => {
    if (!currencyHydrated) return;

    let cancelled = false;

    if (!SUPABASE_ENABLED) {
      setDemoFallback(true);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setDemoFallback(false);

    Promise.all([
      listTransactionsByCurrency({ currency, limit: 50 }),
      listCategories(),
    ])
      .then(([txResult, cats]) => {
        if (cancelled) return;
        setTransactions(txResult.rows);
        setCategories(cats);
      })
      .catch(() => {
        if (cancelled) return;
        // Soft-fall to demo mode so the page never blanks out — the user
        // still sees the empty-state advisor message.
        setDemoFallback(true);
        setTransactions([]);
        setCategories([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currency, currencyHydrated]);

  const handleTalk = React.useCallback(() => {
    toast.info("Próximamente: chat con tu asesor.");
  }, []);

  const handleSoonAction = React.useCallback(() => {
    toast.info("Próximamente.");
  }, []);

  // Insight set + advisor message are derived state — recomputed only when
  // the underlying data changes, not on every render.
  const insights = React.useMemo(
    () => computeInsights(transactions, categories, currency),
    [transactions, categories, currency],
  );

  const advisorMessage = React.useMemo(() => {
    if (loading) return "Analizando tus gastos...";
    if (demoFallback) {
      return "Inicia sesión para que pueda analizar tus gastos.";
    }
    if (transactions.length === 0) {
      return "Hola, soy tu asesor financiero. Cuando registres tus primeros gastos, podré darte consejos personalizados.";
    }
    const greeting = greetingForHour(new Date().getHours());
    const who = name?.trim() ? name.trim() : "amigo";
    const count = insights.length;
    return `${greeting}, ${who}. Detecté ${count} ${count === 1 ? "patrón" : "patrones"} en tus gastos del mes. Mira abajo.`;
  }, [loading, demoFallback, transactions.length, insights.length, name]);

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-3xl">
        <AppHeader
          eyebrow="Tu dinero"
          title="Asesor IA"
          titleStyle="page"
          className="px-0 pt-0"
        />

        {/* Hero — disabled CTA while loading so we don't fire the toast on
            an unresolved state. */}
        <AdvisorCard
          message={advisorMessage}
          onTalk={loading ? undefined : handleTalk}
        />

        {/* Insights */}
        <section>
          <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Insights del mes
          </h2>

          {loading ? (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {insights.map((insight) => {
                const Icon = insight.icon;
                return (
                  <Card
                    key={insight.id}
                    className="rounded-2xl border-border p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          SENTIMENT_TILE[insight.sentiment],
                        )}
                      >
                        <Icon size={18} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-foreground">
                          {insight.title}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                          {insight.body}
                        </p>
                        <div className="mt-3 flex">
                          <button
                            type="button"
                            onClick={handleSoonAction}
                            className="h-7 rounded-full bg-primary/10 px-3 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15"
                          >
                            Ver detalle
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer — calm reminder that chat is on the roadmap. */}
        <Card className="rounded-2xl border-border p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare size={18} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                Conversación con tu asesor
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Pronto podrás conversar con tu asesor en lenguaje natural y
                recibir recomendaciones a tu medida.
              </p>
              <div className="mt-3 flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={handleSoonAction}
                >
                  Activar notificaciones
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
