import "server-only";

import { NextResponse } from "next/server";

import { sendPushToUser } from "@/lib/push/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/push/test
 *
 * Manda un push de prueba a TODAS las subscriptions del user actual.
 * Lo invoca el boton "Probar aviso ahora" del toggle en /settings —
 * util para verificar que el permiso quedo concedido y que el
 * dispositivo recibe pushes correctamente.
 *
 * No respeta `budget_alerts` ni `daily_reminder` (es un test, va a todo
 * device del user).
 */
export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(user.id, {
      title: "Kane",
      body: "Notificaciones activadas correctamente. Te avisaremos cuando se acerquen los límites.",
      tag: "kane-test",
      url: "/settings",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/push/test] send failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido." },
      { status: 500 },
    );
  }
}
