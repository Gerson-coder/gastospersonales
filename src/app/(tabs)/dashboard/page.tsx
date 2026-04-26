// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands
/**
 * Dashboard preview route — Lumi
 *
 * Mobile-first; scales to desktop at md+ (2-col) and lg+ (3-col secondary row).
 * All copy in es-PE.
 *
 * NOTE: Currently a public preview route. When Batch D wires the (protected)
 * group, this file moves there. Data is still mocked — see TRANSACTIONS,
 * WEEK_SPEND, TOP_CATEGORIES below. The dev-only state switcher at the bottom
 * exists to demo empty + loading variants without touching the mocks; it is
 * tree-shaken in production via the literal NODE_ENV check.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
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
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/lumi/AppHeader";
import { MonthSummaryCard } from "@/components/lumi/MonthSummaryCard";
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

// Mock account count — sidebar/Cuentas mini-card. Stable, deterministic.
const ACCOUNTS_COUNT = 3;

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

// ─── Insight helper ───────────────────────────────────────────────────────
// One-sentence smart observation displayed under the hero. Three rotation
// slots, picked DETERMINISTICALLY from the data so SSR and CSR agree (no
// Math.random / Date.now). The "prior week" reconstruction is intentionally
// fake-but-stable: when real data lands, swap the prior-week source and the
// rotation can stay as-is.
type InsightDirection = "down" | "up" | "flat";
type Insight = {
  direction: InsightDirection;
  parts: { text: string; emphasis?: boolean }[];
};

function getInsight(
  txns: Transaction[],
  weekSpend: { label: string; value: number }[],
  currency: Currency,
): Insight | null {
  if (txns.length === 0) return null;
  const slot = txns.length % 3;
  const weekTotal = weekSpend.reduce((a, d) => a + d.value, 0);

  if (slot === 0) {
    // Slot 0 — week-over-week change. Mock prior week as +14% of this one,
    // so this week is ~12% lower. Real impl will compare two real periods.
    const prior = weekTotal * 1.14;
    const pct = Math.round(((prior - weekTotal) / prior) * 100);
    const direction: InsightDirection = pct > 0 ? "down" : pct < 0 ? "up" : "flat";
    return {
      direction,
      parts: [
        { text: "Esta semana gastaste " },
        { text: formatMoney(weekTotal, currency), emphasis: true },
        { text: " — un " },
        { text: `${Math.abs(pct)}% ${pct >= 0 ? "menos" : "más"}`, emphasis: true },
        { text: " que la pasada." },
      ],
    };
  }

  if (slot === 1) {
    // Slot 1 — top category callout.
    const top = TOP_CATEGORIES[0];
    return {
      direction: "flat",
      parts: [
        { text: "Lo más fuerte fue " },
        { text: top.label, emphasis: true },
        { text: " — " },
        { text: `${top.value}%`, emphasis: true },
        { text: " de lo que gastaste." },
      ],
    };
  }

  // Slot 2 — day of highest spend.
  const peak = weekSpend.reduce((m, d) => (d.value > m.value ? d : m), weekSpend[0]);
  const dayLabel: Record<string, string> = {
    Lun: "El lunes",
    Mar: "El martes",
    Mié: "El miércoles",
    Jue: "El jueves",
    Vie: "El viernes",
    Sáb: "El sábado",
    Dom: "El domingo",
  };
  return {
    direction: "flat",
    parts: [
      { text: `${dayLabel[peak.label]} fue tu día más fuerte: ` },
      { text: formatMoney(peak.value, currency), emphasis: true },
      { text: "." },
    ],
  };
}

function InsightChip({ insight }: { insight: Insight }) {
  const Icon =
    insight.direction === "down"
      ? TrendingDown
      : insight.direction === "up"
        ? TrendingUp
        : Sparkles;
  const iconTone =
    insight.direction === "down"
      ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
      : insight.direction === "up"
        ? "text-destructive"
        : "text-primary";

  return (
    <div className="mx-4 mt-4 flex md:mx-0 md:mt-6">
      <div className="inline-flex max-w-fit items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 shadow-[var(--shadow-card)]">
        <Icon
          size={14}
          aria-hidden="true"
          strokeWidth={2.4}
          className={cn("flex-shrink-0", iconTone)}
        />
        <p className="text-[13px] leading-snug text-foreground">
          {insight.parts.map((p, i) =>
            p.emphasis ? (
              <span
                key={i}
                className="font-display italic font-semibold tabular-nums"
                style={{ fontFeatureSettings: '"tnum","lnum"' }}
              >
                {p.text}
              </span>
            ) : (
              <span key={i} className="text-muted-foreground">
                {p.text}
              </span>
            ),
          )}
        </p>
      </div>
    </div>
  );
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
// prior days use a soft muted tint. Each bar is interactive: tap to surface the
// amount above it. Defaults to "today" highlighted; tapping "today" again
// returns the chart to its default state.
//
// Hit area is a transparent slot-wide rect to make tapping forgiving on mobile
// (the visible bar is only ~28px wide; we want the full ~45px slot tappable).
function WeeklyBars({
  data,
  height = 140,
  currency = "PEN",
}: {
  data: { label: string; value: number }[];
  height?: number;
  currency?: Currency;
}) {
  const todayIdx = data.length - 1;
  // null = no selection → today's amount is shown by default.
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);
  const activeIdx = selectedIdx ?? todayIdx;

  const w = 320;
  const padX = 10;
  const padTop = 18;
  const padBottom = 26;
  const innerW = w - padX * 2;
  const innerH = height - padTop - padBottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = innerW / data.length;
  const barW = Math.min(28, slot * 0.55);

  const toggle = (i: number) => {
    setSelectedIdx((curr) => (curr === i ? null : i));
  };

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Gasto de los últimos 7 días — tocá un día para ver el monto"
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
        <linearGradient id="lumi-dashboard-week-selected" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0.50" />
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
        const isActive = i === activeIdx;
        // Selected (non-today) shows a neutral foreground gradient so it's
        // distinct from the brand-emerald "today" highlight.
        const fill = isActive
          ? isToday
            ? "url(#lumi-dashboard-week-today)"
            : "url(#lumi-dashboard-week-selected)"
          : "url(#lumi-dashboard-week-other)";
        return (
          <g
            key={d.label}
            onClick={() => toggle(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(i);
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={`${d.label}: ${formatMoney(d.value, currency)}`}
            style={{ cursor: "pointer" }}
            className="focus:outline-none focus-visible:[&_rect:first-of-type]:fill-foreground/5"
          >
            {/* Transparent hit area covering the full slot — bigger tap target
                than the visible bar. Drawn first so it sits behind the bar. */}
            <rect
              x={padX + slot * i}
              y={padTop}
              width={slot}
              height={innerH + 6}
              fill="transparent"
            />
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(2, h)}
              rx={6}
              ry={6}
              fill={fill}
              style={{ transition: "fill 150ms ease-out" }}
            />
            {isActive && (
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
              fontWeight={isActive ? 700 : 500}
              className={isActive ? "fill-foreground" : "fill-muted-foreground"}
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
    // TODO: wire row tap → /movements/{id} once movement detail route lands.
    <div className="flex items-center gap-4 rounded-md px-5 py-4 transition-colors md:py-5 md:hover:bg-muted/40">
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

// ─── Empty-state card ──────────────────────────────────────────────────────
// Rendered when the user has zero transactions. The MonthSummaryCard hero
// stays visible above (showing zeroes) — that's intentional context: "this is
// where your numbers will live". The FAB is HIDDEN on this state because the
// inline CTAs are the primary path; two competing scan affordances would
// fight for attention.
function EmptyDashboardCard() {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border bg-[var(--color-card)] p-8 text-center md:mx-0 md:mt-6 md:p-12">
      <div className="mx-auto flex flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.94_0.05_162)] text-primary dark:bg-[oklch(0.30_0.06_162)]">
          <Sparkles size={22} aria-hidden="true" strokeWidth={2.2} />
        </span>
        <h2 className="mt-5 text-[18px] font-bold tracking-tight md:text-[20px]">
          Empezá tu primer mes
        </h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
          Registrá un gasto o ingreso para ver acá tu evolución, tus
          categorías y tus últimas transacciones.
        </p>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/capture"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Registrar movimiento
          </Link>
          <Link
            href="/receipt"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Escanear ticket
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────
// Mirrors the populated layout 1:1 so there is zero visual jump on swap.
function HeroSkeleton() {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-6 md:p-10">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-12 w-56 md:h-14 md:w-72" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mx-auto my-6 h-px w-full max-w-xs bg-border md:my-8" />
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex min-h-[64px] flex-col gap-2 rounded-xl px-3.5 py-3"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function WeeklyBarsSkeleton() {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8">
      <div className="flex items-baseline justify-between pb-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="flex h-[150px] items-end justify-between gap-2 px-2 pb-6">
        {[18, 36, 12, 56, 88, 100, 44].map((pct, i) => (
          <Skeleton
            key={i}
            className="w-7 rounded-md"
            style={{ height: `${pct}%` }}
          />
        ))}
      </div>
    </Card>
  );
}

function CategoryBarsSkeleton() {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8">
      <div className="mb-3 flex items-baseline justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mb-5 h-4 w-48" />
      <ul className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex flex-col gap-2 px-2.5 py-1">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3.5 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentTransactionsSkeleton() {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border p-0 md:mx-0 md:mt-0 md:col-span-2 lg:col-span-3">
      <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-4 px-5 py-4 md:py-5",
              i ? "border-t border-border" : "",
            )}
          >
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
const CURRENCY_STORAGE_KEY = "lumi-pref-currency";
const DEFAULT_CURRENCY: Currency = "PEN";

// Three states the dashboard can render. Real data wiring (Batch B/C) will
// drive these from a fetch lifecycle; for now the dev switcher at the bottom
// of the page lets us preview each.
type ViewState = "ready" | "loading" | "empty";

export default function DashboardPage() {
  const [currency, setCurrency] = React.useState<Currency>(DEFAULT_CURRENCY);
  const [currencyHydrated, setCurrencyHydrated] = React.useState(false);
  // Default to "ready" so the production page (with mock data) renders the
  // populated layout. Dev switcher mutates this without touching the mocks.
  const [viewState, setViewState] = React.useState<ViewState>("ready");

  // Hydrate currency from localStorage AFTER mount — never during SSR.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (raw === "PEN" || raw === "USD") setCurrency(raw);
    } catch {
      // Corrupted value or storage disabled — stay on default.
    }
    setCurrencyHydrated(true);
  }, []);

  // Persist currency whenever it changes AFTER hydration. Skipping pre-hydration
  // writes prevents the default from clobbering whatever was on disk.
  React.useEffect(() => {
    if (!currencyHydrated) return;
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    } catch {
      // Quota exceeded or storage disabled — nothing actionable here.
    }
  }, [currency, currencyHydrated]);

  const router = useRouter();
  const { name, hydrated } = useUserName();

  // Effective dataset depends on viewState. "empty" forces zero data through
  // the same rendering pipeline so MonthSummaryCard renders zeroes (which is
  // the intended empty UX — gives the user spatial context).
  // Memoized so downstream useMemo deps stay referentially stable (React
  // Compiler refuses manual memoization with conditional non-memoized deps).
  const transactions = React.useMemo(
    () => (viewState === "empty" ? [] : TRANSACTIONS),
    [viewState],
  );
  const weekSpend = React.useMemo(
    () => (viewState === "empty" ? [] : WEEK_SPEND),
    [viewState],
  );
  const topCategories = React.useMemo(
    () => (viewState === "empty" ? [] : TOP_CATEGORIES),
    [viewState],
  );

  const spent = React.useMemo(
    () =>
      transactions.filter((t) => t.kind === "expense").reduce(
        (s, t) => s + t.amount,
        0,
      ),
    [transactions],
  );
  const income = React.useMemo(
    () =>
      transactions.filter((t) => t.kind === "income").reduce(
        (s, t) => s + t.amount,
        0,
      ),
    [transactions],
  );
  // Mock month-over-month deltas (mirrors values used in Movements). Real
  // values land with Supabase + FX. Convention: fractional, e.g. -0.12 = -12%.
  // On empty state we omit them so MonthSummaryCard hides the chips.
  const spentDelta = viewState === "empty" ? undefined : -0.12;
  const incomeDelta = viewState === "empty" ? undefined : 0.18;
  const recent = transactions.slice(0, 5);
  const weekTotal = weekSpend.reduce((a, d) => a + d.value, 0);
  const insight = React.useMemo(
    () => getInsight(transactions, weekSpend, currency),
    [transactions, weekSpend, currency],
  );

  // Greeting: defaults to "Hola" until hydration completes; then "Hola, {name}"
  // when a name is stored. Avoids a hydration mismatch flicker.
  const greeting = hydrated && name ? `Hola, ${name}` : "Hola";

  const isLoading = viewState === "loading";
  const isEmpty = viewState === "empty";
  // FAB visibility: keep it on the populated state (it's the quick scan path
  // alongside TabBar's center "Capturar"). HIDE on empty (inline CTAs already
  // surface scan), HIDE during loading (no point on a skeleton).
  const showFab = !isLoading && !isEmpty;

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* Header — render even during loading; the greeting handles its own
            hydration via useUserName. */}
        <AppHeader
          eyebrow="abril · 2026"
          title={greeting}
          titleStyle="page"
        />

        {isLoading ? (
          <>
            <HeroSkeleton />
            <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              <WeeklyBarsSkeleton />
              <CategoryBarsSkeleton />
              {/* Cuentas mini — lg+ only. Hidden below to mirror live layout. */}
              <Card className="mx-4 mt-4 hidden rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8 lg:block">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-8 w-12" />
                <Skeleton className="mt-2 h-3 w-28" />
              </Card>
              <RecentTransactionsSkeleton />
            </div>
          </>
        ) : (
          <>
            {/* Hero — vertical "Este mes · abril" summary card. Tapping a KPI
                cell navigates to /movements with the matching filter
                pre-applied (Movements reads ?filter= from the URL on mount).
                Dashboard does not track filter state, so we omit `filter`
                and just route. */}
            <MonthSummaryCard
              eyebrow="Este mes · abril"
              comparison="comparado con marzo"
              spent={spent}
              income={income}
              currency={currency}
              spentDelta={spentDelta}
              incomeDelta={incomeDelta}
              onCurrencyToggle={() => setCurrency((c) => (c === "PEN" ? "USD" : "PEN"))}
              onFilterChange={(next) => {
                if (next === "all") {
                  router.push("/movements");
                } else if (next === "expense") {
                  router.push("/movements?filter=gastos");
                } else {
                  router.push("/movements?filter=ingresos");
                }
              }}
            />

            {/* Mini insight chip — hidden on empty; only renders with data. */}
            {!isEmpty && insight && <InsightChip insight={insight} />}

            {isEmpty ? (
              <EmptyDashboardCard />
            ) : (
              // Desktop grid: 2 cols at md+, 3 cols at lg+.
              // The lg 3-col adds a small "Cuentas" mini-card alongside
              // Weekly + Distribución — gives a quick at-a-glance entry point
              // to the accounts tab without leaving the dashboard density
              // unchanged on tablet/mid widths. Recent transactions still
              // spans the full row below.
              <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {/* Recent transactions — moved to the top per user request:
                    the most actionable surface (last 5 movements) reads first;
                    aggregates (Distribución, Esta semana) follow. Spans full
                    grid row on md AND lg so it acts as a hero band above the
                    secondary cards. */}
                <Card className="mx-4 mt-4 rounded-2xl border-border p-0 md:mx-0 md:mt-0 md:col-span-2 lg:col-span-3 lg:order-1">
                  <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Últimas transacciones
                    </div>
                    <Link
                      href="/movements"
                      className="-m-2 inline-flex min-h-11 items-center rounded p-2 text-xs font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver todas →
                    </Link>
                  </div>
                  <div>
                    {recent.map((t, i) => (
                      <div key={t.id} className={i ? "border-t border-border" : ""}>
                        <TransactionRow t={t} />
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Distribución — interactive category bars */}
                <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8 lg:order-2">
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Distribución
                    </div>
                    <Link
                      href="/insights"
                      className="-m-2 inline-flex min-h-11 items-center rounded p-2 text-xs font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver todo →
                    </Link>
                  </div>
                  <p className="mb-5 text-[13px] leading-snug text-muted-foreground">
                    <span
                      className="font-semibold tabular-nums text-foreground"
                      style={{ fontFeatureSettings: '"tnum","lnum"' }}
                    >
                      {formatMoney(spent, currency)}
                    </span>{" "}
                    gastado en {topCategories.length} categorías
                  </p>
                  <CategoryBars items={topCategories} total={spent} currency={currency} />
                </Card>

                {/* Weekly bars */}
                <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8 lg:order-3">
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
                  <WeeklyBars data={weekSpend} height={150} currency={currency} />
                </Card>

                {/* Distribución — interactive category bars */}
                <Card className="mx-4 mt-4 rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8">
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Distribución
                    </div>
                    <Link
                      href="/insights"
                      className="-m-2 inline-flex min-h-11 items-center rounded p-2 text-xs font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver todo →
                    </Link>
                  </div>
                  <p className="mb-5 text-[13px] leading-snug text-muted-foreground">
                    <span
                      className="font-semibold tabular-nums text-foreground"
                      style={{ fontFeatureSettings: '"tnum","lnum"' }}
                    >
                      {formatMoney(spent, currency)}
                    </span>{" "}
                    gastado en {topCategories.length} categorías
                  </p>
                  <CategoryBars items={topCategories} total={spent} currency={currency} />
                </Card>

                {/* Cuentas mini — lg+ only. Quick at-a-glance count + link.
                    On md (tablet) the 2-col grid keeps the original density;
                    showing this card there would force a 3rd row of 1+1+1
                    that looks unbalanced. */}
                <Card className="mx-4 mt-4 hidden rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8 lg:flex lg:flex-col">
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cuentas
                    </div>
                    <Link
                      href="/accounts"
                      className="-m-2 inline-flex min-h-11 items-center rounded p-2 text-xs font-semibold text-foreground decoration-foreground/40 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Ver cuentas →
                    </Link>
                  </div>
                  <div className="flex flex-1 items-center gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[oklch(0.94_0.05_162)] text-primary dark:bg-[oklch(0.30_0.06_162)]">
                      <Wallet size={22} aria-hidden="true" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <div
                        className="font-display italic text-[32px] leading-none tabular-nums tracking-tight"
                        style={{ fontFeatureSettings: '"tnum","lnum"' }}
                      >
                        {ACCOUNTS_COUNT}
                      </div>
                      <div className="mt-1.5 text-[12px] text-muted-foreground">
                        cuentas activas
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}

        {/* Dev-only state switcher — preview affordance for empty/loading
            without touching the mocks. The literal NODE_ENV check is
            tree-shaken in prod by Next.js, so this block (and its handlers)
            disappear from the production bundle. */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mx-4 mt-8 mb-[calc(80px+env(safe-area-inset-bottom))] md:mx-0">
            <Card className="flex flex-col gap-2 rounded-xl border-dashed border-border bg-muted/40 p-3 text-xs">
              <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Dev · estado de la vista
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["ready", "Estado normal"],
                    ["empty", "Estado vacío"],
                    ["loading", "Cargando…"],
                  ] as [ViewState, string][]
                ).map(([state, label]) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => setViewState(state)}
                    aria-pressed={viewState === state}
                    className={cn(
                      "rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors",
                      viewState === state
                        ? "bg-foreground text-background"
                        : "bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Camera FAB — mobile only. The TabBar's center "Capturar" handles the
          primary capture; this is the alternative path (snap a receipt photo).
          Sidebar shows the same alternative on desktop, so this hides at md+.
          Hidden on empty / loading (see showFab). One-shot mount bounce via
          animate-in keeps it from feeling like a generic floating ad. */}
      {showFab && (
        <button
          type="button"
          onClick={() => router.push("/receipt")}
          aria-label="Escanear ticket con la cámara"
          className={cn(
            "fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-20",
            "flex h-12 w-12 items-center justify-center rounded-full",
            "border border-border bg-card text-foreground",
            "shadow-[var(--shadow-card)] ring-2 ring-primary/15",
            "transition-transform active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "animate-in zoom-in-50 duration-300",
            "md:hidden",
          )}
        >
          <Camera size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
