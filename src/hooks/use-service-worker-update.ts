"use client";

import * as React from "react";

/**
 * useServiceWorkerUpdate
 *
 * Mounts a tiny watchdog that listens for `controllerchange` and reloads
 * the page when a fresh service worker takes over. With sw.ts now using
 * `skipWaiting: true` + `clientsClaim: true`, every Vercel deploy auto-
 * promotes the new worker; this hook is what closes the loop on the
 * client side so the user lands on the fresh app shell instead of a
 * mixed old-shell / new-chunks state that hangs navigation.
 *
 * Freshness probes (visibility / focus / 15-min interval) are kept so
 * users who left the PWA backgrounded for hours catch the new deploy
 * the next time they re-foreground the tab.
 */
export function useServiceWorkerUpdate(): void {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let activeReg: ServiceWorkerRegistration | null = null;
    // First-visit registrations also fire controllerchange (clientsClaim
    // takes over a previously-uncontrolled page). We swallow that one to
    // avoid an unnecessary reload before the user has even interacted.
    let hadInitialController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (!hadInitialController) {
        hadInitialController = true;
        return;
      }
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (!activeReg) return;
      activeReg.update().catch(() => {
        // Silent — offline / transient network is fine.
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkForUpdate);

    void navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return;
      activeReg = reg;
      checkForUpdate();
      intervalId = setInterval(checkForUpdate, 15 * 60 * 1000);
    });

    return () => {
      cancelled = true;
      activeReg = null;
      if (intervalId) clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);
}
