import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * SERVER-ONLY admin client with service-role privileges. Bypasses RLS.
 * Use only for trusted server actions or route handlers that need
 * cross-tenant access (e.g. allowlist checks pre-signup, OCR worker).
 *
 * NEVER import from "use client" files. The `'server-only'` import +
 * the `no-restricted-imports` ESLint rule + Next's bundling check together
 * guarantee this never reaches the browser.
 *
 * Env vars are read from `process.env` rather than `@/lib/env` so importing
 * this module does not crash the build when envs are not yet set; the throw
 * is deferred to the first call.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin env vars missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
