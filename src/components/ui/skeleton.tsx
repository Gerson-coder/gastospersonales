/**
 * Skeleton — Lumi loading placeholder primitive.
 *
 * Uses a subtle left→right shimmer (`animate-lumi-shimmer` defined in
 * `globals.css`) over a `bg-muted` base. Falls back to no animation under
 * `prefers-reduced-motion: reduce` (the global rule in globals.css clamps
 * animation-duration to 0.01ms).
 *
 * Compose by sizing/shape via className — same ergonomics as shadcn's stock
 * Skeleton component. Marked `aria-hidden` by default so screen-readers don't
 * announce the placeholder content.
 */
"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate overflow-hidden rounded-md bg-muted",
        // Inline gradient sweep — see `@keyframes lumi-shimmer` in globals.css.
        "before:absolute before:inset-0 before:-translate-x-full before:bg-[linear-gradient(90deg,transparent,oklch(1_0_0/0.35),transparent)] before:animate-lumi-shimmer dark:before:bg-[linear-gradient(90deg,transparent,oklch(1_0_0/0.07),transparent)]",
        className,
      )}
      {...props}
    />
  );
}

export default Skeleton;
