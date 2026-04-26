"use client";

/**
 * AppHeader — shared title chrome for all (tabs) screens.
 *
 * Lives at the top of Dashboard, Movements, Insights, Accounts, Settings,
 * Profile. Hosts the eyebrow/title cluster on the left and an optional
 * `actionsBefore` slot on the right (used by Movements for the search
 * trigger). Per-screen money toggles (e.g. PEN/USD on Dashboard) live
 * INSIDE their respective hero cards.
 *
 * The persistent action cluster (Ajustes / Tema / Perfil) is NOT here —
 * it's rendered once by `TabsTopBar` in `(tabs)/layout.tsx` so it does
 * not unmount-remount on every navigation. The right padding on the
 * inner div reserves space for that floating cluster on mobile so the
 * page title never slides under it.
 *
 * Title style:
 *   - "page" → regular bold 22/30, used for context-heavy screens (Dashboard,
 *     Accounts) where the title is a label, not a hero.
 *   - "display" → font-display italic 28/36, used for hero pages (Movements,
 *     Insights) where the title carries character.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  /** Eyebrow text above the title — e.g. "abril · 2026" */
  eyebrow?: string;
  /** Title of the page (h1) */
  title: string;
  /** Optional className override on the outer wrapper */
  className?: string;
  /** Optional element inserted RIGHT of the title (e.g. search trigger). */
  actionsBefore?: React.ReactNode;
  /** Title styling: "page" (regular bold) or "display" (font-display italic). */
  titleStyle?: "page" | "display";
}

export function AppHeader({
  eyebrow,
  title,
  className,
  actionsBefore,
  titleStyle = "page",
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        // pr-44 reserves room on mobile for the fixed TabsTopBar pill
        // (~160px wide). Desktop has plenty of horizontal real estate so
        // we drop the reservation at md+.
        "flex items-center justify-between gap-3 px-5 pr-44 pt-3 md:px-0 md:pr-0 md:pt-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1
          className={cn(
            "leading-tight",
            titleStyle === "display"
              ? "mt-1 font-display text-[28px] italic md:text-4xl tracking-tight font-semibold"
              : "mt-1.5 text-[22px] font-bold md:text-3xl",
          )}
        >
          {title}
        </h1>
      </div>
      {actionsBefore ? (
        <div className="flex items-center gap-1.5 shrink-0">
          {actionsBefore}
        </div>
      ) : null}
    </header>
  );
}
