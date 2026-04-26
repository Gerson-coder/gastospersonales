"use client";

/**
 * TabsTopBar — persistent floating action cluster for the (tabs) layout.
 *
 * Mounted ONCE in `(tabs)/layout.tsx` so the icons (Ajustes / Tema / Perfil)
 * do not unmount-remount on every tab navigation. Previously these lived
 * inside `AppHeader` which is part of each page → the cluster flickered on
 * every route change. By hoisting it to the layout the cluster is preserved
 * across navigations.
 *
 * Position: fixed top-right with a soft backdrop-blur pill so it stays
 * legible over scrolled content. z-30 — below the sidebar (z-40) so on
 * desktop the sidebar always wins on the unlikely event of an overlap;
 * above any sticky page chrome.
 */

import * as React from "react";
import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";

import { ThemeToggle } from "@/components/lumi/ThemeToggle";
import { ProfileMenu } from "@/components/lumi/ProfileMenu";

export function TabsTopBar() {
  return (
    <div
      role="toolbar"
      aria-label="Acciones de la cuenta"
      className="fixed top-3 right-3 z-30 flex items-center gap-1 rounded-full border border-border/60 bg-background/75 p-1 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/55 md:top-5 md:right-6"
    >
      <Link
        href="/settings"
        aria-label="Abrir ajustes"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SettingsIcon className="h-5 w-5" aria-hidden="true" />
      </Link>
      <ThemeToggle className="h-9 w-9" />
      <ProfileMenu />
    </div>
  );
}
