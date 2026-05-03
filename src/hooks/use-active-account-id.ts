/**
 * `useActiveAccountId` — read/write the dashboard's active account id from
 * `kane-prefs.activeAccountId`.
 *
 * Storage shape (shared with useActiveCurrency):
 *   localStorage["kane-prefs"] = {
 *     "currency": "PEN" | "USD",
 *     "activeAccountId": "uuid-of-the-account" | null,
 *     "theme": ...,
 *     ...
 *   }
 *
 * Why a dedicated hook (mirror of useActiveCurrency)?
 *   - The carousel and the capture flow both need to read/write the same
 *     value. Without a hook the read path would be a `useEffect` + state
 *     mirror in every consumer, drifting on the first frame after a write.
 *   - `useSyncExternalStore` subscribes to localStorage changes natively,
 *     so when /capture writes the just-used account before redirecting to
 *     /dashboard, the carousel's snapshot is already correct on its very
 *     next render — no race.
 *   - Same-tab writes also go through a synthesized `StorageEvent` so any
 *     other consumer of this hook in the same tab (e.g. a future header
 *     account-name display) re-renders too.
 *
 * SSR-safety: server snapshot returns null so the first paint never flashes
 * the wrong card before hydration corrects it.
 *
 * IMPORTANT: writes preserve unknown keys via read-merge-write so flipping
 * the active account doesn't clobber `currency` / `theme`.
 */

"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "kane-prefs";
const FIELD = "activeAccountId";

type KanePrefs = {
  activeAccountId?: string | null;
  // Other keys (currency, theme, ...) MUST be preserved on write.
  [key: string]: unknown;
};

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
    // Corrupted JSON / storage disabled — silent fallback.
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

function getSnapshot(): string | null {
  const value = readPrefs()[FIELD];
  return typeof value === "string" ? value : null;
}

function getServerSnapshot(): string | null {
  return null;
}

export function useActiveAccountId(): {
  activeAccountId: string | null;
  setActiveAccountId: (id: string | null) => void;
} {
  const activeAccountId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setActiveAccountId = useCallback((next: string | null) => {
    if (typeof window === "undefined") return;
    try {
      const prefs = readPrefs();
      // No-op write keeps storage cheap and avoids spurious StorageEvents
      // that would otherwise re-trigger every subscriber.
      if (prefs[FIELD] === next) return;

      const updated: KanePrefs = { ...prefs, [FIELD]: next };
      const serialized = JSON.stringify(updated);
      window.localStorage.setItem(STORAGE_KEY, serialized);

      // Same-tab sync: the native `storage` event only fires in OTHER tabs.
      // The carousel + any other consumer of this hook live in the SAME tab
      // as /capture, so we synthesize the event here.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: serialized,
        }),
      );
    } catch {
      // Quota exceeded / private mode — UI keeps in-memory state for the
      // session. Nothing actionable to surface.
    }
  }, []);

  return { activeAccountId, setActiveAccountId };
}
