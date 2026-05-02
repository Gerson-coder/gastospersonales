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

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    // Preserve where the user was trying to go so /login can bounce them
    // back after a successful auth. Skip API hits — there is no UX flow to
    // resume for a fetch().
    if (!pathname.startsWith("/api/")) {
      redirectUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirectUrl);
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
