// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands
/**
 * Dashboard preview route — Lumi
 *
 * Mobile-first; scales to desktop at md+. All copy in es-PE.
 * NOTE: Currently a public preview route. When Batch D wires the (protected)
 * group, this file moves there.
 */

"use client";

import * as React from "react";
import {
  Camera,
  User,
  UtensilsCrossed,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  Home,
  GraduationCap,
  Briefcase,
  Circle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/lumi/ThemeToggle";
import { cn } from "@/lib/utils";
import { useUserName } from "@/lib/use-user-name";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
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
  kind: "expense" | "income";
  categoryId: CategoryId;
  merchant: string;
  occurredAt: string;
};

// ─── Mock data (stable values — no Date.now() / Math.random() in JSX) ─────
const TRANSACTIONS: Transaction[] = [
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
  {
    id: "t5",
    amount: 4200,
    currency: "PEN",
    kind: "income",
    categoryId: "work",
    merchant: "Sueldo abril",
    occurredAt: "2026-04-01T09:00:00",
  },
];

// Last 7 days of spend (Mon → Sun); today is the rightmost bar.
// Realistic-ish PEN amounts — stable, deterministic.
const WEEK_SPEND: { label: string; value: number }[] = [
  { label: "Lun", value: 28 },
  { label: "Mar", value: 64 },
  { label: "Mié", value: 18 },
  { label: "Jue", value: 92 },
  { label: "Vie", value: 145 },
  { label: "Sáb", value: 210 },
  { label: "Dom", value: 76 },
];

const TOP_CATEGORIES = [
  { id: "fun" as CategoryId, label: "Entretenimiento", value: 32, color: "var(--color-chart-2)" },
  { id: "food" as CategoryId, label: "Comida", value: 22, color: "var(--color-chart-1)" },
  { id: "transport" as CategoryId, label: "Transporte", value: 16, color: "var(--color-chart-3)" },
  { id: "market" as CategoryId, label: "Mercado", value: 12, color: "var(--color-chart-4)" },
  { id: "utilities" as CategoryId, label: "Servicios", value: 10, color: "var(--color-chart-5)" },
  { id: "other" as CategoryId, label: "Otros", value: 8, color: "var(--color-chart-6)" },
];

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
  home: Home,
  edu: GraduationCap,
  work: Briefcase,
  other: Circle,
};

const CATEGORY_LABEL: Record<CategoryId, string> = {
  food: "Comida",
  transport: "Transporte",
  market: "Mercado",
  health: "Salud",
  fun: "Entretenimiento",
  utilities: "Servicios",
  home: "Hogar",
  edu: "Educación",
  work: "Trabajo",
  other: "Otros",
};

// Subtle, unified tint palette — same hue family as Lumi (warm + emerald accents),
// high lightness + low chroma so nothing screams. NOT a rainbow.
const CATEGORY_TINT: Record<CategoryId, { bg: string; text: string }> = {
  food: { bg: "bg-[oklch(0.92_0.04_30)]", text: "text-[oklch(0.45_0.10_30)]" },
  transport: { bg: "bg-[oklch(0.92_0.03_220)]", text: "text-[oklch(0.45_0.10_220)]" },
  market: { bg: "bg-[oklch(0.92_0.04_280)]", text: "text-[oklch(0.45_0.10_280)]" },
  health: { bg: "bg-[oklch(0.92_0.04_10)]", text: "text-[oklch(0.50_0.12_10)]" },
  fun: { bg: "bg-[oklch(0.92_0.04_310)]", text: "text-[oklch(0.45_0.10_310)]" },
  utilities: { bg: "bg-[oklch(0.92_0.04_70)]", text: "text-[oklch(0.45_0.10_70)]" },
  home: { bg: "bg-[oklch(0.92_0.04_162)]", text: "text-[oklch(0.45_0.10_162)]" },
  edu: { bg: "bg-[oklch(0.92_0.03_180)]", text: "text-[oklch(0.45_0.10_180)]" },
  work: { bg: "bg-[oklch(0.92_0.03_140)]", text: "text-[oklch(0.45_0.10_140)]" },
  other: { bg: "bg-[oklch(0.92_0_95)]", text: "text-[oklch(0.45_0_95)]" },
};

// ─── Money formatting ─────────────────────────────────────────────────────
// TODO: replace with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Component primitives ──────────────────────────────────────────────────
function MoneyDisplay({
  amount,
  currency = "PEN",
  size = "md",
  tone = "default",
  showSign = false,
}: {
  amount: number;
  currency?: Currency;
  size?: "hero" | "lg" | "md" | "sm";
  tone?: "default" | "positive" | "negative" | "muted";
  showSign?: boolean;
}) {
  const sign = amount < 0 ? "– " : showSign && amount > 0 ? "+ " : "";
  const sizeClass = {
    hero: "text-[44px] md:text-[64px]",
    lg: "text-3xl md:text-4xl",
    md: "text-xl",
    sm: "text-base",
  }[size];
  const toneClass = {
    default: "text-foreground",
    positive: "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
    negative: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <span
      className={`font-display italic tabular-nums leading-none tracking-tight whitespace-nowrap ${sizeClass} ${toneClass}`}
      style={{ fontFeatureSettings: '"tnum","lnum"' }}
    >
      {sign}
      {formatMoney(Math.abs(amount), currency)}
    </span>
  );
}

// ─── Hero KPI primitives ───────────────────────────────────────────────────
// Small inline chip used under each KPI to communicate month-over-month
// change. Semantic mapping: for EXPENSE, lower is better (negative delta →
// positive tone); for INCOME, higher is better (positive delta → positive
// tone). The `kind` prop encodes that domain knowledge so callers don't
// have to think about it.
function DeltaChip({
  pct,
  kind,
  comparison = "vs marzo",
}: {
  pct: number;
  kind: "expense" | "income";
  comparison?: string;
}) {
  // "Good for the user" check: expenses shrinking, income growing.
  const isGood = kind === "expense" ? pct < 0 : pct > 0;
  const Icon = pct < 0 ? TrendingDown : TrendingUp;
  const toneClass = isGood
    ? "bg-[oklch(0.72_0.18_162/0.12)] text-[oklch(0.42_0.16_162)] dark:bg-[oklch(0.72_0.18_162/0.18)] dark:text-[oklch(0.86_0.14_162)]"
    : "bg-destructive/10 text-destructive dark:bg-destructive/20";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${toneClass}`}
    >
      <Icon size={11} aria-hidden="true" strokeWidth={2.5} />
      <span>
        {Math.abs(pct * 100).toFixed(0)}%
      </span>
      <span className="font-medium opacity-70">{comparison}</span>
    </span>
  );
}

// One column of the hero KPI row — label, money, delta chip. Internal
// vertical rhythm is calibrated so the chip sits one breath below the
// number, not glued to it.
function KpiBlock({
  label,
  amount,
  currency,
  deltaPct,
  kind,
}: {
  label: string;
  amount: number;
  currency: Currency;
  deltaPct: number;
  kind: "expense" | "income";
}) {
  const isIncome = kind === "income";
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </div>
      <div className="mt-2.5">
        <MoneyDisplay
          amount={amount}
          currency={currency}
          size="md"
          tone={isIncome ? "positive" : "default"}
          showSign={isIncome}
        />
      </div>
      <div className="mt-3">
        <DeltaChip pct={deltaPct} kind={kind} />
      </div>
    </div>
  );
}

// Interactive category breakdown — replaces the legacy donut. Each row is a
// button (keyboard-native), with an animated proportional bar fill. Tapping a
// row highlights it (others fade) and a second tap clears the selection.
// Bars animate from 0 → target on mount via a one-shot RAF so the transition
// reliably runs on first paint.
type CategoryBarItem = {
  id: CategoryId;
  label: string;
  value: number; // percentage share (0-100)
  color: string; // CSS var ref, e.g. var(--color-chart-2)
};

function CategoryBars({
  items,
  total,
  currency = "PEN",
}: {
  items: CategoryBarItem[];
  total: number;
  currency?: Currency;
}) {
  const [selectedId, setSelectedId] = React.useState<CategoryId | null>(null);
  // Mount-time animation: render bars at width 0, then flip to target on the
  // next frame so the CSS transition actually plays.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = (id: CategoryId) => {
    setSelectedId((curr) => (curr === id ? null : id));
  };

  return (
    <ul className="flex flex-col gap-1.5" role="list">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const isDimmed = selectedId !== null && !isSelected;
        const Icon = CATEGORY_ICONS[item.id];
        const tint = CATEGORY_TINT[item.id];
        const amount = (item.value / 100) * total;
        const fillPct = mounted ? item.value : 0;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-pressed={isSelected}
              aria-label={`${item.label}: ${item.value}% (${formatMoney(amount, currency)})`}
              className={cn(
                "group flex w-full flex-col gap-2 rounded-xl px-2.5 py-2.5 text-left",
                "transition-opacity duration-200 ease-out",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isDimmed && "opacity-45",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                    tint.bg,
                    tint.text,
                  )}
                  aria-hidden="true"
                >
                  <Icon size={15} />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13.5px] leading-tight transition-[font-weight] duration-200",
                    isSelected ? "font-bold" : "font-semibold",
                  )}
                >
                  {item.label}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-[12px] font-medium",
                    isSelected ? "text-foreground" : "text-muted-foreground",
                  )}
                  style={{ fontFeatureSettings: '"tnum","lnum"' }}
                >
                  {item.value}%
                </span>
                <span
                  className={cn(
                    "min-w-[68px] text-right tabular-nums text-[13px]",
                    isSelected ? "font-bold text-foreground" : "font-semibold text-foreground/80",
                  )}
                  style={{ fontFeatureSettings: '"tnum","lnum"' }}
                >
                  {formatMoney(amount, currency)}
                </span>
              </div>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <span
                  className="absolute inset-y-0 left-0 block rounded-full ease-[cubic-bezier(0.32,0.72,0,1)]"
                  style={{
                    width: `${fillPct}%`,
                    backgroundColor: item.color,
                    transitionProperty: "width, opacity, filter",
                    transitionDuration: "600ms, 200ms, 200ms",
                    opacity: selectedId !== null && !isSelected ? 0.55 : 1,
                    filter: isSelected ? "saturate(1.15)" : "none",
                  }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Weekly bar chart — last 7 days of spend. Today's bar (last) uses primary color,
// prior days use a soft muted tint. Hand-rolled SVG, unique gradient ids.
function WeeklyBars({
  data,
  height = 140,
  currency = "PEN",
}: {
  data: { label: string; value: number }[];
  height?: number;
  currency?: Currency;
}) {
  const w = 320;
  const padX = 10;
  const padTop = 18;
  const padBottom = 26;
  const innerW = w - padX * 2;
  const innerH = height - padTop - padBottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = innerW / data.length;
  const barW = Math.min(28, slot * 0.55);
  const todayIdx = data.length - 1;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Gasto de los últimos 7 días"
    >
      <defs>
        <linearGradient id="lumi-dashboard-week-today" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="lumi-dashboard-week-other" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-muted-foreground)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-muted-foreground)" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* Faint baseline */}
      <line
        x1={padX}
        x2={w - padX}
        y1={padTop + innerH + 0.5}
        y2={padTop + innerH + 0.5}
        stroke="var(--color-border)"
        strokeWidth="1"
      />

      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const x = padX + slot * i + (slot - barW) / 2;
        const y = padTop + (innerH - h);
        const isToday = i === todayIdx;
        const fill = isToday
          ? "url(#lumi-dashboard-week-today)"
          : "url(#lumi-dashboard-week-other)";
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(2, h)}
              rx={6}
              ry={6}
              fill={fill}
            />
            {isToday && (
              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-display)"
                fontStyle="italic"
                className="fill-foreground"
                style={{ fontFeatureSettings: '"tnum","lnum"' }}
              >
                {formatMoney(d.value, currency)}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={padTop + innerH + 16}
              textAnchor="middle"
              fontSize="9"
              fontWeight={isToday ? 700 : 500}
              className={isToday ? "fill-foreground" : "fill-muted-foreground"}
              fontFamily="var(--font-sans)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const Icon = CATEGORY_ICONS[t.categoryId];
  const tint = CATEGORY_TINT[t.categoryId];
  // Stable formatting: parse the ISO string directly to hh:mm to avoid TZ-driven
  // hydration mismatches. Mock data is local-naive; we treat it as wall-clock.
  const time = t.occurredAt.slice(11, 16);
  const isIncome = t.kind === "income";
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-snug">{t.merchant}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {CATEGORY_LABEL[t.categoryId]} · {time}
        </div>
      </div>
      <MoneyDisplay
        amount={isIncome ? t.amount : -t.amount}
        currency={t.currency}
        size="sm"
        tone={isIncome ? "positive" : "default"}
        showSign={isIncome}
      />
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [currency, setCurrency] = React.useState<Currency>("PEN");
  const { name, hydrated } = useUserName();
  const balance = 4820.1;
  const spent = 2180.4;
  const income = 4200.0;
  // Spend delta vs previous month: negative means we spent LESS (good).
  const spentDelta = -0.08;
  // Income delta vs previous month: positive means earned MORE (good).
  const incomeDelta = 0.12;
  const recent = TRANSACTIONS.slice(0, 5);
  const weekTotal = WEEK_SPEND.reduce((a, d) => a + d.value, 0);

  // Greeting: defaults to "Hola" until hydration completes; then "Hola, {name}"
  // when a name is stored. Avoids a hydration mismatch flicker.
  const greeting = hydrated && name ? `Hola, ${name}` : "Hola";

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-3 md:px-0 md:pt-0">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              abril · 2026
            </div>
            <h1 className="mt-1.5 text-[22px] font-bold leading-tight md:text-3xl">{greeting}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === "PEN" ? "USD" : "PEN"))}
              aria-label={`Cambiar moneda (actualmente ${currency})`}
              aria-pressed={currency === "USD"}
              className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-border bg-card px-4 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true">
                {currency === "PEN" ? "S/" : "$"}
              </span>
              <span className="ml-1 text-muted-foreground font-medium">{currency}</span>
            </button>
            <ThemeToggle />
            <button
              type="button"
              aria-label="Abrir perfil"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <User size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Hero balance */}
        <Card className="relative mx-4 mt-6 overflow-hidden rounded-3xl border-border p-6 md:mx-0 md:mt-8 md:p-10">
          {/* Subtle emerald aurora — anchors brand without screaming. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 80% 0%, oklch(0.72 0.18 162 / 0.10) 0%, transparent 60%)",
            }}
          />
          <div className="relative">
            {/* Primary label — neutral dot keeps hierarchy without screaming brand */}
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-foreground/40"
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
                Disponible · abril
              </span>
            </div>

            {/* Hero amount — dominant element, isolated with generous breathing */}
            <div className="mt-4">
              <MoneyDisplay amount={balance} currency={currency} size="hero" />
            </div>

            {/* KPI row — equal columns, hairline divider, supporting role */}
            <div className="mt-10 grid grid-cols-[1fr_1px_1fr] items-stretch gap-5 md:mt-12 md:gap-8">
              <KpiBlock
                label="Gastado"
                amount={spent}
                currency={currency}
                deltaPct={spentDelta}
                kind="expense"
              />
              <div
                className="bg-border/60"
                aria-hidden="true"
              />
              <KpiBlock
                label="Ingresos"
                amount={income}
                currency={currency}
                deltaPct={incomeDelta}
                kind="income"
              />
            </div>
          </div>
        </Card>

        {/* Desktop grid wrapper: Weekly bars + Donut side by side on md+ */}
        <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6">
          {/* Weekly bars (replaces daily sparkline) */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8">
            <div className="flex items-baseline justify-between pb-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Esta semana
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums">
                  {formatMoney(weekTotal, currency)}{" "}
                  <span className="font-medium text-muted-foreground">en 7 días</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-sm bg-primary"
                  aria-hidden="true"
                />
                hoy
              </div>
            </div>
            <WeeklyBars data={WEEK_SPEND} height={150} currency={currency} />
          </Card>

          {/* Distribución — interactive category bars (replaces legacy donut) */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Distribución
              </div>
              <button
                type="button"
                className="-m-2 inline-flex min-h-11 items-center rounded p-2 text-xs font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver todo →
              </button>
            </div>
            <p className="mb-5 text-[13px] leading-snug text-muted-foreground">
              <span
                className="font-semibold tabular-nums text-foreground"
                style={{ fontFeatureSettings: '"tnum","lnum"' }}
              >
                {formatMoney(spent, currency)}
              </span>{" "}
              gastado en {TOP_CATEGORIES.length} categorías
            </p>
            <CategoryBars items={TOP_CATEGORIES} total={spent} currency={currency} />
          </Card>

          {/* Recent transactions */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-0 md:mx-0 md:mt-0 md:col-span-2">
            <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Últimas transacciones
              </div>
              <button
                type="button"
                className="-m-2 inline-flex min-h-11 items-center rounded p-2 text-xs font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver todas →
              </button>
            </div>
            <div>
              {recent.map((t, i) => (
                <div key={t.id} className={i ? "border-t border-border" : ""}>
                  <TransactionRow t={t} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Camera FAB — mobile only. The TabBar's center "Capturar" handles the
          primary capture; this is the alternative path (snap a receipt photo).
          Sidebar shows the same alternative on desktop, so this hides at md+. */}
      <button
        type="button"
        aria-label="Escanear factura con la cámara"
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-card)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Camera size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
