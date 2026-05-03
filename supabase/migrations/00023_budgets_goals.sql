-- 00023_budgets_goals.sql
-- Move budgets + goals from client localStorage to server-side multi-tenant tables.
-- Mirrors the conventions of 00001_schema.sql + 00002_rls.sql + 00003_triggers.sql.
--
-- Soft-delete via `archived_at` — no DELETE policy from the app.
-- Money is `_minor` BIGINT (int cents) consistent with `transactions.amount_minor`.
-- The updated_at trigger reuses `tg_set_updated_at()` defined in 00003_triggers.sql.

-- ---------- budgets ----------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  limit_minor bigint not null check (limit_minor > 0),
  currency    char(3) not null check (currency in ('PEN','USD')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hot path: list a user's active budgets for the active currency.
create index budgets_user_currency_active_idx
  on public.budgets (user_id, currency)
  where archived_at is null;

-- Prevent duplicate active budgets for the same (user, category, currency).
-- Allows multiple archived rows for history.
create unique index budgets_unique_active
  on public.budgets (user_id, category_id, currency)
  where archived_at is null;

-- ---------- goals ----------
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0 and length(name) <= 80),
  target_minor  bigint not null check (target_minor > 0),
  current_minor bigint not null default 0 check (current_minor >= 0),
  currency      char(3) not null check (currency in ('PEN','USD')),
  deadline      date,
  icon          text not null default 'target',
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index goals_user_currency_active_idx
  on public.goals (user_id, currency)
  where archived_at is null;

-- ---------- updated_at triggers ----------
-- Reuses `tg_set_updated_at()` from 00003_triggers.sql.
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.tg_set_updated_at();

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.tg_set_updated_at();

-- ---------- RLS ----------
alter table public.budgets enable row level security;
alter table public.goals   enable row level security;

create policy budgets_select_own on public.budgets
  for select using (auth.uid() = user_id);
create policy budgets_insert_own on public.budgets
  for insert with check (auth.uid() = user_id);
create policy budgets_update_own on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy goals_select_own on public.goals
  for select using (auth.uid() = user_id);
create policy goals_insert_own on public.goals
  for insert with check (auth.uid() = user_id);
create policy goals_update_own on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No DELETE policies — soft-delete via archived_at, mirroring transactions pattern.
