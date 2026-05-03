/**
 * Magic-link callback — Kane
 *
 * Supabase redirects the browser here after the user clicks the email link.
 * We exchange the one-time `code` for a session, write the session cookies
 * onto the response, inspect the user's profile to pick a destination, and
 * redirect into the app.
 *
 * Branching:
 *   • No `code` query param → /login?error=missing_code
 *   • Envs missing (offline preview build) → /login?error=auth_disabled
 *   • Supabase exchange error → /login?error=<message>
 *   • Success + `profiles.display_name IS NULL` → /welcome
 *   • Success + display_name present → ${origin}${next} (default /dashboard)
 *
 * The `next` query param lets us thread deep links through the auth round-trip
 * without losing the destination — but `/welcome` always wins on first login
 * so the user gets a one-time orientation before any deep link resolves.
 *
 * The `handle_new_user` trigger inserts a fresh `profiles` row with
 * `display_name = NULL` on first signup, so the /welcome branch fires exactly
 * once per user. After they save a name in /welcome (or via Settings), the
 * column is non-null forever and this branch is skipped.
 *
 * If the profile fetch fails (RLS hiccup, network), we fall back to the
 * normal `next` destination rather than blocking the user behind onboarding.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/login?error=auth_disabled`);
  }

  // Read incoming cookies once, then write outgoing cookies onto the
  // response. Mutating `request.cookies` is not supported in route handlers,
  // so we keep the in/out split explicit.
  //
  // We default the redirect target to ${next} and overwrite it to /welcome
  // below if the profile lookup tells us this is a first login. The cookies
  // we set on this response carry the session either way.
  const incoming = request.cookies.getAll();
  let destination = `${origin}${next}`;
  const response = NextResponse.redirect(destination);

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return incoming;
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Check display_name to decide whether the user needs the welcome flow.
  // Errors here are non-fatal: better to land them on the dashboard than to
  // strand them on /login because of a transient profile read failure.
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      if (profile && profile.display_name === null) {
        destination = `${origin}/welcome`;
      }
    }
  } catch {
    // Swallow — destination stays at ${origin}${next}.
  }

  // NextResponse.redirect freezes the destination at construction time, so we
  // build the final response now that we know where to send the user — while
  // forwarding the cookies we already collected.
  const finalResponse = NextResponse.redirect(destination);
  response.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });
  return finalResponse;
}
