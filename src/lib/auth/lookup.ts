import "server-only";

// Type-only import — this module never instantiates the admin client; it
// receives one from each callsite (which already declared the disable).
// eslint-disable-next-line no-restricted-imports
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Find an auth.users row by email. Walks `admin.auth.admin.listUsers` pages
 * until a match is found or the list runs out. Used by the no-session auth
 * flows (login-with-pin, login-via-otp on a new device) where we identify
 * the user purely by their email address.
 *
 * Performance: each `listUsers` call is one round-trip; with perPage=200 we
 * scan up to 10k users in a single page. For our MVP scale that's a single
 * page lookup. Revisit when user count grows past ~10k — at that point we
 * should add a SQL function (`SELECT id FROM auth.users WHERE email = $1`)
 * exposed via Supabase RPC for an O(1) lookup.
 */
export async function findUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error(
        `[lookup] list_users_failed page=${page} message=${error.message}`,
      );
      return null;
    }
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === normalized,
    );
    if (found && found.email) {
      return { id: found.id, email: found.email };
    }
    if (data.users.length < perPage) return null;
    page += 1;
    // Safety: don't paginate past 50 pages (10k users) silently.
    if (page > 50) {
      console.warn(`[lookup] aborted_after_50_pages email_hash=${normalized.length}`);
      return null;
    }
  }
}
