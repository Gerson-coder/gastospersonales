-- 00013_account_subtype.sql
-- Adds an optional `subtype` column to `accounts` so users can keep
-- multiple products under one institution without duplicating the
-- bank label. Real-world Peruvian users typically have:
--   - BCP cuenta sueldo
--   - BCP cuenta corriente
--   - BCP cuenta ahorros
--   - BCP cuenta dólares
--   - BCP tarjeta de crédito
-- … all under the same bank. With brand presets locking the name,
-- `subtype` is what differentiates the rows in the UI.
--
-- NULL = no subtype (the row renders with just the bank label, same
-- as before this migration). Idempotent — re-running is a no-op.
--
-- GATED: not applied automatically. Run in the Supabase SQL editor
-- when you're ready to surface the subtype picker in /accounts.

alter table public.accounts
  add column if not exists subtype text;

-- Drop+recreate the constraint so the allowed-value list can evolve
-- in future migrations without an `add constraint if not exists` dance.
alter table public.accounts
  drop constraint if exists accounts_subtype_check;
alter table public.accounts
  add constraint accounts_subtype_check
  check (
    subtype is null
    or subtype in (
      'sueldo',
      'corriente',
      'ahorro',
      'dolares',
      'credito',
      'debito'
    )
  );

-- Index on (user_id, subtype) to keep the dashboard's account chip
-- strip + the account list query fast even when a single user has
-- many products under the same bank.
create index if not exists accounts_user_subtype_idx
  on public.accounts (user_id, subtype)
  where archived_at is null;
