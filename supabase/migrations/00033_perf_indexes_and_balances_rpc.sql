-- ============================================================================
-- Migration 00033 — Performance: partial index + balances RPC
--
-- Auditoria de performance (2026-05-07) detecto dos hot paths con costo
-- innecesariamente alto:
--
--   1) Las queries del dashboard / movements / insights filtran SIEMPRE por
--      `archived_at IS NULL`. Los indices existentes
--      `transactions_user_occurred_idx (user_id, occurred_at desc)` y
--      variantes son completos, asi que Postgres tiene que filtrar archived
--      en memoria. Para usuarios con muchas filas archivadas (factory-reset
--      cancelado, undo expirado) el costo crece linealmente con la basura.
--      Solucion: un indice parcial `WHERE archived_at IS NULL` que solo
--      indexa filas activas. Mas rapido + ocupa menos disco.
--
--   2) `getAccountBalances()` en el cliente (src/lib/data/transactions.ts)
--      hacia `SELECT account_id, kind, amount_minor` sobre TODAS las txs
--      no archivadas y sumaba en JavaScript. Para un usuario heavy con anios
--      de historial es bajar miles de filas + parsear en cliente. Solucion:
--      RPC `get_account_balances(currency)` que hace `SUM ... GROUP BY` en
--      Postgres. Payload de 4-10 filas en lugar de miles, una sola RTT.
--
-- Cero downtime — solo agrega indice + funcion. No modifica filas ni RLS.
-- ============================================================================

-- ─── 1) Indice parcial sobre filas activas ──────────────────────────────────
--
-- Cubre el filtro `archived_at IS NULL` que TODAS las queries del hot path
-- aplican. La semantica de orden coincide con el indice no-parcial existente
-- (`transactions_user_occurred_idx`) — Postgres elige automaticamente cual
-- usar segun la selectividad del filtro. Para usuarios con historial mixto
-- (activos + archivados) el parcial es estrictamente mas chico y mas rapido.
create index if not exists transactions_user_occurred_active_idx
  on public.transactions (user_id, occurred_at desc)
  where archived_at is null;

-- ─── 2) RPC: get_account_balances ───────────────────────────────────────────
--
-- Reemplaza el calculo client-side. RLS auto-scopea por user_id (security
-- invoker). El cliente recibe una tabla `(account_id, balance_minor)` con
-- una fila por cuenta que tiene al menos una tx activa en la moneda. Las
-- cuentas sin movimientos no aparecen — el cliente las trata como saldo 0.
--
-- amount_minor se devuelve como bigint para que el cliente haga la division
-- a major units (centavos -> soles/dolares) en un solo lugar; mantener todo
-- en integer en SQL evita drift de punto flotante en la suma.
create or replace function public.get_account_balances(p_currency char(3))
returns table (
  account_id   uuid,
  balance_minor bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.account_id,
    sum(case when t.kind = 'income' then t.amount_minor else -t.amount_minor end)::bigint
      as balance_minor
  from public.transactions t
  where t.archived_at is null
    and t.currency = p_currency
  group by t.account_id;
$$;

grant execute on function public.get_account_balances(char) to authenticated;
