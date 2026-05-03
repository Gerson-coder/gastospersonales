"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { useSession } from "@/lib/use-session";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const STORAGE_KEY = "kane-user-name";
const AVATAR_STORAGE_KEY = "kane-user-avatar-url";

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
 *   - Demo / pre-auth: name lives in `localStorage["kane-user-name"]`. This
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
  avatarUrl: string | null;
  setName: (name: string) => Promise<void>;
  setAvatarUrl: (url: string | null) => void;
  clearName: () => void;
  hydrated: boolean;
} {
  const session = useSession();
  const [name, setNameState] = useState<string | null>(null);
  // Avatar URL now lives in local state too. We seed from the session
  // profile (the source of truth) but expose a setter so consumers can
  // optimistically flip the UI immediately after an upload, without
  // waiting for the next session refresh round-trip. Same pattern as
  // `name` — DB writes flow through the data layer; the hook just
  // mirrors the new value across every mounted instance via storage
  // events so the dashboard greeting + sidebar + ProfileMenu all
  // update in lockstep.
  const [avatarUrl, setAvatarUrlState] = useState<string | null>(null);
  const [localHydrated, setLocalHydrated] = useState(false);

  // Step 1 — load the localStorage cache after mount. Always runs. Cheap and
  // synchronous, so it paints before any network round-trip.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setNameState(stored);
      const storedAvatar = window.localStorage.getItem(AVATAR_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storedAvatar !== null) {
        setAvatarUrlState(storedAvatar === "" ? null : storedAvatar);
      }
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
    // Avatar — the session profile carries the canonical URL with a
    // cache-buster; mirror it into local state + storage so a fresh
    // mount paints the right image without an extra round-trip. We
    // explicitly accept null so a removed avatar clears the UI.
    const dbAvatar = session.profile?.avatar_url ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarUrlState(dbAvatar);
    try {
      window.localStorage.setItem(AVATAR_STORAGE_KEY, dbAvatar ?? "");
    } catch {
      /* ignore */
    }
  }, [
    session.hydrated,
    session.profile?.display_name,
    session.profile?.avatar_url,
  ]);

  // Cross-instance sync — when one mount calls setName / setAvatarUrl,
  // dispatch a `storage` event so every other useUserName mount on the
  // same page (sidebar greeting, dashboard header, ProfileMenu, etc.)
  // re-reads from cache immediately instead of waiting for the session
  // refresh that lands the new value through the network.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setNameState(e.newValue);
      } else if (e.key === AVATAR_STORAGE_KEY) {
        setAvatarUrlState(e.newValue === "" ? null : e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setName = useCallback(
    async (next: string) => {
      // Optimistic local update so the UI does not wait on the round-trip.
      setNameState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
        // Same-tab sync — the native `storage` event fires only in
        // OTHER tabs, so we synthesise one here so other useUserName
        // mounts on this page re-read the cache.
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: STORAGE_KEY,
            newValue: next,
          }),
        );
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
        // Refresh the shared session.profile so other useUserName mounts
        // (dashboard greeting, sidebar, ProfileMenu) re-read the latest
        // display_name on their next effect pass. Without this, when the
        // user navigates away from /profile and the editing component
        // unmounts, the dashboard's useUserName step-2 effect reads
        // session.profile.display_name (still cached as the OLD value)
        // and overwrites the localStorage value we just set — the user
        // sees the old name on the dashboard until a hard reload.
        // Best-effort: a refresh failure doesn't undo the optimistic UI
        // update or the DB write, so swallow the error here.
        try {
          await session.refresh();
        } catch {
          /* ignore */
        }
      }
    },
    [session],
  );

  // Optimistic avatar update — call right after `uploadAvatar` returns
  // the new public URL so the UI flips before the session refresh
  // round-trip completes. Pass null to clear (post-removeAvatar).
  const setAvatarUrl = useCallback((url: string | null) => {
    setAvatarUrlState(url);
    try {
      const serialised = url ?? "";
      window.localStorage.setItem(AVATAR_STORAGE_KEY, serialised);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: AVATAR_STORAGE_KEY,
          newValue: serialised,
        }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const clearName = useCallback(() => {
    setNameState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(AVATAR_STORAGE_KEY);
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

  return { name, avatarUrl, setName, setAvatarUrl, clearName, hydrated };
}
