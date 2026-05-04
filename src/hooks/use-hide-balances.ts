/**
 * `useHideBalances` — read/write the "ocultar saldos" toggle from
 * `kane-prefs.hideBalances`.
 *
 * Storage shape (shared with useActiveCurrency / useActiveAccountId):
 *   localStorage["kane-prefs"] = {
 *     "currency": "PEN" | "USD",
 *     "activeAccountId": "uuid" | null,
 *     "theme": ...,
 *     "hideBalances": true | false,
 *     ...
 *   }
 *
 * Why a dedicated hook:
 *   - Bug previo: el toggle vivía en `useState(false)` dentro del
 *     AccountCardCarousel. Cada vez que el dashboard se desmontaba (al
 *     navegar a otra tab) el state se perdía y el carousel arrancaba en
 *     "visible" al volver — el user reportaba que su preferencia de
 *     ocultar el saldo se reseteaba sola.
 *   - useSyncExternalStore + localStorage da el mismo patrón que
 *     useActiveAccountId / useActiveCurrency: persistencia entre nav,
 *     cross-tab sync nativo, no race en el primer frame post-mount.
 *
 * SSR-safety: server snapshot devuelve `false` (default visible) — el
 * primer paint nunca muestra el masking si el user nunca eligió ocultar.
 *
 * IMPORTANT: writes preserve unknown keys (read-merge-write) para no
 * clobber `currency` / `theme` / `activeAccountId`.
 */

"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "kane-prefs";
const FIELD = "hideBalances";

type KanePrefs = {
  hideBalances?: boolean;
  // Other keys MUST be preserved on write.
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

function getSnapshot(): boolean {
  const value = readPrefs()[FIELD];
  return value === true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useHideBalances(): {
  hideBalances: boolean;
  setHideBalances: (next: boolean) => void;
  toggleHideBalances: () => void;
} {
  const hideBalances = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setHideBalances = useCallback((next: boolean) => {
    if (typeof window === "undefined") return;
    try {
      const prefs = readPrefs();
      // No-op skip keeps storage cheap + avoids spurious StorageEvents.
      if (prefs[FIELD] === next) return;

      const updated: KanePrefs = { ...prefs, [FIELD]: next };
      const serialized = JSON.stringify(updated);
      window.localStorage.setItem(STORAGE_KEY, serialized);

      // Same-tab sync — the native `storage` event only fires in OTHER
      // tabs, so we synthesize one for any other useHideBalances mount
      // in this same tab (future: a global toggle in the header).
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: serialized,
        }),
      );
    } catch {
      // Quota / private mode — UI keeps in-memory state, nothing to
      // surface.
    }
  }, []);

  const toggleHideBalances = useCallback(() => {
    setHideBalances(!getSnapshot());
  }, [setHideBalances]);

  return { hideBalances, setHideBalances, toggleHideBalances };
}
