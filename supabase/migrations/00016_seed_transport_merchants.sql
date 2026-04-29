-- 00016_seed_transport_merchants.sql
-- Nine more system merchants (user_id IS NULL) under Transporte. The
-- user mostly logs ride-by-ride so the picker needs the typical Peruvian
-- transport surfaces — metro lines, BRT, app taxi, combi, mototaxi,
-- inter-provincial bus, plane. Most don't have hand-prepared SVGs yet;
-- logo_slug is pre-assigned anyway so dropping a file at
-- /public/logos/merchants/{slug}.svg later "just works" without another
-- migration. MerchantAvatar falls back to deterministic initials when
-- the SVG 404s, so rows still render correctly today.
--
-- Idempotent across all operations:
--   - Merchant INSERT uses ON CONFLICT DO NOTHING via the
--     merchants_user_category_name_uniq index.
--   - logo_slug UPDATEs are NULL-guarded so a manual override survives.
--
-- The existing "Metropolitano" merchant (seeded in 00014) stays as-is.

BEGIN;

-- 1. Insert merchants. category_id resolved by joining against the system
--    "Transporte" category from 00004.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  ('Transporte', 'Línea 1'),
  ('Transporte', 'Línea 2'),
  ('Transporte', 'Corredor'),
  ('Transporte', 'Bus'),
  ('Transporte', 'Combi'),
  ('Transporte', 'Mototaxi'),
  ('Transporte', 'Taxi por aplicativo'),
  ('Transporte', 'Bus interprovincial'),
  ('Transporte', 'Avión')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. Pre-assign logo_slug for each. Slugs use kebab-case + diacritic strip
--    (avion, not avión) to match the file-naming convention. NULL-guarded
--    so manual edits persist.
UPDATE public.merchants SET logo_slug = 'linea-1'             WHERE user_id IS NULL AND name = 'Línea 1'             AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'linea-2'             WHERE user_id IS NULL AND name = 'Línea 2'             AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'corredor'            WHERE user_id IS NULL AND name = 'Corredor'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'bus'                 WHERE user_id IS NULL AND name = 'Bus'                 AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'combi'               WHERE user_id IS NULL AND name = 'Combi'               AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'mototaxi'            WHERE user_id IS NULL AND name = 'Mototaxi'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'taxi-app'            WHERE user_id IS NULL AND name = 'Taxi por aplicativo' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'bus-interprovincial' WHERE user_id IS NULL AND name = 'Bus interprovincial' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'avion'               WHERE user_id IS NULL AND name = 'Avión'               AND logo_slug IS NULL;

COMMIT;
