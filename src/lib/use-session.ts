"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Session = {
  user: User | null;
  profile: Profile | null;
  hydrated: boolean;
  refresh: () => Promise<void>;
};

// Mirrors the runtime gate used in /login and /settings: do we have a real
// Supabase project wired? When false we short-circuit to a "demo" state so
// the app stays usable without env vars.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

const DEFAULT_SESSION: Session = {
  user: null,
  profile: null,
  hydrated: !SUPABASE_ENABLED,
  refresh: async () => {},
};

const SessionContext = React.createContext<Session>(DEFAULT_SESSION);

/**
 * App-wide session state. Mounted ONCE in `Providers` (RootLayout) so every
 * consumer of `useSession()` reads from a single shared store — only one
 * `auth.getSession()` call and one `profiles` fetch per app load.
 *
 * Why a singleton: previously each `useSession()` call instantiated its own
 * loader. Multiple components mounting at once (Sidebar, ProfileMenu, page
 * content...) raced for the Supabase storage lock that `getUser()` acquires
 * and produced "Lock was released because another request stole it" errors.
 *
 * `getSession()` (vs `getUser()`) reads from local storage only — no network
 * round-trip and no storage lock. RLS still validates the JWT on the server
 * for any data request, so this is safe for UI rendering.
 */
export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [hydrated, setHydrated] = React.useState(!SUPABASE_ENABLED);

  const fetchProfile = React.useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        // RLS or network — keep profile null but do not throw; the UI can
        // degrade to "—" placeholders rather than crash.
        setProfile(null);
        return;
      }
      if (data) {
        setProfile(data);
        return;
      }
      // Defensive auto-create: if the profile row is missing, insert it now.
      // This covers users created BEFORE the migrations were applied (the
      // handle_new_user trigger never fired for them) and any race where the
      // trigger lags behind the first authenticated request. RLS allows the
      // insert because `auth.uid() = id`. If the insert races with another
      // tab and conflicts, fall back to a re-read.
      const { data: created, error: insertErr } = await supabase
        .from("profiles")
        .insert({ id: userId })
        .select("*")
        .maybeSingle();
      if (created) {
        setProfile(created);
        return;
      }
      if (insertErr) {
        const { data: refetched } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        setProfile(refetched ?? null);
        return;
      }
      setProfile(null);
    } catch {
      setProfile(null);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    if (!SUPABASE_ENABLED) return;
    await fetchProfile(user?.id ?? null);
  }, [fetchProfile, user?.id]);

  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;

    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      await fetchProfile(nextUser?.id ?? null);
      if (!cancelled) setHydrated(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      void fetchProfile(nextUser?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const value = React.useMemo<Session>(
    () => ({ user, profile, hydrated, refresh }),
    [user, profile, hydrated, refresh],
  );

  // React.createElement (not JSX) so this file can stay .ts — the rest of the
  // module is plain TypeScript and we don't want to flip it to .tsx just for
  // one return statement.
  return React.createElement(
    SessionContext.Provider,
    { value },
    children,
  );
}

export function useSession(): Session {
  return React.useContext(SessionContext);
}
