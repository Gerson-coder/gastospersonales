"use client";

import { usePathname } from "next/navigation";

import { TabBar } from "./TabBar";

/**
 * Conditional renderer for the bottom TabBar.
 *
 * Routes listed in `HIDDEN_PREFIXES` mount their own bottom CTA bar
 * (e.g. /receipt's "Volver / Analizar" buttons or "Aceptar / Descartar"
 * sticky bar) and would have it covered by the TabBar otherwise.
 * Hiding the TabBar on those routes keeps page-owned bottom UI usable.
 *
 * Server-component layouts that need the TabBar import THIS component
 * instead of TabBar directly so the hide logic stays in one place.
 */
const HIDDEN_PREFIXES = ["/receipt"] as const;

export function TabBarSlot() {
  const pathname = usePathname();
  if (
    pathname &&
    HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return null;
  }
  return <TabBar />;
}
