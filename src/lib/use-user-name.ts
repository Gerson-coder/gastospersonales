"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "lumi-user-name";

/**
 * SSR-safe hook for the onboarding name persisted in localStorage.
 *
 * Reading localStorage during render is unsafe under SSR (the server has no
 * `window`), so the hook mounts with `null` and hydrates from storage in a
 * post-mount effect. Consumers should gate UI on `hydrated` to avoid a
 * single-frame flash of the empty state.
 *
 * Mirrors the localStorage contract used by `src/app/(tabs)/accounts/page.tsx`
 * (key `lumi-prefs`); here the key is `lumi-user-name`.
 */
export function useUserName(): {
  name: string | null;
  setName: (name: string) => void;
  hydrated: boolean;
} {
  const [name, setNameState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage AFTER mount — never during SSR. The setState
  // call here is the documented React pattern for syncing with a non-React
  // store on first paint; a single render flip is the cost of being SSR-safe.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setNameState(stored);
    } catch {
      // Storage disabled (private mode, quota, etc.) — stay on null.
    }
    setHydrated(true);
  }, []);

  const setName = useCallback((next: string) => {
    setNameState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Quota exceeded or storage disabled — nothing actionable here.
    }
  }, []);

  return { name, setName, hydrated };
}
