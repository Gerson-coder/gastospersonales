"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTrendKind = "expense" | "income";

export interface StatTrendCardProps {
  kind: StatTrendKind;
  amount: number;
  /** Signed fraction vs prior period: 0.12 = +12%, -0.08 = -8%. null = sin comparable. */
  delta: number | null;
  /** Comparativo legible: "la semana anterior", "el mes anterior", "ayer" */
  comparedTo: string;
  /** Serie temporal para el sparkline (longitud variable, mín 2 puntos). */
  series: number[];
  currency?: "PEN" | "USD";
  className?: string;
}

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

/**
 * Build a smoothed SVG path from a numeric series.
 * Uses a simple Catmull-Rom-ish smoothing: each segment's control points
 * are placed at the midpoint between adjacent neighbors.
 *
 * viewBox is fixed at 0..100 horizontally, 0..30 vertically (SVG y-down,
 * so we invert the data values).
 */
function buildSparkline(series: number[]): {
  linePath: string;
  areaPath: string;
  isFlat: boolean;
} {
  // Defensive: a single point degrades to a flat line in the middle.
  const points =
    series.length >= 2 ? series : series.length === 1 ? [series[0], series[0]] : [0, 0];

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;

  const W = 100;
  const H = 30;
  const PAD_Y = 3; // keep stroke off the very edge

  // Flat when there's not enough signal: <3 points OR amplitude is <1% of the
  // largest absolute value present. In that case the consumer renders a
  // dotted placeholder line instead of a visually noisy flat curve.
  const isFlat =
    series.length < 3 ||
    range < 0.01 * Math.max(Math.abs(max), Math.abs(min), 1);

  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map((v) => {
    if (range === 0) return H / 2; // all equal → center line
    const norm = (v - min) / range; // 0..1
    return H - PAD_Y - norm * (H - PAD_Y * 2);
  });

  // Smoothed line via midpoint-curve technique.
  let linePath = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 1; i < xs.length; i++) {
    const xPrev = xs[i - 1];
    const yPrev = ys[i - 1];
    const xCurr = xs[i];
    const yCurr = ys[i];
    const cx = (xPrev + xCurr) / 2;
    // Quadratic with control at midpoint X but previous Y → soft S-curve.
    linePath += ` Q ${cx.toFixed(2)} ${yPrev.toFixed(2)} ${cx.toFixed(2)} ${(
      (yPrev + yCurr) /
      2
    ).toFixed(2)} T ${xCurr.toFixed(2)} ${yCurr.toFixed(2)}`;
  }

  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return { linePath, areaPath, isFlat };
}

function getStatAmountClass(amount: number): string {
  if (amount >= 1_000_000) return "text-sm leading-tight";
  if (amount >= 100_000)   return "text-base leading-tight";
  if (amount >= 10_000)    return "text-lg leading-tight";
  if (amount >= 1_000)     return "text-xl leading-tight";
  return "text-2xl leading-tight";
}

export function StatTrendCard({
  kind,
  amount,
  delta,
  comparedTo,
  series,
  currency = "PEN",
  className,
}: StatTrendCardProps) {
  const gradientId = React.useId();

  const isExpense = kind === "expense";
  const label = isExpense ? "Gastos" : "Ingresos";
  const HeaderIcon = isExpense ? ArrowDown : ArrowUp;

  // Color tokens (resolved via Tailwind arbitrary values to stay in oklch system).
  const accentColor = isExpense
    ? "var(--color-destructive)"
    : "var(--color-primary)";
  const headerBubbleBg = isExpense
    ? "oklch(0.94 0.05 30)"
    : "oklch(0.94 0.05 162)";

  // Delta semantics: for expenses, going UP is BAD (red); for income, UP is GOOD (green).
  let deltaTone: "good" | "bad" | "neutral" = "neutral";
  if (delta !== null && delta !== 0) {
    const wentUp = delta > 0;
    if (isExpense) {
      deltaTone = wentUp ? "bad" : "good";
    } else {
      deltaTone = wentUp ? "good" : "bad";
    }
  }

  const DeltaIcon = delta !== null && delta < 0 ? TrendingDown : TrendingUp;

  const deltaClassName =
    deltaTone === "good"
      ? "text-primary"
      : deltaTone === "bad"
        ? "text-destructive"
        : "text-muted-foreground";

  const displayAmount = isExpense ? -Math.abs(amount) : amount;
  const formattedAmount = React.useMemo(
    () =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(displayAmount),
    [displayAmount, currency],
  );

  const deltaText =
    delta === null
      ? "Sin comparable"
      : (() => {
          const pct = Math.abs(delta) * 100;
          const pctText = `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
          if (delta === 0) return `Igual que ${comparedTo}`;
          const direction = delta > 0 ? "más" : "menos";
          return `${pctText} ${direction} que ${comparedTo}`;
        })();

  const { linePath, areaPath, isFlat } = React.useMemo(
    () => buildSparkline(series),
    [series],
  );

  return (
    <Card
      className={cn(
        "min-h-[160px] gap-3 rounded-2xl border-border bg-card p-4 md:p-5",
        className,
      )}
    >
      {/* Header — 2 rows para cards angostas */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full shrink-0"
              style={{ backgroundColor: headerBubbleBg }}
              aria-hidden
            >
              <HeaderIcon
                className="h-4 w-4"
                style={{ color: accentColor }}
                aria-hidden
              />
            </span>
            <span className="text-sm font-medium text-muted-foreground leading-tight">
              {label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground pl-[36px]">
          Este mes
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        </div>
      </div>

      {/* Amount */}
      <div
        className={cn("font-bold tabular-nums text-foreground truncate", getStatAmountClass(amount))}
        style={TNUM_STYLE}
      >
        {formattedAmount}
      </div>

      {/* Delta line */}
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          deltaClassName,
        )}
      >
        {delta !== null && (
          <DeltaIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="tabular-nums" style={TNUM_STYLE}>
          {deltaText}
        </span>
      </div>

      {/* Sparkline */}
      <div className="mt-auto -mx-4">
        <svg
          viewBox="0 0 100 30"
          preserveAspectRatio="none"
          className="block h-[48px] w-full"
          aria-hidden
          role="presentation"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={accentColor}
                stopOpacity={0.18}
              />
              <stop
                offset="100%"
                stopColor={accentColor}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          {isFlat ? (
            <line
              x1="0"
              y1="15"
              x2="100"
              y2="15"
              stroke={accentColor}
              strokeWidth={1}
              strokeOpacity={0.35}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} />
              <path
                d={linePath}
                fill="none"
                stroke={accentColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>
    </Card>
  );
}
