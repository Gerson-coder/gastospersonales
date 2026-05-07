import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line no-restricted-imports -- service-role required to read every user's budgets cross-tenant
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/server";

/**
 * POST /api/cron/budget-alerts
 *
 * Vercel Cron target — corre 1x/dia (configurado en vercel.json a las
 * 14:00 UTC = 09:00 hora Lima). Para cada user con push activado:
 *
 *   1. Lee sus budgets activos (no archivados) en PEN y USD por separado.
 *   2. Calcula spent del mes actual por categoria.
 *   3. Si ratio >= 0.80 y aun no se mando el aviso de "warning" para
 *      este budget en el mes => manda push + log en notification_logs.
 *   4. Si ratio >= 1.00 y aun no se mando "exceeded" => manda push.
 *
 * Anti-spam fuerte:
 *   - dedup_key = `${budget_id}:${YYYY-MM}` por kind. Una insertion en
 *     notification_logs falla por unique constraint si ya se mando.
 *   - Por user mandamos a TODAS sus subscriptions con budget_alerts=true
 *     (cubre celular + laptop, etc).
 *
 * Auth: Bearer ${CRON_SECRET} en header Authorization (Vercel lo manda
 * automaticamente). Sin secret configurado => 503.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cap defensivo — un cron con bug no debe poder mandar miles de pushes.
// 200 alerts por corrida es mas que suficiente para los proximos meses.
const MAX_ALERTS_PER_RUN = 200;

type Budget = {
  id: string;
  user_id: string;
  category_id: string;
  limit_minor: number;
  currency: "PEN" | "USD";
};

type SpentByCat = Map<string, number>;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const expected = cronSecret ? `Bearer ${cronSecret}` : null;
  if (!expected) {
    console.error("[cron/budget-alerts] cron_secret_not_configured");
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 },
    );
  }
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `admin` con tipos para las tablas existentes (budgets, transactions,
  // categories). `adminUntyped` solo para push_subscriptions y
  // notification_logs (migration 00034 todavia no en el Database type).
  // Cuando se regeneren los types, eliminar adminUntyped.
  const admin = createAdminClient();
  const adminUntyped = admin as unknown as SupabaseClient;
  const startedAt = Date.now();
  let alertsSent = 0;
  let usersChecked = 0;
  let usersSkipped = 0;
  let errors = 0;

  // Periodo a evaluar: mes calendario actual UTC. Usamos UTC para que la
  // dedup_key (YYYY-MM) sea estable entre runs sin importar la hora del
  // cron. Para Lima esto coincide con el mes local salvo en la primera y
  // ultima hora del mes — aceptable.
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();

  // ── 1) Pull users con al menos UNA subscription budget_alerts=true.
  // Mandar el push se filtra dentro de sendPushToUser por la misma flag.
  const { data: subRows, error: subErr } = await adminUntyped
    .from("push_subscriptions")
    .select("user_id")
    .eq("budget_alerts", true);
  if (subErr) {
    console.error("[cron/budget-alerts] sub_query_failed", subErr);
    return NextResponse.json(
      { error: "subscription query failed" },
      { status: 500 },
    );
  }
  const userIds = Array.from(new Set((subRows ?? []).map((r) => r.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, usersChecked: 0, alertsSent: 0 });
  }

  // ── 2) Por cada user, evaluar sus budgets vs spent.
  for (const userId of userIds) {
    if (alertsSent >= MAX_ALERTS_PER_RUN) {
      console.warn("[cron/budget-alerts] max_alerts_reached", { alertsSent });
      break;
    }
    usersChecked += 1;

    try {
      const { data: budgets, error: bErr } = await admin
        .from("budgets")
        .select("id, user_id, category_id, limit_minor, currency")
        .eq("user_id", userId)
        .is("archived_at", null);
      if (bErr) {
        errors += 1;
        continue;
      }
      const activeBudgets = (budgets ?? []) as Budget[];
      if (activeBudgets.length === 0) {
        usersSkipped += 1;
        continue;
      }

      // Spent por categoria, separado por currency. Un solo query por user.
      const { data: txs, error: txErr } = await admin
        .from("transactions")
        .select("category_id, amount_minor, currency")
        .eq("user_id", userId)
        .eq("kind", "expense")
        .is("archived_at", null)
        .gte("occurred_at", monthStart)
        .lt("occurred_at", monthEnd);
      if (txErr) {
        errors += 1;
        continue;
      }

      const spentPEN: SpentByCat = new Map();
      const spentUSD: SpentByCat = new Map();
      for (const t of txs ?? []) {
        if (!t.category_id) continue;
        const target = t.currency === "USD" ? spentUSD : spentPEN;
        target.set(
          t.category_id,
          (target.get(t.category_id) ?? 0) + (t.amount_minor ?? 0),
        );
      }

      // Categorias del user para nombrar la notificacion.
      const catIds = Array.from(
        new Set(activeBudgets.map((b) => b.category_id)),
      );
      const catMap = new Map<string, string>();
      if (catIds.length > 0) {
        const { data: cats } = await admin
          .from("categories")
          .select("id, name")
          .in("id", catIds);
        for (const c of cats ?? []) catMap.set(c.id, c.name);
      }

      // Para cada budget evalua warning + exceeded.
      for (const b of activeBudgets) {
        if (alertsSent >= MAX_ALERTS_PER_RUN) break;
        const spent =
          (b.currency === "USD" ? spentUSD : spentPEN).get(b.category_id) ?? 0;
        if (b.limit_minor <= 0) continue;
        const ratio = spent / b.limit_minor;
        const catName = catMap.get(b.category_id) ?? "categoría";
        const sym = b.currency === "USD" ? "$" : "S/";
        const fmt = (m: number) =>
          `${sym} ${(m / 100).toLocaleString("es-PE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;

        // Exceeded primero — si ya paso el 100%, ese aviso es mas
        // urgente que el de 80% (que probablemente se mando un dia antes).
        if (ratio >= 1) {
          const sent = await tryLogAndSend(adminUntyped, {
            userId,
            kind: "budget_exceeded",
            dedupKey: `${b.id}:${monthKey}`,
            title: `Excediste tu presupuesto de ${catName}`,
            body: `Llevas ${fmt(spent)} de ${fmt(b.limit_minor)} este mes.`,
            url: "/budgets",
            tag: `budget-exceeded-${b.id}-${monthKey}`,
          });
          if (sent) alertsSent += 1;
        } else if (ratio >= 0.8) {
          const sent = await tryLogAndSend(adminUntyped, {
            userId,
            kind: "budget_warning",
            dedupKey: `${b.id}:${monthKey}`,
            title: `Tu presupuesto de ${catName} al ${Math.round(ratio * 100)}%`,
            body: `Has gastado ${fmt(spent)} de ${fmt(b.limit_minor)} este mes.`,
            url: "/budgets",
            tag: `budget-warning-${b.id}-${monthKey}`,
          });
          if (sent) alertsSent += 1;
        }
      }
    } catch (err) {
      errors += 1;
      console.error("[cron/budget-alerts] user_loop_error", { userId, err });
    }
  }

  return NextResponse.json({
    ok: true,
    usersChecked,
    usersSkipped,
    alertsSent,
    errors,
    elapsedMs: Date.now() - startedAt,
  });
}

/**
 * Inserta el row en notification_logs ANTES de mandar el push. La unique
 * constraint (user_id, kind, dedup_key) hace que el segundo intento del
 * mismo aviso falle limpio sin enviar push duplicado. Si el push falla
 * post-log el unique sigue protegiendo contra spam — preferimos un aviso
 * "perdido" a uno "duplicado".
 */
async function tryLogAndSend(
  admin: SupabaseClient,
  args: {
    userId: string;
    kind: "budget_warning" | "budget_exceeded";
    dedupKey: string;
    title: string;
    body: string;
    url: string;
    tag: string;
  },
): Promise<boolean> {
  // INSERT first — si la unique constraint dispara, no mandamos push.
  const { error: insertErr } = await admin.from("notification_logs").insert({
    user_id: args.userId,
    kind: args.kind,
    dedup_key: args.dedupKey,
    payload: { title: args.title, body: args.body, url: args.url },
  });
  if (insertErr) {
    // 23505 = unique_violation => ya se envio antes. Salida silenciosa.
    if ((insertErr as { code?: string }).code === "23505") return false;
    console.error("[cron/budget-alerts] log_insert_failed", insertErr);
    return false;
  }

  // Manda push. Si falla, el log queda — no reintentamos hasta el
  // siguiente mes. Trade-off explicito: evitar duplicados > evitar gaps.
  try {
    const result = await sendPushToUser(
      args.userId,
      {
        title: args.title,
        body: args.body,
        url: args.url,
        tag: args.tag,
      },
      "budget_alerts",
    );
    await admin
      .from("notification_logs")
      .update({
        delivered_count: result.delivered,
        failed_count: result.failed,
      })
      .eq("user_id", args.userId)
      .eq("kind", args.kind)
      .eq("dedup_key", args.dedupKey);
    return result.delivered > 0;
  } catch (err) {
    console.error("[cron/budget-alerts] push_send_failed", { ...args, err });
    return false;
  }
}
