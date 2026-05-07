import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/push/subscribe
 *
 * Body:
 *   {
 *     endpoint: string,
 *     keys: { p256dh: string, auth: string },
 *     deviceLabel?: string,
 *   }
 *
 * Guarda (o actualiza) la subscription del dispositivo actual. Se llama
 * desde `usePushSubscription` apenas el browser autoriza el permiso y
 * registra la subscription. Idempotente — re-subscribir el mismo
 * endpoint hace upsert via la unique (user_id, endpoint).
 *
 * RLS-protected: el INSERT solo cuela si auth.uid() === user_id (mismo
 * pattern que el resto del proyecto).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    deviceLabel?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  const p256dh =
    typeof body.keys?.p256dh === "string" ? body.keys.p256dh : null;
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : null;
  const deviceLabel =
    typeof body.deviceLabel === "string" && body.deviceLabel.trim().length > 0
      ? body.deviceLabel.trim().slice(0, 80)
      : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Faltan campos: endpoint, keys.p256dh o keys.auth." },
      { status: 400 },
    );
  }

  // Cast a SupabaseClient sin generic — `push_subscriptions` (migration
  // 00034) aun no esta en el Database type generado. Cuando se regenere
  // con `supabase gen types`, el cast se puede quitar.
  const untyped = supabase as unknown as SupabaseClient;

  // Upsert por (user_id, endpoint). Si el dispositivo se re-subscribe
  // (ej: browser regenero las llaves), actualizamos en lugar de duplicar.
  const { data, error } = await untyped
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        device_label: deviceLabel,
        // Por defecto activamos budget_alerts para que el toggle "tenga
        // sentido" la primera vez. El user lo puede apagar luego.
        budget_alerts: true,
      },
      { onConflict: "user_id,endpoint" },
    )
    .select("id, device_label, budget_alerts, daily_reminder")
    .single();

  if (error) {
    console.error("[/api/push/subscribe] upsert failed", {
      userId: user.id,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "No pudimos guardar la suscripción." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, subscription: data });
}
