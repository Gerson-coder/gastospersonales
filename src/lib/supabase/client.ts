"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser-side Supabase client. Reads the public env vars at call time so the
 * module can be imported (and the build can succeed) even before
 * `.env.local` is provisioned. The throw is deferred to the first runtime
 * use, where the developer gets an actionable message.
 *
 * Env vars are validated by `@/lib/env` in modules that opt-in to eager
 * validation; here we deliberately read `process.env` so this file does not
 * crash at module init when the schema has not been satisfied yet.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
