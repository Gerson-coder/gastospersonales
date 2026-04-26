"use client";

/**
 * AppHeader — shared top header for all (tabs) screens.
 *
 * Lives at the top of Dashboard, Movements, Insights, Accounts. Hosts the
 * eyebrow/title cluster on the left and a compact action cluster on the right
 * (settings shortcut, theme toggle, profile menu).
 *
 * Sizing rationale:
 *   - All action buttons render at h-9 (36px) so the cluster reads as a tight
 *     secondary control row rather than a chunky toolbar.
 *
 * Title style:
 *   - "page" → regular bold 22/30, used for context-heavy screens (Dashboard,
 *     Accounts) where the title is a label, not a hero.
 *   - "display" → font-display italic 28/36, used for hero pages (Movements,
 *     Insights) where the title carries character.
 *
 * Per-screen money toggles (e.g. PEN/USD on Dashboard) live INSIDE their
 * respective hero cards, not in the header — this keeps the header chrome
 * predictable across tabs.
 */

import * as React from "react";
import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { ThemeToggle } from "@/components/lumi/ThemeToggle";
import { ProfileMenu } from "@/components/lumi/ProfileMenu";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  /** Eyebrow text above the title — e.g. "abril · 2026" */
  eyebrow?: string;
  /** Title of the page (h1) */
  title: string;
  /** Optional className override on the outer wrapper */
  className?: string;
  /** Optional element inserted RIGHT before the action cluster (e.g. search). */
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
        <Link
          href="/settings"
          aria-label="Abrir ajustes"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SettingsIcon className="h-5 w-5" aria-hidden="true" />
        </Link>
        <ThemeToggle className="h-9 w-9" />
        <ProfileMenu />
      </div>
    </header>
  );
}
