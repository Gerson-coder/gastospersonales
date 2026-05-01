/**
 * MobileStatBigCard — the redesigned Gastos / Ingresos card on the mobile
 * dashboard. Replaces the old StatTrendCard sparkline-only pattern with:
 *
 *   1. Header strip — soft-tinted icon bubble + uppercase label + period
 *      selector ("Este mes ⌄").
 *   2. Big amount.
 *   3. Delta line with up/down arrow + colored text vs prior month.
 *   4. Daily mini-chart with axis labels (Y: 0/half/max, X: first/mid/last).
 *      Bars for expense, line+dots for income — matches the user's
 *      reference design.
 *   5. Footer chip — "Categoría principal" / "Fuente principal" with
 *      icon, value, percent, and a chevron suggesting it's tappable.
 *
 * The chart is hand-rolled SVG (no external chart lib): the dataset is
 * already at our fingertips via `useTransactionsWindow.byDayCurrentMonth`,
 * the visual budget is small (one card slot), and a chart lib would pull
 * 30-60kB for what amounts to 30-31 bars or one polyline.
 */

"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type MobileStatBigCardKind = "expense" | "income";

export type MobileStatBigCardFooter = {
  /** Static label e.g. "Categoría principal". */
  label: string;
  /** Highlighted value e.g. "Comida" / "Sueldo". */
  value: string;
  /**
   * Optional percent that renders to the right of the value.
   * `null`/undefined hides it (e.g. "Sin ingresos" footer with no number).
   */
  percent?: number | null;
  /** Lucide-style icon component for the footer bubble. */
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

export type MobileStatBigCardProps = {
  kind: MobileStatBigCardKind;
  amount: number;
  /** Signed fraction vs prior period (+0.12 = up 12%, -0.08 = down 8%). null = no comparable. */
  delta: number | null;
  /** Comparison label — e.g. "mes anterior". */
  comparedTo: string;
  /** Daily values for the current month (length = days in month). */
  daily: number[];
  /** First day of the current month — drives the X-axis labels. */
  monthStart: Date;
  /** Currency code for amount formatting. */
  currency: "PEN" | "USD";
  /** Footer chip data — top category / top source. */
  footer: MobileStatBigCardFooter;
  /** href for the footer chip — defaults to /insights. */
  footerHref?: string;
  className?: string;
};

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

const MONTH_LABELS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Round `n` up to the next "nice" round number for the y-axis. Picks a step
 * that keeps the maxLabel ≤ 1.25× the actual peak so the chart never feels
 * dwarfed but still sits below a clean tick. Falls back to 100 for very
 * tiny series so a flat-zero day doesn't render a 0/0/0 axis.
 */
function niceMax(peak: number): number {
  if (peak <= 0) return 100;
  if (peak < 50) return Math.ceil(peak / 10) * 10;
  if (peak < 200) return Math.ceil(peak / 25) * 25;
  if (peak < 1000) return Math.ceil(peak / 100) * 100;
  if (peak < 10_000) return Math.ceil(peak / 500) * 500;
  if (peak < 100_000) return Math.ceil(peak / 5000) * 5000;
  return Math.ceil(peak / 50_000) * 50_000;
}

/** Format a number for the y-axis label — compact for big numbers. */
function formatYAxisLabel(n: number, currency: "PEN" | "USD"): string {
  const symbol = currency === "USD" ? "$" : "S/";
  if (n === 0) return `${symbol}0`;
  if (n < 1000) return `${symbol}${n}`;
  if (n < 10_000) return `${symbol}${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${symbol}${Math.round(n / 1000)}k`;
  return `${symbol}${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "1 May" style x-axis label. Uses the project's es-PE month abbreviations. */
function formatXAxisLabel(date: Date): string {
  const month = MONTH_LABELS_ES[date.getMonth()];
  return `${date.getDate()} ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

/** Length-tiered class for the big amount so 7-digit values still fit. */
function getAmountSizeClass(text: string): string {
  if (text.length <= 9) return "text-[28px] leading-tight";
  if (text.length <= 12) return "text-[24px] leading-tight";
  if (text.length <= 15) return "text-[20px] leading-tight";
  return "text-[16px] leading-tight";
}

// ─── Chart: bars for expense, line + dots for income ─────────────────────

type ChartProps = {
  daily: number[];
  maxValue: number;
  kind: MobileStatBigCardKind;
  /** Index of "today" within the daily series (0-based). -1 = not today. */
  todayIdx: number;
};

function Chart({ daily, maxValue, kind, todayIdx }: ChartProps) {
  const W = 100; // svg viewbox width (% units, scaled via preserveAspectRatio)
  const H = 40;
  const N = daily.length;

  if (kind === "expense") {
    // Bars. Each day gets a column; barWidth fills 70% of the column,
    // 15% gap on each side. We invert y because SVG origin is top-left.
    const colWidth = W / Math.max(N, 1);
    const barWidth = colWidth * 0.7;
    const barOffset = colWidth * 0.15;

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-full w-full overflow-visible"
        aria-hidden
      >
        {daily.map((value, i) => {
          // Floor at 0.6 for non-zero days so a tiny expense still shows a
          // hairline bar instead of vanishing — gives the chart a sense of
          // density even on quiet days.
          const h =
            value > 0
              ? Math.max((value / maxValue) * H, 0.8)
              : 0;
          const x = i * colWidth + barOffset;
          const y = H - h;
          // Today's bar gets the saturated accent; the rest get a muted
          // version so the eye lands on "where am I right now".
          const isToday = i === todayIdx;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={0.4}
              fill={isToday ? "var(--color-destructive)" : "var(--color-destructive)"}
              fillOpacity={isToday ? 1 : 0.45}
            />
          );
        })}
      </svg>
    );
  }

  // Income: polyline + dots. The dots help the eye anchor on each datapoint
  // even when the line is flat (e.g. zero income most days).
  const points = daily.map((value, i) => {
    const x = (i / Math.max(N - 1, 1)) * W;
    const y = H - (value / maxValue) * H;
    return { x, y };
  });
  const polylinePoints = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-full w-full overflow-visible"
      aria-hidden
    >
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={1.1}
          fill="var(--color-primary)"
          stroke="var(--color-card)"
          strokeWidth={0.6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export function MobileStatBigCard({
  kind,
  amount,
  delta,
  comparedTo,
  daily,
  monthStart,
  currency,
  footer,
  footerHref = "/insights",
  className,
}: MobileStatBigCardProps) {
  const isExpense = kind === "expense";

  // Color tokens — destructive for expense, primary for income. The soft
  // bubble shades pick up the same hue at low chroma so the icon reads as
  // "tinted" rather than "stamped on".
  const accentClass = isExpense ? "text-destructive" : "text-primary";
  const bubbleClass = isExpense
    ? "bg-[oklch(0.94_0.05_30)] text-destructive"
    : "bg-[oklch(0.94_0.05_162)] text-primary";

  // Footer chip soft tone — same family, slightly lighter than the bubble.
  const footerBg = isExpense
    ? "bg-[oklch(0.97_0.025_30)]"
    : "bg-[oklch(0.97_0.025_162)]";
  const footerIconBg = isExpense
    ? "bg-[oklch(0.90_0.06_30)] text-destructive"
    : "bg-[oklch(0.90_0.06_162)] text-primary";

  const HeaderIcon = isExpense ? ArrowDown : ArrowUp;
  const FooterIcon = footer.Icon;

  // Delta semantics — for expense, UP is bad; for income, UP is good.
  let deltaTone: "good" | "bad" | "neutral" = "neutral";
  if (delta !== null && delta !== 0) {
    const wentUp = delta > 0;
    deltaTone = isExpense
      ? wentUp
        ? "bad"
        : "good"
      : wentUp
        ? "good"
        : "bad";
  }
  const DeltaIcon = delta !== null && delta < 0 ? TrendingDown : TrendingUp;
  const deltaClassName =
    deltaTone === "good"
      ? "text-primary"
      : deltaTone === "bad"
        ? "text-destructive"
        : "text-muted-foreground";

  // Amount display. Expense renders with a "−" prefix only when the number
  // is non-zero — a leading "−S/ 0.00" feels broken on an empty period.
  const fmt = React.useMemo(
    () =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    [currency],
  );
  const amountText = React.useMemo(() => {
    const baseText = fmt.format(Math.abs(amount));
    if (!isExpense) return baseText;
    if (amount === 0) return baseText;
    return `−${baseText}`;
  }, [amount, fmt, isExpense]);

  const deltaText = React.useMemo(() => {
    if (delta === null) return "Sin comparable";
    if (delta === 0) return `Igual que el ${comparedTo}`;
    const pct = Math.abs(delta) * 100;
    const pctText = `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
    const sign = delta > 0 ? "+" : "−";
    return `${sign}${pctText} vs. ${comparedTo}`;
  }, [delta, comparedTo]);

  // Chart math — niceMax keeps the y-axis flat across renders unless the
  // data jumps tier. todayIdx highlights the column the user is in.
  const peak = daily.length > 0 ? Math.max(...daily) : 0;
  const yMax = niceMax(peak);
  const yAxisTicks = [yMax, yMax / 2, 0]; // top → bottom for flex-col layout

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === monthStart.getFullYear() &&
    today.getMonth() === monthStart.getMonth();
  const todayIdx = isCurrentMonth ? today.getDate() - 1 : -1;

  // X-axis labels — first/mid/last day of the month.
  const monthYear = monthStart.getFullYear();
  const monthIdx = monthStart.getMonth();
  const lastDay = new Date(monthYear, monthIdx + 1, 0).getDate();
  const firstLabel = formatXAxisLabel(new Date(monthYear, monthIdx, 1));
  const midLabel = formatXAxisLabel(new Date(monthYear, monthIdx, 15));
  const lastLabel = formatXAxisLabel(new Date(monthYear, monthIdx, lastDay));

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4",
        className,
      )}
    >
      {/* HEADER — bubble + label + period selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              bubbleClass,
            )}
            aria-hidden
          >
            <HeaderIcon size={16} strokeWidth={2.4} />
          </span>
          <span
            className={cn(
              "truncate text-[13px] font-bold uppercase tracking-wider",
              accentClass,
            )}
          >
            {isExpense ? "Gastos" : "Ingresos"}
          </span>
        </div>
        {/* Period selector — visual only for now. The chevron signals the
            future "switch period" affordance; tap is a no-op until we wire
            today/week/month switching across the dashboard. */}
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
          aria-label="Cambiar periodo"
        >
          Este mes
          <ChevronDown size={12} aria-hidden />
        </button>
      </div>

      {/* AMOUNT */}
      <div
        className={cn(
          "font-bold tabular-nums tracking-tight text-foreground",
          getAmountSizeClass(amountText),
        )}
        style={TNUM_STYLE}
      >
        {amountText}
      </div>

      {/* DELTA */}
      <div
        className={cn(
          "flex items-center gap-1 text-[12px] font-semibold",
          deltaClassName,
        )}
      >
        {delta !== null && (
          <DeltaIcon size={13} strokeWidth={2.4} aria-hidden />
        )}
        <span className="tabular-nums" style={TNUM_STYLE}>
          {deltaText}
        </span>
      </div>

      {/* CHART — y-axis labels stack on the left, svg fills the rest. */}
      <div className="mt-1 flex h-20 items-stretch gap-1.5">
        <div
          className="flex flex-col justify-between text-right text-[9px] font-medium text-muted-foreground tabular-nums"
          style={TNUM_STYLE}
          aria-hidden
        >
          {yAxisTicks.map((v, i) => (
            <span key={i}>{formatYAxisLabel(v, currency)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <Chart
            daily={daily}
            maxValue={yMax}
            kind={kind}
            todayIdx={todayIdx}
          />
          {/* Bottom rule — sits at the chart baseline so the bars/line
              "rest" on it. Border-bottom would be cleaner but border
              doesn't render at the SVG-relative baseline; absolute element
              decoupled from the SVG keeps it crisp. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border"
          />
        </div>
      </div>

      {/* X-AXIS LABELS */}
      <div
        className="-mt-1 flex justify-between pl-7 text-[9px] font-medium text-muted-foreground tabular-nums"
        style={TNUM_STYLE}
        aria-hidden
      >
        <span>{firstLabel}</span>
        <span>{midLabel}</span>
        <span>{lastLabel}</span>
      </div>

      {/* FOOTER — top category / top source */}
      <a
        href={footerHref}
        className={cn(
          "mt-1 flex items-center gap-2.5 rounded-xl p-2.5",
          footerBg,
          "transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            footerIconBg,
          )}
          aria-hidden
        >
          <FooterIcon size={15} className="shrink-0" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] leading-none text-muted-foreground">
            {footer.label}
          </p>
          <p className="mt-1 truncate text-[13px] font-bold leading-tight text-foreground">
            {footer.value}
          </p>
        </div>
        {typeof footer.percent === "number" && (
          <span
            className={cn(
              "shrink-0 text-[12px] font-bold tabular-nums",
              accentClass,
            )}
            style={TNUM_STYLE}
          >
            {footer.percent}%
          </span>
        )}
        <ChevronRight
          size={14}
          className="shrink-0 text-muted-foreground"
          aria-hidden
        />
      </a>
    </div>
  );
}

export default MobileStatBigCard;
