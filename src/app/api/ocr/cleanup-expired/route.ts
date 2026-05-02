import { NextResponse } from "next/server";

// eslint-disable-next-line no-restricted-imports -- service-role required to delete receipts + storage objects across all users
import { createAdminClient } from "@/lib/supabase/admin";

// Force Node runtime + dynamic execution. The cron target must NOT be
// prerendered or evaluated for static analysis at build time — it
// reads process.env.CRON_SECRET, calls Supabase admin, and deletes
// rows. None of that is safe to run during build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ocr/cleanup-expired
 *
 * Vercel Cron target. Deletes receipts (DB row + storage object) past
 * their `expires_at` TTL. Configured in `vercel.json` to run daily at
 * 03:00 UTC.
 *
 * Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>`. We compare
 * with the env var; mismatched → 401. Without this, anyone hitting the
 * route would be able to mass-delete receipts.
 *
 * Resilience:
 *   - Iterates in batches of 100 to bound a single invocation under
 *     ~10s. Successive batches drop already-deleted rows from the
 *     query naturally.
 *   - Storage delete failures are logged but DON'T abort the run —
 *     orphan storage objects get caught next pass or by a manual sweep.
 *     DB row delete is the priority because the row is what the user
 *     can still access via RLS.
 *   - If the function times out mid-batch, the next run picks up where
 *     it left off (no cursor needed — DELETE removes the rows the next
 *     SELECT would have returned).
 */

const BATCH_SIZE = 100;
// Hard ceiling per invocation — keeps us well under the Vercel
// serverless function timeout. With 90-day TTL and modest scale, even
// a 10× spike fits in this many batches.
const MAX_BATCHES = 50;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  // Read process.env directly inside the handler — keeps the module
  // evaluation cheap so Next 16's build-time route analysis doesn't
  // trip over an env-var lookup on a route that's strictly runtime.
  const cronSecret = process.env.CRON_SECRET;
  const expected = cronSecret ? `Bearer ${cronSecret}` : null;

  // If no CRON_SECRET is configured, refuse — never run this in prod
  // without auth, and never expose a public mass-delete endpoint.
  if (!expected) {
    console.error("[ocr/cleanup] cron_secret_not_configured");
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 },
    );
  }

  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  let totalRowsDeleted = 0;
  let totalStorageDeleted = 0;
  let storageErrors = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const nowIso = new Date().toISOString();

    // Pull a batch of expired rows. Filter on the partial index from
    // migration 00022 (`completed` | `failed`) because those make up
    // ~99% of the cleanup volume; stuck `pending`/`processing` rows
    // are caught by a separate manual sweep when needed.
    const { data: expired, error: queryErr } = await admin
      .from("receipts")
      .select("id, image_path")
      .lt("expires_at", nowIso)
      .in("ocr_status", ["completed", "failed"])
      .limit(BATCH_SIZE);

    if (queryErr) {
      console.error("[ocr/cleanup] query_failed", { code: queryErr.code });
      return NextResponse.json(
        {
          error: "query failed",
          rowsDeleted: totalRowsDeleted,
          batches,
        },
        { status: 500 },
      );
    }

    if (!expired || expired.length === 0) break;

    const paths = expired
      .map((r) => r.image_path)
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) {
      const { error: storageErr } = await admin.storage
        .from("receipts")
        .remove(paths);
      if (storageErr) {
        // Best-effort — keep going so the DB rows still get cleaned up.
        // Orphan storage objects are tracked and swept on the next run.
        console.error("[ocr/cleanup] storage_remove_failed", {
          message: storageErr.message,
          batchPaths: paths.length,
        });
        storageErrors += paths.length;
      } else {
        totalStorageDeleted += paths.length;
      }
    }

    const ids = expired.map((r) => r.id);
    const { error: deleteErr } = await admin
      .from("receipts")
      .delete()
      .in("id", ids);
    if (deleteErr) {
      console.error("[ocr/cleanup] db_delete_failed", { code: deleteErr.code });
      return NextResponse.json(
        {
          error: "delete failed",
          rowsDeleted: totalRowsDeleted,
          batches,
        },
        { status: 500 },
      );
    }

    totalRowsDeleted += expired.length;
    batches++;

    // Smaller batch than requested → no more rows match.
    if (expired.length < BATCH_SIZE) break;
  }

  return NextResponse.json({
    ok: true,
    rowsDeleted: totalRowsDeleted,
    storageDeleted: totalStorageDeleted,
    storageErrors,
    batches,
    capped: batches >= MAX_BATCHES,
  });
}
