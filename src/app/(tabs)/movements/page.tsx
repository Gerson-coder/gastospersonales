// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
// TODO: replace MOCK_TODAY anchor + TRANSACTIONS list with Supabase data once the persistence layer is up.
/**
 * Movements route — Lumi
 *
 * Mobile-first list of every transaction, grouped by day with sticky day
 * headers. Scales to a centered max-w-3xl column at md+ so the list doesn't
 * stretch on desktop.
 *
 * Source of truth: Lumi UI-kit `MovementsScreen` (TabScreens.jsx, lines 4-86).
 *
 * Reviewer fixes applied:
 *   - No `window.LUMI_*` globals — all data lives inline as typed constants.
 *   - No `new Date('2026-04-24')` "today" lie. We use a documented
 *     `MOCK_TODAY` anchor matched to the mock dataset; comments mark it as a
 *     temporary anchor to be replaced by `new Date()` once real data lands.
 *   - Time-of-day uses `t.occurredAt.slice(11, 16)` like Dashboard does, so
 *     SSR and client agree regardless of TZ. Documented with a TODO for proper
 *     TZ-aware formatting once Batch B/C lands.
 *   - 'use client' so the page can hold filter state without server churn —
 *     the data is still deterministic so hydration is stable.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  UtensilsCrossed,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  Home as HomeIcon,
  GraduationCap,
  Briefcase,
  Circle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type Kind = "expense" | "income";
type CategoryId =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "home"
  | "edu"
  | "work"
  | "other";

type Transaction = {
  id: string;
  amount: number;
  currency: Currency;
  kind: Kind;
  categoryId: CategoryId;
  merchant: string;
  /** Local-naive ISO timestamp ("YYYY-MM-DDTHH:mm:ss"). Treated as wall-clock. */
  occurredAt: string;
};

type Filter = "todo" | "gastos" | "ingresos";

// ─── Mock anchor ──────────────────────────────────────────────────────────
// MOCK_TODAY: anchor for grouped mock transactions; replace with new Date()
// once Supabase data lands. Using a fixed reference keeps SSR + hydration
// deterministic — no `Date.now()` drift between server and client.
const MOCK_TODAY = new Date(2026, 3, 24); // April 24, 2026 (month is 0-indexed)

// ─── Mock data ────────────────────────────────────────────────────────────
// 18 transactions across 6 days, mixed kinds, categories, accounts, currencies.
const TRANSACTIONS: Transaction[] = [
  // 2026-04-24 — Hoy
  {
    id: "t1",
    amount: 32.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "fun",
    merchant: "Cinépolis Plaza Norte",
    occurredAt: "2026-04-24T23:14:00",
  },
  {
    id: "t2",
    amount: 14.8,
    currency: "PEN",
    kind: "expense",
    categoryId: "transport",
    merchant: "Uber a casa",
    occurredAt: "2026-04-24T23:42:00",
  },
  {
    id: "t3",
    amount: 189.4,
    currency: "PEN",
    kind: "expense",
    categoryId: "market",
    merchant: "Wong San Isidro",
    occurredAt: "2026-04-24T19:08:00",
  },
  {
    id: "t4",
    amount: 8.5,
    currency: "PEN",
    kind: "expense",
    categoryId: "food",
    merchant: "Tambo+",
    occurredAt: "2026-04-24T08:22:00",
  },

  // 2026-04-23 — Ayer
  {
    id: "t5",
    amount: 26.9,
    currency: "PEN",
    kind: "expense",
    categoryId: "food",
    merchant: "Bisetti Café",
    occurredAt: "2026-04-23T10:15:00",
  },
  {
    id: "t6",
    amount: 12.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "transport",
    merchant: "Metro Línea 1",
    occurredAt: "2026-04-23T18:40:00",
  },
  {
    id: "t7",
    amount: 75.0,
    currency: "PEN",
    kind: "income",
    categoryId: "work",
    merchant: "Reembolso Vale",
    occurredAt: "2026-04-23T14:00:00",
  },

  // 2026-04-22
  {
    id: "t8",
    amount: 1450.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "home",
    merchant: "Alquiler abril",
    occurredAt: "2026-04-22T09:00:00",
  },
  {
    id: "t9",
    amount: 38.5,
    currency: "PEN",
    kind: "expense",
    categoryId: "utilities",
    merchant: "Movistar fibra",
    occurredAt: "2026-04-22T11:30:00",
  },
  {
    id: "t10",
    amount: 22.0,
    currency: "USD",
    kind: "expense",
    categoryId: "edu",
    merchant: "Coursera Plus",
    occurredAt: "2026-04-22T15:18:00",
  },

  // 2026-04-21
  {
    id: "t11",
    amount: 64.2,
    currency: "PEN",
    kind: "expense",
    categoryId: "food",
    merchant: "Rappi · La Lucha",
    occurredAt: "2026-04-21T20:45:00",
  },
  {
    id: "t12",
    amount: 9.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "other",
    merchant: "Kiosko esquina",
    occurredAt: "2026-04-21T07:55:00",
  },

  // 2026-04-20
  {
    id: "t13",
    amount: 145.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "health",
    merchant: "Inkafarma",
    occurredAt: "2026-04-20T17:20:00",
  },
  {
    id: "t14",
    amount: 35.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "fun",
    merchant: "Spotify Premium",
    occurredAt: "2026-04-20T08:00:00",
  },
  {
    id: "t15",
    amount: 18.4,
    currency: "PEN",
    kind: "expense",
    categoryId: "transport",
    merchant: "Cabify",
    occurredAt: "2026-04-20T22:10:00",
  },

  // 2026-04-18
  {
    id: "t16",
    amount: 240.0,
    currency: "PEN",
    kind: "income",
    categoryId: "work",
    merchant: "Clase particular",
    occurredAt: "2026-04-18T19:00:00",
  },
  {
    id: "t17",
    amount: 56.0,
    currency: "PEN",
    kind: "expense",
    categoryId: "market",
    merchant: "Plaza Vea",
    occurredAt: "2026-04-18T12:34:00",
  },

  // 2026-04-01
  {
    id: "t18",
    amount: 4200,
    currency: "PEN",
    kind: "income",
    categoryId: "work",
    merchant: "Sueldo abril",
    occurredAt: "2026-04-01T09:00:00",
  },
];

// ─── Category map ─────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<
  CategoryId,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  food: UtensilsCrossed,
  transport: Car,
  market: ShoppingCart,
  health: Heart,
  fun: Film,
  utilities: Zap,
  home: HomeIcon,
  edu: GraduationCap,
  work: Briefcase,
  other: Circle,
};

const CATEGORY_LABEL: Record<CategoryId, string> = {
  food: "Comida",
  transport: "Transporte",
  market: "Mercado",
  health: "Salud",
  fun: "Ocio",
  utilities: "Servicios",
  home: "Vivienda",
  edu: "Educación",
  work: "Trabajo",
  other: "Otros",
};

// ─── Money formatting ─────────────────────────────────────────────────────
// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Date helpers ─────────────────────────────────────────────────────────
/** Returns a YYYY-MM-DD key from a local-naive ISO timestamp. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Build a Date at local midnight from a YYYY-MM-DD key. */
function dayDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a day-key as the visible group header.
 * Uses MOCK_TODAY (not real `new Date()`) to compute "Hoy"/"Ayer" so SSR and
 * client agree. Replace MOCK_TODAY with `new Date()` once real data lands.
 */
function dayLabel(key: string): string {
  const d = dayDate(key);
  const today = new Date(MOCK_TODAY.getFullYear(), MOCK_TODAY.getMonth(), MOCK_TODAY.getDate());
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  // "lun 22 abr"
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(d)
    .replace(/\./g, "");
}

// ─── Group by day (preserves dataset order; assumes data is sorted) ───────
type DayGroup = {
  key: string;
  label: string;
  items: Transaction[];
  /** Net for the day in PEN-equivalent (mock: sum naively across currencies). */
  net: number;
};

function groupByDay(txns: Transaction[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const t of txns) {
    const key = dayKey(t.occurredAt);
    let g = map.get(key);
    if (!g) {
      g = { key, label: dayLabel(key), items: [], net: 0 };
      map.set(key, g);
    }
    g.items.push(t);
    // Net is mock-only: we sum amounts ignoring currency. Real impl will
    // convert via FX once Batch B/C lands.
    g.net += t.kind === "income" ? t.amount : -t.amount;
  }
  // Sort: most recent day first.
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}

// ─── Transaction row ──────────────────────────────────────────────────────
function TransactionRow({ t }: { t: Transaction }) {
  const Icon = CATEGORY_ICONS[t.categoryId];
  // Stable formatting: parse the ISO string directly to hh:mm to avoid TZ-driven
  // hydration mismatches. Mock data is local-naive; we treat it as wall-clock.
  // TODO: replace with proper TZ-aware formatting once Batch B/C lands.
  const time = t.occurredAt.slice(11, 16);
  const isIncome = t.kind === "income";
  const signed = isIncome ? t.amount : -t.amount;
  const sign = signed < 0 ? "– " : isIncome ? "+ " : "";
  const moneyText = `${sign}${formatMoney(Math.abs(signed), t.currency)}`;
  const ariaLabel = `${t.merchant}, ${moneyText}, ${CATEGORY_LABEL[t.categoryId]}, ${time}`;

  return (
    <article
      aria-label={ariaLabel}
      className="flex min-h-14 items-center gap-3.5 px-4 py-3.5"
    >
      <div
        aria-hidden="true"
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-tight">
          {t.merchant}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {CATEGORY_LABEL[t.categoryId]} · {time}
        </div>
      </div>
      <span
        className={cn(
          "font-display italic tabular-nums leading-none tracking-tight whitespace-nowrap text-base",
          isIncome
            ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
            : "text-foreground",
        )}
        style={{ fontFeatureSettings: '"tnum","lnum"' }}
      >
        {moneyText}
      </span>
    </article>
  );
}

// ─── Hero summary (this month) ────────────────────────────────────────────
function MonthSummary({
  spent,
  income,
  net,
}: {
  spent: number;
  income: number;
  net: number;
}) {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border p-5 md:mx-0 md:mt-6 md:p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Este mes · abril
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Gastado
          </div>
          <div className="mt-1 font-display italic tabular-nums leading-none tracking-tight text-lg text-foreground">
            {formatMoney(spent, "PEN")}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Ingresos
          </div>
          <div className="mt-1 font-display italic tabular-nums leading-none tracking-tight text-lg text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]">
            + {formatMoney(income, "PEN")}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Neto
          </div>
          <div
            className={cn(
              "mt-1 font-display italic tabular-nums leading-none tracking-tight text-lg",
              net < 0
                ? "text-destructive"
                : "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
            )}
          >
            {net < 0 ? "– " : "+ "}
            {formatMoney(Math.abs(net), "PEN")}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Filter chips ─────────────────────────────────────────────────────────
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "gastos", label: "Gastos" },
  { id: "ingresos", label: "Ingresos" },
];

function FilterChips({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (next: Filter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Filtrar movimientos"
      className="flex gap-1.5"
    >
      {FILTERS.map((f) => {
        const selected = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(f.id)}
            className={cn(
              "inline-flex h-9 min-w-11 items-center rounded-full border px-3.5 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-transparent text-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function MovementsPage() {
  const [filter, setFilter] = React.useState<Filter>("todo");

  const filtered = React.useMemo(
    () =>
      TRANSACTIONS.filter((t) =>
        filter === "todo"
          ? true
          : filter === "gastos"
            ? t.kind === "expense"
            : t.kind === "income",
      ),
    [filter],
  );

  const groups = React.useMemo(() => groupByDay(filtered), [filtered]);

  // Month summary uses the FULL dataset, not the filtered view — the hero is
  // about the month, not the filter. Numbers are PEN-only in mock; the few
  // USD rows are intentionally excluded from PEN totals.
  const { spent, income, net } = React.useMemo(() => {
    let s = 0;
    let i = 0;
    for (const t of TRANSACTIONS) {
      if (t.currency !== "PEN") continue;
      if (t.kind === "expense") s += t.amount;
      else i += t.amount;
    }
    return { spent: s, income: i, net: i - s };
  }, []);

  const isEmpty = groups.length === 0;

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl md:px-8 md:py-8">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-3 md:px-0 md:pt-0">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              abril · 2026
            </div>
            <h1 className="mt-1 text-[22px] font-bold md:text-3xl">Movimientos</h1>
          </div>
          <button
            type="button"
            aria-label="Buscar movimientos"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </header>

        {/* Month summary hero */}
        <MonthSummary spent={spent} income={income} net={net} />

        {/* Filter chips */}
        <div className="px-4 pb-2 pt-4 md:px-0">
          <FilterChips value={filter} onChange={setFilter} />
        </div>

        {/* Grouped list — or empty state */}
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="px-4 pb-8 md:px-0">
            {groups.map((g) => (
              <DayGroupSection key={g.key} group={g} />
            ))}

            {/* Pagination affordance — mock-only; real pagination lands with Supabase. */}
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full px-5 text-[13px] font-semibold"
                aria-label="Cargar más movimientos"
              >
                Cargar más
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day group section ────────────────────────────────────────────────────
function DayGroupSection({ group }: { group: DayGroup }) {
  const netSign = group.net < 0 ? "– " : "+ ";
  const netText = `${netSign}${formatMoney(Math.abs(group.net), "PEN")}`;
  return (
    <section className="mt-4 first:mt-0">
      {/* Sticky day header — h2 so screen readers can section-jump. */}
      <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between bg-background/95 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-0 md:px-1">
        <span>{group.label}</span>
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            group.net < 0 ? "text-foreground" : "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
          )}
          aria-label={`Neto del día ${netText}`}
        >
          {netText}
        </span>
      </h2>

      <Card className="overflow-hidden rounded-2xl border-border p-0">
        {group.items.map((t, i) => (
          <div key={t.id} className={i ? "border-t border-border" : ""}>
            <TransactionRow t={t} />
          </div>
        ))}
      </Card>
    </section>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="mx-auto flex flex-col items-center gap-4 px-6 py-16 text-center md:py-24">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
      >
        <Plus size={22} />
      </div>
      <div>
        <h2 className="text-lg font-bold">Aún no hay movimientos</h2>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          Cuando registres tu primer gasto o ingreso, va a aparecer acá agrupado
          por día.
        </p>
      </div>
      <Link
        href="/capture"
        aria-label="Registrar primer movimiento"
        className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Registrar primero
      </Link>
    </div>
  );
}
