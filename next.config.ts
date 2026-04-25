import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Wrap the Next config with Serwist for PWA support.
// `swSrc` doesn't exist yet — it's authored in Batch D as `src/app/sw.ts`.
// Until then, `npm run build` would fail; that's expected for now.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Default `output` (no `standalone`) — keeps Vercel build path simple.
};

export default withSerwist(nextConfig);
