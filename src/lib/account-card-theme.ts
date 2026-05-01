/**
 * AccountCard theme — Lumi
 *
 * Maps a bank slug to the gradient + accent colors the AccountCard component
 * paints itself with via CSS custom properties. The component is theme-agnostic
 * (reads `--card-bg-from`, `--card-bg-to`, `--card-accent`); this module is
 * the single source of truth for which colors a given bank gets.
 *
 * Why CSS vars instead of Tailwind class strings?
 *   1) Class strings would force a switch over every bank slug inside the
 *      component, leaking branding details into presentation code.
 *   2) Tailwind's JIT can't see dynamically-built class strings, so palettes
 *      would all need to be safelist-ed — fragile when adding new banks.
 *   3) CSS custom properties cascade cleanly into pseudo-elements (sheen,
 *      watermark mask), keyframes (shine animation) and child SVG fills,
 *      none of which is ergonomic via Tailwind classes.
 *
 * Colors use oklch where possible — perceptually uniform lightness keeps the
 * dark-end of every gradient at the same visual weight, so a green BBVA card
 * doesn't read "louder" than a navy BCP card next to it in the carousel.
 */

import { accountBrandSlug } from "@/lib/account-brand-slug";
import type { Account } from "@/lib/data/accounts";

export type AccountCardTheme = {
  /** Lighter gradient stop (top-left). */
  bgFrom: string;
  /** Deeper gradient stop (bottom-right). */
  bgTo: string;
  /**
   * Accent color for pills, dividers, badges. Almost always a brighter shade
   * of the base brand — kept inside oklch so it stays legible on the
   * gradient.
   */
  accent: string;
  /**
   * Whether the bank's brand reads better with the watermark logo tinted
   * white (most darks: BCP, BBVA) or untouched (Yape's purple already pops
   * on its own gradient). Drives the `--card-watermark-tint` var.
   */
  watermarkTint: "white" | "none";
};

const NEUTRAL_DEFAULT: AccountCardTheme = {
  // Sophisticated deep neutral — onyx → graphite. Reads premium without
  // claiming any specific brand. Used for cash, generic accounts, fallbacks.
  bgFrom: "oklch(0.32 0.02 250)",
  bgTo: "oklch(0.18 0.02 250)",
  accent: "oklch(0.78 0.04 250)",
  watermarkTint: "white",
};

// Bank-specific themes. Slugs match `accountBrandSlug()` output (kebab-case,
// diacritic-stripped, lowercased). Add a new entry to register a new bank.
const THEMES: Record<string, AccountCardTheme> = {
  bbva: {
    // BBVA's primary brand blue is #004481; we go a touch deeper for the bottom
    // stop so the watermark "BBVA" wordmark catches enough contrast at 8% opacity.
    bgFrom: "oklch(0.42 0.14 245)",
    bgTo: "oklch(0.22 0.10 245)",
    accent: "oklch(0.80 0.10 245)",
    watermarkTint: "white",
  },
  bcp: {
    // BCP corporate blue — slightly cooler hue than BBVA so a user with both
    // accounts can tell them apart at a glance in the carousel.
    bgFrom: "oklch(0.38 0.14 255)",
    bgTo: "oklch(0.20 0.12 255)",
    accent: "oklch(0.78 0.12 255)",
    watermarkTint: "white",
  },
  interbank: {
    // Interbank green — saturated mid-green like the Lumi primary, but deeper
    // at the bottom so the green doesn't compete with our app primary.
    bgFrom: "oklch(0.45 0.16 150)",
    bgTo: "oklch(0.22 0.10 150)",
    accent: "oklch(0.80 0.14 150)",
    watermarkTint: "white",
  },
  scotiabank: {
    // Scotiabank red — the only bank that goes warm, so we lean into it.
    bgFrom: "oklch(0.45 0.18 25)",
    bgTo: "oklch(0.24 0.14 25)",
    accent: "oklch(0.82 0.14 25)",
    watermarkTint: "white",
  },
  banbif: {
    // BanBif teal — close enough to Interbank's hue family that we drift
    // toward cyan to keep visual separation in the carousel.
    bgFrom: "oklch(0.42 0.12 200)",
    bgTo: "oklch(0.22 0.08 200)",
    accent: "oklch(0.80 0.10 200)",
    watermarkTint: "white",
  },
  pichincha: {
    bgFrom: "oklch(0.42 0.14 30)",
    bgTo: "oklch(0.22 0.10 30)",
    accent: "oklch(0.82 0.12 30)",
    watermarkTint: "white",
  },
  yape: {
    // Yape brand purple. Deeper at bottom so the watermark stays readable.
    bgFrom: "oklch(0.42 0.16 305)",
    bgTo: "oklch(0.24 0.12 305)",
    accent: "oklch(0.80 0.14 305)",
    watermarkTint: "white",
  },
  plin: {
    // Plin cyan-blue.
    bgFrom: "oklch(0.45 0.14 220)",
    bgTo: "oklch(0.22 0.10 220)",
    accent: "oklch(0.80 0.12 220)",
    watermarkTint: "white",
  },
};

/**
 * Resolve the theme for an account. Falls back to NEUTRAL_DEFAULT for any
 * label not registered above (cash, "Mi colchón", custom names…).
 */
export function getAccountCardTheme(account: Account): AccountCardTheme {
  const slug = accountBrandSlug(account.label);
  if (slug && THEMES[slug]) return THEMES[slug];
  return NEUTRAL_DEFAULT;
}

/**
 * Build the inline `style` object the AccountCard reads from. Centralised so
 * the carousel and the switcher drawer can both call it — they need to keep
 * the variable names + values in sync.
 */
export function getAccountCardStyle(
  account: Account,
): React.CSSProperties & Record<`--${string}`, string> {
  const theme = getAccountCardTheme(account);
  return {
    "--card-bg-from": theme.bgFrom,
    "--card-bg-to": theme.bgTo,
    "--card-accent": theme.accent,
    "--card-watermark-tint": theme.watermarkTint === "white" ? "1" : "0",
  };
}

/**
 * The slug we use to render the bank watermark / logo. Re-exposed here so
 * the AccountCard component doesn't need to import `account-brand-slug.ts`
 * directly — keeps the component's public-facing imports minimal.
 */
export function getAccountBankSlug(account: Account): string | null {
  return accountBrandSlug(account.label);
}
