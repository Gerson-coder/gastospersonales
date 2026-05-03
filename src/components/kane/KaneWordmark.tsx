/**
 * KaneWordmark — wordmark KANE inline as JSX so it inherits the parent's
 * `color` via `currentColor`. The previous implementation used Next
 * `<Image src="/brand/kane-wordmark.svg" />`, which renders the SVG as
 * an `<img>` element — those don't inherit CSS `color`, so `currentColor`
 * inside the SVG always resolved to the SVG's own black default. That
 * made the wordmark invisible on dark backgrounds.
 *
 * Now the SVG ships in the React tree, `text-foreground` (or any other
 * color utility) flows in via `currentColor`, and dark mode flips the
 * letters to near-white automatically.
 *
 * The accent dot stays at a fixed Kane-green so the brand reads
 * consistently across themes.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type KaneWordmarkProps = {
  width?: number;
  height?: number;
  className?: string;
  /** Set to `true` when the wordmark is purely decorative — the parent
   *  already labels the surface ("Bienvenido", etc.). Defaults to false
   *  so screen readers announce the brand name. */
  decorative?: boolean;
};

export function KaneWordmark({
  width = 96,
  height = 30,
  className,
  decorative = false,
}: KaneWordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 64"
      width={width}
      height={height}
      className={cn("text-foreground", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Kane"}
      aria-hidden={decorative || undefined}
    >
      <text
        x="0"
        y="48"
        fill="currentColor"
        fontFamily="'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontWeight={800}
        fontSize={56}
        letterSpacing={-1.5}
      >
        KANE
      </text>
      <circle cx="148" cy="44" r="6" fill="oklch(0.72 0.18 162)" />
    </svg>
  );
}
