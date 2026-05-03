/**
 * Money utilities for Kane.
 *
 * Internal representation: amount_minor (bigint or number) — the smallest
 * currency unit (centavos for PEN/USD).
 * Display: localized via Intl.NumberFormat in es-PE.
 */

export type Currency = "PEN" | "USD";

/**
 * Friendly UI labels for each currency. The code ("PEN" / "USD") is the
 * canonical DB / API value; "Soles" / "Dólares" is what the user sees in
 * pickers, account rows and the currency switch — Spanish-PE feels
 * native, technical codes felt like translated stock-tickers.
 */
export const CURRENCY_LABEL: Record<Currency, string> = {
  PEN: "Soles",
  USD: "Dólares",
};

/** Format a minor-units amount as a localized currency string. */
export function formatMoney(
  amountMinor: bigint | number,
  currency: Currency = "PEN",
  locale: string = "es-PE",
): string {
  const major =
    typeof amountMinor === "bigint"
      ? Number(amountMinor) / 100
      : amountMinor / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(major);
}

/** Format with explicit sign — useful in lists where + and − must align. */
export function formatMoneySigned(
  amountMinor: bigint | number,
  currency: Currency = "PEN",
  kind: "expense" | "income",
  locale: string = "es-PE",
): string {
  const sign = kind === "expense" ? "−" : "+";
  return `${sign} ${formatMoney(amountMinor, currency, locale)}`;
}

/**
 * Parse a user-typed string ("12.50", "12,50", "S/ 12.50") into minor units.
 * Returns 0 on parse failure. Best-effort — input validation is the caller's
 * responsibility (e.g. via zod at the form boundary).
 */
export function parseMoneyToMinor(input: string): bigint {
  if (!input) return 0n;
  // Strip currency symbols, whitespace, NBSP.
  const cleaned = input.replace(/[^\d,.-]/g, "").trim();
  // Normalize comma to dot (es-PE uses comma as decimal sometimes).
  const normalized = cleaned.replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return 0n;
  // Round half-up to avoid floating drift.
  const minor = Math.round(n * 100);
  return BigInt(minor);
}

/** Convert a major-unit number ("12.5" → 1250n) to minor units. */
export function toMinor(major: number): bigint {
  return BigInt(Math.round(major * 100));
}

/** Convert minor units back to major-unit number for math (precision aware). */
export function toMajor(minor: bigint | number): number {
  return typeof minor === "bigint" ? Number(minor) / 100 : minor / 100;
}

/**
 * Picks a Tailwind size class for a money display based on the formatted
 * string length. Per-transaction is capped at 999,999.99 (MAX_TRANSACTION_AMOUNT)
 * but aggregates (saldo, totals) can grow unbounded, so the UI must shrink
 * gracefully when numbers get wider. Predictable JS-driven breakpoints
 * (no clamp() guesswork — the size only depends on the actual content).
 *
 * Two scales:
 *   - "hero": for the centerpiece Saldo number.
 *   - "secondary": for sibling numbers like Gasto/Ingreso under the saldo.
 *
 * Length thresholds reference the "es-PE" PEN format ("S/ 12,345.67"):
 *   ≤ 12 chars  → up to ~99,999.99            → biggest tier
 *   ≤ 15 chars  → up to ~999,999.99           → tier-2
 *   ≤ 18 chars  → up to ~99,999,999.99 (~100M) → tier-3
 *   > 18 chars  → extreme (multi-100M / B+)    → smallest tier
 */
export type MoneyDisplayScale = "hero" | "secondary";

const HERO_SIZES = [
  "text-5xl md:text-6xl", // ≤12
  "text-4xl md:text-5xl", // ≤15
  "text-3xl md:text-4xl", // ≤18
  "text-2xl md:text-3xl", // >18
] as const;

const SECONDARY_SIZES = [
  "text-2xl md:text-3xl", // ≤12
  "text-xl md:text-2xl",  // ≤15
  "text-lg md:text-xl",   // ≤18
  "text-base md:text-lg", // >18
] as const;

export function getMoneyDisplaySizeClass(
  amount: number,
  currency: Currency = "PEN",
  scale: MoneyDisplayScale = "hero",
  /** Extra characters that the consumer adds OUTSIDE formatMoney — typically
   *  the "− " prefix when the displayed number is negative. Without this the
   *  helper underestimates the effective width and the bigger tier overflows
   *  the card on narrow mobile (S/.1,228 + "− " = 13 chars but formatted
   *  alone is 11 → would fall into tier 0 incorrectly). */
  extraChars: number = 0,
): string {
  const formatted = formatMoney(Math.abs(amount) * 100, currency);
  const length = formatted.length + extraChars;
  // Thresholds tightened by 2 vs the original (12/15/18) so even unaccounted
  // sign or symbol prefixes still fall into a safe tier on a 320px mobile card.
  const tier = length <= 10 ? 0 : length <= 13 ? 1 : length <= 16 ? 2 : 3;
  return scale === "hero" ? HERO_SIZES[tier] : SECONDARY_SIZES[tier];
}
