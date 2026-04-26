"use client";

/**
 * Tiny module-scoped store that lets the bottom-nav FAB invoke /capture's
 * save handler from outside the page. Built on useSyncExternalStore so it
 * is React 19 / Next 15+ compliant (no useState-in-effect lint issues).
 *
 * /capture page registers its handler on mount; the FAB reads `canSave`
 * to decide enabled state and calls `triggerSave()` on click.
 *
 * The handler is module-scoped (not React-scoped) on purpose: only ONE
 * /capture instance can be mounted at a time (it is a route), and the
 * FAB lives in the persistent (tabs) layout, so a single global slot is
 * the correct shape. Effects on /capture set+clear the slot on
 * mount/unmount to avoid stale closures after navigation.
 */

import { useSyncExternalStore } from "react";

let saveHandler: (() => void) | null = null;
let canSave = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const captureActionBus = {
  setSaveHandler(handler: (() => void) | null, ready: boolean): void {
    saveHandler = handler;
    canSave = ready;
    emit();
  },
  triggerSave(): void {
    if (saveHandler && canSave) saveHandler();
  },
  getCanSave(): boolean {
    return canSave;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useCaptureCanSave(): boolean {
  return useSyncExternalStore(
    captureActionBus.subscribe,
    () => captureActionBus.getCanSave(),
    () => false, // SSR snapshot — start disabled to avoid hydration flash
  );
}
