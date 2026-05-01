import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Security headers applied to every response. Tuned for the Lumi stack:
// Supabase (REST + Realtime WSS + Storage), Resend (email assets), and
// the OpenAI vision API for receipt OCR (server-side fetch only, so no
// connect-src entry needed for it).
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next 16 + Turbopack inline scripts; 'unsafe-inline' kept until
      // we wire a nonce strategy. 'unsafe-eval' only needed in dev.
      "script-src 'self' 'unsafe-inline'" +
        (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Default `output` (no `standalone`) — keeps Vercel build path simple.

  // Hide the "X-Powered-By: Next.js" header. Tells attackers nothing about
  // the framework / version, which makes targeted CVE scans harder.
  poweredByHeader: false,

  // No browser source maps in production. Source maps de-minify the bundle
  // and expose the original TypeScript (component names, comments, control
  // flow). Disabled by default in Next 16 but we lock it explicitly.
  productionBrowserSourceMaps: false,

  // Strip console.* calls from production bundles to avoid leaking
  // runtime state in DevTools. Keep console.error so Vercel runtime logs
  // still capture real failures.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

// Skip the Serwist wrap entirely in dev. The wrap injects a webpack config
// key, which Next 16's default Turbopack bundler warns about. Serwist only
// matters for production PWA builds, so we apply it only there.
// `swSrc` is authored in Batch D as `src/app/sw.ts`; until then,
// `npm run build` will fail at the SW step (expected).
export default process.env.NODE_ENV === "production"
  ? withSerwistInit({
      swSrc: "src/app/sw.ts",
      swDest: "public/sw.js",
      cacheOnNavigation: true,
    })(nextConfig)
  : nextConfig;
