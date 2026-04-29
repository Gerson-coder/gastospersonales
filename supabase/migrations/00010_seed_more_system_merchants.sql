-- 00010_seed_more_system_merchants.sql
-- Eight additional system merchants (user_id IS NULL) on top of the 19
-- from 00007 + the 5 from 00009. Each one ships with a hand-prepared
-- SVG at /public/logos/merchants/{logo_slug}.svg. Idempotent: the
-- unique index merchants_user_category_name_uniq covers the inserts and
-- the logo_slug update is NULL-guarded so a manual override won't be
-- clobbered by re-running the migration.

BEGIN;

-- 1. Insert the merchants. category_id resolved by joining against the
--    system categories from 00004 by name. Same pattern as 00007 + 00009.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  -- Comida (restaurants + supermarkets + convenience stores — places
  -- the user typically allocates to "Comida" in the chip strip)
  ('Comida',    'China Wok'),
  ('Comida',    'Metro'),
  ('Comida',    'Oxxo'),
  ('Comida',    'Pinkberry'),
  ('Comida',    'Roky''s'),
  ('Comida',    'Tambo'),
  -- Educación
  ('Educación', 'Británico'),
  -- Otros (department store — doesn't fit Comida / Salud / etc.)
  ('Otros',     'Saga Falabella')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. Assign logo_slug to each newly-seeded row. NULL-guarded UPDATE so a
--    manual override in production stays put.
UPDATE public.merchants SET logo_slug = 'chinawok'       WHERE user_id IS NULL AND name = 'China Wok'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'metro'          WHERE user_id IS NULL AND name = 'Metro'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'oxxo'           WHERE user_id IS NULL AND name = 'Oxxo'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'pinkberry'      WHERE user_id IS NULL AND name = 'Pinkberry'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'rokys'          WHERE user_id IS NULL AND name = 'Roky''s'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'tambo'          WHERE user_id IS NULL AND name = 'Tambo'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'britanico'      WHERE user_id IS NULL AND name = 'Británico'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'saga-falabella' WHERE user_id IS NULL AND name = 'Saga Falabella' AND logo_slug IS NULL;

COMMIT;
