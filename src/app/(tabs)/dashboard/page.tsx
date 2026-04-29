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
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Plus,
  ArrowLeftRight,
  PieChart,
  BarChart2,
  X,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CURRENCY_LABEL } from "@/lib/money";
import { formatTxDate } from "@/lib/format-tx-date";
import { AppHeader } from "@/components/lumi/AppHeader";
import { CurrencySwitch } from "@/components/lumi/CurrencySwitch";
import { DashboardHero, type Period } from "@/components/lumi/DashboardHero";
import { StatTrendCard } from "@/components/lumi/StatTrendCard";
import { CategoryDonut, type CategoryDonutItem } from "@/components/lumi/CategoryDonut";
import { AdvisorCard } from "@/components/lumi/AdvisorCard";
import { ThemeToggle } from "@/components/lumi/ThemeToggle";
import { ProfileMenu } from "@/components/lumi/ProfileMenu";
import { NotificationsBell } from "@/components/lumi/NotificationsBell";
import { MerchantAvatar } from "@/components/lumi/MerchantAvatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUserName } from "@/lib/use-user-name";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { useTransactionsWindow } from "@/hooks/use-transactions-window";
import { useTransactionsRealtime } from "@/hooks/use-transactions-realtime";
import {
  accountDisplayLabel,
  listAccounts,
  type Account,
} from "@/lib/data/accounts";
import { TX_UPSERTED_EVENT, type TransactionView } from "@/lib/data/transactions";

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
// Used to assign a stable color per category bucket in donut + bar charts.
const CHART_COLOR_LADDER = [
  "var(--color-chart-2)",
  "var(--color-chart-1)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

// ─── Account filter chip ──────────────────────────────────────────────────
// Used by the dashboard's chip strip to scope all numbers to a single
// account. "Todas" is the no-op default; tapping a specific account flips
// the active state and re-derives the entire window via `accountId`.
function AccountChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 px-4 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {label}
    </button>
  );
}

// ─── Component primitives ──────────────────────────────────────────────────
function MoneyDisplay({
  amount,
  currency = "PEN",
  size = "md",
  tone = "default",
  showSign = false,
  className,
}: {
  amount: number;
  currency?: Currency;
  size?: "hero" | "lg" | "md" | "sm";
  tone?: "default" | "positive" | "negative" | "muted";
  showSign?: boolean;
  className?: string;
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
      className={cn(
        "font-semibold tabular-nums leading-none tracking-tight whitespace-nowrap",
        sizeClass,
        toneClass,
        className,
      )}
      style={{ fontFeatureSettings: '"tnum","lnum"' }}
    >
      {sign}
      {formatMoney(Math.abs(amount), currency)}
    </span>
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
  /** Nombre de la cuenta para el badge en mobile (e.g. "Tarjeta BCP", "Yape"). */
  accountName?: string | null;
};

function TransactionRow({ t }: { t: RecentRowItem }) {
  const Icon = CATEGORY_ICONS[t.iconKey];
  const tint = CATEGORY_TINT[t.iconKey];
  const isIncome = t.kind === "income";
  // Mobile parity — income leads with the account name, expense keeps
  // the merchant/category as title. Subtitle is the friendly relative
  // date (Hoy / Ayer / DD MMM) in muted text.
  const title = isIncome ? (t.accountName ?? t.merchant) : t.merchant;
  const subtitle = formatTxDate(t.occurredAt);
  return (
    <div className="flex items-center gap-4 rounded-md px-5 py-4 transition-colors md:py-5 md:hover:bg-muted/40">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tint.bg} ${tint.text}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-snug">
          {title}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {subtitle}
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

// Mobile recent-transaction row — usa MerchantAvatar (iniciales tinted) y
// añade un badge con el nombre de la cuenta (Tarjeta/Cuenta/Yape/etc.). El
// monto sigue las mismas reglas de signo que TransactionRow.
function TransactionRowMobile({ t }: { t: RecentRowItem }) {
  const isIncome = t.kind === "income";
  // Income: title = account name (the user's mental model is "I deposited
  // 270 to BCP Ahorro" — the account is the meaningful label, not the
  // category which is a dim "Ahorro"). Expense: keep merchant/category.
  const title = isIncome ? (t.accountName ?? t.merchant) : t.merchant;
  // Subtitle = friendly date ("Hoy 12:30" / "Ayer 09:15" / "20 Abr 11:10").
  // Subtle muted color carries the timestamp without competing with the
  // amount on the right column.
  const subtitle = formatTxDate(t.occurredAt);
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_88px] items-center gap-2 px-3 py-3.5">
      <MerchantAvatar name={title} size="lg" />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold leading-tight">
          {title}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {subtitle}
        </div>
      </div>
      <div className="text-right">
        <MoneyDisplay
          amount={isIncome ? t.amount : -t.amount}
          currency={t.currency}
          size="sm"
          tone={isIncome ? "positive" : "negative"}
          showSign={isIncome}
          className="text-sm"
        />
      </div>
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
    accountName: t.accountName,
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

// Moved to `@/lib/format-tx-date` so /movements rows share the exact
// same formatting language as the dashboard's "Últimas transacciones".

// ─── Empty-state card ──────────────────────────────────────────────────────
// Rendered when the user has zero transactions in the active-currency 6-month
// window. We use 6-month-empty as a proxy for "no history" — a brand-new
// account will trivially be empty, and an established user who hasn't used
// this currency in 6 months effectively has no recent context to plot. The
// hero + insight banner are also hidden in this branch so the screen has a
// single CTA (no zero-filled "Gastaste hoy/semana/mes" cards competing for
// attention with the "registra tu primero" prompt).
function EmptyDashboardCard({ currency: _currency }: { currency: Currency }) {
  return (
    <Card className="mx-4 mt-4 rounded-2xl border-border bg-[var(--color-card)] p-8 text-center md:mx-0 md:mt-6 md:p-12">
      <div className="mx-auto flex flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.94_0.05_162)] text-primary dark:bg-[oklch(0.30_0.06_162)]">
          <Sparkles size={22} aria-hidden="true" strokeWidth={2.2} />
        </span>
        <h2 className="mt-5 text-[18px] font-bold tracking-tight md:text-[20px]">
          Registra tu primer gasto
        </h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
          Apenas tengamos un movimiento empezamos a armar tu historial:
          evolución, categorías y últimas transacciones.
        </p>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/capture"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Empezar
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


// ─── Desktop tip bar ─────────────────────────────────────────────────────
function DesktopTipBar() {
  const [visible, setVisible] = React.useState(true);
  if (!visible) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3.5 text-[13px] text-foreground">
      <Sparkles size={15} className="shrink-0 text-primary" aria-hidden />
      <p className="flex-1 leading-snug">
        <span className="font-semibold">Tip del día: </span>
        <span className="text-muted-foreground">
          Pequeños gastos diarios pueden convertirse en grandes gastos mensuales. ¡Tú puedes controlarlo!
        </span>
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar tip"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}

// ─── Mobile insight chip ──────────────────────────────────────────────────
function MobileInsightCard({
  spent,
  income,
  currency: _currency,
}: {
  spent: number;
  income: number;
  currency: "PEN" | "USD";
}) {
  if (income <= 0 || spent <= 0) return null;
  const pct = Math.round(((income - spent) / income) * 100);
  if (Math.abs(pct) < 1) return null;
  const isGood = pct > 0;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl p-4",
        isGood
          ? "bg-[oklch(0.95_0.05_162)]"
          : "bg-[oklch(0.96_0.04_30)]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isGood
            ? "bg-[oklch(0.88_0.10_162)] text-[oklch(0.45_0.16_162)]"
            : "bg-[oklch(0.90_0.08_30)] text-[oklch(0.45_0.14_30)]",
        )}
        aria-hidden
      >
        {isGood ? (
          <TrendingUp size={16} strokeWidth={2.4} />
        ) : (
          <TrendingDown size={16} strokeWidth={2.4} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[13.5px] font-semibold leading-tight",
            isGood
              ? "text-[oklch(0.40_0.16_162)]"
              : "text-[oklch(0.45_0.14_30)]",
          )}
        >
          {isGood ? "Vas por buen camino" : "Cuidado con los gastos"}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
          {isGood
            ? `Tus gastos están ${pct}% por debajo de tus ingresos esta semana.`
            : `Tus gastos superan tus ingresos en un ${Math.abs(pct)}% esta semana.`}
        </p>
      </div>
      <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground" aria-hidden />
    </div>
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
  // Account filter — when set, the entire dashboard scopes to a single
  // account. `null` = "Todas las cuentas" (default). The picker only renders
  // when the user has more than one account; with a single account the
  // chip strip would be a no-op.
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountDrawerOpen, setAccountDrawerOpen] = React.useState(false);

  const window = useTransactionsWindow({
    months: 6,
    currency,
    accountId: selectedAccountId,
  });
  useTransactionsRealtime({
    enabled: SUPABASE_ENABLED,
    onEvent: window.refetch,
    debounceMs: 250,
  });

  // Refetch when the dashboard regains visibility / focus. App Router
  // caches client pages, so coming back from /capture via router.push
  // doesn't unmount this page — without this hook the user could be
  // staring at the pre-insert numbers until the realtime broadcast
  // arrives (often 500-1500ms). This fires synchronously on tab focus
  // and on bfcache restore too. See bugfix: insight banner stuck after
  // a fresh expense.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    const refetch = window.refetch;
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    globalThis.addEventListener("focus", refetch);
    globalThis.addEventListener("pageshow", refetch);
    // App Router caches client pages, so `/capture` → `/dashboard` doesn't
    // remount this page. Realtime alone has 500-1500ms latency and
    // `router.refresh()` only invalidates server data. Listening to a
    // synchronous in-app event guarantees the saldo card + per-account card
    // refresh the moment a write ACKs in the same tab.
    globalThis.addEventListener(TX_UPSERTED_EVENT, refetch);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      globalThis.removeEventListener("focus", refetch);
      globalThis.removeEventListener("pageshow", refetch);
      globalThis.removeEventListener(TX_UPSERTED_EVENT, refetch);
    };
  }, [window.refetch]);

  // Account list — feeds the account-filter chip strip. Fetched once on mount.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAccounts();
        if (!cancelled) setAccounts(list);
      } catch {
        // Non-fatal — chip strip simply won't render without accounts.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Order accounts by "most recently used" — `window.rows` is DESC by
  // occurredAt, so the first time we see an `accountId` is also its latest
  // tx. Accounts with no tx in the visible window keep their server
  // (created_at) order at the tail. Drives both the chip strip and the
  // "Ver todos" sheet so a fresh recharge surfaces immediately at the head
  // without needing a separate persisted MRU.
  const orderedAccounts = React.useMemo(() => {
    if (accounts.length === 0) return accounts;
    const seenAt = new Map<string, number>();
    window.rows.forEach((r, idx) => {
      if (!seenAt.has(r.accountId)) seenAt.set(r.accountId, idx);
    });
    return [...accounts].sort((a, b) => {
      const ai = seenAt.get(a.id);
      const bi = seenAt.get(b.id);
      if (ai === undefined && bi === undefined) return 0;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
  }, [accounts, window.rows]);

  // Seed the account filter to the most-recently-used account once we have
  // a list — matches the user's expectation after capturing a recharge
  // ("the account I just used should be selected"). Subsequent re-renders
  // are no-ops because selectedAccountId is no longer null.
  React.useEffect(() => {
    if (selectedAccountId !== null) return;
    if (orderedAccounts.length === 0) return;
    setSelectedAccountId(orderedAccounts[0].id);
  }, [orderedAccounts, selectedAccountId]);

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
      // Demo: alternamos accountName entre los métodos comunes para que
      // el badge de cuenta se vea bonito sin Supabase.
      const DEMO_ACCOUNT_LABELS = ["Tarjeta", "Cuenta", "Yape", "Tarjeta", "Yape"];
      return DEMO_TRANSACTIONS.slice(0, 5).map((t, i) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        kind: t.kind,
        iconKey: t.categoryId,
        categoryLabel: CATEGORY_LABEL[t.categoryId],
        merchant: t.merchant,
        occurredAt: t.occurredAt,
        accountName: DEMO_ACCOUNT_LABELS[i % DEMO_ACCOUNT_LABELS.length],
      }));
    }
    return window.recentTransactions.map(viewToRecent);
  }, [isDemo, window.recentTransactions]);

  // ── Mobile hero — period selector + saldo actual ──────────────────────
  // El hero muestra: gasto del período + saldo actual (= ingreso − gasto).
  // Sin presupuestos derivados — eso vivía antes y producía números
  // confusos (e.g. "te quedan S/ 6.67" cuando había S/ 200 de ingreso al
  // dividirlo entre 30 días). Saldo es la métrica honesta del estado.
  // Period is locked to "month" — the today/week pills were dropping users
  // onto an empty Saldo (no movements today / this week) which felt broken.
  // The hero now always reflects the current month total. setPeriod is kept
  // for the DashboardHero prop signature but never invoked.
  const [period, setPeriod] = React.useState<Period>("month");

  const heroNumbers = React.useMemo(() => {
    const now = new Date();

    // Today key (YYYY-MM-DD).
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Week start = Monday 00:00 of the current week.
    const day = now.getDay();
    const offsetToMon = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - offsetToMon);
    monday.setHours(0, 0, 0, 0);
    const weekStartKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    const rows = isDemo
      ? DEMO_TRANSACTIONS.map((t) => ({
          kind: t.kind,
          amount: t.amount,
          occurredAt: t.occurredAt,
        }))
      : window.filteredRows.map((t) => ({
          kind: t.kind,
          amount: t.amount,
          occurredAt: t.occurredAt,
        }));

    let spentToday = 0;
    let incomeToday = 0;
    let spentWeek = 0;
    let incomeWeek = 0;
    for (const t of rows) {
      const dateKey = t.occurredAt.slice(0, 10);
      const inToday = dateKey === todayKey;
      const inWeek = dateKey >= weekStartKey && dateKey <= todayKey;
      if (t.kind === "expense") {
        if (inToday) spentToday += t.amount;
        if (inWeek) spentWeek += t.amount;
      } else {
        if (inToday) incomeToday += t.amount;
        if (inWeek) incomeWeek += t.amount;
      }
    }

    const result = (() => {
      if (period === "today") {
        return { spent: spentToday, saldo: incomeToday - spentToday };
      }
      if (period === "week") {
        return { spent: spentWeek, saldo: incomeWeek - spentWeek };
      }
      // Month: use the closure-scoped totals from the hook.
      return { spent, saldo: income - spent };
    })();
    // Expose the weekly totals separately so the insight chip (whose copy
    // says "esta semana") can use them regardless of the active period.
    return { ...result, spentWeek, incomeWeek };
  }, [period, income, spent, isDemo, window.filteredRows]);

  // Date range pill label que acompaña al saludo en mobile.
  // Para semanas que cruzan meses ("27 abr - 3 may, 2026") incluimos los
  // dos abreviados; para semanas dentro del mismo mes el formato compacto
  // ("27 - 3 abril, 2026") se conserva.
  const dateRangeLabel = React.useMemo(() => {
    const now = new Date();
    const longMonth = (d: Date) => {
      const m = d.toLocaleDateString("es", { month: "long" });
      return m.charAt(0).toUpperCase() + m.slice(1);
    };
    const shortMonth = (d: Date) => {
      // "abr." → "Abr"; we strip the trailing period so the label looks
      // calmer and stays consistent with the long form.
      const m = d.toLocaleDateString("es", { month: "short" }).replace(".", "");
      return m.charAt(0).toUpperCase() + m.slice(1);
    };
    if (period === "today") {
      return `${now.getDate()} ${longMonth(now)}, ${now.getFullYear()}`;
    }
    if (period === "month") {
      return `${longMonth(now)} ${now.getFullYear()}`;
    }
    // Week: Monday..Sunday of the current week.
    const day = now.getDay();
    const offsetToMon = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - offsetToMon);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    if (monday.getMonth() === sunday.getMonth()) {
      return `${monday.getDate()} - ${sunday.getDate()} ${longMonth(monday)}, ${monday.getFullYear()}`;
    }
    // Cross-month week (e.g. 27 abr - 3 may, 2026).
    const yearLabel =
      monday.getFullYear() === sunday.getFullYear()
        ? `, ${monday.getFullYear()}`
        : `, ${monday.getFullYear()} / ${sunday.getFullYear()}`;
    return `${monday.getDate()} ${shortMonth(monday)} - ${sunday.getDate()} ${shortMonth(sunday)}${yearLabel}`;
  }, [period]);

  // Series para los sparklines de StatTrendCard — 6 meses de monthTotals.
  const expenseSeries = React.useMemo(() => {
    if (isDemo) return [40, 95, 30, 110, 50, 100, 25, 90, 60, 105, 35, 80];
    return window.monthTotals.map((b) => b.spent);
  }, [isDemo, window.monthTotals]);

  const incomeSeries = React.useMemo(() => {
    if (isDemo) return [60, 35, 75, 40, 70, 45, 80, 38, 72, 42, 68, 50];
    return window.monthTotals.map((b) => b.income);
  }, [isDemo, window.monthTotals]);

  // CategoryDonut items — top 5 del mes actual, palette del color ladder.
  const donutItems: CategoryDonutItem[] = React.useMemo(() => {
    const source = isDemo
      ? DEMO_TOP_CATEGORIES.map((c) => ({
          id: c.id,
          name: c.label,
          value: c.value,
          amount: (c.value / 100) * spent,
        }))
      : window.byCategoryCurrentMonth.slice(0, 5).map((b) => ({
          id: b.categoryId ?? "__uncat__",
          name: b.categoryName,
          value: b.value,
          amount: b.amount,
        }));
    return source.slice(0, 5).map((c, i) => ({
      id: c.id,
      label: c.name,
      value: c.value,
      amount: c.amount,
      color: CHART_COLOR_LADDER[i % CHART_COLOR_LADDER.length],
    }));
  }, [isDemo, spent, window.byCategoryCurrentMonth]);

  // Empty: no rows for the active currency in the entire window. We only
  // show the full-page empty card in this case. If rows exist but the current
  // month is zero we just render the dashboard with zero values + a subtle
  // hint baked into the existing chips (NETO renders +S/0.00 cleanly).
  const isEmpty = !isDemo && !isLoading && !hasError && window.rows.length === 0;

  // Greeting: defaults to "Hola" until hydration completes.
  const greeting = hydrated && name ? `Hola, ${name}` : "Hola";


  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] md:px-12 md:py-10">
        {/* Mobile header — saludo + date range pill + bell decorativo.
            En mobile reemplazamos AppHeader con un layout más rico (Figma),
            donde la fecha es un pill clickeable que cicla los 3 períodos.
            En md+ usamos AppHeader como antes. */}
        <header className="flex items-start justify-between gap-3 px-5 pt-3 pr-4 md:hidden">
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold leading-tight tracking-tight">
              {greeting}
            </h1>
            <span
              className="mt-1 inline-block text-[12px] text-muted-foreground tabular-nums"
              style={{ fontFeatureSettings: '"tnum","lnum"' }}
            >
              {dateRangeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NotificationsBell />
            <ThemeToggle className="h-9 w-9" />
            <ProfileMenu className="h-9 w-9 items-center justify-center" />
          </div>
        </header>

        {/* Desktop header — siempre visible en md+ */}
        <div className="hidden md:block">
          <AppHeader title={greeting} titleStyle="page" />
        </div>

        {isLoading ? (
          <>
            {/* Mobile loading */}
            <div className="md:hidden">
              <HeroSkeleton />
            </div>
            {/* Desktop loading */}
            <div className="hidden md:flex md:flex-col md:gap-5 md:mt-5">
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-5">
                <Skeleton className="h-[280px] rounded-3xl" />
                <Skeleton className="h-[280px] rounded-2xl" />
                <Skeleton className="h-[280px] rounded-2xl" />
              </div>
              <Skeleton className="h-[72px] rounded-2xl" />
              <div className="grid grid-cols-[3fr_2fr] gap-5">
                <Skeleton className="h-[400px] rounded-2xl" />
                <div className="flex flex-col gap-5">
                  <Skeleton className="h-[280px] rounded-2xl" />
                  <Skeleton className="h-[180px] rounded-2xl" />
                </div>
              </div>
            </div>
          </>
        ) : hasError ? (
          <>
            {/* Mobile error */}
            <div className="md:hidden">
              <DashboardErrorCard onRetry={window.refetch} />
            </div>
            {/* Desktop error */}
            <div className="hidden md:flex md:flex-col md:gap-5 md:mt-5">
              <DashboardErrorCard onRetry={window.refetch} />
            </div>
          </>
        ) : (
          <>
            {/* Account filter — chip strip. Renders only when the user has
                multiple accounts. We surface the first 3 chips inline; if
                there are more, a "+N · Ver más" chip opens a drawer with
                the full list, picking one selects it and closes. Each
                card represents an independent account view (the old
                "Todas" chip is gone — the brand badges below carry their
                own identity). */}
            {accounts.length > 1 && (
              <div
                className="mx-4 mt-4 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:mt-6"
                aria-label="Filtrar por cuenta"
              >
                <div className="flex gap-2 w-max pr-1 md:pr-0">
                  {/* Always show the active account first so the user can
                      see what's currently selected even if it's beyond the
                      visible window of 3. Followed by up to 3 others. */}
                  {(() => {
                    const visibleAccounts = (() => {
                      const head = orderedAccounts.slice(0, 3);
                      const active = orderedAccounts.find(
                        (a) => a.id === selectedAccountId,
                      );
                      if (!active || head.some((a) => a.id === active.id)) {
                        return head;
                      }
                      return [active, ...head.slice(0, 2)];
                    })();
                    const remaining = orderedAccounts.length - visibleAccounts.length;
                    return (
                      <>
                        {visibleAccounts.map((account) => (
                          <AccountChip
                            key={account.id}
                            label={accountDisplayLabel(account)}
                            active={selectedAccountId === account.id}
                            onClick={() => setSelectedAccountId(account.id)}
                          />
                        ))}
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => setAccountDrawerOpen(true)}
                            aria-label="Ver todas las cuentas"
                            aria-haspopup="dialog"
                            className={cn(
                              "ml-1 inline-flex h-9 items-center gap-0.5 rounded-sm pl-2 pr-1 text-[12px] font-semibold whitespace-nowrap shrink-0 transition-colors",
                              "text-primary hover:text-primary/80 active:scale-[0.98]",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                          >
                            Ver todos
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Full account picker — opens from the "Ver más" chip when the
                user has more accounts than fit in the inline strip. */}
            <Sheet
              open={accountDrawerOpen}
              onOpenChange={setAccountDrawerOpen}
            >
              <SheetContent
                side="bottom"
                aria-labelledby="dashboard-account-picker-title"
                className="rounded-t-2xl px-4 pb-6 pt-2 md:max-w-md"
              >
                <SheetHeader className="px-1">
                  <SheetTitle
                    id="dashboard-account-picker-title"
                    className="font-sans not-italic font-semibold"
                  >
                    Elige una cuenta
                  </SheetTitle>
                  <SheetDescription>
                    El dashboard se filtra por la cuenta que selecciones.
                  </SheetDescription>
                </SheetHeader>
                <ul className="mt-2 flex flex-col gap-1">
                  {orderedAccounts.map((account) => {
                    const selected = selectedAccountId === account.id;
                    return (
                      <li key={account.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAccountId(account.id);
                            setAccountDrawerOpen(false);
                          }}
                          aria-pressed={selected}
                          className={cn(
                            "flex min-h-12 w-full items-center justify-between rounded-2xl px-3 text-left transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected
                              ? "bg-foreground text-background"
                              : "text-foreground hover:bg-muted",
                          )}
                        >
                          <span className="truncate text-[14px] font-semibold">
                            {accountDisplayLabel(account)}
                          </span>
                          <span
                            className={cn(
                              "ml-3 shrink-0 text-[11px] font-medium tabular-nums",
                              selected
                                ? "text-background/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {CURRENCY_LABEL[account.currency]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </SheetContent>
            </Sheet>

            {/* Mobile hero — verde con presupuesto derivado + period selector + CTA.
                CurrencySwitch va en una fila separada arriba en mobile para no
                competir con los CTAs del hero. */}
            {!isEmpty && (
              <div className="mx-4 mt-4 flex justify-end md:hidden">
                <CurrencySwitch />
              </div>
            )}
            {/* Mobile hero — hidden when the user has zero history in
                the active currency. The empty card below is the single
                CTA in that case (no zero-filled "Gastaste hoy/semana/mes"
                cards competing for attention). */}
            {!isEmpty && (
              <div className="mx-4 mt-4 md:hidden">
                <DashboardHero
                  period={period}
                  onPeriodChange={setPeriod}
                  spent={heroNumbers.spent}
                  saldo={heroNumbers.saldo}
                  currency={currency}
                />
              </div>
            )}

            {isEmpty ? (
              <EmptyDashboardCard currency={currency} />
            ) : (
              <>
                {/* ─── MOBILE LAYOUT ──────────────────────────────────────
                    Stack vertical: insight chip, 2-col stat cards, lista de
                    últimas transacciones flat, donut de distribución,
                    AdvisorCard. */}
                <div className="mx-4 mt-4 flex flex-col gap-4 md:hidden">
                  {/* Insight chip — uses WEEKLY totals because its copy
                      explicitly says "esta semana". Previously it was wired
                      to the monthly `spent`/`income` which produced stale
                      "vas por buen camino" banners after a large fresh
                      expense (a 25k expense barely moves the monthly ratio
                      if income is also monthly). See bugfix April 2026. */}
                  <MobileInsightCard
                    spent={heroNumbers.spentWeek}
                    income={heroNumbers.incomeWeek}
                    currency={currency}
                  />

                  {/* StatTrendCards */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatTrendCard
                      kind="expense"
                      amount={spent}
                      delta={isDemo ? 0.12 : window.spentDeltaVsPrevMonth}
                      comparedTo="el mes anterior"
                      series={expenseSeries}
                      currency={currency}
                    />
                    <StatTrendCard
                      kind="income"
                      amount={income}
                      delta={isDemo ? 0.08 : window.incomeDeltaVsPrevMonth}
                      comparedTo="el mes anterior"
                      series={incomeSeries}
                      currency={currency}
                    />
                  </div>

                  {/* Últimas transacciones */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[15px] font-bold text-foreground">Últimas transacciones</span>
                      <Link
                        href="/movements"
                        className="text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                      >
                        Ver todas
                      </Link>
                    </div>
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                      {recent.length > 0 ? (
                        recent.map((t, i) => (
                          <div key={t.id} className={i ? "border-t border-border/60" : ""}>
                            <TransactionRowMobile t={t} />
                          </div>
                        ))
                      ) : (
                        <div className="px-5 py-5 text-[13px] text-muted-foreground">
                          Sin movimientos este mes.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Distribución de gastos */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[15px] font-bold text-foreground">Distribución de gastos</span>
                      <Link
                        href="/insights"
                        className="text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                      >
                        Ver reporte
                      </Link>
                    </div>
                    <CategoryDonut items={donutItems} currency={currency} variant="full" />
                  </div>

                </div>

                {/* ─── DESKTOP LAYOUT ─────────────────────────────────── */}
                <div className="hidden md:flex md:flex-col md:gap-5 md:mt-5">
                  {/* ROW 1: Hero + StatTrend x2 */}
                  <div className="grid grid-cols-[2fr_1fr_1fr] gap-5 items-stretch">
                    <DashboardHero
                      period={period}
                      onPeriodChange={setPeriod}
                      spent={heroNumbers.spent}
                      saldo={heroNumbers.saldo}
                      currency={currency}
                    />
                    <StatTrendCard
                      kind="expense"
                      amount={spent}
                      delta={isDemo ? 0.12 : window.spentDeltaVsPrevMonth}
                      comparedTo="el mes anterior"
                      series={expenseSeries}
                      currency={currency}
                    />
                    <StatTrendCard
                      kind="income"
                      amount={income}
                      delta={isDemo ? 0.08 : window.incomeDeltaVsPrevMonth}
                      comparedTo="el mes anterior"
                      series={incomeSeries}
                      currency={currency}
                    />
                  </div>

                  {/* ROW 2: Quick actions */}
                  <Card className="rounded-2xl border-border px-6 py-4">
                    <div className="flex items-center justify-around">
                      <button
                        type="button"
                        onClick={() => router.push("/capture")}
                        className="flex flex-col items-center gap-2 group focus-visible:outline-none"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105 group-active:scale-95">
                          <Plus size={22} aria-hidden strokeWidth={2.5} />
                        </span>
                        <span className="text-[12px] font-medium text-foreground">Agregar gasto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/capture")}
                        className="flex flex-col items-center gap-2 group focus-visible:outline-none"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-transform group-hover:scale-105 group-active:scale-95">
                          <TrendingUp size={20} aria-hidden />
                        </span>
                        <span className="text-[12px] font-medium text-foreground">Agregar ingreso</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.info("Transferencias próximamente")}
                        className="flex flex-col items-center gap-2 group focus-visible:outline-none"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-transform group-hover:scale-105 group-active:scale-95">
                          <ArrowLeftRight size={20} aria-hidden />
                        </span>
                        <span className="text-[12px] font-medium text-foreground">Transferir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toast.info("Presupuestos próximamente")}
                        className="flex flex-col items-center gap-2 group focus-visible:outline-none"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-transform group-hover:scale-105 group-active:scale-95">
                          <PieChart size={20} aria-hidden />
                        </span>
                        <span className="text-[12px] font-medium text-foreground">Crear presupuesto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push("/insights")}
                        className="flex flex-col items-center gap-2 group focus-visible:outline-none"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-transform group-hover:scale-105 group-active:scale-95">
                          <BarChart2 size={20} aria-hidden />
                        </span>
                        <span className="text-[12px] font-medium text-foreground">Ver reportes</span>
                      </button>
                    </div>
                  </Card>

                  {/* ROW 3: Transacciones (3fr) + columna derecha (2fr) */}
                  <div className="grid grid-cols-[3fr_2fr] gap-5 items-start">
                    {/* Últimas transacciones — desktop */}
                    <Card className="rounded-2xl border-border p-0">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                        <span className="text-[15px] font-semibold text-foreground">Últimas transacciones</span>
                        <Link
                          href="/movements"
                          className="text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                        >
                          Ver todas
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
                          <div className="px-6 py-5 text-[13px] text-muted-foreground">Sin movimientos este mes.</div>
                        )}
                      </div>
                      <div className="border-t border-border px-6 py-4">
                        <Link
                          href="/movements"
                          className="text-[13px] font-semibold text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          Ver todas las transacciones →
                        </Link>
                      </div>
                    </Card>

                    {/* Columna derecha: Donut + Advisor */}
                    <div className="flex flex-col gap-5">
                      <CategoryDonut
                        variant="full"
                        items={donutItems}
                        currency={currency}
                        periodLabel="Este mes"
                      />
                      <AdvisorCard
                        onTalk={() =>
                          toast.info("El asesor financiero llegará pronto", {
                            description: "Próximamente podrás conversar con tu asistente IA.",
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Tip bar */}
                  <DesktopTipBar />
                </div>

              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}
