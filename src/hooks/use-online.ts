/**
 * `useOnline` — reactive `navigator.onLine` flag.
 *
 * Implemented via `useSyncExternalStore` so we subscribe to the browser's
 * `online` / `offline` events without the React 19 "set-state-in-effect"
 * lint warning. The server snapshot returns `true` so the first paint never
 * flashes an offline banner before hydration.
 *
 * v1 scope: detection only — we do NOT queue offline writes. The capture
 * page uses this to disable Save and show a banner.
 */
"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // Optimistic: assume online during SSR so we never paint the offline UI
  // before hydration runs and corrects us.
  return true;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
