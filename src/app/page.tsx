/**
 * Root redirect — Lumi
 *
 * Decides where a fresh browser tab should land. Two parallel auth realities
 * live behind this gate:
 *
 *   1. Supabase wired (envs PRESENT) → we ask the browser client whether a
 *      session cookie is alive. If yes, we peek at `profiles.display_name`:
 *      a NULL value means the user verified email but never finished
 *      onboarding, so we send them to /welcome; otherwise /dashboard.
 *      A profile read error falls through to /dashboard rather than blocking.
 *
 *   2. Supabase missing (envs ABSENT, demo build) → fall back to the legacy
 *      localStorage gate so `npm run dev` without `.env.local` keeps working.
 *
 * TODO: Move this gate to `middleware.ts` once we trust the Supabase session
 * on the server. Today we keep it client-side to avoid forcing the build to
 * have envs available.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "lumi-user-name";

const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

function readStoredName(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      if (SUPABASE_ENABLED) {
        try {
          const supabase = createClient();
          const { data } = await supabase.auth.getSession();
          if (cancelled) return;
          if (data.session) {
            // Authenticated — pick /welcome vs /dashboard the same way the
            // /auth/callback handler does, so a user who lands on `/` after
            // verifying email gets the orientation flow exactly once.
            let target = "/dashboard";
            try {
              const { data: profile } = await supabase
                .from("profiles")
                .select("display_name")
                .eq("id", data.session.user.id)
                .maybeSingle();
              if (profile && profile.display_name === null) {
                target = "/welcome";
              }
            } catch {
              // Profile read failed — keep the safe default of /dashboard.
            }
            if (!cancelled) router.replace(target);
            return;
          }
          // No live session: fall through to the localStorage check so the
          // demo-name flow still works for users mid-migration.
        } catch {
          // If the client throws (misconfig, blocked storage) treat it as
          // "no session" and let the legacy gate decide.
        }
      }

      const target = readStoredName() ? "/dashboard" : "/login";
      if (!cancelled) router.replace(target);
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
