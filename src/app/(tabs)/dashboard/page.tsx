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
  Plus,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

const MONTH_DAILY = [
  12, 18, 8, 22, 6, 42, 15, 28, 10, 16, 32, 9, 24, 18, 14, 38, 12, 20, 8, 16,
  28, 42, 18, 24,
];

const TOP_CATEGORIES = [
  { id: "fun", label: "Entretenimiento", value: 32, color: "var(--color-chart-2)" },
  { id: "food", label: "Comida", value: 22, color: "var(--color-chart-1)" },
  { id: "transport", label: "Transporte", value: 16, color: "var(--color-chart-3)" },
  { id: "market", label: "Mercado", value: 12, color: "var(--color-chart-4)" },
  { id: "utilities", label: "Servicios", value: 10, color: "var(--color-chart-5)" },
  { id: "other", label: "Otros", value: 8, color: "var(--color-chart-6)" },
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

function DonutChart({
  segments,
  total,
  currency = "PEN",
  size = 180,
}: {
  segments: { id: string; label: string; value: number; color: string }[];
  total: number;
  currency?: Currency;
  size?: number;
}) {
  const r = 15.91549;
  const totalVal = segments.reduce((a, s) => a + s.value, 0);
  // Precompute (dash, offset) per segment without mutating after render.
  const computed = segments.reduce<
    { id: string; color: string; dash: number; offset: number }[]
  >((acc, s) => {
    const dash = (s.value / totalVal) * 100;
    const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash;
    acc.push({ id: s.id, color: s.color, dash, offset });
    return acc;
  }, []);
  return (
    <svg
      viewBox="0 0 42 42"
      width={size}
      height={size}
      role="img"
      aria-label="Distribución por categoría"
    >
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="6" />
      {computed.map((s) => (
        <circle
          key={s.id}
          cx="21"
          cy="21"
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth="6"
          strokeDasharray={`${s.dash} ${100 - s.dash}`}
          strokeDashoffset={-s.offset}
          transform="rotate(-90 21 21)"
          className="transition-[stroke-dasharray] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        />
      ))}
      <text
        x="21"
        y="20.5"
        textAnchor="middle"
        fontSize="6"
        className="fill-foreground"
        fontFamily="var(--font-display)"
        fontStyle="italic"
      >
        {formatMoney(total, currency)}
      </text>
      <text
        x="21"
        y="25"
        textAnchor="middle"
        fontSize="2.5"
        className="fill-muted-foreground"
        fontFamily="var(--font-sans)"
      >
        gastado este mes
      </text>
    </svg>
  );
}

function SparkArea({ points, height = 90 }: { points: number[]; height?: number }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 320;
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(
          height -
          8 -
          ((p - min) / range) * (height - 16)
        ).toFixed(1)}`,
    )
    .join(" ");
  const area = `${path} L ${w} ${height} L 0 ${height} Z`;
  const lastY = (
    height -
    8 -
    ((points[points.length - 1] - min) / range) * (height - 16)
  ).toFixed(1);
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Gasto diario del mes"
    >
      <defs>
        {/* Unique id to avoid collisions with other SVGs on the page */}
        <linearGradient id="lumi-dashboard-spark-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lumi-dashboard-spark-grad)" />
      <path
        d={path}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={w} cy={lastY} r="3" fill="var(--color-primary)" />
    </svg>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const Icon = CATEGORY_ICONS[t.categoryId];
  // Stable formatting: parse the ISO string directly to hh:mm to avoid TZ-driven
  // hydration mismatches. Mock data is local-naive; we treat it as wall-clock.
  const time = t.occurredAt.slice(11, 16);
  const isIncome = t.kind === "income";
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{t.merchant}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
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
  const balance = 4820.1;
  const spent = 2180.4;
  const income = 4200.0;
  const delta = -0.08;
  const recent = TRANSACTIONS.slice(0, 5);

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-3 md:px-0 md:pt-0">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              abril · 2026
            </div>
            <h1 className="mt-1 text-[22px] font-bold md:text-3xl">Hola, Ana</h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === "PEN" ? "USD" : "PEN"))}
              aria-label={`Cambiar moneda (actualmente ${currency})`}
              aria-pressed={currency === "USD"}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card px-4 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true">
                {currency === "PEN" ? "S/" : "$"}
              </span>
              <span className="ml-1 text-muted-foreground font-medium">{currency}</span>
            </button>
            <button
              type="button"
              aria-label="Abrir perfil"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <User size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Hero balance */}
        <Card className="relative mx-4 mt-5 overflow-hidden rounded-3xl border-border p-6 md:mx-0 md:mt-8 md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 80% 0%, oklch(0.72 0.18 162 / 0.10) 0%, transparent 60%)",
            }}
          />
          <div className="relative">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Disponible · abril
            </div>
            <div className="mt-1.5">
              <MoneyDisplay amount={balance} currency={currency} size="hero" />
            </div>
            <div className="mt-4 flex gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Gastado
                </div>
                <div className="mt-1">
                  <MoneyDisplay amount={spent} currency={currency} size="sm" />
                </div>
                <div
                  className={`mt-1 text-[11px] font-semibold ${
                    delta < 0
                      ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
                      : "text-destructive"
                  }`}
                >
                  {delta < 0 ? "↓" : "↑"} {Math.abs(delta * 100).toFixed(0)}% vs marzo
                </div>
              </div>
              <div className="w-px bg-border" aria-hidden="true" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Ingresos
                </div>
                <div className="mt-1">
                  <MoneyDisplay
                    amount={income}
                    currency={currency}
                    size="sm"
                    tone="positive"
                    showSign
                  />
                </div>
                <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
                  1 transacción
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Desktop grid wrapper: Donut + Sparkline side by side on md+ */}
        <div className="md:mt-6 md:grid md:grid-cols-2 md:gap-6">
          {/* Spark area */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-4 md:mx-0 md:mt-0 md:p-6">
            <div className="flex items-baseline justify-between px-1 pb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Día a día
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                24 días · {formatMoney(spent, currency)}
              </div>
            </div>
            <SparkArea points={MONTH_DAILY} height={100} />
            <div className="flex justify-between px-1 pt-1 text-[10px] font-medium text-muted-foreground">
              <span>1</span>
              <span>8</span>
              <span>15</span>
              <span>22</span>
              <span>hoy</span>
            </div>
          </Card>

          {/* Donut */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-5 md:mx-0 md:mt-0 md:p-6 md:max-w-md">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Distribución
              </div>
              <button
                type="button"
                className="min-h-11 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Ver todo
              </button>
            </div>
            <div className="flex items-center gap-5">
              <DonutChart
                segments={TOP_CATEGORIES}
                total={spent}
                currency={currency}
                size={150}
              />
              <div className="flex-1 space-y-1.5 text-xs md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-1.5 md:space-y-0">
                {TOP_CATEGORIES.map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: s.color }}
                        aria-hidden="true"
                      />
                      {s.label}
                    </span>
                    <span className="font-mono font-medium tabular-nums">{s.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Recent transactions */}
          <Card className="mx-4 mt-4 rounded-2xl border-border p-0 md:mx-0 md:mt-0 md:col-span-2">
            <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Últimas transacciones
              </div>
              <button
                type="button"
                className="min-h-11 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Ver todas
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

      {/* FAB cluster — mobile only (sidebar provides desktop primary action) */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Escanear factura con la cámara"
          className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-[18px] z-20 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-card)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Camera size={20} aria-hidden="true" />
        </button>
        <Button
          aria-label="Registrar nuevo movimiento"
          className="fixed bottom-[calc(22px+env(safe-area-inset-bottom))] right-[18px] z-20 h-[60px] rounded-full px-6 text-base font-bold transition-transform active:scale-95"
          style={{ boxShadow: "var(--shadow-fab)" }}
        >
          <Plus size={22} strokeWidth={2.5} className="mr-1" aria-hidden="true" />
          Registrar
        </Button>
      </div>
    </div>
  );
}
