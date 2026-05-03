"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useServiceWorkerUpdate } from "@/hooks/use-service-worker-update";
import { SessionProvider } from "@/lib/use-session";
import { migrateLegacyStorage } from "@/lib/storage-migration";
import { uploadLegacyLocalDataToSupabase } from "@/lib/storage-to-supabase-migration";

/**
 * Suppresses a known upstream noise from vaul (the lib that powers shadcn
 * Drawer): "Failed to execute 'releasePointerCapture' on 'Element': No
 * active pointer with the given id is found." It fires when a swipe gesture
 * races with vaul's pointer cleanup. The exception is non-fatal — vaul
 * already completed the visual cleanup and only the redundant capture
 * release fails. Tracked: https://github.com/emilkowalski/vaul (search
 * "releasePointerCapture"). Remove this filter once vaul ships a fix.
 */
function useSuppressVaulPointerError() {
  React.useEffect(() => {
    const isVaulNoise = (msg: unknown) =>
      typeof msg === "string" && msg.includes("releasePointerCapture");

    const onError = (e: ErrorEvent) => {
      if (isVaulNoise(e.message) || isVaulNoise(e.error?.message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string } | undefined;
      if (isVaulNoise(reason?.message)) {
        e.preventDefault();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useSuppressVaulPointerError();
  // Auto-reload the app when a new service worker takes over. With
  // skipWaiting + clientsClaim in sw.ts this fires on every deploy, so
  // users always end up on fresh code instead of the old stale shell.
  useServiceWorkerUpdate();
  // One-shot migracion del rebrand: copia claves de localStorage del
  // formato legacy al `kane-*` actual y borra las viejas.
  // Idempotente — corridas siguientes son no-ops porque las claves
  // legacy ya no estan. Sin esto, los users que venian de la version
  // anterior pierden currency / theme / metas / presupuestos al
  // actualizar.
  React.useEffect(() => {
    migrateLegacyStorage();
    // Fire-and-forget: upload any leftover localStorage budgets/goals to
    // Supabase. Bails on its own if not authenticated, no env, or sentinel
    // already set. Idempotent. Must run AFTER migrateLegacyStorage so any
    // legacy `lumi-budgets` / `lumi-goals` keys have already been renamed
    // to `kane-*` and are visible to this uploader.
    void uploadLegacyLocalDataToSupabase();
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        {children}
        <Toaster richColors position="top-center" />
      </SessionProvider>
    </ThemeProvider>
  );
}
