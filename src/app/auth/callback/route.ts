/**
 * Magic-link callback — Lumi
 *
 * Supabase redirects the browser here after the user clicks the email link.
 * We exchange the one-time `code` for a session, write the session cookies
 * onto the response, and redirect into the app.
 *
 * Branching:
 *   • No `code` query param → /login?error=missing_code
 *   • Envs missing (offline preview build) → /login?error=auth_disabled
 *   • Supabase exchange error → /login?error=<message>
 *   • Success → ${origin}${next} (default /dashboard)
 *
 * The `next` query param lets us thread deep links through the auth round-trip
 * without losing the destination.
 *
 * TODO: Once we ship a profile model in Batch C+, hydrate the local
 * `lumi-user-name` slot from the Supabase user record so the new flow
 * preserves the "what should we call you" UX.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  const incoming = request.cookies.getAll();
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, anonKey, {
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

  return response;
}
