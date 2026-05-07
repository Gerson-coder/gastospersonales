import "server-only";

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push helpers — server-only.
 *
 * Wrapper sobre `web-push` que:
 *   - Valida y configura las VAPID keys una sola vez por proceso.
 *   - Manda push a un user (todas sus subscriptions activas en una sola
 *     llamada).
 *   - Maneja codes 404/410 (subscription expirada) borrando la fila del
 *     DB asi no acumulamos endpoints muertos.
 *
 * VAPID keys: par publico/privado que el push service usa para validar
 * que somos el origen autorizado. Generadas UNA vez (ver README), van
 * en env vars VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 *
 * El cliente lee NEXT_PUBLIC_VAPID_PUBLIC_KEY (mismo valor que
 * VAPID_PUBLIC_KEY) para registrar la subscription en el browser.
 */

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID env vars missing — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (mailto:...).",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export type PushPayload = {
  /** Titulo bold del notification card. */
  title: string;
  /** Cuerpo del card — 1-2 lineas. */
  body: string;
  /**
   * URL relativa a abrir cuando el user toca la notificacion.
   * El SW lee este campo en el `notificationclick` handler.
   * Default: "/dashboard".
   */
  url?: string;
  /**
   * Tag de dedup en el OS — si llega un push con el mismo tag mientras
   * uno previo esta en pantalla, lo reemplaza en lugar de apilar dos
   * cards. Util para "presupuesto X actualizado".
   */
  tag?: string;
  /** Icon URL (default: /icons/icon-192.png del manifest). */
  icon?: string;
  /** Badge para Android status bar (mono). */
  badge?: string;
  /** Datos arbitrarios accesibles desde el SW handler. */
  data?: Record<string, unknown>;
};

export type SendPushResult = {
  delivered: number;
  failed: number;
  /** Endpoints que dieron 404/410 — se borraron del DB. */
  removed: number;
};

/**
 * Manda un push a TODAS las subscriptions activas de un user.
 * Filtros opcionales:
 *   - `kind === "budget_alerts"` => solo a subscriptions con
 *     `budget_alerts = true`.
 *   - `kind === "daily_reminder"` => idem para `daily_reminder`.
 *
 * Devuelve metricas para que el caller las loguee en notification_logs.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  filterKind?: "budget_alerts" | "daily_reminder",
): Promise<SendPushResult> {
  ensureVapidConfigured();
  // Cast a SupabaseClient sin generic — push_subscriptions (migration
  // 00034) aun no esta en el Database type generado por
  // `supabase gen types`. Quitar el cast cuando se regeneren los types.
  const admin = createAdminClient() as unknown as SupabaseClient;

  // Bajamos las subscriptions activas. Filtramos por preferencia si el
  // caller especifico el kind — sin filtro mandamos a todas (caso "test").
  let query = admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (filterKind === "budget_alerts") {
    query = query.eq("budget_alerts", true);
  } else if (filterKind === "daily_reminder") {
    query = query.eq("daily_reminder", true);
  }

  const { data: subs, error } = (await query) as {
    data: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> | null;
    error: { message?: string } | null;
  };
  if (error) {
    throw new Error(`No pudimos leer las subscriptions: ${error.message}`);
  }
  if (!subs || subs.length === 0) {
    return { delivered: 0, failed: 0, removed: 0 };
  }

  const body = JSON.stringify(payload);
  const expiredIds: string[] = [];
  let delivered = 0;
  let failed = 0;

  // Mandamos en paralelo — typicamente 1-3 subscriptions por user.
  await Promise.all(
    subs.map(async (s) => {
      const subscription: WebPushSubscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, body, {
          // TTL = 24h. Si el dispositivo esta offline mas de eso, el push
          // se descarta (la mayoria son tiempo-sensitivos: presupuesto al
          // 80% del MES, no del ano que viene).
          TTL: 60 * 60 * 24,
          urgency: "normal",
        });
        delivered += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expirada — el user desinstalo la PWA o revoco
          // permisos. Borramos para no insistir.
          expiredIds.push(s.id);
        } else {
          failed += 1;
          console.error("[push] sendNotification failed", {
            userId,
            endpoint: s.endpoint.slice(0, 60),
            statusCode,
            message: (err as Error).message,
          });
        }
      }
    }),
  );

  // Cleanup endpoints muertos en una sola query.
  if (expiredIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return { delivered, failed, removed: expiredIds.length };
}
