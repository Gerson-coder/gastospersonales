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
 * Update polling: while the tab stays open, we call `reg.update()`
 * every 60 minutes so long-lived sessions still pick up new versions.
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

    const onControllerChange = () => {
      // The new worker just took control — reload so the page runs
      // against the fresh assets.
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    void navigator.serviceWorker.ready.then((reg) => {
      if (cancelled) return;
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

      // Periodic update check while the tab is open.
      intervalId = setInterval(
        () => {
          reg.update().catch(() => {
            // Silent — offline or transient network issue.
          });
        },
        60 * 60 * 1000,
      );
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
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
