-- 00006_merchants.sql
-- Merchants picker feature.
-- Mirrors `categories` end-to-end (table shape, sentinel-uuid uniqueness, RLS, updated_at trigger).
-- A merchant is a concrete place (KFC, Inkafarma) scoped to a category.
-- Soft-delete via `archived_at` — no DELETE policy from the app.
-- See engram topic `sdd/merchants-picker/design` for the full rationale.

-- ---------- merchants ----------
-- user_id IS NULL → system merchant, visible to all authenticated users (mirror of categories).
-- category_id is REQUIRED — every merchant must belong to a category.
create table public.merchants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null check (length(name) between 1 and 64),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Unique per (user-or-system, category, name) for non-archived rows.
-- Reuses the same sentinel uuid as categories so system rows share a uniqueness namespace.
-- lower(name) for case-insensitive uniqueness ("KFC" == "kfc").
create unique index merchants_user_category_name_uniq
  on public.merchants (
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category_id,
    lower(name)
  )
  where archived_at is null;

-- Hot path: lookups by (user_id, category_id) for the picker. Filtered to non-archived.
create index merchants_user_category_idx
  on public.merchants (user_id, category_id)
  where archived_at is null;

-- ---------- updated_at trigger ----------
-- Reuses the existing tg_set_updated_at() function from 00003_triggers.sql.
create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function public.tg_set_updated_at();

-- ---------- RLS ----------
-- Same pattern as categories: read system + own; write own only; system rows immutable.
alter table public.merchants enable row level security;

create policy merchants_select_system_or_own on public.merchants
  for select using (user_id is null or user_id = auth.uid());

create policy merchants_insert_own on public.merchants
  for insert with check (user_id = auth.uid() and user_id is not null);

create policy merchants_update_own on public.merchants
  for update using (user_id = auth.uid() and user_id is not null)
            with check (user_id = auth.uid() and user_id is not null);

-- No DELETE policy: soft-delete via archived_at only.

-- ---------- transactions.merchant_id ----------
-- Optional FK from a transaction to the merchant where the spend happened.
-- ON DELETE SET NULL preserves history if the merchant row is hard-deleted (archive doesn't trigger this).
alter table public.transactions
  add column merchant_id uuid null references public.merchants(id) on delete set null;

-- Partial index: only rows with a merchant. Most transactions won't have one initially.
create index transactions_merchant_idx
  on public.transactions (merchant_id)
  where merchant_id is not null;

-- ---------- RPC: list_mru_merchants ----------
-- Returns the top N merchants in a category for the CURRENT user, ranked by recent usage
-- (last 90 days). RLS auto-filters because SECURITY INVOKER. Falls back to alphabetical
-- when usage_count is zero so the picker still has content on cold start.
create or replace function public.list_mru_merchants(p_category_id uuid, p_limit int default 3)
returns table (
  id          uuid,
  user_id     uuid,
  category_id uuid,
  name        text,
  archived_at timestamptz,
  created_at  timestamptz,
  updated_at  timestamptz,
  usage_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id,
    m.user_id,
    m.category_id,
    m.name,
    m.archived_at,
    m.created_at,
    m.updated_at,
    coalesce(t.usage_count, 0) as usage_count
  from public.merchants m
  left join (
    select merchant_id, count(*) as usage_count
    from public.transactions
    where merchant_id is not null
      and archived_at is null
      and occurred_at >= now() - interval '90 days'
    group by merchant_id
  ) t on t.merchant_id = m.id
  where m.category_id = p_category_id
    and m.archived_at is null
  order by usage_count desc, lower(m.name) asc
  limit p_limit;
$$;

grant execute on function public.list_mru_merchants(uuid, int) to authenticated;
