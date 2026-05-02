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
// Helper: treat "" as absent so missing or empty env vars both validate
// as `undefined`. This matters during Next 16 build-time page-data
// collection — env vars that aren't part of the build environment may
// surface as empty strings rather than `undefined`, which a strict
// `.min(1).optional()` would reject and crash module load.
const optionalNonEmpty = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const serverSchema = z.object({
  // Required. The app cannot serve any data without it.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Optional at the env level — runtime callers (lib/ocr/client.ts)
  // throw a typed error when missing, so the failure mode is reported
  // by the OCR pipeline instead of crashing the build.
  OPENAI_API_KEY: optionalNonEmpty,
  // Bearer token Vercel Cron sends as `Authorization: Bearer <secret>`.
  // Optional in dev so local boots succeed; the cleanup-expired route
  // refuses to run when this is missing.
  CRON_SECRET: optionalNonEmpty,
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
