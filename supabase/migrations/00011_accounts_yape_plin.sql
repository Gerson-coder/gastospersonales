-- 00011_accounts_yape_plin.sql
-- Allow 'yape' and 'plin' as valid account types (popular Peruvian
-- mobile-payment apps). They are treated as a separate account type from
-- cash/card/bank so the UI can render them distinctly and auto-name them.
--
-- The original CHECK in 00001_schema.sql is unnamed:
--   type text not null check (type in ('cash','card','bank'))
-- Postgres auto-names it `accounts_type_check`. We DROP IF EXISTS to be safe
-- against environments where the constraint name diverges, then re-add with
-- the same canonical name.

BEGIN;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('cash', 'card', 'bank', 'yape', 'plin'));

COMMENT ON COLUMN public.accounts.type IS
  'Account type: cash | card | bank | yape | plin. Yape/plin are PE mobile-pay rails.';

COMMIT;
