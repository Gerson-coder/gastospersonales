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
import { usePathname } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/kane/ThemeToggle";
import { ProfileMenu } from "@/components/kane/ProfileMenu";

export function TabsTopBar() {
  // /capture pulls the eye toward the amount + keypad; the persistent action
  // cluster competes for attention with no benefit on that screen. Hide on
  // mobile only — desktop has plenty of horizontal real estate so the cluster
  // never crowds the capture flow there.
  const pathname = usePathname();
  const hideOnMobile = pathname?.startsWith("/capture") ?? false;

  return (
    <div
      role="toolbar"
      aria-label="Acciones de la cuenta"
      className={cn(
        // Mobile: completamente oculto (los iconos van en el header de cada página)
        // Desktop: fixed top-right como antes
        "hidden md:fixed md:top-5 md:right-6 md:z-30 md:flex items-center gap-1",
        hideOnMobile && "md:hidden",
      )}
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
