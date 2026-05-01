/**
 * AccountCard — wallet-style premium card for a single account.
 *
 * Pure presentation. Receives all data via props; reads its colors from CSS
 * custom properties (`--card-bg-from`, `--card-bg-to`, `--card-accent`) set by
 * the parent so the bank-theme decision lives in one place
 * (`account-card-theme.ts`).
 *
 * Two variants:
 *   - `full`  — used in the carousel. Aspect ratio 1.586:1 (ID-1 credit
 *               card). Shows full numbers, sheen, watermark, eye toggle.
 *   - `mini`  — used in the switcher drawer. Same layout but reduced font
 *               sizes and no sheen animation, so a 4-up grid scans cleanly.
 *
 * Accessibility:
 *   - Container is a `<button type="button">` only when `onClick` is passed
 *     so the user can tap a mini card to switch to it. Otherwise it renders
 *     as a `<div>` (the carousel slide is the actionable element, not the
 *     card itself).
 *   - The amount toggle has `aria-pressed` so screen readers announce the
 *     hide/show state.
 *   - Numbers use `tabular-nums` so the eye-toggle swap doesn't reflow.
 */

"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

export type AccountCardVariant = "full" | "mini";

export type AccountCardProps = {
  bankSlug: string | null;
  /** Wordmark drawn at top-left, e.g. "BBVA", "EFECTIVO". */
  bankLabel: string;
  /** Optional subtype chip drawn at bottom-right ("Sueldo", "Ahorro"...). */
  subtypeLabel?: string | null;
  currency: "PEN" | "USD";
  saldoActual: number;
  gastadoMes: number;
  /** Signed fraction. `null` when there's no prior-month data. */
  deltaPctVsPrevMonth: number | null;
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
 *
 * The 7-digit threshold is calibrated so that any amount that fits cleanly
 * inside the 360px-viewport hero font tier renders verbatim, and only the
 * truly-large values (> 1M) get abbreviated. Below the threshold we still
 * tier-down the font (see `getAmountSizeClass`) so 6-digit amounts don't
 * overflow.
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
 * Pick the saldo font size based on the formatted text length AND variant.
 * Tiers exist because at 360px viewport even a properly-formatted 6-digit
 * amount ("S/ 999,999.99" = 13 chars) overflows the hero's left column.
 *
 * The bumps are aggressive on purpose — text legibility matters more than
 * raw size on a card that's already drawing the eye with color and gradient.
 */
function getSaldoSizeClass(textLength: number, variant: AccountCardVariant): string {
  if (variant === "mini") {
    if (textLength <= 10) return "text-base";
    if (textLength <= 13) return "text-sm";
    return "text-xs";
  }
  // full
  if (textLength <= 10) return "text-[40px] leading-[1.05]";
  if (textLength <= 13) return "text-[34px] leading-[1.05]";
  if (textLength <= 16) return "text-[28px] leading-[1.05]";
  return "text-[24px] leading-[1.1]";
}

function getGastoSizeClass(textLength: number, variant: AccountCardVariant): string {
  if (variant === "mini") return "text-[10px]";
  if (textLength <= 10) return "text-[18px]";
  if (textLength <= 14) return "text-[16px]";
  return "text-[14px]";
}

// ─── Contactless icon ─────────────────────────────────────────────────────
// Lucide doesn't ship a credit-card-grade contactless symbol, so we render
// the canonical 4-arc EMVCo wave inline. Aria-hidden because the bank label
// already conveys the card identity.
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
  gastadoMes,
  deltaPctVsPrevMonth,
  hideAmounts = false,
  onToggleHide,
  variant = "full",
  className,
  onClick,
  style,
  "data-shine": dataShine,
}: AccountCardProps) {
  const isNegative = saldoActual < 0;
  const saldo = formatAdaptiveCurrency(saldoActual, currency);
  const gasto = formatAdaptiveCurrency(gastadoMes, currency);

  // Pre-pend the explicit minus sign so tabular-nums alignment stays clean
  // when the formatter returns a positive-formatted abs value.
  const saldoText = hideAmounts ? "••••••" : `${isNegative ? "− " : ""}${saldo.text}`;
  const gastoText = hideAmounts ? "••••••" : gasto.text;

  const saldoSize = getSaldoSizeClass(saldoText.length, variant);
  const gastoSize = getGastoSizeClass(gastoText.length, variant);

  // Delta pill — only shown when we have a usable prior-month figure. Down is
  // green (less spending = good), up is amber (don't go red — spending more
  // isn't a "failure", just a heads-up).
  const showDelta = deltaPctVsPrevMonth !== null && variant === "full";
  const deltaPct = deltaPctVsPrevMonth ?? 0;
  const deltaIsDown = deltaPct < 0;
  const deltaText = `${deltaIsDown ? "↓" : "↑"} ${Math.round(Math.abs(deltaPct) * 100)}% ${
    deltaIsDown ? "menos" : "más"
  } que el mes anterior`;

  // Container wrapper — when mini + onClick we render as a button so the
  // keyboard / screen reader gets the affordance for free.
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
        "rounded-2xl shadow-[0_10px_30px_-12px_rgba(0,0,0,0.55)]",
        "ring-1 ring-white/10",
        // Aspect ratio 1.586:1 (ID-1) — anchored on width so the card flexes
        // cleanly inside the carousel slide.
        variant === "full" ? "aspect-[1.586]" : "aspect-[1.586]",
        // Padding scales with variant — mini gets less so the grid tile
        // breathes at small sizes.
        variant === "full" ? "p-5" : "p-3",
        // CSS-vars-driven gradient. Default fallback to a neutral graphite
        // so the card never renders white if a parent forgets to set vars.
        "bg-[linear-gradient(135deg,var(--card-bg-from,oklch(0.32_0.02_250))_0%,var(--card-bg-to,oklch(0.18_0.02_250))_100%)]",
        "text-white",
        // Sheen + watermark only animate on the full variant — the mini
        // tiles are static thumbnails.
        variant === "full" && "lumi-account-card--full",
        "transition-transform duration-300 ease-out",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        className,
      )}
    >
      {/* Specular sheen — radial highlight at top-right. Pseudo-element so the
          gradient and the highlight compose without an extra wrapper div.
          mix-blend-mode: overlay keeps the highlight responsive to the
          underlying gradient hue (no hard white wash). */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit]",
          "bg-[radial-gradient(120%_60%_at_85%_-10%,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0)_55%)]",
          "mix-blend-overlay",
        )}
      />

      {/* Watermark logo — bottom-right, low opacity. Only renders when the
          account has a registered brand. Uses a brightness filter so dark
          mono SVGs (which are the majority in /public/logos/banks) read on
          the dark gradient. */}
      {bankSlug && variant === "full" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-8 h-44 w-44 opacity-[0.10]"
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

      {/* Animated shine — a thin diagonal highlight that crosses the card
          on initial mount. Skipped under prefers-reduced-motion via the
          global CSS rule we add in globals.css. */}
      {variant === "full" && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden",
          )}
        >
          <span className="lumi-account-card__shine absolute -inset-y-4 -left-[40%] w-[40%] -skew-x-12 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)]" />
        </span>
      )}

      {/* TOP ROW — bank wordmark + contactless + eye toggle */}
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            "min-w-0 truncate font-bold uppercase tracking-tight text-white",
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
            variant === "full" ? "text-[28px] leading-none" : "text-[15px] leading-none",
          )}
        >
          {bankLabel}
        </span>
        <div className="flex flex-shrink-0 items-center gap-2 text-white/85">
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
            className={variant === "full" ? "h-6 w-6" : "h-3.5 w-3.5"}
          />
        </div>
      </div>

      {/* MID — saldo */}
      <div className={cn("relative", variant === "full" ? "mt-5" : "mt-2")}>
        <p
          className={cn(
            "font-medium text-white/75",
            variant === "full" ? "text-[12px]" : "text-[9px]",
          )}
        >
          Saldo disponible
        </p>
        <p
          className={cn(
            "mt-1 font-bold tabular-nums tracking-tight",
            saldoSize,
            isNegative && !hideAmounts ? "text-red-300" : "text-white",
          )}
          style={{ fontFeatureSettings: '"tnum","lnum"' }}
        >
          {saldoText}
        </p>
      </div>

      {/* DIVIDER */}
      <div
        aria-hidden="true"
        className={cn(
          "relative h-px w-full bg-white/15",
          variant === "full" ? "mt-4" : "mt-2",
        )}
      />

      {/* BOTTOM — gasto del mes + delta pill + subtype */}
      <div
        className={cn(
          "relative flex items-end justify-between gap-2",
          variant === "full" ? "mt-3" : "mt-2",
        )}
      >
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-medium text-white/75",
              variant === "full" ? "text-[11px]" : "text-[9px]",
            )}
          >
            Gastado este mes
          </p>
          <p
            className={cn(
              "mt-0.5 font-semibold tabular-nums tracking-tight text-white",
              gastoSize,
            )}
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {gastoText}
          </p>
          {showDelta && (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                "text-[11px] font-medium",
                "bg-white/15 text-white backdrop-blur-sm",
                "ring-1 ring-white/10",
              )}
            >
              {deltaText}
            </span>
          )}
        </div>
        {subtypeLabel && variant === "full" && (
          <span
            className={cn(
              "flex-shrink-0 rounded-md bg-white/15 px-2 py-1",
              "text-[10px] font-semibold uppercase tracking-wider text-white/90",
              "backdrop-blur-sm ring-1 ring-white/10",
            )}
          >
            {subtypeLabel}
          </span>
        )}
      </div>
    </Container>
  );
}

export default AccountCard;
