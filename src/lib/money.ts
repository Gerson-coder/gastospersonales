/**
 * Money utilities for Lumi.
 *
 * Internal representation: amount_minor (bigint or number) — the smallest
 * currency unit (centavos for PEN/USD).
 * Display: localized via Intl.NumberFormat in es-PE.
 */

export type Currency = "PEN" | "USD";

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
