"use client";

import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceWorkerUpdate } from "@/hooks/use-service-worker-update";
import { cn } from "@/lib/utils";

/**
 * UpdatePrompt
 *
 * Toast-style banner that appears when a new service worker version is
 * waiting. The user can apply the update (which triggers a reload) or
 * dismiss it for the current tab session.
 *
 * Positioned above the bottom tab bar on mobile and floats centered
 * on desktop. Accessible: role=dialog, aria-live=polite.
 */
export function UpdatePrompt() {
  const { updateAvailable, applyUpdate, dismiss } = useServiceWorkerUpdate();

  if (!updateAvailable) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Nueva versión disponible"
      className={cn(
        "fixed left-1/2 z-[60] -translate-x-1/2",
        // Sit above the mobile tab bar; float low on desktop.
        "bottom-28 md:bottom-6",
        "w-[calc(100%-2rem)] max-w-md",
        "flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-card",
      )}
    >
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <RefreshCw className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground leading-tight">
          Nueva versión disponible
        </p>
        <p className="text-sm text-muted-foreground leading-tight">
          Actualizá para ver las novedades.
        </p>
      </div>
      <Button size="sm" onClick={applyUpdate} className="h-9 shrink-0 px-3">
        Actualizar
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Descartar"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
