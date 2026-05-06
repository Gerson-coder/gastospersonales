-- 00025_commitments.sql
-- Compromisos financieros (CxP / CxC + recurring + reminders).
--
-- Una unica tabla cubre los 4 casos del producto:
--   - payment   = pago programado (recibo Sedapal, cuota BCP, alquiler que pago)
--   - income    = cobro programado (alquiler que cobro, sueldo esperado)
--   - lent      = "le preste a Juan" (cuenta por cobrar)
--   - borrowed  = "me prestaron" (cuenta por pagar)
--
-- Recurrence enum cubre el 90% de patrones reales (mensual + ad-hoc).
-- Status se actualiza al marcar como pagado/cobrado en la UI; "overdue"
-- queda como estado derivado (status='pending' AND due_date < today).
--
-- Soft-delete via archived_at — sin DELETE policy, mismo patron que
-- transactions/budgets/goals.
--
-- PR1: solo schema + CRUD. PR2 conectara markCompleted al flow de
-- transactions. PR3 agregara push_subscriptions y el cron de envio.

-- ---------- enums ----------
create type commitment_kind as enum (
  'payment',   -- egreso esperado (recibos, cuotas)
  'income',    -- ingreso esperado (alquiler cobrado, sueldo)
  'lent',      -- preste dinero (CxC)
  'borrowed'   -- me prestaron dinero (CxP)
);

create type commitment_recurrence as enum (
  'none',      -- puntual, una sola fecha
  'weekly',    -- todas las semanas (mismo dia)
  'biweekly',  -- cada 15 dias
  'monthly',   -- todos los meses (mismo dia del mes)
  'yearly'     -- una vez al ano
);

create type commitment_status as enum (
  'pending',   -- aun por pagar/cobrar (incluye vencidos sin marcar)
  'completed', -- ya marcado como pagado/cobrado
  'cancelled'  -- el user cancelo el compromiso (no se va a hacer)
);

-- ---------- table ----------
create table public.commitments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        commitment_kind not null,
  title       text not null check (length(trim(title)) > 0 and length(title) <= 80),
  amount_minor bigint not null check (amount_minor > 0),
  currency    char(3) not null check (currency in ('PEN','USD')),

  -- Fecha del proximo evento. Para recurrentes, se actualiza cuando
  -- se marca como pagado el periodo actual (PR2 hace ese rollforward).
  due_date    date not null,
  recurrence  commitment_recurrence not null default 'none',

  -- Status del periodo actual. Para recurrentes, este flag se resetea
  -- a 'pending' cuando rolla la fecha al proximo periodo.
  status      commitment_status not null default 'pending',

  -- Optional links — para que cuando el user marque como pagado, podamos
  -- precargar /capture con la categoria y cuenta correctas.
  category_id uuid references public.categories(id) on delete set null,
  account_id  uuid references public.accounts(id) on delete set null,

  -- Solo aplica a kind in ('lent','borrowed') — quien es la otra parte.
  counterparty text check (counterparty is null or (length(trim(counterparty)) > 0 and length(counterparty) <= 60)),
  notes        text check (notes is null or length(notes) <= 500),

  -- Cuando se marco completado por ultima vez (no se resetea al rollforward).
  -- Usado por PR2 para "ultima vez que pagaste Sedapal: hace 27 dias".
  last_completed_at timestamptz,

  -- Recordatorio: cuantos dias antes de due_date queremos avisar al
  -- user. Default 3 dias. PR3 usa este campo para decidir cuando
  -- mandar el push.
  remind_days_before int not null default 3
    check (remind_days_before >= 0 and remind_days_before <= 30),

  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- indexes ----------
-- Hot path: listar compromisos activos del user ordenados por fecha.
create index commitments_user_due_idx
  on public.commitments (user_id, due_date asc)
  where archived_at is null;

-- Hot path: filtrar por status (pending) — cron de PR3 los necesita.
create index commitments_user_status_idx
  on public.commitments (user_id, status)
  where archived_at is null;

-- ---------- updated_at trigger ----------
-- Reusa tg_set_updated_at() de 00003_triggers.sql.
create trigger commitments_set_updated_at
  before update on public.commitments
  for each row execute function public.tg_set_updated_at();

-- ---------- RLS ----------
alter table public.commitments enable row level security;

create policy commitments_select_own on public.commitments
  for select using (auth.uid() = user_id);
create policy commitments_insert_own on public.commitments
  for insert with check (auth.uid() = user_id);
create policy commitments_update_own on public.commitments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No DELETE policy — soft-delete via archived_at.
