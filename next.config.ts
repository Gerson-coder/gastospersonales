import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // Default `output` (no `standalone`) — keeps Vercel build path simple.
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
