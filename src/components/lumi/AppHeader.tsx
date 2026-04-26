"use client";

/**
 * AppHeader — shared top header for all (tabs) screens.
 *
 * Lives at the top of Dashboard, Movements, Insights, Accounts. Hosts the
 * eyebrow/title cluster on the left and a compact action cluster on the right
 * (currency toggle (optional), theme toggle, profile).
 *
 * Sizing rationale:
 *   - Per user feedback ("S/PEN más pequeño") all action buttons render at
 *     h-9 (36px) so the cluster reads as a tight, secondary control row
 *     rather than a chunky toolbar. Currency text is 12px to match.
 *   - The 9x9 footprint is below WCAG 2.5.5 (44x44) on mobile, but the
 *     cluster mirrors the visual weight of OS/system header chips users
 *     already accept; the primary tap targets (FAB, TabBar) remain >=44.
 *   - We override ThemeToggle's default 10x10 via className to keep the row
 *     visually aligned at the same height.
 *
 * Title style:
 *   - "page" → regular bold 22/30, used for context-heavy screens (Dashboard,
 *     Accounts) where the title is a label, not a hero.
 *   - "display" → font-display italic 28/36, used for hero pages (Movements,
 *     Insights) where the title carries character.
 */

import * as React from "react";
import { User } from "lucide-react";
import { ThemeToggle } from "@/components/lumi/ThemeToggle";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  /** Eyebrow text above the title — e.g. "abril · 2026" */
  eyebrow?: string;
  /** Title of the page (h1) */
  title: string;
  /** Optional className override on the outer wrapper */
  className?: string;
  /** Currency state (controlled). If omitted, the currency button is hidden. */
  currency?: "PEN" | "USD";
  /** Toggle handler for the currency button. Required if `currency` is set. */
  onCurrencyToggle?: () => void;
  /** Optional element inserted RIGHT before the action cluster (e.g. search). */
  actionsBefore?: React.ReactNode;
  /** Title styling: "page" (regular bold) or "display" (font-display italic). */
  titleStyle?: "page" | "display";
}

export function AppHeader({
  eyebrow,
  title,
  className,
  currency,
  onCurrencyToggle,
  actionsBefore,
  titleStyle = "page",
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 px-5 pt-3 md:px-0 md:pt-0",
        className,
      )}
    >
      <div className="min-w-0">
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
      <div className="flex items-center gap-1.5 shrink-0">
        {actionsBefore}
        {currency && onCurrencyToggle ? (
          <button
            type="button"
            onClick={onCurrencyToggle}
            aria-label={`Cambiar moneda (actualmente ${currency})`}
            aria-pressed={currency === "USD"}
            className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-3 text-[12px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">{currency === "PEN" ? "S/" : "$"}</span>
            <span className="ml-1 text-muted-foreground font-medium">
              {currency}
            </span>
          </button>
        ) : null}
        <ThemeToggle className="h-9 w-9" />
        <button
          type="button"
          aria-label="Abrir perfil"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <User size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
