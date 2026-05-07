-- 00032_partnership_owner_visibility.sql
-- HOTFIX: el OWNER de una cuenta compartida no podia ver las tx que
-- inserto el PARTNER. Asimetria critica de visibilidad.
--
-- Caso reportado por el user: "cuando yo el dueño de la cuenta gasto
-- si se refleja en la cuenta de mi pareja, pero cuando ella gasta no
-- se refleja en mi cuenta".
--
-- Causa raíz:
--   La policy `transactions_select_own_or_partner` (00027 original,
--   simplificada en 00029) solo tenia 2 ramas:
--     1. auth.uid() = user_id  (es mi tx)
--     2. user_is_account_partner(account_id)  (soy partner de la cuenta)
--
--   Cuando el PARTNER inserta una tx en la cuenta compartida:
--     - tx.user_id = partner_user_id
--     - tx.account_id = shared_account_id
--
--   Para que el OWNER la vea:
--     - auth.uid() = user_id?  NO (user_id es del partner)
--     - user_is_account_partner(account_id)?  NO — la function chequea
--       si auth.uid() es el partner_user_id, y el owner NO es el
--       partner de su propia cuenta.
--
--   → El owner queda ciego a las tx del partner. Asimetria confirmada.
--
-- Fix: agregar una tercera rama `user_owns_account(account_id)` para
-- que el owner vea (y pueda editar/insertar) cualquier tx en cuentas
-- de su propiedad, no importa quien sea el user_id del row. Mismo fix
-- para commitments.
--
-- Las functions user_is_account_partner y user_owns_account ya existen
-- desde 00029. Solo reemplazamos las policies, sin tocar nada mas.

-- ============================================================
-- 1. transactions — agregar rama del owner
-- ============================================================

drop policy if exists transactions_select_own_or_partner on public.transactions;
create policy transactions_select_own_or_partner on public.transactions
  for select using (
    auth.uid() = user_id
    OR public.user_is_account_partner(account_id)
    OR public.user_owns_account(account_id)
  );

drop policy if exists transactions_insert_own_or_partner on public.transactions;
create policy transactions_insert_own_or_partner on public.transactions
  for insert with check (
    -- El user_id sigue siendo el del que inserta — el owner no puede
    -- insertar tx con user_id = partner. La rama user_owns_account NO
    -- relaja esto, solo confirma que la cuenta target es valida.
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
    OR public.user_owns_account(account_id)
  ) with check (
    auth.uid() = user_id
    OR public.user_is_account_partner(account_id)
    OR public.user_owns_account(account_id)
  );

-- ============================================================
-- 2. commitments — agregar rama del owner
-- ============================================================
-- Mismo bug latente: si el partner crea un commitment con
-- account_id = cuenta compartida, el owner no podia verlo.

drop policy if exists commitments_select_own_or_partner_account on public.commitments;
create policy commitments_select_own_or_partner_account on public.commitments
  for select using (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND (
        public.user_is_account_partner(account_id)
        OR public.user_owns_account(account_id)
      )
    )
  );

drop policy if exists commitments_update_own_or_partner_account on public.commitments;
create policy commitments_update_own_or_partner_account on public.commitments
  for update using (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND (
        public.user_is_account_partner(account_id)
        OR public.user_owns_account(account_id)
      )
    )
  ) with check (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND (
        public.user_is_account_partner(account_id)
        OR public.user_owns_account(account_id)
      )
    )
  );
