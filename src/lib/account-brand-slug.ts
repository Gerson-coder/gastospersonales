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

/**
 * Brands whose SVG logo is a single-color silhouette with the brand text
 * "punched out" via even-odd fill. On a white/transparent chip the cutout
 * letters end up white-on-white and the logo reads as a solid blob. They
 * NEED a colored chip background to render legibly.
 *
 * Today the only one in `public/logos/banks/` that hits this is Interbank
 * (recolored from the original PNG-traced black silhouette to the brand
 * green in commit 3f8e2fc). If we ever replace it with a proper layered
 * vector source, this list can shrink.
 *
 * Merchants with the same problem (Bembos, Inkafarma, Tambo) live under
 * `public/logos/merchants/` and render inside chips owned by the merchant-
 * avatar pathway, not this one — they have their own visual treatment.
 */
const COLORED_CHIP_BG_SLUGS = new Set<string>(["interbank"]);

/**
 * Returns the chip background class for an account row's icon. Most
 * accounts get a neutral theme-aware background (`bg-background` adapts
 * to light/dark) with a subtle border so the chip still reads as a
 * container. Brands in COLORED_CHIP_BG_SLUGS get a fixed low-chroma
 * tint that survives both modes — the SVG cutouts depend on it.
 *
 * Pure / safe-during-render. Output is a Tailwind class string.
 */
export function accountChipBgClass(label: string): string {
  const slug = accountBrandSlug(label);
  if (slug && COLORED_CHIP_BG_SLUGS.has(slug)) {
    // Same low-chroma green hue 140 the bank-kind tint used to apply
    // across the board — kept as the Interbank exception so its
    // wordmark cutouts stay readable.
    return "bg-[oklch(0.92_0.03_140)] dark:bg-[oklch(0.30_0.06_140)]";
  }
  return "bg-background";
}
