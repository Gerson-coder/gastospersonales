-- 00015_telefonia_category.sql
-- Splits "Servicios" into utilities (water / electricity / gas) vs
-- "Telefonía" (mobile recargas + postpago). The original "Servicios"
-- bucket was overloaded — Sedapal / Luz del Sur and Movistar / Claro /
-- Entel ended up in the same picker group, so the user couldn't see
-- phone spending as a distinct dashboard slice.
--
-- Operations:
--   1. New system category: Telefonía (kind=expense, smartphone icon).
--   2. Move Movistar / Claro / Entel from Servicios -> Telefonía.
--   3. Seed Bitel — the 4th Peruvian carrier, missing from 00007.
--   4. Assign logo_slug='bitel' to the new Bitel row (NULL-guarded).
--
-- Idempotent across all four:
--   - INSERT category covered by categories_user_name_kind_uniq.
--   - Re-running the merchant UPDATE is a no-op once rows are moved
--     (the WHERE binds by current category).
--   - INSERT merchant uses ON CONFLICT DO NOTHING via
--     merchants_user_category_name_uniq.
--   - logo_slug UPDATE is NULL-guarded so a manual override survives.
--
-- Existing transactions are NOT touched. transactions.category_id is
-- a snapshot taken at capture time and lives independently of
-- merchants.category_id, so historical rows keep their original
-- "Servicios" classification — only future captures with a moved
-- merchant will land in Telefonía.

BEGIN;

-- 1. New system category. Hue picked to be distinct from Servicios
--    (#14b8a6 teal) and Educación (#06b6d4 cyan). Lucide icon name
--    in kebab-case to match the convention from 00004.
INSERT INTO public.categories (user_id, name, kind, color, icon)
VALUES (NULL, 'Telefonía', 'expense', '#f97316', 'smartphone')
ON CONFLICT DO NOTHING;

-- 2. Move existing telecom system merchants from Servicios -> Telefonía.
--    user_id IS NULL only — user-created merchants are NOT touched
--    (a user may have a personal "Movistar" row that they categorized
--     intentionally; we don't second-guess that).
UPDATE public.merchants
SET category_id = (
  SELECT id FROM public.categories
  WHERE user_id IS NULL AND name = 'Telefonía'
)
WHERE user_id IS NULL
  AND name IN ('Movistar', 'Claro', 'Entel')
  AND category_id = (
    SELECT id FROM public.categories
    WHERE user_id IS NULL AND name = 'Servicios'
  );

-- 3. Seed Bitel as a system merchant under Telefonía.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, 'Bitel'
FROM public.categories c
WHERE c.user_id IS NULL AND c.name = 'Telefonía'
ON CONFLICT DO NOTHING;

-- 4. logo_slug for Bitel. Requires public/logos/merchants/bitel.svg
--    to exist for the SVG to actually render; without it the picker
--    falls back to the deterministic-initials avatar (still works,
--    just no logo).
UPDATE public.merchants
SET logo_slug = 'bitel'
WHERE user_id IS NULL AND name = 'Bitel' AND logo_slug IS NULL;

COMMIT;
