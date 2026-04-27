-- 00010_ahorro_to_income.sql
-- Reclassify the "Ahorro" system category from expense to income.
--
-- Originally seeded as `kind=expense` in 00004_seed_system_categories.sql,
-- because at the time the team modeled "putting money into savings" as
-- money leaving the spending pool. Product decision (Apr 2026) reverses
-- that: savings is treated as an income-side bucket so it shows up in the
-- income capture flow and rolls into income totals on the dashboard.
--
-- Idempotent via the WHERE clause — re-running this migration after it has
-- already been applied is a no-op.
-- Gated: NOT yet applied. Run manually via the Supabase SQL editor (or
-- whatever migration runner you are using) when ready.

BEGIN;

UPDATE public.categories
SET kind = 'income'
WHERE user_id IS NULL
  AND name = 'Ahorro'
  AND kind = 'expense';

COMMIT;
