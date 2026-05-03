/**
 * `useActiveCurrency` — read/write the active currency from `kane-prefs`.
 *
 * Storage shape (shared with `src/app/(tabs)/settings/page.tsx`):
 *   localStorage["kane-prefs"] = { "currency": "PEN" | "USD", "theme": ... }
 *
 * IMPORTANT: this hook MUST preserve unknown keys when writing, so flipping
 * the currency from /dashboard does not clobber `theme` (or any future pref).
 * We always read → merge → write.
 *
 * Implementation:
 *   - Read path uses `useSyncExternalStore` so React subscribes to the
 *     localStorage `storage` event natively (no `setState`-in-effect).
 *   - Cross-tab: native `storage` event fires in OTHER tabs.
 *   - Same-tab: `storage` does NOT fire in the writer's own tab, so on
 *     write we synthesize a `StorageEvent` to nudge other consumers.
 *
 * SSR-safety: the server snapshot returns `'PEN'` so the first paint never
 * flashes USD before hydration corrects it.
 */
"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { Currency } from "@/lib/supabase/types";

const STORAGE_KEY = "kane-prefs";
const DEFAULT_CURRENCY: Currency = "PEN";

type KanePrefs = {
  currency?: Currency;
  // Other keys (e.g. `theme`) MUST be preserved on write.
  [key: string]: unknown;
};

function isCurrency(value: unknown): value is Currency {
  return value === "PEN" || value === "USD";
}

function readPrefs(): KanePrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as KanePrefs;
    }
    return {};
  } catch {
    // Corrupted JSON or storage disabled — silent fallback to defaults.
    return {};
  }
}

function subscribe(onChange: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSnapshot(): Currency {
  const prefs = readPrefs();
  return isCurrency(prefs.currency) ? prefs.currency : DEFAULT_CURRENCY;
}

function getServerSnapshot(): Currency {
  return DEFAULT_CURRENCY;
}

// Hydration-flag store: an empty subscribe (state never changes after mount)
// with `getSnapshot` returning `true` on the client and `false` on the server.
// React calls `getServerSnapshot` during SSR and the first commit, then
// switches to `getSnapshot` for subsequent reads — giving us a "safe-to-fetch"
// flag without triggering the `set-state-in-effect` lint rule.
function noopSubscribe(): () => void {
  return () => {};
}
function getHydratedSnapshot(): boolean {
  return true;
}
function getHydratedServerSnapshot(): boolean {
  return false;
}

export function useActiveCurrency(): {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  hydrated: boolean;
} {
  const currency = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // `hydrated` flips to `true` post-mount so consumers can avoid running
  // currency-dependent fetches with a stale default during the SSR/CSR
  // boundary. `useSyncExternalStore` already returns the correct value once
  // mounted; this flag exists purely as a "safe-to-fetch" signal for callers.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    getHydratedSnapshot,
    getHydratedServerSnapshot,
  );

  const setCurrency = useCallback((next: Currency) => {
    if (!isCurrency(next)) return;
    if (typeof window === "undefined") return;
    try {
      // Read-merge-write so we preserve `theme` and any other key the
      // settings page (or future code) parks under `kane-prefs`.
      const prefs = readPrefs();
      const updated: KanePrefs = { ...prefs, currency: next };
      const serialized = JSON.stringify(updated);
      window.localStorage.setItem(STORAGE_KEY, serialized);

      // Same-tab sync: native `storage` event only fires in other tabs,
      // so we synthesize one for any other consumer of this hook in
      // this same tab (e.g. /dashboard header + /movements list).
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: serialized,
        }),
      );
    } catch {
      // Quota exceeded or storage disabled — UI keeps the in-memory value
      // for this session; nothing actionable to surface.
    }
  }, []);

  return { currency, setCurrency, hydrated };
}
