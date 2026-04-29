-- 00014_seed_burger_king_metropolitano.sql
-- Two more system merchants (user_id IS NULL) on top of the 27 from
-- 00007 + 00009 + 00010. Each ships with a hand-prepared SVG at
-- /public/logos/merchants/{logo_slug}.svg. Same idempotent pattern:
-- the unique index merchants_user_category_name_uniq covers the
-- inserts and the logo_slug update is NULL-guarded so manual edits
-- are never clobbered.

BEGIN;

-- 1. Insert the merchants. category_id resolved by joining against
--    the system categories from 00004 by name.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  -- Comida (fast food chain)
  ('Comida',     'Burger King'),
  -- Transporte (Lima BRT — Metropolitano)
  ('Transporte', 'Metropolitano')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. Assign logo_slug to each newly-seeded row. NULL-guarded UPDATE
--    so a manual override in production stays put.
UPDATE public.merchants SET logo_slug = 'burger-king'    WHERE user_id IS NULL AND name = 'Burger King'   AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'metropolitano'  WHERE user_id IS NULL AND name = 'Metropolitano' AND logo_slug IS NULL;

COMMIT;
