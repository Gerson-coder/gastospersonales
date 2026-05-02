import { z } from "zod";

/**
 * Environment variable validation, lazy-evaluated.
 *
 * Why lazy: Next 16's "Collecting page data" build phase imports route
 * modules to analyze dynamicity, headers, params, etc. That cascades
 * through every transitive import including this one. If the schemas
 * are evaluated eagerly at import time, a single missing env var
 * crashes module load and the entire build fails — even on routes
 * that don't read that var.
 *
 * The fix: expose `clientEnv` / `serverEnv` as Proxies that defer the
 * actual `safeParse` until the first property access. Module load is
 * cheap; validation runs only when something actually reads a value.
 */

// Helper: treat "" as absent so missing or empty env vars both validate
// as `undefined`. Vercel surfaces some unset vars as empty strings during
// build, which a strict `.min(1).optional()` would reject.
const optionalNonEmpty = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

// Schema for variables the CLIENT bundle is allowed to read.
// Anything here MUST be safe to embed in JS shipped to the browser.
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Optional at the env level — currently no consumer in the codebase
  // reads it, but kept in the schema as a documented hook for future
  // share-target / OG-image generation that needs an absolute URL.
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

// Schema for variables ONLY the server may read.
// Reading these from a client bundle MUST throw at first access.
const serverSchema = z.object({
  // Required at runtime. The app cannot serve any data without it.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional at the env level — runtime callers (lib/ocr/client.ts)
  // throw a typed error when missing, so the failure mode is reported
  // by the OCR pipeline instead of crashing the build.
  OPENAI_API_KEY: optionalNonEmpty,
  // Bearer token Vercel Cron sends as `Authorization: Bearer <secret>`.
  // The cleanup-expired route refuses to run when this is missing.
  CRON_SECRET: optionalNonEmpty,
});

type ClientEnv = z.infer<typeof clientSchema>;
type ServerEnv = z.infer<typeof serverSchema>;

function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  values: Record<string, unknown>,
  label: string,
): z.infer<T> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const formatted = JSON.stringify(parsed.error.format(), null, 2);
    throw new Error(
      `[env] Invalid ${label} environment variables:\n${formatted}`,
    );
  }
  return parsed.data;
}

// Lazy parse + cache. The first property access through the Proxy
// triggers parseOrThrow; subsequent accesses return the cached object.
function lazyEnv<T extends ClientEnv | ServerEnv>(
  parse: () => T,
): T {
  let cached: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop) {
      if (!cached) cached = parse();
      return cached[prop as keyof T];
    },
    has(_target, prop) {
      if (!cached) cached = parse();
      return prop in cached;
    },
    ownKeys() {
      if (!cached) cached = parse();
      return Reflect.ownKeys(cached);
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (!cached) cached = parse();
      return Object.getOwnPropertyDescriptor(cached, prop);
    },
  });
}

// Next.js inlines NEXT_PUBLIC_* at build time, so reading them via
// process.env.X is safe in both server and client runtime.
export const clientEnv: ClientEnv = lazyEnv(() =>
  parseOrThrow(
    clientSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    "client",
  ),
);

// Server-only. Guarded so a client bundle that accidentally imports
// this throws at first access instead of silently returning empties.
export const serverEnv: ServerEnv = lazyEnv(() => {
  if (typeof window !== "undefined") {
    throw new Error("[env] serverEnv accessed from a client bundle");
  }
  return parseOrThrow(
    serverSchema,
    {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
    },
    "server",
  );
});
