/**
 * Root redirect — Lumi
 *
 * Client-side gate that decides where a fresh tab should land:
 *
 *   - Authenticated session + `profiles.display_name === null` → /welcome
 *     (user verified email but never finished onboarding).
 *   - Authenticated session otherwise → /dashboard.
 *   - No session → /login.
 *
 * The auth-guard middleware (`middleware.ts`) catches deep links to
 * protected pages independently; this page only handles the "/" entry.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

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
          router.replace("/login");
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
        // /login so the user can re-auth instead of getting stuck on /.
        if (!cancelled) router.replace("/login");
      }
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
