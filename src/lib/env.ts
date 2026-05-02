import { z } from "zod";

// Schema for variables the CLIENT bundle is allowed to read.
// Anything here MUST be safe to embed in JS shipped to the browser.
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

// Schema for variables ONLY the server may read.
// Reading these from a client bundle MUST throw at module init.
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Bearer token Vercel Cron sends as `Authorization: Bearer <secret>`.
  // Optional in dev so local boots succeed; required in prod for the
  // cleanup-expired route to authorize the caller.
  CRON_SECRET: z.string().min(16).optional(),
});

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

// Next.js inlines NEXT_PUBLIC_* at build time, so reading them via
// process.env.X is safe in both the server and client runtime.
export const clientEnv = parseOrThrow(
  clientSchema,
  {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  "client",
);

// Server-only. Guarded so a client bundle that accidentally imports this
// throws at module init instead of silently shipping `undefined`.
type ServerEnv = z.infer<typeof serverSchema>;

export const serverEnv: ServerEnv =
  typeof window === "undefined"
    ? parseOrThrow(
        serverSchema,
        {
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          CRON_SECRET: process.env.CRON_SECRET,
        },
        "server",
      )
    : (undefined as never);
