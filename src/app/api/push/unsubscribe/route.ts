import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/push/unsubscribe
 *
 * Body: { endpoint: string }
 *
 * Borra la subscription del endpoint indicado. Se llama cuando el user
 * apaga el toggle en /settings o cuando el browser revoca el permiso.
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

  let body: { endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json(
      { error: "Falta el campo endpoint." },
      { status: 400 },
    );
  }

  // Cast — push_subscriptions aun no esta en el Database type generado.
  const untyped = supabase as unknown as SupabaseClient;
  const { error } = await untyped
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json(
      { error: "No pudimos cancelar la suscripción." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
