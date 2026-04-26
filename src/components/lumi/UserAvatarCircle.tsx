"use client";

/**
 * UserAvatarCircle — small round avatar with the user's initial.
 *
 * Pure presentational primitive shared by the persistent ProfileMenu trigger
 * (clickable, top-right of the tabs layout) and the Dashboard `AppHeader`
 * greeting (display-only, left of "Hola, {name}"). Centralising the visual
 * here keeps both surfaces in lockstep — same circle, same initial, same
 * font weight — and avoids re-deriving the initial in two places.
 *
 * Sizes:
 *   - "sm" (28px) — sized to sit next to a 17px greeting in the header.
 *   - "md" (36px) — sized to match the 9x9 ProfileMenu trigger pill.
 *
 * Hydration: the initial flips from "?" to the real letter once `useUserName`
 * resolves. Consumers get a stable layout because the circle is rendered at
 * a fixed size from first paint regardless of hydration state.
 */

import * as React from "react";

import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

export type UserAvatarCircleSize = "sm" | "md";

const SIZE_CLASSES: Record<UserAvatarCircleSize, string> = {
  sm: "h-7 w-7 text-[12px]",
  md: "h-9 w-9 text-[13px]",
};

function deriveInitial(name: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "?";
}

export interface UserAvatarCircleProps {
  /** Visual size — "sm" for inline header, "md" for the dropdown trigger. */
  size?: UserAvatarCircleSize;
  /** Extra classes appended to the circle. */
  className?: string;
}

/**
 * Display-only avatar circle. For a clickable trigger (ProfileMenu),
 * compose this inside a button — do not wrap it here, otherwise nested
 * interactive elements would break a11y.
 */
export function UserAvatarCircle({
  size = "sm",
  className,
}: UserAvatarCircleProps) {
  const { name, hydrated } = useUserName();
  const initial = hydrated ? deriveInitial(name) : "?";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-foreground font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {initial}
    </span>
  );
}
