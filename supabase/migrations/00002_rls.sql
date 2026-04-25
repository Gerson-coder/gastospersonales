-- 00002_rls.sql
-- Enable RLS on every table from migration 00001 and define policies.
-- Tables with RLS enabled and ZERO policies deny everything to anon/authenticated.
-- The service role bypasses RLS by design — used by admin.ts and triggers.

alter table public.profiles        enable row level security;
alter table public.accounts        enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.receipts        enable row level security;
alter table public.exchange_rates  enable row level security;
alter table public.allowed_emails  enable row level security;

-- =================================================================
-- profiles: own row only. No DELETE policy — cascade only via auth.users.
-- =================================================================
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- =================================================================
-- accounts: own rows only. No DELETE policy — soft-delete via archived_at.
-- =================================================================
create policy accounts_select_own on public.accounts
  for select using (auth.uid() = user_id);
create policy accounts_insert_own on public.accounts
  for insert with check (auth.uid() = user_id);
create policy accounts_update_own on public.accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- categories: read system (user_id IS NULL) + own; write own only.
-- System rows (user_id IS NULL) are immutable from the app — UPDATE/INSERT
-- policies require user_id = auth.uid() AND not null.
-- =================================================================
create policy categories_select_system_or_own on public.categories
  for select using (user_id is null or user_id = auth.uid());
create policy categories_insert_own on public.categories
  for insert with check (user_id = auth.uid() and user_id is not null);
create policy categories_update_own on public.categories
  for update using (user_id = auth.uid() and user_id is not null)
            with check (user_id = auth.uid() and user_id is not null);

-- =================================================================
-- transactions: own rows only. Soft-delete via archived_at — no DELETE policy.
-- =================================================================
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- receipts: own rows only.
-- =================================================================
create policy receipts_select_own on public.receipts
  for select using (auth.uid() = user_id);
create policy receipts_insert_own on public.receipts
  for insert with check (auth.uid() = user_id);
create policy receipts_update_own on public.receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =================================================================
-- exchange_rates: RLS enabled, NO policies → service-role only writes.
-- (Reads from authenticated users will return zero rows; rate conversion
--  happens via the admin client or via SECURITY DEFINER server actions.)
-- allowed_emails: same — service-role only.
-- =================================================================
