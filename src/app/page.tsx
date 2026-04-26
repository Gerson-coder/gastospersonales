/**
 * Root redirect — Lumi
 *
 * Decides where a fresh browser tab should land. Two parallel auth realities
 * live behind this gate:
 *
 *   1. Supabase wired (envs PRESENT) → we ask the browser client whether a
 *      session cookie is alive. If yes, /dashboard. If no, /login.
 *      A cleared `lumi-user-name` is fine — the user is logged in but hasn't
 *      picked a display name yet, and Settings will let them set one.
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
            router.replace("/dashboard");
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
