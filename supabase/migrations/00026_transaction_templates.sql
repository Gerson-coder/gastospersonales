-- 00026_transaction_templates.sql
-- Templates de gastos/ingresos frecuentes — el user guarda un combo
-- (titulo + monto + categoria + cuenta + merchant) y despues, desde
-- el dashboard, lo dispara con un solo tap para crear la transaccion.
--
-- Caso real: cafe en Starbucks 4 veces a la semana. En vez de capturar
-- cada vez, tappea el chip y listo.
--
-- Soft-delete via archived_at — sin DELETE policy, mismo patron que
-- transactions/budgets/goals/commitments.

create table public.transaction_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0 and length(title) <= 80),
  kind        text not null check (kind in ('expense','income')),
  amount_minor bigint not null check (amount_minor > 0),
  currency    char(3) not null check (currency in ('PEN','USD')),
  category_id uuid references public.categories(id) on delete set null,
  account_id  uuid references public.accounts(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete set null,
  note        text check (note is null or length(note) <= 500),

  -- Bumped each time el template se usa; ordena el quick row del
  -- dashboard (los mas tappeados arriba).
  usage_count integer not null default 0,
  -- Fallback de orden cuando hay empate de usage_count, y fuente
  -- para el subtitulo "usado hace 2 dias".
  last_used_at timestamptz,

  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hot path: el quick row del dashboard hace un SELECT ordenado por
-- usage_count desc, last_used_at desc nulls last (los mas tappeados
-- arriba) limitado a 5-10 filas.
create index transaction_templates_quick_row_idx
  on public.transaction_templates (user_id, usage_count desc, last_used_at desc nulls last)
  where archived_at is null;

-- Hot path: pagina /templates lista todos los activos del user.
create index transaction_templates_user_active_idx
  on public.transaction_templates (user_id)
  where archived_at is null;

-- Reusa tg_set_updated_at() de 00003_triggers.sql.
create trigger transaction_templates_set_updated_at
  before update on public.transaction_templates
  for each row execute function public.tg_set_updated_at();

-- ---------- RLS ----------
alter table public.transaction_templates enable row level security;

create policy templates_select_own on public.transaction_templates
  for select using (auth.uid() = user_id);
create policy templates_insert_own on public.transaction_templates
  for insert with check (auth.uid() = user_id);
create policy templates_update_own on public.transaction_templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No DELETE policy — soft-delete via archived_at.
