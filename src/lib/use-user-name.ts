"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { useSession } from "@/lib/use-session";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const STORAGE_KEY = "lumi-user-name";

const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

/**
 * SSR-safe hook for the user's display name.
 *
 * Two backing stores, depending on whether we have an authenticated session:
 *   - Authenticated (Supabase enabled + session): name is the source-of-truth
 *     value of `profiles.display_name`. `setName` UPDATEs the row and updates
 *     local state so the UI is reactive immediately. `clearName` only wipes
 *     the localStorage cache — sign-out tears down the actual session.
 *   - Demo / pre-auth: name lives in `localStorage["lumi-user-name"]`. This
 *     keeps the unauthenticated onboarding flow (and the no-env preview
 *     deploy) working without a backend.
 *
 * The localStorage cache is also written in the authenticated path so the
 * first paint of subsequent visits has a name available before the profile
 * row finishes loading — avoids a flicker between "" and the real value.
 *
 * Consumers should gate UI on `hydrated` to avoid a single-frame flash of
 * the empty state.
 */
export function useUserName(): {
  name: string | null;
  setName: (name: string) => Promise<void>;
  clearName: () => void;
  hydrated: boolean;
} {
  const session = useSession();
  const [name, setNameState] = useState<string | null>(null);
  const [localHydrated, setLocalHydrated] = useState(false);

  // Step 1 — load the localStorage cache after mount. Always runs. Cheap and
  // synchronous, so it paints before any network round-trip.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setNameState(stored);
    } catch {
      // Storage disabled (private mode, quota, etc.) — stay on null.
    }
    setLocalHydrated(true);
  }, []);

  // Step 2 — once the session resolves with a profile, prefer the DB value
  // and refresh the cache. Falls through silently in demo mode (profile is
  // always null when SUPABASE_ENABLED is false).
  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    if (!session.hydrated) return;
    const dbName = session.profile?.display_name ?? null;
    if (dbName !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameState(dbName);
      try {
        window.localStorage.setItem(STORAGE_KEY, dbName);
      } catch {
        /* ignore */
      }
    }
  }, [session.hydrated, session.profile?.display_name]);

  const setName = useCallback(
    async (next: string) => {
      // Optimistic local update so the UI does not wait on the round-trip.
      setNameState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }

      // Persist to DB only when there is a real session to write against.
      if (SUPABASE_ENABLED && session.user) {
        const supabase = createClient();
        const patch: ProfileUpdate = { display_name: next };
        const { error } = await supabase
          .from("profiles")
          .update(patch)
          .eq("id", session.user.id);
        if (error) {
          // Caller decides how to surface this (toast, retry, etc.).
          throw new Error(error.message);
        }
      }
    },
    [session.user],
  );

  const clearName = useCallback(() => {
    setNameState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage disabled — nothing actionable here.
    }
  }, []);

  // Hydration completes as soon as the localStorage cache is in. The DB sync
  // (when enabled) refines the name in a follow-up effect — but consumers
  // shouldn't gate the avatar/greeting on it, otherwise every navigation
  // shows "?" for the round-trip duration. The cache is the source of first
  // paint; DB is the eventual-consistency authority.
  const hydrated = localHydrated;

  return { name, setName, clearName, hydrated };
}
