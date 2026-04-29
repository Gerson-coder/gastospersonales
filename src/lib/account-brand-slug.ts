/**
 * Maps an account display label to a kebab-case filename stem for the
 * SVG at `/public/logos/banks/{slug}.svg`. Returns `null` for any label
 * that doesn't have a hand-prepared logo — the UI then falls back to the
 * Lucide kind icon (Wallet / Landmark / CreditCard).
 *
 * Adding a new brand:
 *   1. Drop the SVG at `public/logos/banks/{slug}.svg` (kebab-case).
 *   2. Add the entry below: `bcp: "bcp"` etc. The KEY is the
 *      diacritic-stripped, lowercased, trimmed account label as it
 *      appears in the DB. The VALUE is the filename stem.
 *
 * Designed for accounts, mirroring the merchants/{slug}.svg convention
 * at `src/lib/merchant-avatar.ts` + the `merchants.logo_slug` column.
 */

const DIACRITIC_RE = /[̀-ͯ]/g;

const BRAND_LABEL_TO_SLUG: Record<string, string> = {
  // Banks
  bcp: "bcp",
  interbank: "interbank",
  bbva: "bbva",
  scotiabank: "scotiabank",
  banbif: "banbif",
  pichincha: "pichincha",
  // Wallets / payment brands
  yape: "yape",
  plin: "plin",
};

/**
 * Pure function — safe to call during render. Same input always returns
 * the same slug, no side effects, no async.
 */
export function accountBrandSlug(label: string): string | null {
  const normalized = label
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .trim()
    .toLowerCase();
  return BRAND_LABEL_TO_SLUG[normalized] ?? null;
}
