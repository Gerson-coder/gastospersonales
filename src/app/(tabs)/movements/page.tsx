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
  ArrowLeft,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/lumi/AppHeader";

// --- Types ----------------------------------------------------------------
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

// --- Mock anchor ----------------------------------------------------------
// MOCK_TODAY: anchor for grouped mock transactions; replace with new Date()
// once Supabase data lands. Using a fixed reference keeps SSR + hydration
// deterministic — no `Date.now()` drift between server and client.
const MOCK_TODAY = new Date(2026, 3, 24); // April 24, 2026 (month is 0-indexed)

// --- Mock data ------------------------------------------------------------
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

// --- Category map ---------------------------------------------------------
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

// --- Unified category tint palette ----------------------------------------
// Subtle tints (high lightness, low chroma) so the list reads as a coherent
// taxonomy instead of an arcoíris. Mirrors the Dashboard polish palette.
// Local Lumi categories `home` and `edu` map to the closest spec entries
// (`utilities` and `education`) so we avoid emitting Tailwind classes that
// don't exist at build time.
const CATEGORY_TINT: Record<CategoryId, { bg: string; text: string }> = {
  food: {
    bg: "bg-[oklch(0.92_0.04_30)]",
    text: "text-[oklch(0.45_0.10_30)]",
  },
  transport: {
    bg: "bg-[oklch(0.92_0.03_220)]",
    text: "text-[oklch(0.45_0.10_220)]",
  },
  market: {
    bg: "bg-[oklch(0.92_0.04_280)]",
    text: "text-[oklch(0.45_0.10_280)]",
  },
  health: {
    bg: "bg-[oklch(0.92_0.04_10)]",
    text: "text-[oklch(0.50_0.12_10)]",
  },
  fun: {
    bg: "bg-[oklch(0.92_0.04_310)]",
    text: "text-[oklch(0.45_0.10_310)]",
  },
  utilities: {
    bg: "bg-[oklch(0.92_0.04_70)]",
    text: "text-[oklch(0.45_0.10_70)]",
  },
  home: {
    bg: "bg-[oklch(0.92_0.04_70)]",
    text: "text-[oklch(0.45_0.10_70)]",
  },
  edu: {
    bg: "bg-[oklch(0.92_0.03_180)]",
    text: "text-[oklch(0.45_0.10_180)]",
  },
  work: {
    bg: "bg-[oklch(0.92_0.03_140)]",
    text: "text-[oklch(0.45_0.10_140)]",
  },
  other: {
    bg: "bg-[oklch(0.92_0_95)]",
    text: "text-[oklch(0.45_0_95)]",
  },
};

// Shared min-width for any money column (transaction prices + day net) so
// every value lands on the same right edge regardless of digit count.
// Combined with `tabular-nums`, digits become equal-width and align as a
// proper column.
const MONEY_COL_MIN_WIDTH = "108px";

// --- Money formatting -----------------------------------------------------
// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// --- Date helpers ---------------------------------------------------------
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

// --- Group by day (preserves dataset order; assumes data is sorted) -------
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

// --- Transaction row ------------------------------------------------------
function TransactionRow({ t }: { t: Transaction }) {
  const Icon = CATEGORY_ICONS[t.categoryId];
  const tint = CATEGORY_TINT[t.categoryId];
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
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
          tint.bg,
          tint.text,
        )}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {t.merchant}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {CATEGORY_LABEL[t.categoryId]} · {time}
        </div>
      </div>
      <span
        className={cn(
          // ml-auto + shrink-0 + min-width + tabular-nums + text-right gives us
          // a fixed-width money column: every price, no matter the digit count,
          // lines up on the same right edge with equal-width digits.
          "ml-auto shrink-0 text-right whitespace-nowrap",
          "font-display italic tabular-nums leading-none tracking-tight text-base",
          isIncome
            ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
            : "text-foreground",
        )}
        style={{
          fontFeatureSettings: '"tnum","lnum"',
          minWidth: MONEY_COL_MIN_WIDTH,
        }}
      >
        {moneyText}
      </span>
    </article>
  );
}

// --- Hero summary (this month) --------------------------------------------
// Mock month-over-month deltas. Real values land with Supabase + FX (Batch B/C).
// Convention: positive `delta` = "good" for the user's wallet (gasto bajó, ingreso
// subió, ahorro mayor). The chip color follows that semantic, not the raw sign.
const MOCK_DELTAS = {
  spent: { pct: -12, label: "vs marzo" },
  income: { pct: 18, label: "vs marzo" },
  net: { pct: 24, label: "vs marzo" },
} as const;

/**
 * Compact, single-line delta chip used by the hero. Icon + percentage only;
 * the comparison label ("comparado con marzo") lives once in the eyebrow so
 * the chip never wraps inside narrow cells.
 *
 * `tone` is semantic, not raw sign: "positive" = good news for the user
 * (gasto bajó, ingreso subió, ahorro positivo) → emerald; "negative" = bad
 * news → red; "neutral" → muted.
 */
function DeltaChip({
  pct,
  tone,
}: {
  pct: number;
  tone: "positive" | "negative" | "neutral";
}) {
  const Icon = pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const palette =
    tone === "positive"
      ? "bg-[oklch(0.94_0.05_162)] text-[oklch(0.40_0.14_162)] dark:bg-[oklch(0.30_0.06_162)] dark:text-[oklch(0.85_0.14_162)]"
      : tone === "negative"
        ? "bg-[oklch(0.94_0.04_30)] text-[oklch(0.45_0.14_30)] dark:bg-[oklch(0.30_0.05_30)] dark:text-[oklch(0.85_0.12_30)]"
        : "bg-muted text-muted-foreground";
  // Always show absolute %; the icon carries the direction.
  const display = `${Math.abs(pct)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums whitespace-nowrap",
        palette,
      )}
    >
      <Icon size={12} aria-hidden="true" strokeWidth={2.5} />
      {display}
    </span>
  );
}

/**
 * Secondary KPI cell (Gasto / Ingreso). Rendered as a real <button> so the
 * card itself becomes a filter UI: tap → toggle the matching filter chip on
 * the page. Active state mirrors aria-pressed for screen readers AND uses a
 * subtle bg + inset ring so the active filter is obvious without shouting.
 */
function HeroKpiButton({
  label,
  amount,
  forceSign,
  variant,
  pct,
  ariaLabel,
  pressed,
  onClick,
}: {
  label: string;
  amount: number;
  forceSign: "+" | "−";
  variant: "expense" | "income";
  pct: number;
  ariaLabel: string;
  pressed: boolean;
  onClick: () => void;
}) {
  const numberColor =
    variant === "income"
      ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
      : "text-foreground";
  const dotColor =
    variant === "income" ? "bg-[oklch(0.65_0.16_162)]" : "bg-foreground/40";
  // Semantic tone: gasto bajó (pct < 0) = positive; ingreso subió (pct > 0) = positive.
  const tone: "positive" | "negative" =
    variant === "expense"
      ? pct <= 0
        ? "positive"
        : "negative"
      : pct >= 0
        ? "positive"
        : "negative";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={cn(
        // 44px+ tap target, full-cell, left-aligned content. Subtle interactive
        // surface — restraint over flash. Active state uses an inset ring + bg
        // lift so it reads as "selected" without competing with the hero.
        "flex min-h-[64px] w-full flex-col items-start gap-1.5 rounded-xl px-3.5 py-3 text-left",
        "transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        pressed
          ? "bg-foreground/[0.06] ring-1 ring-inset ring-foreground/15"
          : "hover:bg-muted/60",
      )}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("inline-block h-1.5 w-1.5 rounded-full", dotColor)}
        />
        {label}
      </span>
      <span
        className={cn(
          "font-display italic leading-none tracking-tight text-[22px] md:text-[26px] tabular-nums whitespace-nowrap",
          numberColor,
          pressed && "font-semibold",
        )}
        style={{ fontFeatureSettings: '"tnum","lnum"' }}
      >
        {forceSign} {formatMoney(amount, "PEN")}
      </span>
      <DeltaChip pct={pct} tone={tone} />
    </button>
  );
}

function MonthSummary({
  spent,
  income,
  net,
  filter,
  onFilterChange,
}: {
  spent: number;
  income: number;
  net: number;
  filter: Filter;
  onFilterChange: (next: Filter) => void;
}) {
  const netPositive = net >= 0;
  const netTone: "positive" | "negative" = netPositive ? "positive" : "negative";
  const netColor = netPositive
    ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
    : "text-destructive";

  // Tap-to-filter: tapping the active cell again returns to "todo" so the card
  // is a true toggle, not a one-way switch. Both the cells here and the chip
  // group below the card read/write the same `filter` state on the page.
  const toggle = (next: Filter) => {
    onFilterChange(filter === next ? "todo" : next);
  };

  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-6 md:p-10">
      {/* Eyebrow — also carries the comparison ("comparado con marzo") so the
          delta chips below stay compact (icon + %) and never line-wrap. */}
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-px w-6 bg-border" />
          Este mes · abril
        </span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-muted-foreground/80">
          comparado con marzo
        </span>
      </div>

      {/* HERO: NETO. The single most important number — "how am I doing this
          month?". Centered, oversized, font-display italic. Renders as <dl>
          for semantic structure (label + value pair, not a control). */}
      <dl className="mt-6 flex flex-col items-center text-center md:mt-8">
        <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              netPositive ? "bg-[oklch(0.65_0.16_162)]" : "bg-destructive",
            )}
          />
          Neto
        </dt>
        <dd
          className={cn(
            "mt-2 font-display italic leading-[0.95] tracking-tight tabular-nums whitespace-nowrap",
            "text-[40px] md:text-[56px]",
            netColor,
          )}
          style={{ fontFeatureSettings: '"tnum","lnum"' }}
        >
          {netPositive ? "+" : "−"} {formatMoney(Math.abs(net), "PEN")}
        </dd>
        <div className="mt-3">
          <DeltaChip pct={MOCK_DELTAS.net.pct} tone={netTone} />
        </div>
      </dl>

      {/* Thin separator — restraint, not a heavy divider. */}
      <div
        aria-hidden="true"
        className="mx-auto my-6 h-px w-full max-w-xs bg-border md:my-8"
      />

      {/* Secondary KPIs — only TWO cells now (no more cramped 3-col), so the
          numbers + delta chips never wrap. Each cell is a tappable filter. */}
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <HeroKpiButton
          label="Gasto"
          amount={spent}
          forceSign="−"
          variant="expense"
          pct={MOCK_DELTAS.spent.pct}
          ariaLabel={
            filter === "gastos"
              ? "Quitar filtro de gastos"
              : "Filtrar por gastos"
          }
          pressed={filter === "gastos"}
          onClick={() => toggle("gastos")}
        />
        <HeroKpiButton
          label="Ingreso"
          amount={income}
          forceSign="+"
          variant="income"
          pct={MOCK_DELTAS.income.pct}
          ariaLabel={
            filter === "ingresos"
              ? "Quitar filtro de ingresos"
              : "Filtrar por ingresos"
          }
          pressed={filter === "ingresos"}
          onClick={() => toggle("ingresos")}
        />
      </div>
    </Card>
  );
}

// --- Filter chips ---------------------------------------------------------
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
      className="flex gap-2"
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
              // 44px tap target (h-11) — meets WCAG 2.5.5; the visual height
              // is carried by the pill background so the chip still looks
              // compact next to body text.
              "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? // OBVIOUS active state: filled with foreground, ring for lift.
                  "border-foreground bg-foreground text-background shadow-sm"
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

// --- Page -----------------------------------------------------------------
export default function MovementsPage() {
  const [filter, setFilter] = React.useState<Filter>("todo");
  // Search state — `isSearching` toggles the inline-expand header swap;
  // `query` is the live text. Both reset on close.
  const [isSearching, setIsSearching] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // Filter chain composes the chip filter (Todo / Gastos / Ingresos) with the
  // free-text search. Search matches on merchant name, category label, and
  // amount string (so "32" matches 32.00). Both filters compose: chips narrow
  // the pool first, then search narrows further.
  const filtered = React.useMemo(() => {
    let list: Transaction[] = TRANSACTIONS.filter((t) =>
      filter === "todo"
        ? true
        : filter === "gastos"
          ? t.kind === "expense"
          : t.kind === "income",
    );

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        if (t.merchant.toLowerCase().includes(q)) return true;
        const catLabel = CATEGORY_LABEL[t.categoryId]?.toLowerCase() ?? "";
        if (catLabel.includes(q)) return true;
        // Amount substring match: "32" matches 32.00, "189" matches 189.40,
        // "1450" matches 1450.00. We don't try to localize separators here —
        // raw decimal string is the most predictable behavior for the user.
        const amountStr = t.amount.toFixed(2);
        if (amountStr.includes(q)) return true;
        return false;
      });
    }

    return list;
  }, [filter, query]);

  const groups = React.useMemo(() => groupByDay(filtered), [filtered]);

  // Close the search bar AND wipe the query — closing implies "I'm done
  // filtering," not "keep the filter but hide the input."
  const closeSearch = React.useCallback(() => {
    setIsSearching(false);
    setQuery("");
  }, []);

  const trimmedQuery = query.trim();
  const hasActiveQuery = trimmedQuery.length > 0;
  const noResults = hasActiveQuery && groups.length === 0;

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

  // "Empty" splits two cases:
  //   - dataset truly empty (no chip filter active, no query) → onboarding
  //     EmptyState (the existing "Aún no hay movimientos").
  //   - dataset has rows but the search filter wiped them → in-list
  //     "Sin resultados" message rendered below.
  const isEmpty = groups.length === 0 && !hasActiveQuery;

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl md:px-8 md:py-8">
        {/* Header — swaps between AppHeader (idle) and an inline search input.
            The wrapper keeps the same min-height so the layout doesn't jump
            when toggling. transition-all gives a soft 200ms swap.

            Search-mode header is intentionally kept inline (not part of
            AppHeader) because it replaces the entire header chrome — title,
            eyebrow, and the action cluster — with a focused input row. */}
        {isSearching ? (
          <header className="flex min-h-[64px] items-center gap-2 px-5 pt-3 transition-all duration-200 md:px-0 md:pt-0">
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Cerrar búsqueda"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <div className="relative flex-1">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                inputMode="search"
                autoComplete="off"
                autoFocus
                aria-label="Buscar movimientos"
                placeholder="Buscar por nombre, categoría o monto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
                className="h-11 rounded-full border-border bg-muted pl-9 pr-10 text-[14px]"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Borrar búsqueda"
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </header>
        ) : (
          <AppHeader
            eyebrow="abril · 2026"
            title="Movimientos"
            titleStyle="display"
            actionsBefore={
              <button
                type="button"
                onClick={() => setIsSearching(true)}
                aria-label="Buscar movimientos"
                aria-expanded={false}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search size={16} aria-hidden="true" />
              </button>
            }
          />
        )}

        {/* Month summary hero — intentionally based on the FULL dataset, not
            the filtered/searched view. The hero is a month-level summary, not
            a search summary. The hero's secondary cells (Gasto / Ingreso)
            also act as filter controls — they read/write the same `filter`
            state used by the chip group below, so both UIs stay in sync. */}
        <MonthSummary
          spent={spent}
          income={income}
          net={net}
          filter={filter}
          onFilterChange={setFilter}
        />

        {/* Filter chips */}
        <div className="px-4 pb-3 pt-6 md:px-0 md:pt-8">
          <FilterChips value={filter} onChange={setFilter} />
        </div>

        {/* Grouped list — onboarding empty, no-results empty, or the list. */}
        {isEmpty ? (
          <EmptyState />
        ) : noResults ? (
          <NoSearchResults query={trimmedQuery} />
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

// --- No search results ----------------------------------------------------
// Lives inside the list area (not full-page) so the hero + chips stay
// reachable. role="status" so a screen reader announces the count change.
function NoSearchResults({ query }: { query: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex flex-col items-center gap-3 px-6 py-16 text-center md:py-20"
    >
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Search size={20} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Sin resultados para «{query}»
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Probá con otra palabra.
        </p>
      </div>
    </div>
  );
}

// --- Day group section ----------------------------------------------------
function DayGroupSection({ group }: { group: DayGroup }) {
  const netSign = group.net < 0 ? "– " : "+ ";
  const netText = `${netSign}${formatMoney(Math.abs(group.net), "PEN")}`;
  return (
    <section className="mt-5 first:mt-0">
      {/* Sticky day header — h2 so screen readers can section-jump.
          Bumped from muted-foreground to foreground + semibold so day labels
          read as proper section headings instead of fading metadata. */}
      <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between border-b border-border/40 bg-background/95 px-5 py-2.5 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:-mx-0 md:px-1">
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          {group.label}
        </span>
        <span
          className={cn(
            // Day net: aligned to the same money column as transaction prices,
            // a touch smaller and lighter than the day label so the hierarchy
            // reads label → total → rows.
            "shrink-0 text-right tabular-nums text-[11px] font-medium",
            group.net < 0
              ? "text-muted-foreground"
              : "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
          )}
          style={{
            fontFeatureSettings: '"tnum","lnum"',
            minWidth: MONEY_COL_MIN_WIDTH,
          }}
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

// --- Empty state ----------------------------------------------------------
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
          Cuando registres tu primer gasto o ingreso, aparecerá aquí agrupado
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
