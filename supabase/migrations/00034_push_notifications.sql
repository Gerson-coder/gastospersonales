-- ============================================================================
-- Migration 00034 — Web Push notifications
--
-- Tablas:
--   1) push_subscriptions: una fila por dispositivo donde el user activo
--      las notificaciones. user_id + endpoint son la clave logica
--      (un mismo dispositivo solo puede suscribirse una vez).
--   2) notification_logs: registro de cada push enviado, evita spam
--      (no mandamos el mismo aviso dos veces el mismo periodo).
--
-- Cero downtime — solo agrega tablas + RLS. No modifica nada existente.
-- ============================================================================

-- ─── 1) push_subscriptions ──────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Endpoint URL del push service (FCM en Android, APNs en iOS via Apple Push,
  -- Mozilla Push en Firefox). Es la "direccion" para mandar notificaciones.
  endpoint        text not null,
  -- Llaves crypto del subscriber para encriptar el payload (ECDH P-256).
  p256dh          text not null,
  auth            text not null,
  -- Etiqueta human-readable para el switcher de devices ("iPhone de Gerson").
  -- La derivamos del User-Agent al subscribirse; el user puede editarla luego.
  device_label    text,
  -- Preferencias por device. Permite tener push activo en celular pero
  -- silenciado en laptop, por ejemplo.
  budget_alerts   boolean not null default true,
  daily_reminder  boolean not null default false,
  -- Hora local (Lima TZ) del recordatorio diario, formato "HH:MM".
  daily_reminder_time text default '21:00',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Un mismo endpoint solo puede registrarse una vez por user — re-subscribir
  -- desde el mismo dispositivo hace upsert sobre esta unicidad.
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- RLS — solo el dueno ve / modifica sus subscriptions. Nadie puede leer
-- las llaves de otro user (las llaves son sensibles, no son URLs publicas).
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Trigger para updated_at — pattern existente del proyecto.
create or replace function public.touch_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger push_subscriptions_updated_at_trg
  before update on public.push_subscriptions
  for each row execute function public.touch_push_subscriptions_updated_at();

-- ─── 2) notification_logs ───────────────────────────────────────────────────
-- Anti-spam: registramos cada push enviado con su categoria + periodo asi
-- evitamos mandar el mismo aviso dos veces. Por ejemplo "presupuesto Comida
-- al 80% en 2026-05" se manda UNA vez por user por mes.
create table if not exists public.notification_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Tipo de notificacion: "budget_warning" (>=80%), "budget_exceeded" (>=100%),
  -- "daily_reminder", "partner_event", "test". Nuevos tipos se agregan en
  -- futuro sin migrar.
  kind         text not null,
  -- Llave de dedup: combinacion que identifica unicamente "este aviso ya
  -- fue mandado". Para budget_warning es "<budget_id>:<YYYY-MM>". Para
  -- daily_reminder es "<YYYY-MM-DD>". El cron consulta esta columna antes
  -- de mandar.
  dedup_key    text not null,
  -- Cuantas subscriptions del user recibieron el push (puede tener varios
  -- devices). Util para dashboards de salud.
  delivered_count int not null default 0,
  -- Cuantas fallaron. Una falla 410 (gone) implica desuscribir esa entry.
  failed_count int not null default 0,
  payload      jsonb,
  created_at   timestamptz not null default now(),
  unique (user_id, kind, dedup_key)
);

create index if not exists notification_logs_user_kind_idx
  on public.notification_logs (user_id, kind, created_at desc);

alter table public.notification_logs enable row level security;

-- El user puede leer su propio historial (futuro: tab "tus notificaciones").
create policy "notification_logs_select_own"
  on public.notification_logs for select
  using (auth.uid() = user_id);

-- Insert / update / delete solo desde server-side con service_role
-- (no exponemos al cliente — el cron es la unica via legitima).
-- Sin policies = denied por default.
