/**
 * Root redirect — Kane
 *
 * Reads from the SessionProvider (which already validates the JWT via
 * `getUser()` in its mount effect) instead of running its own
 * `getSession()` — that one trusts localStorage blindly and would re-send
 * deleted/incomplete users straight to /dashboard.
 *
 * Flow:
 *   - No session + first-time visitor → /onboarding/welcome
 *   - No session + returning visitor → /login
 *   - Has session, profile incomplete (no display_name) → /welcome
 *   - Has session, profile complete → /dashboard
 *
 * The auth-guard middleware + the server-side guard in `(tabs)/layout.tsx`
 * cover deep links to protected pages independently.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/use-session";

const SEEN_INTRO_KEY = "kane_seen_intro";

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
  const { user, profile, hydrated } = useSession();

  useEffect(() => {
    // Wait for SessionProvider to finish its initial validation. If the
    // session is a ghost, SessionProvider triggers `recoverFromStaleSession`
    // before setting hydrated, which window.location.replaces away — this
    // effect never sees the post-recovery state.
    if (!hydrated) return;

    if (!user) {
      router.replace(hasSeenIntro() ? "/login" : "/onboarding/welcome");
      return;
    }

    // User exists but profile is missing (orphan auth row) or display_name
    // is null (mid-onboarding). Send to /welcome so they finish setup
    // instead of landing on an empty dashboard.
    if (!profile || !profile.display_name) {
      router.replace("/welcome");
      return;
    }

    router.replace("/dashboard");
  }, [hydrated, user, profile, router]);

  return null;
}
