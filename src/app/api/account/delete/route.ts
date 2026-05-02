import "server-only";

import { NextResponse } from "next/server";

import { createClient as createServerSupabase } from "@/lib/supabase/server";
// Service-role admin client is required to call `auth.admin.deleteUser` —
// no anon-key path can delete an auth user, even their own.
// eslint-disable-next-line no-restricted-imports
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Permanent account deletion.
 *
 * Hard-deletes the auth user; CASCADE on `profiles.id → auth.users.id` (and
 * every domain table → profiles) wipes all data rows. Storage objects under
 * `receipts/<uid>/...` are deleted explicitly because Postgres FKs cannot
 * cascade into Supabase Storage.
 *
 * The endpoint requires:
 *   - An authenticated session cookie (validated server-side via SSR client).
 *   - A body `{ confirm: "ELIMINAR" }` — the same string the client UI gates
 *     the destructive button behind. Defense in depth: a leaked cookie isn't
 *     enough on its own.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { confirm?: string } = {};
  try {
    body = (await request.json()) as { confirm?: string };
  } catch {
    // Malformed body falls through to the confirmation check below.
  }

  if (body.confirm !== "ELIMINAR") {
    return NextResponse.json(
      { error: "missing_confirmation" },
      { status: 400 },
    );
  }

  const userId = user.id;
  const admin = createAdminClient();

  // Storage cleanup — best effort. We don't want a transient storage hiccup
  // to block the auth deletion (the user expects their account gone). Orphan
  // files would still be unreachable thanks to the bucket's path-bound RLS,
  // and can be swept later via a maintenance job.
  try {
    const { data: files } = await admin.storage
      .from("receipts")
      .list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await admin.storage.from("receipts").remove(paths);
    }
  } catch (err) {
    console.error(
      `[account-delete] storage_cleanup_failed user=${userId} message=${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    console.error(
      `[account-delete] auth_delete_failed user=${userId} status=${deleteErr.status ?? "unknown"} message=${deleteErr.message}`,
    );
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  // Drop the cookie on this response. The client also calls signOut() to
  // clear its in-memory session, but doing it here guarantees the next
  // server-rendered page already sees the user as anonymous. The user row
  // is gone at this point — Supabase may reject the call, but the local
  // cookie is still cleared. We swallow errors so a transient signOut
  // failure can't undo a successful deletion.
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error(
      `[account-delete] signout_failed user=${userId} message=${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return NextResponse.json({ ok: true });
}
