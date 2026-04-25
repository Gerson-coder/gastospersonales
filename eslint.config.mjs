import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Strategy for keeping the service-role admin client out of the browser bundle:
//
//   1) Primary defense: `import 'server-only'` at the top of
//      `src/lib/supabase/admin.ts` (added in Batch B). Next.js fails the build
//      if a "use client" module transitively imports a server-only module.
//
//   2) Editor / lint defense: the `no-restricted-imports` rule below blocks
//      any `**/*.ts` or `**/*.tsx` file from importing `@/lib/supabase/admin`
//      via a pattern, so accidental imports surface in the editor BEFORE
//      `next build` runs. Files that legitimately need admin access (server
//      actions, route handlers, cron) silence the rule with an inline
//      `// eslint-disable-next-line no-restricted-imports` comment.
//
// The build-time `server-only` guard is the source of truth; this lint rule
// is convenience.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/sw.js",
    "Lumi Design System/**",
    "scripts/generate-pwa-icons.cjs",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/supabase/admin", "@/lib/supabase/admin"],
              message:
                "admin.ts is server-only (service-role key). Use @/lib/supabase/server in Server Components / Actions / Route Handlers. If you genuinely need cross-tenant access, silence with an inline eslint-disable comment.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
