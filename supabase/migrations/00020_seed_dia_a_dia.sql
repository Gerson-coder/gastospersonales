-- 00020_seed_dia_a_dia.sql
-- A single broad expense category for casual day-to-day purchases that
-- don't deserve a granular bucket. Use case: the user buys gaseosa at a
-- bodega today, pollo at the market tomorrow, caramelo from a street
-- vendor on the way home — none of those need their own category. A
-- generic "Día a día" with product-style merchants ("Gaseosa", "Pollo",
-- "Verdura"...) lets the user log those in one tap from the picker.
--
-- This is intentionally NOT named "Mercado" — that bucket already exists
-- (00004) and is associated with supermarket runs. "Día a día" is the
-- bodega / street-vendor / quick-snack equivalent.
--
-- Idempotent across all operations:
--   - Category INSERT uses ON CONFLICT DO NOTHING via the
--     categories_user_name_kind_uniq index.
--   - Merchant INSERT uses ON CONFLICT DO NOTHING via the
--     merchants_user_category_name_uniq index.

BEGIN;

-- 1. Category. Teal so it doesn't collide with the existing palette
--    (Comida amber, Mercado, Suscripciones purple, etc.). Icon "store"
--    is added to the icon-alias map in src/lib/category-icons.ts so the
--    picker / row chips pick it up correctly.
INSERT INTO public.categories (user_id, name, kind, color, icon) VALUES
  (NULL, 'Día a día', 'expense', '#14b8a6', 'store')
ON CONFLICT DO NOTHING;

-- 2. Merchants. These are PRODUCT-style names rather than store names —
--    the natural read in a "casual purchase" context where the user
--    doesn't care which specific bodega sold the gaseosa. The user can
--    always create their own custom merchants on top via /capture's
--    MerchantPicker (e.g. "Bodega Doña María").
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  ('Día a día', 'Gaseosa'),
  ('Día a día', 'Agua'),
  ('Día a día', 'Pan'),
  ('Día a día', 'Pollo'),
  ('Día a día', 'Carne'),
  ('Día a día', 'Verdura'),
  ('Día a día', 'Fruta'),
  ('Día a día', 'Caramelo'),
  ('Día a día', 'Snack'),
  ('Día a día', 'Helado')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 3. logo_slug — these are generic product names with no canonical brand
--    SVG, so we leave logo_slug NULL. MerchantAvatar falls back to
--    deterministic initials ("GA" for Gaseosa, "PO" for Pollo...) which
--    keeps the rows visually scannable without forcing us to ship art.

COMMIT;
