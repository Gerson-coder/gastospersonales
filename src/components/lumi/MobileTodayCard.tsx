/**
 * MobileTodayCard — minimal mobile dashboard card focused on RECENT activity.
 * Replaces MobileStatBigCard's monthly aggregate / chart layout with a much
 * tighter "today recap" design:
 *
 *   ┌──────────────────────┐
 *   │ [↓] Gasto de hoy     │   header — soft bubble + label
 *   │                      │
 *   │ S/ 18.90             │   amount
 *   │ ↗ 5 movimientos      │   subline (count or timestamp)
 *   │ ┌────────────────┐   │
 *   │ │🍴 Restaurante  │   │   preview — last tx
 *   │ │   11:35  S/12.50  │
 *   │ └────────────────┘   │
 *   │ ─────────────────    │
 *   │ Ver todos       >    │   footer link
 *   └──────────────────────┘
 *
 * Pure presentation; the dashboard derives "today total / count / last tx"
 * (expense card) and "last income amount + when + where" (income card).
 *
 * Why not reuse MobileStatBigCard? The previous card carried a chart and
 * monthly delta — useful for trend analysis, noisy for daily check-ins.
 * The user explicitly asked to cut it down to the most-needed signals.
 */

"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type MobileTodayCardKind = "expense" | "income";

/**
 * One-row preview of the latest related transaction. Rendered as a small
 * tinted pill row INSIDE the card. The icon is passed in already-resolved
 * so the dashboard can plug a category-specific icon for expense and a
 * Briefcase / Wallet for income.
 */
export type MobileTodayCardPreview = {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  /** First line — merchant or source name. */
  primary: string;
  /** Second line — relative time (expense) or account label (income). */
  secondary: string;
  amount: number;
  currency: "PEN" | "USD";
};

export type MobileTodayCardProps = {
  kind: MobileTodayCardKind;
  /** Header label — "Gasto de hoy" / "Último ingreso". */
  title: string;
  amount: number;
  currency: "PEN" | "USD";
  /**
   * Subline rendered after the amount. Free-form so each kind picks its
   * own style: expense passes the latest tx's category + timestamp in
   * red via `<ExpenseSubline />`; income passes the most-recent income
   * timestamp in green via `<IncomeSubline />`. Pass `null` when there
   * is nothing to render (e.g. no tx in the period yet).
   */
  subline?: React.ReactNode;
  /** Optional preview row — null when there's no related tx yet. */
  preview?: MobileTodayCardPreview | null;
  /** Empty-state copy when `preview` is null. */
  emptyHint?: string;
  className?: string;
};

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: "PEN" | "USD"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Pick the amount font tier so a 7-digit amount still fits in a 2-col
 * mobile grid cell at 360px viewport. Below 7 digits we keep the tier
 * comfortable and large; above we step down aggressively.
 */
function getAmountSizeClass(text: string): string {
  if (text.length <= 9) return "text-[28px] leading-[1.05]";
  if (text.length <= 12) return "text-[24px] leading-tight";
  if (text.length <= 15) return "text-[20px] leading-tight";
  return "text-[16px] leading-tight";
}

// ─── Component ────────────────────────────────────────────────────────────

export function MobileTodayCard({
  kind,
  title,
  amount,
  currency,
  subline,
  preview,
  emptyHint,
  className,
}: MobileTodayCardProps) {
  const isExpense = kind === "expense";

  // Soft tint tokens — match the family used by MobileInsightCard so the
  // mobile column reads as a coherent palette.
  const bubbleClass = isExpense
    ? "bg-[oklch(0.94_0.05_30)] text-destructive"
    : "bg-[oklch(0.94_0.05_162)] text-primary";

  // Preview row tint — even softer than the bubble. Uses the same hue so
  // the card stays in the same color family without two competing tones.
  const previewBg = isExpense
    ? "bg-[oklch(0.97_0.025_30)]"
    : "bg-[oklch(0.97_0.025_162)]";
  const previewIconBg = isExpense
    ? "bg-[oklch(0.90_0.06_30)] text-destructive"
    : "bg-[oklch(0.90_0.06_162)] text-primary";

  const HeaderIcon = isExpense ? ArrowDown : ArrowUp;
  const PreviewIcon = preview?.Icon ?? null;

  const amountText = formatCurrency(amount, currency);
  const amountSize = getAmountSizeClass(amountText);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4",
        className,
      )}
    >
      {/* HEADER */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            bubbleClass,
          )}
          aria-hidden
        >
          <HeaderIcon size={11} strokeWidth={2.6} />
        </span>
        <span className="truncate text-[13px] font-semibold text-foreground">
          {title}
        </span>
      </div>

      {/* AMOUNT */}
      <div
        className={cn(
          "font-bold tabular-nums tracking-tight text-foreground",
          amountSize,
        )}
        style={TNUM_STYLE}
      >
        {amountText}
      </div>

      {/* SUBLINE — count badge / timestamp / etc. Free-form so each card
          can carry its own visual treatment without spilling into props. */}
      {subline && <div>{subline}</div>}

      {/* PREVIEW ROW — last related tx; falls back to empty hint. */}
      {preview && PreviewIcon ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl p-2",
            previewBg,
          )}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              previewIconBg,
            )}
            aria-hidden
          >
            <PreviewIcon size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold leading-tight text-foreground">
              {preview.primary}
            </p>
            <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
              {preview.secondary}
            </p>
          </div>
          <span
            className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground"
            style={TNUM_STYLE}
          >
            {formatCurrency(preview.amount, preview.currency)}
          </span>
        </div>
      ) : (
        emptyHint && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {emptyHint}
          </p>
        )
      )}

    </div>
  );
}

// ─── Subline helpers ──────────────────────────────────────────────────────
// Both helpers render at the SAME font size on purpose — the user asked
// for visual symmetry between the two cards' sublines.

/**
 * Expense subline: latest expense category + relative timestamp, red.
 * Renders nothing when both pieces are missing.
 */
export function ExpenseSubline({
  category,
  timestamp,
}: {
  category: string | null;
  timestamp: string | null;
}) {
  if (!category && !timestamp) return null;
  const text = [category, timestamp].filter(Boolean).join(" · ");
  return (
    <p
      className="text-[11px] font-medium text-destructive tabular-nums truncate"
      style={TNUM_STYLE}
    >
      {text}
    </p>
  );
}

/** Plain timestamp subline used by the income card (green). */
export function IncomeSubline({ text }: { text: string }) {
  return (
    <p
      className="text-[11px] font-medium text-primary tabular-nums truncate"
      style={TNUM_STYLE}
    >
      {text}
    </p>
  );
}

// Legacy alias — kept so other callers don't break in flight. Prefer
// `IncomeSubline` going forward.
export { IncomeSubline as TimestampLine };

export default MobileTodayCard;
