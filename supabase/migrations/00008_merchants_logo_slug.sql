-- 00008_merchants_logo_slug.sql
-- Adds the logo_slug column to merchants and assigns slugs to the 19 system seed.
-- The slug maps to a static SVG file at /public/logos/merchants/{slug}.svg.
-- A NULL slug renders the deterministic initials avatar in the UI (fallback).

BEGIN;

-- Idempotent so a partially-applied migration (column added, but a later
-- statement in this file rolled back / errored / was retried by `supabase
-- db push`) can be re-run cleanly. Without IF NOT EXISTS the retry blows
-- up with "column logo_slug already exists" before getting to the slug
-- assignments below.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS logo_slug TEXT NULL
    CHECK (logo_slug IS NULL OR length(logo_slug) BETWEEN 1 AND 64);

COMMENT ON COLUMN merchants.logo_slug IS
  'Filename stem (kebab-case) for the merchant logo SVG at /public/logos/merchants/{slug}.svg. NULL = render generated-initials avatar.';

-- Assign slugs to the 19 system seed merchants. The WHERE clause guards
-- against re-runs: only updates rows where the column is still NULL so
-- a manual override won't be clobbered if the migration re-applies.

UPDATE merchants SET logo_slug = 'kfc'                   WHERE user_id IS NULL AND name = 'KFC' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'pizza-hut'             WHERE user_id IS NULL AND name = 'Pizza Hut' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'papa-johns'            WHERE user_id IS NULL AND name = 'Papa John''s' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'bembos'                WHERE user_id IS NULL AND name = 'Bembos' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'norkys'                WHERE user_id IS NULL AND name = 'Norky''s' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'pardos-chicken'        WHERE user_id IS NULL AND name = 'Pardos Chicken' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'inkafarma'             WHERE user_id IS NULL AND name = 'Inkafarma' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'mifarma'               WHERE user_id IS NULL AND name = 'Mifarma' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'clinica-ricardo-palma' WHERE user_id IS NULL AND name = 'Clínica Ricardo Palma' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'clinica-san-pablo'     WHERE user_id IS NULL AND name = 'Clínica San Pablo' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'movistar'              WHERE user_id IS NULL AND name = 'Movistar' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'claro'                 WHERE user_id IS NULL AND name = 'Claro' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'entel'                 WHERE user_id IS NULL AND name = 'Entel' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'sedapal'               WHERE user_id IS NULL AND name = 'Sedapal' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'luz-del-sur'           WHERE user_id IS NULL AND name = 'Luz del Sur' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'pucp'                  WHERE user_id IS NULL AND name = 'PUCP' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'upc'                   WHERE user_id IS NULL AND name = 'UPC' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'utp'                   WHERE user_id IS NULL AND name = 'UTP' AND logo_slug IS NULL;
UPDATE merchants SET logo_slug = 'unmsm'                 WHERE user_id IS NULL AND name = 'UNMSM' AND logo_slug IS NULL;

-- Re-create the RPC to include the new logo_slug column in its return shape.
-- The original definition (in 00006_merchants.sql) predates this column, so
-- callers receive a row without logo_slug and the picker falls back to
-- initials even when a static SVG exists. CREATE OR REPLACE preserves the
-- GRANT EXECUTE applied in 00006. Body mirrors the original 1:1 — same
-- 90-day window over `transactions.occurred_at`, same archive filter, same
-- ordering — only adds `logo_slug` to the SELECT and RETURNS TABLE.
CREATE OR REPLACE FUNCTION public.list_mru_merchants(p_category_id UUID, p_limit INT DEFAULT 3)
RETURNS TABLE (
  id          UUID,
  user_id     UUID,
  category_id UUID,
  name        TEXT,
  logo_slug   TEXT,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  usage_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.user_id,
    m.category_id,
    m.name,
    m.logo_slug,
    m.archived_at,
    m.created_at,
    m.updated_at,
    COALESCE(t.usage_count, 0) AS usage_count
  FROM public.merchants m
  LEFT JOIN (
    SELECT merchant_id, COUNT(*) AS usage_count
    FROM public.transactions
    WHERE merchant_id IS NOT NULL
      AND archived_at IS NULL
      AND occurred_at >= now() - interval '90 days'
    GROUP BY merchant_id
  ) t ON t.merchant_id = m.id
  WHERE m.category_id = p_category_id
    AND m.archived_at IS NULL
  ORDER BY usage_count DESC, lower(m.name) ASC
  LIMIT p_limit;
$$;

COMMIT;
