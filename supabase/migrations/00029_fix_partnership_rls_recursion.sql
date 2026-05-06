-- 00029_fix_partnership_rls_recursion.sql
-- HOTFIX: las policies de 00027 causan recursion circular de RLS.
--
-- Cycle de la recursion:
--   SELECT transactions
--     → policy hace exists() sobre accounts
--       → RLS de accounts hace exists() sobre account_partnerships
--         → RLS de account_partnerships hace exists() sobre accounts
--           → RLS de accounts (CYCLE — el planner aborta)
--
-- Sintoma: TODA query a transactions/accounts/commitments/
-- account_partnerships falla. La app muestra "no pudimos cargar
-- movimientos" en todos lados.
--
-- Fix: reemplazar las exists() inline en las policies por llamadas
-- a 2 functions SECURITY DEFINER que bypassan RLS (corren como el
-- dueno de la function, no como auth.uid()) y rompen el ciclo.
--
-- Patron estandar en Postgres para evitar RLS recursion entre
-- tablas que se referencian mutuamente.

-- ============================================================
-- 1. Helper functions (SECURITY DEFINER)
-- ============================================================

create or replace function public.user_is_account_partner(p_account_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- "stable" + lookups por PK = postgres lo cachea por query.
  select exists (
    select 1
    from accounts a
    inner join account_partnerships p on p.account_id = a.id
    where a.id = p_account_id
      and a.shared_with_partner = true
      and p.partner_user_id = auth.uid()
  );
$$;

grant execute on function public.user_is_account_partner(uuid) to authenticated;

create or replace function public.user_owns_account(p_account_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from accounts where id = p_account_id and user_id = auth.uid()
  );
$$;

grant execute on function public.user_owns_account(uuid) to authenticated;

-- ============================================================
-- 2. accounts policies — usar la function helper
-- ============================================================

drop policy if exists accounts_select_own_or_partner on public.accounts;
create policy accounts_select_own_or_partner on public.accounts
  for select using (
    auth.uid() = user_id
    OR public.user_is_account_partner(id)
  );

-- ============================================================
-- 3. transactions policies — usar las functions
-- ============================================================

drop policy if exists transactions_select_own_or_partner on public.transactions;
create policy transactions_select_own_or_partner on public.transactions
  for select using (
    auth.uid() = user_id
    OR public.user_is_account_partner(account_id)
  );

drop policy if exists transactions_insert_own_or_partner on public.transactions;
create policy transactions_insert_own_or_partner on public.transactions
  for insert with check (
    auth.uid() = user_id
    AND (
      public.user_owns_account(account_id)
      OR public.user_is_account_partner(account_id)
    )
  );

drop policy if exists transactions_update_own_or_partner on public.transactions;
create policy transactions_update_own_or_partner on public.transactions
  for update using (
    auth.uid() = user_id
    OR public.user_is_account_partner(account_id)
  ) with check (
    auth.uid() = user_id
    OR public.user_is_account_partner(account_id)
  );

-- ============================================================
-- 4. commitments policies — usar las functions
-- ============================================================

drop policy if exists commitments_select_own_or_partner_account on public.commitments;
create policy commitments_select_own_or_partner_account on public.commitments
  for select using (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND public.user_is_account_partner(account_id)
    )
  );

drop policy if exists commitments_update_own_or_partner_account on public.commitments;
create policy commitments_update_own_or_partner_account on public.commitments
  for update using (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND public.user_is_account_partner(account_id)
    )
  ) with check (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND public.user_is_account_partner(account_id)
    )
  );

-- ============================================================
-- 5. account_partnerships policies — romper el otro lado del cycle
-- ============================================================
-- La policy de SELECT en account_partnerships tambien hacia exists()
-- a accounts inline → contribuia al cycle. Reemplazo con la
-- function user_owns_account.

drop policy if exists account_partnerships_select on public.account_partnerships;
create policy account_partnerships_select on public.account_partnerships
  for select using (
    auth.uid() = partner_user_id
    OR public.user_owns_account(account_id)
  );

drop policy if exists account_partnerships_insert_owner on public.account_partnerships;
create policy account_partnerships_insert_owner on public.account_partnerships
  for insert with check (
    public.user_owns_account(account_id)
  );

drop policy if exists account_partnerships_delete on public.account_partnerships;
create policy account_partnerships_delete on public.account_partnerships
  for delete using (
    auth.uid() = partner_user_id
    OR public.user_owns_account(account_id)
  );
