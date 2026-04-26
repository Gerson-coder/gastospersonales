"use client";

/**
 * Generates a deterministic visual avatar (initials + tint color) for a
 * merchant, derived purely from its display name. No assets, no upload —
 * keeps the UI offline-friendly and trademark-safe for any merchant the
 * user types in. The same name always returns the same colors.
 *
 * The color palette piggybacks on the existing chart tokens
 * (`--chart-1` … `--chart-8`) defined in `src/app/globals.css`. There are
 * no `--chart-N-foreground` variants, so the foreground falls back to the
 * theme's `--foreground` token, which renders legibly on every tint.
 *
 * Examples:
 *   getMerchantAvatar("KFC")            → { initials: "KF", tintIndex: ?, ... }
 *   getMerchantAvatar("Pizza Hut")      → { initials: "PH", tintIndex: ?, ... }
 *   getMerchantAvatar("Pardos Chicken") → { initials: "PC", tintIndex: ?, ... }
 *   getMerchantAvatar("Inkafarma")      → { initials: "IN", tintIndex: ?, ... }
 *   getMerchantAvatar("")               → { initials: "?",  tintIndex: 0, ... }
 */

export type MerchantAvatar = {
  /** 1-2 uppercase ASCII chars derived from the merchant name. */
  initials: string;
  /** 0..PALETTE_SIZE-1 — index into the chart-token palette. */
  tintIndex: number;
  /** CSS var for the tinted background, e.g. "var(--chart-3)". */
  bgVar: string;
  /** CSS var for the foreground / text color sitting on the tint. */
  fgVar: string;
};

/**
 * Number of color slots available. Mirrors the `--chart-1`…`--chart-8`
 * tokens declared in `src/app/globals.css`. If the palette grows, bump
 * this constant — `tintIndex` will immediately distribute over the new
 * range without any other code change.
 */
const PALETTE_SIZE = 8;

/** Match diacritics in the Unicode combining-marks block (U+0300–U+036F). */
const DIACRITIC_RE = /[̀-ͯ]/g;

/** Word boundaries in merchant names: whitespace, dash, slash, apostrophe. */
const WORD_SPLIT_RE = /[\s\-/']+/;

/**
 * djb2 string hash — small, fast, deterministic, no crypto needed. Returns
 * an unsigned 32-bit int; we mod it down to the palette size at the call
 * site so the spread is roughly uniform across the 8 tints.
 */
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    // ((hash << 5) + hash) === hash * 33; xor with charCode mixes well.
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  // Force unsigned 32-bit so JS doesn't surprise us with negative mods.
  return hash >>> 0;
}

/**
 * Strip diacritics and split the name into clean ASCII-ish words. The
 * NFD-normalize trick separates base letters from combining marks so we
 * can drop the marks with a single regex.
 */
function tokenize(name: string): string[] {
  const stripped = name.normalize("NFD").replace(DIACRITIC_RE, "");
  return stripped
    .split(WORD_SPLIT_RE)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

/** Derive the 1-2 char initials per the rules in the JSDoc above. */
function deriveInitials(name: string): string {
  const words = tokenize(name);
  if (words.length === 0) {
    // Empty / whitespace-only / all-punctuation name. Fall back to "?" so
    // the chip still renders something and we never crash on bad input.
    return "?";
  }

  if (words.length === 1) {
    const only = words[0];
    if (only.length === 1) {
      return only.toUpperCase();
    }
    // First + last char of the single word — keeps "KFC" → "KC" awkward,
    // so we prefer first + second char if available.
    const first = only.charAt(0);
    const second = only.charAt(1);
    return (first + second).toUpperCase();
  }

  // 2+ words — first letter of the first two words.
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/**
 * Public API: given a merchant name, return a stable visual avatar
 * descriptor. Pure function — safe to call during render.
 */
export function getMerchantAvatar(name: string): MerchantAvatar {
  // Normalize for hashing so "KFC" and "kfc" land on the same tint.
  const normalized = name.normalize("NFD").replace(DIACRITIC_RE, "").trim().toLowerCase();
  const tintIndex = normalized.length === 0 ? 0 : djb2(normalized) % PALETTE_SIZE;
  const oneBased = tintIndex + 1;

  return {
    initials: deriveInitials(name),
    tintIndex,
    bgVar: `var(--chart-${oneBased})`,
    // No `--chart-N-foreground` token in the palette today; `--foreground`
    // is a neutral high-contrast value that renders on every chart tint.
    fgVar: "var(--foreground)",
  };
}
