import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that render or respond without a Supabase session. Anything not
// listed here (or covered by PUBLIC_API_PREFIXES) is treated as protected
// and redirected to /login when the user is anonymous.
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/login",
  "/register",
  "/onboarding/welcome",
  "/onboarding/intro",
  "/auth/verify-email",
  "/auth/reset-password",
]);

// API namespaces whose routes do their own auth checks (signup, OTP issuance,
// device fingerprint lookup, etc.). They must reach the server even without
// a session cookie.
const PUBLIC_API_PREFIXES = ["/api/auth/"] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_API_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Pre-Supabase deployments / local dev without `.env.local`: let everything
  // through. The pages themselves render real or empty data — the auth gate
  // only kicks in once the project is wired.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session if needed. Do NOT remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isApi = pathname.startsWith("/api/");

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    // Preserve where the user was trying to go so /login can bounce them
    // back after a successful auth. Skip API hits — there is no UX flow to
    // resume for a fetch().
    if (!isApi) {
      redirectUrl.searchParams.set("next", pathname);
    }
    const redirectResponse = NextResponse.redirect(redirectUrl);
    if (!isApi) {
      redirectResponse.headers.set("Cache-Control", "no-store, max-age=0");
    }
    return redirectResponse;
  }

  // Disable BFCache (back-forward cache) for HTML page responses. Without
  // this, browsers snapshot authenticated pages in memory and serve them
  // on the back button without re-running middleware or layouts — a user
  // kicked to /welcome (incomplete profile) or signed out could press back
  // and see the dashboard from a stale snapshot. `no-store` makes the page
  // ineligible for BFCache and forces a fresh fetch every navigation.
  //
  // Critically excluded: /api/* responses. iOS Safari (and WKWebView in
  // standalone PWAs) has a long-standing bug where `no-store` on XHR/fetch
  // responses can drop Set-Cookie headers from the response — which would
  // break the auth flow (register → verify-otp → onboarding/name) by
  // losing the session between calls. API caching isn't a BFCache concern
  // anyway; browsers don't snapshot fetch results into BFCache.
  if (!isApi) {
    supabaseResponse.headers.set("Cache-Control", "no-store, max-age=0");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip Next internals, static files, image optimization, the auth callback
    // (which manages its own session creation), and Supabase API endpoints.
    "/((?!_next/static|_next/image|favicon.ico|icons|brand|manifest.json|sw.js|swe-worker-.*\\.js|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
