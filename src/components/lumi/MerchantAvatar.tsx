/**
 * MerchantAvatar — small circular badge with one of two render paths:
 *
 *   1. **Static SVG logo** (when `logoSlug` is provided): renders an
 *      `<img>` pointing to `/logos/merchants/{logoSlug}.svg`. Used by
 *      seeded system merchants that have a hand-prepared SVG file.
 *      If the file 404s (or any image error fires), we transparently
 *      fall back to the initials avatar — same render as path 2.
 *
 *   2. **Deterministic initials** (no slug, or slug failed): a tinted
 *      circle with 1–2 letters derived from the merchant name. Pure
 *      runtime, no assets, trademark-safe for any user-typed name.
 *
 * The avatar is decorative (`aria-hidden="true"`); call sites always
 * render the merchant name next to it for screen-reader users. Three
 * sizes:
 *
 *   - sm → 24px (chip rows, dense lists)
 *   - md → 32px (default; drawer rows)
 *   - lg → 40px (form sheet preview, info cards)
 *
 * Initials background + foreground colors come from {@link getMerchantAvatar},
 * which piggybacks on the `--chart-1`…`--chart-8` tokens. SVG path uses a
 * neutral `bg-muted` so any padding around a logo with transparent corners
 * blends with the surrounding card. Pure presentation — no Supabase calls,
 * no effects, safe to render in lists.
 */
"use client";

import * as React from "react";

import { getMerchantAvatar } from "@/lib/merchant-avatar";
import { cn } from "@/lib/utils";

export type MerchantAvatarSize = "sm" | "md" | "lg";

export type MerchantAvatarProps = {
  name: string;
  /**
   * Optional kebab-case filename stem. When set, renders the SVG at
   * `/logos/merchants/{logoSlug}.svg`. Falls back to initials on image
   * load error or when null/undefined.
   */
  logoSlug?: string | null;
  size?: MerchantAvatarSize;
  className?: string;
};

/**
 * Tailwind classes per size. Kept as a constant map (not a switch) so the
 * compiler can see all classes at build time and JIT them properly.
 */
const SIZE_CLASSES: Record<MerchantAvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-[13px]",
};

/** Shared layout for both the SVG container and the initials chip. */
const BASE_CLASSES =
  "inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold leading-none tabular-nums";

export function MerchantAvatar({
  name,
  logoSlug,
  size = "md",
  className,
}: MerchantAvatarProps) {
  // Track image-load failure so we can fall back to initials on the same
  // render. Reset when the slug changes — a different slug is a different
  // asset and deserves a fresh attempt.
  const [imgFailed, setImgFailed] = React.useState(false);
  React.useEffect(() => {
    setImgFailed(false);
  }, [logoSlug]);

  const showLogo = Boolean(logoSlug) && !imgFailed;

  if (showLogo) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          BASE_CLASSES,
          SIZE_CLASSES[size],
          // Plain `<img>` over Next/Image — these are tiny static SVGs in
          // /public, no responsive variants needed, and avoiding the loader
          // keeps the bundle and config simpler.
          "overflow-hidden bg-muted",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs in /public; Next/Image adds no value here */}
        <img
          src={`/logos/merchants/${logoSlug}.svg`}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  // Deterministic — same name → same initials + tint forever.
  const { initials, bgVar, fgVar } = getMerchantAvatar(name);

  return (
    <span
      aria-hidden="true"
      className={cn(BASE_CLASSES, SIZE_CLASSES[size], className)}
      style={{ backgroundColor: bgVar, color: fgVar }}
    >
      {initials}
    </span>
  );
}
