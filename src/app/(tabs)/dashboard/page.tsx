/**
 * Dashboard route — Lumi
 *
 * Mobile-first; scales to desktop at md+ (2-col) and lg+ (3-col secondary row).
 * All copy in es-PE.
 *
 * Wave 4 wiring (transactions-persistence):
 *   - Reads come from `useTransactionsWindow({ months: 6, currency })` which
 *     fetches the last 6 months in one shot and exposes ~10 derived
 *     aggregations (NETO mensual, deltas, recent, weekly bars, distribución).
 *   - Realtime sync only on this page via `useTransactionsRealtime`,
 *     debounce 250ms (Supabase Pro 200-conn cap — see design #4).
 *   - Currency lever lives in the AppHeader `actionsBefore` slot via
 *     `<CurrencySwitch />`, persisted under `lumi-prefs.currency`.
 *   - Empty state when the active currency has zero rows in the window.
 *   - Demo mode (no Supabase env) keeps the inline mocks so the screen is
 *     still browseable without a backend — mirror of `accounts/page.tsx`.
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
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/lumi/AppHeader";
import { UserAvatarCircle } from "@/components/lumi/UserAvatarCircle";
import { MonthSummaryCard } from "@/components/lumi/MonthSummaryCard";
import { CurrencySwitch } from "@/components/lumi/CurrencySwitch";
import { cn } from "@/lib/utils";
import { useUserName } from "@/lib/use-user-name";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { useTransactionsWindow } from "@/hooks/use-transactions-window";
import { useTransactionsRealtime } from "@/hooks/use-transactions-realtime";
import { listAccounts } from "@/lib/data/accounts";
import type { TransactionView } from "@/lib/data/transactions";

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

// Demo-mode flag — when env vars are absent, fall back to the inline demo
// dataset rather than hitting Supabase. Mirrors the gate used by `useSession`,
// `/accounts`, and `/capture`.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Demo dataset (only used when Supabase env vars are absent) ────────────
// Stable values — no Date.now() / Math.random() in JSX.
type DemoTransaction = {
  id: string;
  amount: number;
  currency: Currency;
  kind: "expense" | "income";
  categoryId: CategoryId;
  merchant: string;
  occurredAt: string;
};

const DEMO_TRANSACTIONS: DemoTransaction[] = [
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

const DEMO_WEEK_SPEND: { label: string; date: string; value: number }[] = [
  { label: "Lun", date: "2026-04-20", value: 28 },
  { label: "Mar", date: "2026-04-21", value: 64 },
  { label: "Mié", date: "2026-04-22", value: 18 },
  { label: "Jue", date: "2026-04-23", value: 92 },
  { label: "Vie", date: "2026-04-24", value: 145 },
  { label: "Sáb", date: "2026-04-25", value: 210 },
  { label: "Dom", date: "2026-04-26", value: 76 },
];

const DEMO_TOP_CATEGORIES = [
  { id: "fun" as CategoryId, label: "Entretenimiento", value: 32 },
  { id: "food" as CategoryId, label: "Comida", value: 22 },
  { id: "transport" as CategoryId, label: "Transporte", value: 16 },
  { id: "market" as CategoryId, label: "Mercado", value: 12 },
  { id: "utilities" as CategoryId, label: "Servicios", value: 10 },
  { id: "other" as CategoryId, label: "Otros", value: 8 },
];

const DEMO_ACCOUNTS_COUNT = 3;

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

// ─── Category color ladder ────────────────────────────────────────────────
// We render a stable, ordered palette regardless of which category is on top.
// The CategoryBars component receives an explicit `color` per item so the
// distribution legend stays consistent across renders.
const CHART_COLOR_LADDER = [
  "var(--color-chart-2)",
  "var(--color-chart-1)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

// ─── Insight helper ───────────────────────────────────────────────────────
// One-sentence smart observation under the hero. Three rotation slots, picked
// DETERMINISTICALLY from the data so SSR and CSR agree.
type InsightDirection = "down" | "up" | "flat";
type Insight = {
  direction: InsightDirection;
  parts: { text: string; emphasis?: boolean }[];
};

function getInsight(
  txCount: number,
  weekData: { label: string; value: number }[],
  topCategoryLabel: string | null,
  topCategoryPct: number | null,
  currency: Currency,
): Insight | null {
  if (txCount === 0 || weekData.length === 0) return null;
  const slot = txCount % 3;
  const weekTotal = weekData.reduce((a, d) => a + d.value, 0);

  if (slot === 0) {
    // Slot 0 — week-over-week change. Mock prior week as +14% of this one.
    if (weekTotal === 0) return null;
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

  if (slot === 1 && topCategoryLabel !== null && topCategoryPct !== null) {
    return {
      direction: "flat",
      parts: [
        { text: "Lo más fuerte fue " },
        { text: topCategoryLabel, emphasis: true },
        { text: " — " },
        { text: `${topCategoryPct}%`, emphasis: true },
        { text: " de lo que gastaste." },
      ],
    };
  }

  // Slot 2 — peak day (or fallback to top category if week is flat).
  const peak = weekData.reduce((m, d) => (d.value > m.value ? d : m), weekData[0]);
  if (peak.value === 0) return null;
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
      { text: `${dayLabel[peak.label] ?? peak.label} fue tu día más fuerte: ` },
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
                className="font-semibold tabular-nums"
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
      className={`font-semibold tabular-nums leading-none tracking-tight whitespace-nowrap ${sizeClass} ${toneClass}`}
      style={{ fontFeatureSettings: '"tnum","lnum"' }}
    >
      {sign}
      {formatMoney(Math.abs(amount), currency)}
    </span>
  );
}

// Interactive category breakdown — replaces the legacy donut. Each row is a
// button (keyboard-native), with an animated proportional bar fill.
type CategoryBarItem = {
  id: string; // categoryId or "__uncat__"
  iconKey: CategoryId; // resolved key into CATEGORY_ICONS / CATEGORY_TINT
  label: string;
  value: number; // percentage share (0-100)
  color: string;
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // Mount-time animation: render bars at width 0, then flip to target.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = (id: string) => {
    setSelectedId((curr) => (curr === id ? null : id));
  };

  return (
    <ul className="flex flex-col gap-1.5" role="list">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const isDimmed = selectedId !== null && !isSelected;
        const Icon = CATEGORY_ICONS[item.iconKey];
        const tint = CATEGORY_TINT[item.iconKey];
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

// Weekly bar chart — last 7 days of spend.
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
      aria-label="Gasto de los últimos 7 días — toca un día para ver el monto"
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
                fontFamily="var(--font-sans)"
                fontWeight={700}
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

// ─── Recent transaction row ───────────────────────────────────────────────
// Accepts a normalized shape so demo + real data converge here.
type RecentRowItem = {
  id: string;
  amount: number;
  currency: Currency;
  kind: "expense" | "income";
  iconKey: CategoryId;
  categoryLabel: string;
  merchant: string;
  occurredAt: string;
};

function TransactionRow({ t }: { t: RecentRowItem }) {
  const Icon = CATEGORY_ICONS[t.iconKey];
  const tint = CATEGORY_TINT[t.iconKey];
  // Stable formatting from the ISO string to avoid TZ-driven hydration mismatches.
  const time = t.occurredAt.slice(11, 16);
  const isIncome = t.kind === "income";
  return (
    <div className="flex items-center gap-4 rounded-md px-5 py-4 transition-colors md:py-5 md:hover:bg-muted/40">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-snug">
          {t.merchant}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t.categoryLabel} · {time}
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

// Map a real TransactionView to the row shape this page renders. We use the
// category name as a heuristic to pick an icon family; everything we don't
// recognize falls back to "other" (Circle). When the merchant is missing we
// degrade to the category label.
function viewToRecent(t: TransactionView): RecentRowItem {
  const iconKey = guessIconKey(t.categoryName);
  const categoryLabel =
    t.categoryName?.trim() ||
    (t.categoryId === null ? "Sin categoría" : "Otros");
  return {
    id: t.id,
    amount: t.amount,
    currency: t.currency,
    kind: t.kind,
    iconKey,
    categoryLabel,
    merchant: t.merchantName?.trim() || categoryLabel,
    occurredAt: t.occurredAt,
  };
}

function guessIconKey(name: string | null | undefined): CategoryId {
  if (!name) return "other";
  const n = name.toLowerCase();
  if (n.includes("comida") || n.includes("restaurant") || n.includes("delivery"))
    return "food";
  if (n.includes("transport") || n.includes("uber") || n.includes("taxi"))
    return "transport";
  if (n.includes("mercado") || n.includes("super")) return "market";
  if (n.includes("salud") || n.includes("farmacia") || n.includes("clínica"))
    return "health";
  if (n.includes("entreten") || n.includes("cine") || n.includes("ocio"))
    return "fun";
  if (n.includes("servicio") || n.includes("luz") || n.includes("agua"))
    return "utilities";
  if (n.includes("hogar") || n.includes("casa") || n.includes("alquiler"))
    return "home";
  if (n.includes("educa") || n.includes("curso") || n.includes("colegio"))
    return "edu";
  if (n.includes("trabajo") || n.includes("sueldo") || n.includes("salario"))
    return "work";
  return "other";
}

// ─── Empty-state card ──────────────────────────────────────────────────────
// Rendered when the user has zero transactions in the active currency window.
// The MonthSummaryCard hero stays visible above (showing zeroes) — that's
// intentional context: "this is where your numbers will live".
function EmptyDashboardCard({ currency }: { currency: Currency }) {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border bg-[var(--color-card)] p-8 text-center md:mx-0 md:mt-6 md:p-12">
      <div className="mx-auto flex flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.94_0.05_162)] text-primary dark:bg-[oklch(0.30_0.06_162)]">
          <Sparkles size={22} aria-hidden="true" strokeWidth={2.2} />
        </span>
        <h2 className="mt-5 text-[18px] font-bold tracking-tight md:text-[20px]">
          Todavía no tienes movimientos en {currency}
        </h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
          Registra un gasto o ingreso para ver aquí tu evolución, tus
          categorías y tus últimas transacciones.
        </p>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/capture"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Registrar el primero
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

// ─── Error card ──────────────────────────────────────────────────────────
function DashboardErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border bg-[var(--color-card)] p-6 md:mx-0 md:mt-6 md:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[oklch(0.94_0.05_30)] text-[oklch(0.45_0.14_30)] dark:bg-[oklch(0.30_0.06_30)] dark:text-[oklch(0.85_0.12_30)]">
          <AlertTriangle size={18} aria-hidden="true" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight">
            No pudimos cargar movimientos
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Revisa tu conexión y vuelve a intentar.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-4 text-[12.5px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reintentar
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────
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
export default function DashboardPage() {
  const router = useRouter();
  const { name, hydrated } = useUserName();
  const { currency } = useActiveCurrency();

  // Real data via the shared 6-month window hook. Returns []/zeroes in demo
  // mode would still call Supabase, so we gate all usage of `window` results
  // behind SUPABASE_ENABLED below — when disabled, we never even mount the
  // realtime subscription and we feed the legacy demo dataset into the UI.
  const window = useTransactionsWindow({ months: 6, currency });
  useTransactionsRealtime({
    enabled: SUPABASE_ENABLED,
    onEvent: window.refetch,
    debounceMs: 250,
  });

  // Account count (real). Lives outside the window hook because the dashboard
  // shows a small "Cuentas activas" tile separate from transactions.
  const [accountsCount, setAccountsCount] = React.useState<number | null>(
    SUPABASE_ENABLED ? null : DEMO_ACCOUNTS_COUNT,
  );
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAccounts();
        if (!cancelled) setAccountsCount(list.length);
      } catch {
        // Non-fatal — keep null and the tile renders a dash placeholder.
        if (!cancelled) setAccountsCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Branch on the data source ──────────────────────────────────────────
  // Demo mode: feed the legacy in-file dataset. Real mode: derive everything
  // from `window`. Both paths produce the same downstream shape.
  const isDemo = !SUPABASE_ENABLED;
  const isLoading = !isDemo && window.loading;
  const hasError = !isDemo && window.error !== null;

  const spent = isDemo
    ? DEMO_TRANSACTIONS.filter((t) => t.kind === "expense").reduce(
        (s, t) => s + t.amount,
        0,
      )
    : window.expenseCurrentMonth;
  const income = isDemo
    ? DEMO_TRANSACTIONS.filter((t) => t.kind === "income").reduce(
        (s, t) => s + t.amount,
        0,
      )
    : window.incomeCurrentMonth;

  // Top categories — real path derives an icon key + color ladder from the
  // bucket index. Demo path keeps the curated palette mapping.
  const topCategories: CategoryBarItem[] = React.useMemo(() => {
    if (isDemo) {
      return DEMO_TOP_CATEGORIES.map((c, i) => ({
        id: c.id,
        iconKey: c.id,
        label: c.label,
        value: c.value,
        color: CHART_COLOR_LADDER[i % CHART_COLOR_LADDER.length],
      }));
    }
    return window.topCategoriesAllWindow.slice(0, 6).map((b, i) => ({
      id: b.categoryId ?? "__uncat__",
      iconKey: guessIconKey(b.categoryName),
      label: b.categoryName,
      value: b.value,
      color: CHART_COLOR_LADDER[i % CHART_COLOR_LADDER.length],
    }));
  }, [isDemo, window.topCategoriesAllWindow]);

  // Last 7 days bars.
  const weekData = React.useMemo(() => {
    if (isDemo) return DEMO_WEEK_SPEND.map((d) => ({ label: d.label, value: d.value }));
    return window.weeklyExpenseBars.map((b) => ({
      label: b.label,
      value: b.amount,
    }));
  }, [isDemo, window.weeklyExpenseBars]);

  // Recent transactions (5 most recent).
  const recent: RecentRowItem[] = React.useMemo(() => {
    if (isDemo) {
      return DEMO_TRANSACTIONS.slice(0, 5).map((t) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        kind: t.kind,
        iconKey: t.categoryId,
        categoryLabel: CATEGORY_LABEL[t.categoryId],
        merchant: t.merchant,
        occurredAt: t.occurredAt,
      }));
    }
    return window.recentTransactions.map(viewToRecent);
  }, [isDemo, window.recentTransactions]);

  const weekTotal = weekData.reduce((a, d) => a + d.value, 0);

  const insight = React.useMemo(() => {
    const top = topCategories[0] ?? null;
    const txCount = isDemo ? DEMO_TRANSACTIONS.length : window.rows.length;
    return getInsight(
      txCount,
      weekData,
      top?.label ?? null,
      top?.value ?? null,
      currency,
    );
  }, [isDemo, window.rows.length, weekData, topCategories, currency]);

  // Empty: no rows for the active currency in the entire window. We only
  // show the full-page empty card in this case. If rows exist but the current
  // month is zero we just render the dashboard with zero values + a subtle
  // hint baked into the existing chips (NETO renders +S/0.00 cleanly).
  const isEmpty = !isDemo && !isLoading && !hasError && window.rows.length === 0;

  // Greeting: defaults to "Hola" until hydration completes.
  const greeting = hydrated && name ? `Hola, ${name}` : "Hola";

  // FAB visibility: hide on loading/empty/error to avoid competing CTAs.
  const showFab = !isLoading && !isEmpty && !hasError;

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* AppHeader — header is now greeting + persistent right cluster only.
            The PEN/USD CurrencySwitch was moved INSIDE the MonthSummaryCard,
            centered between the separator and the Gasto/Ingreso row, where it
            reads as part of the money chrome instead of header noise. */}
        <AppHeader
          title={greeting}
          titleStyle="page"
          avatar={<UserAvatarCircle size="sm" />}
        />

        {isLoading ? (
          <>
            <HeroSkeleton />
            <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              <WeeklyBarsSkeleton />
              <CategoryBarsSkeleton />
              <Card className="mx-4 mt-4 hidden rounded-2xl border-border p-6 md:mx-0 md:mt-0 md:p-8 lg:block">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-8 w-12" />
                <Skeleton className="mt-2 h-3 w-28" />
              </Card>
              <RecentTransactionsSkeleton />
            </div>
          </>
        ) : hasError ? (
          <DashboardErrorCard onRetry={window.refetch} />
        ) : (
          <>
            {/* Hero — vertical "Este mes · abril" summary card. */}
            <MonthSummaryCard
              periodLabel={(() => {
                const now = new Date();
                const month = now.toLocaleDateString("es", { month: "long" });
                return `${month.charAt(0).toUpperCase() + month.slice(1)} ${now.getFullYear()}`;
              })()}
              spent={spent}
              income={income}
              currency={currency}
              currencySwitch={<CurrencySwitch />}
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

            {/* Mini insight chip — only renders with data. */}
            {!isEmpty && insight && <InsightChip insight={insight} />}

            {isEmpty ? (
              <EmptyDashboardCard currency={currency} />
            ) : (
              <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {/* Recent transactions — full-width band on top. */}
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
                    {recent.length > 0 ? (
                      recent.map((t, i) => (
                        <div key={t.id} className={i ? "border-t border-border" : ""}>
                          <TransactionRow t={t} />
                        </div>
                      ))
                    ) : (
                      <div className="px-5 pb-5 pt-2 text-[13px] text-muted-foreground">
                        Sin movimientos este mes.
                      </div>
                    )}
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
                  <div className="mb-5">
                    <div
                      className="text-[20px] font-semibold leading-tight tabular-nums text-foreground"
                      style={{ fontFeatureSettings: '"tnum","lnum"' }}
                    >
                      {formatMoney(spent, currency)}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
                      gastado en {topCategories.length} categorías
                    </p>
                  </div>
                  {topCategories.length > 0 ? (
                    <CategoryBars items={topCategories} total={spent} currency={currency} />
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      Sin gastos para mostrar.
                    </p>
                  )}
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
                  <WeeklyBars data={weekData} height={150} currency={currency} />
                </Card>

                {/* Cuentas mini — lg+ only. */}
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
                        className="font-semibold tabular-nums text-[32px] leading-none tracking-tight"
                        style={{ fontFeatureSettings: '"tnum","lnum"' }}
                      >
                        {accountsCount ?? "—"}
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
      </div>

      {/* Camera FAB — mobile only. */}
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
