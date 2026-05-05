/**
 * sitemap.ts — Next.js App Router file convention.
 *
 * Lists every public, indexable URL. Anything auth-gated stays out;
 * `public/robots.txt` already disallows those paths so adding them here
 * would only confuse crawlers.
 *
 * Resolved at request time (`/sitemap.xml`). The base URL falls back to
 * `kane.verkex.com` when `NEXT_PUBLIC_SITE_URL` is not set, matching the
 * `metadataBase` used in `src/app/landing/page.tsx`.
 */

import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://kane.verkex.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${SITE_URL}/landing`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/register`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.6,
    },
  ];
}
