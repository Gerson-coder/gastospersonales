"use client";

/**
 * SyncStatusPill (export name: `OfflineIndicator` for backwards-compat
 * with the layout import) — slim status pill at the top of (tabs).
 *
 * State priority (top to bottom — first match wins):
 *   1. !online + (pending > 0 || receiptsInFlight > 0)
 *      → "Sin conexión · 3 pendientes" (amber)
 *   2. !online
 *      → "Sin conexión — usando datos guardados" (amber)
 *   3. syncing
 *      → "Sincronizando…" (blue, spin)
 *   4. receiptsReady > 0   (Fase 3 — user-action item)
 *      → "1 boleta lista para revisar" (green, tappable → /receipt)
 *   5. pending > 0 || receiptsInFlight > 0
 *      → "3 movimientos por sincronizar" (amber, tappable → flush)
 *   6. all zero + online
 *      → render nothing
 *
 * Tapping the pill triggers a manual flush (case 5) or navigates to
 * /receipt (case 4). Resting state is invisible — zero vertical space.
 *
 * Mounted once in `(tabs)/layout.tsx` so the pill survives navigations
 * instead of remounting per page.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudOff, RefreshCw, UploadCloud } from "lucide-react";

import { useOfflineSync } from "@/hooks/use-offline-sync";

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

type Palette = "amber" | "blue" | "emerald";

const PALETTES: Record<Palette, string> = {
  amber:
    "border-amber-500/40 bg-amber-50/95 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
  blue: "border-sky-500/40 bg-sky-50/95 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200",
  emerald:
    "border-emerald-500/40 bg-emerald-50/95 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
};

export function OfflineIndicator() {
  const router = useRouter();
  const { online, pending, receiptsInFlight, receiptsReady, syncing, flush } =
    useOfflineSync();

  const totalInFlight = pending + receiptsInFlight;

  // Resting state — render nothing so the AppHeader sits flush at the top.
  if (online && totalInFlight === 0 && receiptsReady === 0 && !syncing) {
    return null;
  }

  let palette: Palette;
  let icon: React.ReactNode;
  let label: string;
  let onTap: (() => void) | null = null;

  if (!online) {
    palette = "amber";
    icon = <CloudOff size={13} aria-hidden="true" />;
    label =
      totalInFlight > 0
        ? `Sin conexión · ${totalInFlight} ${pluralize(totalInFlight, "pendiente", "pendientes")}`
        : "Sin conexión — usando datos guardados";
  } else if (syncing) {
    palette = "blue";
    icon = <RefreshCw size={13} aria-hidden="true" className="animate-spin" />;
    const totalForLabel = totalInFlight || 1;
    label = `Sincronizando ${totalInFlight || ""} ${pluralize(
      totalForLabel,
      "movimiento",
      "movimientos",
    )}…`
      .replace(/\s+/g, " ")
      .trim();
  } else if (receiptsReady > 0) {
    // OCR done offline; the user just needs to tap to review.
    palette = "emerald";
    icon = <CheckCircle2 size={13} aria-hidden="true" />;
    label = `${receiptsReady} ${pluralize(
      receiptsReady,
      "boleta lista para revisar",
      "boletas listas para revisar",
    )}`;
    onTap = () => router.push("/receipt");
  } else {
    // online + something queued + not syncing — usually all `failed`
    // rows. Tap to retry.
    palette = "amber";
    icon = <UploadCloud size={13} aria-hidden="true" />;
    label = `${totalInFlight} ${pluralize(
      totalInFlight,
      "movimiento por sincronizar",
      "movimientos por sincronizar",
    )}`;
    onTap = () => void flush();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      {onTap ? (
        <button
          type="button"
          onClick={onTap}
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow-sm backdrop-blur-md transition-transform active:scale-95 ${PALETTES[palette]}`}
          aria-label={label}
        >
          {icon}
          <span>{label}</span>
        </button>
      ) : (
        <div
          className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow-sm backdrop-blur-md ${PALETTES[palette]}`}
        >
          {icon}
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
