-- 00009_seed_more_system_merchants.sql
-- Five additional system merchants (user_id IS NULL) to complement the
-- 19 seeded in 00007. Each ships with a hand-prepared SVG at
-- /public/logos/merchants/{logo_slug}.svg. Idempotent: the unique index
-- merchants_user_category_name_uniq covers re-runs, and the logo_slug
-- update is guarded by NULL-check so a manual override won't be clobbered.

BEGIN;

-- 1. Insert the merchants. category_id resolved by joining against the
--    system categories from 00004 by name. Same pattern as 00007.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  -- Comida
  ('Comida',    'McDonald''s'),
  ('Comida',    'Starbucks'),
  ('Comida',    'Tienda Mass'),
  -- Salud
  ('Salud',     'EsSalud'),
  -- Educación
  ('Educación', 'UPN')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. Assign logo_slug to each newly-seeded row. Same NULL-guarded UPDATE
--    pattern as 00008 so a manual override in production stays put.
UPDATE public.merchants SET logo_slug = 'mcdonalds'   WHERE user_id IS NULL AND name = 'McDonald''s' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'starbucks'   WHERE user_id IS NULL AND name = 'Starbucks'   AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'tienda-mass' WHERE user_id IS NULL AND name = 'Tienda Mass' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'essalud'     WHERE user_id IS NULL AND name = 'EsSalud'     AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'upn'         WHERE user_id IS NULL AND name = 'UPN'         AND logo_slug IS NULL;

COMMIT;
