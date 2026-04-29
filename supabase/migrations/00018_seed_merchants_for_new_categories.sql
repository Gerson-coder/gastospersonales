-- 00018_seed_merchants_for_new_categories.sql
-- System merchants for the three categories added in 00017 where the
-- user explicitly named the brands they expect to see in the picker:
--
--   Impuestos:        SUNAT, SUNARP, Reniec, SAT Lima, Notaría, Peaje
--   Cuidado personal: Esika, Cyzone, LBel, Yanbal, Natura, Avon, Nivea,
--                     La Roche-Posay, Eucerin, Cetaphil
--   Suscripciones:    Netflix, Disney+, HBO Max, Prime Video, Spotify,
--                     YouTube Premium, Apple TV+, Apple Music,
--                     Paramount+, ChatGPT Plus
--
-- logo_slug is pre-assigned for every row using the kebab-case +
-- diacritic-strip convention. MerchantAvatar gracefully falls back to
-- deterministic initials when the SVG file at
-- /public/logos/merchants/{slug}.svg is missing — so rows render today
-- and "just work" once the user drops SVGs in.
--
-- Idempotent across all operations:
--   - INSERT uses ON CONFLICT DO NOTHING via the
--     merchants_user_category_name_uniq index.
--   - logo_slug UPDATEs are NULL-guarded so a manual override survives.

BEGIN;

-- 1. Insert merchants. category_id resolved by joining against the
--    system categories from 00004 + 00017 by name.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  -- Impuestos / Trámites
  ('Impuestos',        'SUNAT'),
  ('Impuestos',        'SUNARP'),
  ('Impuestos',        'Reniec'),
  ('Impuestos',        'SAT Lima'),
  ('Impuestos',        'Notaría'),
  ('Impuestos',        'Peaje'),
  -- Cuidado personal — direct-sale Peruvian cosmetics + global derma
  -- brands the user typically logs from pharmacy / online buys.
  ('Cuidado personal', 'Esika'),
  ('Cuidado personal', 'Cyzone'),
  ('Cuidado personal', 'L''Bel'),
  ('Cuidado personal', 'Yanbal'),
  ('Cuidado personal', 'Natura'),
  ('Cuidado personal', 'Avon'),
  ('Cuidado personal', 'Nivea'),
  ('Cuidado personal', 'La Roche-Posay'),
  ('Cuidado personal', 'Eucerin'),
  ('Cuidado personal', 'Cetaphil'),
  -- Suscripciones digitales — streaming + audio + the "AI subs" the
  -- user is likely paying for. Single-source-of-truth bucket so the
  -- user can see total monthly recurring spend at a glance.
  ('Suscripciones',    'Netflix'),
  ('Suscripciones',    'Disney+'),
  ('Suscripciones',    'HBO Max'),
  ('Suscripciones',    'Prime Video'),
  ('Suscripciones',    'Spotify'),
  ('Suscripciones',    'YouTube Premium'),
  ('Suscripciones',    'Apple TV+'),
  ('Suscripciones',    'Apple Music'),
  ('Suscripciones',    'Paramount+'),
  ('Suscripciones',    'ChatGPT Plus')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. Pre-assign logo_slug for each. NULL-guarded UPDATEs.
--    Slugs use kebab-case with diacritic strip (sunarp, not súnarp;
--    la-roche-posay, not la-roche-posay-derma; etc.) to match the file
--    naming convention.

-- Impuestos
UPDATE public.merchants SET logo_slug = 'sunat'    WHERE user_id IS NULL AND name = 'SUNAT'    AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'sunarp'   WHERE user_id IS NULL AND name = 'SUNARP'   AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'reniec'   WHERE user_id IS NULL AND name = 'Reniec'   AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'sat-lima' WHERE user_id IS NULL AND name = 'SAT Lima' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'notaria'  WHERE user_id IS NULL AND name = 'Notaría'  AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'peaje'    WHERE user_id IS NULL AND name = 'Peaje'    AND logo_slug IS NULL;

-- Cuidado personal
UPDATE public.merchants SET logo_slug = 'esika'           WHERE user_id IS NULL AND name = 'Esika'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cyzone'          WHERE user_id IS NULL AND name = 'Cyzone'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'lbel'            WHERE user_id IS NULL AND name = 'L''Bel'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'yanbal'          WHERE user_id IS NULL AND name = 'Yanbal'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'natura'          WHERE user_id IS NULL AND name = 'Natura'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'avon'            WHERE user_id IS NULL AND name = 'Avon'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'nivea'           WHERE user_id IS NULL AND name = 'Nivea'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'la-roche-posay'  WHERE user_id IS NULL AND name = 'La Roche-Posay'  AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'eucerin'         WHERE user_id IS NULL AND name = 'Eucerin'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cetaphil'        WHERE user_id IS NULL AND name = 'Cetaphil'        AND logo_slug IS NULL;

-- Suscripciones
UPDATE public.merchants SET logo_slug = 'netflix'          WHERE user_id IS NULL AND name = 'Netflix'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'disney-plus'      WHERE user_id IS NULL AND name = 'Disney+'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'hbo-max'          WHERE user_id IS NULL AND name = 'HBO Max'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'prime-video'      WHERE user_id IS NULL AND name = 'Prime Video'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'spotify'          WHERE user_id IS NULL AND name = 'Spotify'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'youtube-premium'  WHERE user_id IS NULL AND name = 'YouTube Premium'  AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'apple-tv'         WHERE user_id IS NULL AND name = 'Apple TV+'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'apple-music'      WHERE user_id IS NULL AND name = 'Apple Music'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'paramount-plus'   WHERE user_id IS NULL AND name = 'Paramount+'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'chatgpt-plus'     WHERE user_id IS NULL AND name = 'ChatGPT Plus'     AND logo_slug IS NULL;

COMMIT;
