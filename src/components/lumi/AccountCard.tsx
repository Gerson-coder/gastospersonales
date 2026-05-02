/**
 * AccountCard — wallet-style premium card for a single account.
 *
 * Layout intentionally mirrors a physical bank card so the user reads it as
 * "this is the BBVA card", not "this is a UI tile for BBVA":
 *
 *   ┌────────────────────────────────┐
 *   │ BBVA            DÉBITO 👁 ))   │  ← top: wordmark + meta strip
 *   │                                │
 *   │ ▢ chip                          │  ← mid: decorative EMV chip
 *   │                                │
 *   │ Saldo disponible               │  ← bottom: saldo only (no gastado)
 *   │ S/ 504.00                      │
 *   └────────────────────────────────┘
 *
 * Pure presentation. Reads colors from CSS custom properties
 * (`--card-bg-from`, `--card-bg-to`, `--card-accent`) set by the parent so
 * the bank-theme decision lives in one place (`account-card-theme.ts`).
 *
 * Two variants:
 *   - `full`  — used in the carousel. Aspect 1.586:1 (ID-1 credit card).
 *   - `mini`  — used in the switcher drawer (smaller padding + typography).
 */

"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

export type AccountCardVariant = "full" | "mini";

export type AccountCardProps = {
  bankSlug: string | null;
  /** Wordmark drawn at top-left, e.g. "BBVA", "MI COLCHÓN". */
  bankLabel: string;
  /** Optional subtype rendered top-right ("Sueldo", "Ahorro", "Débito"...). */
  subtypeLabel?: string | null;
  currency: "PEN" | "USD";
  saldoActual: number;
  /**
   * When true, all monetary values render as "••••••". Controlled by the
   * carousel so the toggle persists across cards.
   */
  hideAmounts?: boolean;
  onToggleHide?: () => void;
  variant?: AccountCardVariant;
  className?: string;
  /** Click handler (mini variant uses this; full ignores it). */
  onClick?: () => void;
  /**
   * Inline style — used by the parent to set CSS custom properties
   * (`--card-bg-from`, `--card-bg-to`, `--card-accent`) per account.
   */
  style?: React.CSSProperties;
  /**
   * Forwarded to the root container so the carousel can replay the shine
   * animation on snap via a `data-shine` toggle.
   */
  "data-shine"?: "true" | undefined;
};

// ─── Number formatting ────────────────────────────────────────────────────

/**
 * Format a positive amount. Switches to compact notation (S/ 1.23M) once the
 * integer portion has 7+ digits, otherwise full digits with 2 decimals.
 */
function formatAdaptiveCurrency(
  amount: number,
  currency: "PEN" | "USD",
): { text: string; isCompact: boolean } {
  const abs = Math.abs(amount);
  const integerDigits = abs >= 1 ? Math.floor(abs).toString().length : 1;
  if (integerDigits >= 7) {
    return {
      text: new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        notation: "compact",
        maximumSignificantDigits: 3,
      }).format(abs),
      isCompact: true,
    };
  }
  return {
    text: new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(abs),
    isCompact: false,
  };
}

/**
 * Saldo font tiers based on text length AND variant. Calibrated so that a
 * worst-case "S/ 999,999.99" (13 chars) still fits inside the 360px-viewport
 * full card without wrapping. Above the compact threshold we'd never get
 * here so the upper tier is the real limit.
 */
function getSaldoSizeClass(textLength: number, variant: AccountCardVariant): string {
  if (variant === "mini") {
    if (textLength <= 10) return "text-base";
    if (textLength <= 13) return "text-sm";
    return "text-xs";
  }
  if (textLength <= 10) return "text-[44px] leading-[1.05]";
  if (textLength <= 13) return "text-[36px] leading-[1.05]";
  if (textLength <= 16) return "text-[30px] leading-[1.05]";
  return "text-[24px] leading-[1.1]";
}

/**
 * Bank-label font tiers — aggressive scale-down so user-typed account names
 * (typically up to ~15 chars per the user spec) still read at premium-card
 * weight without truncating. The tracking-tight on shorter labels lets a
 * 4-char "BBVA" feel beefy without overshooting the card width; longer
 * names drop tracking and grow only as last resort.
 */
function getBankLabelClass(length: number, variant: AccountCardVariant): string {
  if (variant === "mini") {
    if (length <= 6) return "text-[15px] tracking-tight";
    if (length <= 12) return "text-[12px] tracking-tight";
    return "text-[10px]";
  }
  // full
  if (length <= 6) return "text-[32px] leading-none tracking-tight";
  if (length <= 10) return "text-[24px] leading-none tracking-tight";
  if (length <= 15) return "text-[20px] leading-none tracking-tight";
  return "text-[16px] leading-tight";
}

// ─── Decorative SVGs ──────────────────────────────────────────────────────

/**
 * EMV chip — purely decorative, mimics the gold contact pad on a real card.
 * Uses a unique gradient id per render so multiple cards on the same page
 * don't collapse to the same gradient instance (would happen if id was a
 * literal string and React.memo deduped renders).
 */
function ChipIcon({ className }: { className?: string }) {
  // Inline gradient id — generated from useId so every instance is unique.
  const gradId = React.useId();
  const gradHref = `chip-grad-${gradId.replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 38 30"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradHref} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0d68a" />
          <stop offset="50%" stopColor="#c89c3a" />
          <stop offset="100%" stopColor="#8c6a23" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="37"
        height="29"
        rx="4"
        fill={`url(#${gradHref})`}
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="0.5"
      />
      {/* Inner contact pattern. Strokes are slightly translucent so the
          gradient still reads through. */}
      <path
        d="M0.5 8 H37.5 M0.5 15 H37.5 M0.5 22 H37.5 M13 0.5 V29.5 M25 0.5 V29.5"
        stroke="rgba(0,0,0,0.32)"
        strokeWidth="0.6"
      />
      <rect
        x="11"
        y="7"
        width="16"
        height="16"
        rx="0.5"
        stroke="rgba(0,0,0,0.32)"
        strokeWidth="0.5"
        fill="none"
      />
    </svg>
  );
}

/**
 * Contactless wave — canonical 4-arc EMVCo glyph. Lucide's `Wifi` is close
 * but reads as "wifi" not "tap-to-pay"; the inline version sits flush with
 * the card meta strip without rotation hacks.
 */
function ContactlessIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8.5 14.5a5 5 0 0 0 0-5" />
      <path d="M11.5 17.5a9 9 0 0 0 0-11" />
      <path d="M14.5 20.5a13 13 0 0 0 0-17" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export function AccountCard({
  bankSlug,
  bankLabel,
  subtypeLabel,
  currency,
  saldoActual,
  hideAmounts = false,
  onToggleHide,
  variant = "full",
  className,
  onClick,
  style,
  "data-shine": dataShine,
}: AccountCardProps) {
  // Clamp the displayed balance at 0 — a negative saldo on the card is a
  // bug from somewhere upstream (an expense that slipped past the saldo
  // guard, or a window-aggregation drift over long history). The user
  // asked: "por ningun motivo deberia salir el monto rojo de - en el saldo
  // actual dentro de la tarjeta". Showing 0 keeps the surface honest about
  // "you have nothing to spend" without painting an angry negative number
  // on the home screen. The real DB row remains untouched; movements and
  // dashboards can still surface the underlying state if needed.
  const displaySaldo = Math.max(0, saldoActual);
  const saldo = formatAdaptiveCurrency(displaySaldo, currency);

  const saldoText = hideAmounts ? "••••••" : saldo.text;
  const saldoSize = getSaldoSizeClass(saldoText.length, variant);
  const bankLabelClass = getBankLabelClass(bankLabel.length, variant);

  // Container = button when mini+onClick; div otherwise. Mini's onClick lets
  // the user tap a tile in the switcher drawer to swap the active card.
  const Container = (onClick ? "button" : "div") as
    | "button"
    | "div";

  return (
    <Container
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={style}
      data-shine={dataShine}
      className={cn(
        "lumi-account-card group relative flex flex-col overflow-hidden text-left",
        "rounded-2xl shadow-[0_14px_40px_-14px_rgba(0,0,0,0.55)]",
        "ring-1 ring-white/10",
        // Aspect ratio 1.586:1 (ID-1 credit card standard).
        "aspect-[1.586]",
        // Padding scales with variant.
        variant === "full" ? "p-5" : "p-3",
        // CSS-vars-driven gradient; default fallback to graphite.
        "bg-[linear-gradient(135deg,var(--card-bg-from,oklch(0.32_0.02_250))_0%,var(--card-bg-to,oklch(0.18_0.02_250))_100%)]",
        "text-white",
        variant === "full" && "lumi-account-card--full",
        "transition-transform duration-300 ease-out",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        className,
      )}
    >
      {/* Specular sheen — radial highlight at top-right via mix-blend-overlay
          so it picks up the gradient hue rather than baking a hard white. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit]",
          "bg-[radial-gradient(120%_60%_at_85%_-10%,rgba(255,255,255,0.30)_0%,rgba(255,255,255,0)_55%)]",
          "mix-blend-overlay",
        )}
      />

      {/* Watermark logo — bottom-right, low opacity. Only renders when the
          account has a registered brand. brightness(0) invert(1) tints the
          mono SVGs so they read on the dark gradient. */}
      {bankSlug && variant === "full" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -bottom-10 h-52 w-52 opacity-[0.10]"
          style={{ filter: "brightness(0) invert(1)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs in /public */}
          <img
            src={`/logos/banks/${bankSlug}.svg`}
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
      )}

      {/* Animated diagonal shine — on mount + on snap (carousel toggles
          data-shine to replay). Disabled under prefers-reduced-motion via
          the global rule in globals.css. */}
      {variant === "full" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden"
        >
          <span className="lumi-account-card__shine absolute -inset-y-4 -left-[40%] w-[40%] -skew-x-12 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)]" />
        </span>
      )}

      {/* TOP ROW — wordmark left, meta strip right (subtype + eye + NFC) */}
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            "min-w-0 truncate font-bold uppercase text-white",
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
            bankLabelClass,
          )}
        >
          {bankLabel}
        </span>
        <div
          className={cn(
            "flex flex-shrink-0 items-center text-white/85",
            variant === "full" ? "gap-2.5" : "gap-1",
          )}
        >
          {subtypeLabel && (
            <span
              className={cn(
                "font-semibold uppercase tracking-wider text-white/85",
                variant === "full" ? "text-[11px]" : "text-[8px]",
              )}
            >
              {subtypeLabel}
            </span>
          )}
          {variant === "full" && onToggleHide && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleHide();
              }}
              aria-label={hideAmounts ? "Mostrar saldo" : "Ocultar saldo"}
              aria-pressed={hideAmounts}
              className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
          <ContactlessIcon
            className={variant === "full" ? "h-5 w-5" : "h-3.5 w-3.5"}
          />
        </div>
      </div>

      {/* MID — decorative chip */}
      {variant === "full" ? (
        <ChipIcon className="relative mt-4 h-9 w-12" />
      ) : (
        <ChipIcon className="relative mt-1.5 h-4 w-5" />
      )}

      {/* SPACER — pushes the saldo block to the bottom */}
      <div aria-hidden="true" className="flex-1" />

      {/* BOTTOM — saldo only (gastado section removed per design feedback) */}
      <div className="relative">
        <p
          className={cn(
            "font-medium text-white/75",
            variant === "full" ? "text-[12px]" : "text-[8px]",
          )}
        >
          Saldo disponible
        </p>
        <p
          className={cn(
            "mt-1 font-bold tabular-nums tracking-tight text-white",
            saldoSize,
          )}
          style={{ fontFeatureSettings: '"tnum","lnum"' }}
        >
          {saldoText}
        </p>
      </div>
    </Container>
  );
}

export default AccountCard;
