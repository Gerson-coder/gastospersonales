/**
 * Root redirect — Lumi
 *
 * Client-side gate that decides where a fresh tab should land:
 *
 *   - Authenticated session + `profiles.display_name === null` → /welcome
 *     (user verified email but never finished onboarding).
 *   - Authenticated session otherwise → /dashboard.
 *   - No session + first-time visitor (no `lumi_seen_intro` flag) →
 *     /onboarding/welcome (splash → intro → register).
 *   - No session + returning visitor → /login.
 *
 * The `lumi_seen_intro` flag is UX only — it gates the onboarding splash,
 * not access to protected routes (the middleware handles auth server-side).
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const SEEN_INTRO_KEY = "lumi_seen_intro";

function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(SEEN_INTRO_KEY) === "1";
  } catch {
    // localStorage disabled — treat as first-time so the user gets the
    // welcome experience (better than dumping them on /login cold).
    return false;
  }
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!data.session) {
          const target = hasSeenIntro() ? "/login" : "/onboarding/welcome";
          router.replace(target);
          return;
        }

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
      } catch {
        // Supabase client failed (misconfig / blocked storage). Send to
        // the onboarding flow if first-time, /login if returning.
        if (!cancelled) {
          router.replace(hasSeenIntro() ? "/login" : "/onboarding/welcome");
        }
      }
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
