"use client";

import * as React from "react";

interface UseServiceWorkerUpdate {
  updateAvailable: boolean;
  applyUpdate: () => void;
  dismiss: () => void;
}

/**
 * useServiceWorkerUpdate
 *
 * Detects when a new service worker has been installed and is waiting
 * to take control. Surfaces an `updateAvailable` flag so a UI prompt
 * can ask the user to reload.
 *
 * Flow:
 *   1. New deploy ships → SW updates → installs in background.
 *   2. The new worker enters `waiting` state (because sw.ts has
 *      `skipWaiting: false`).
 *   3. This hook detects it (via `updatefound` + `statechange`, or
 *      via `reg.waiting` if the user came back to a stale tab).
 *   4. User clicks "Actualizar" → `applyUpdate` posts SKIP_WAITING.
 *   5. SW activates → `controllerchange` fires → page reloads.
 *
 * Freshness strategy (3 layers — most users hit only the first):
 *   - On every visibilitychange → 'visible' transition: call reg.update().
 *     This catches the common case of users backgrounding the PWA after
 *     a deploy and reopening minutes/hours later. Re-foreground = re-check.
 *   - On focus: same idea, covers desktop/tab switching.
 *   - Periodic interval: every 15 minutes for sessions that stay
 *     foregrounded for hours (rare but cheap to check).
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdate {
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [registration, setRegistration] =
    React.useState<ServiceWorkerRegistration | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let activeReg: ServiceWorkerRegistration | null = null;

    const onControllerChange = () => {
      // The new worker just took control — reload so the page runs
      // against the fresh assets.
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (!activeReg) return;
      activeReg.update().catch(() => {
        // Silent — offline or transient network issue.
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
      setRegistration(reg);

      // Already-waiting worker (user opened a stale tab).
      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setUpdateAvailable(true);
          }
        });
      });

      // Kick off an immediate update probe so we don't wait for
      // visibility/focus on the very first paint.
      checkForUpdate();

      // Periodic update check while the tab stays foregrounded for hours.
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

  const applyUpdate = React.useCallback(() => {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    // controllerchange listener will trigger window.location.reload().
  }, [registration]);

  const dismiss = React.useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, applyUpdate, dismiss };
}
