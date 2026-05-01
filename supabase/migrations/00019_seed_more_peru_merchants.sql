-- 00019_seed_more_peru_merchants.sql
-- Second wave of system merchants (user_id IS NULL) covering Peru-heavy
-- brands across the existing categories. Touches:
--
--   Comida:           23 brands — fine dining (Central, Maido, Astrid y
--                     Gastón…), casual chains (7 Sopas, La Lucha, Las
--                     Canastas…), QSR (Subway, Domino's, Popeyes…),
--                     coffee + bakery (Juan Valdez, Altomayo, La Baguette).
--   Vestimenta:       15 brands — department stores (Ripley, Falabella,
--                     Oechsle, Paris, Estilos), local apparel (Topitop),
--                     sportswear (Adidas, Nike, Puma, Marathon Sports),
--                     fast fashion (Zara, H&M, Stradivarius, Pull&Bear,
--                     Bershka).
--   Mascotas:         8  brands — pet stores + grooming.
--   Regalos:          8  brands — flowers, chocolates, books.
--   Salud:            12 brands — clínicas privadas + cadenas dentales,
--                     laboratorios, óptica.
--   Servicios:        4  brands — gas + electricidad (Cálidda, Solgas,
--                     Lima Gas, Enel).
--   Educación:        10 brands — universidades + idiomas + preparación.
--   Ocio:             12 brands — cines, ticketing, gimnasio, gaming
--                     stores (Steam, PSN, Xbox, Nintendo).
--   Vivienda:         6  brands — mejoramiento del hogar + librería.
--   Otros:            10 brands — supermercados (Plaza Vea, Tottus, Wong,
--                     Vivanda, Makro) + cadenas de tecnología/electro
--                     (Hiraoka, La Curacao, Tiendas EFE, Carsa) + Real
--                     Plaza (mall, gasto genérico).
--
-- Total: 108 system merchants. logo_slug pre-assigned for every row;
-- MerchantAvatar falls back to deterministic initials when the SVG at
-- /public/logos/merchants/{slug}.svg is missing.
--
-- Idempotent across all operations:
--   - INSERT uses ON CONFLICT DO NOTHING via the
--     merchants_user_category_name_uniq index.
--   - logo_slug UPDATEs are NULL-guarded so a manual override survives.

BEGIN;

-- 1. Insert merchants. category_id resolved by joining against the
--    system categories from 00004 + 00015 + 00017 by name.
INSERT INTO public.merchants (user_id, category_id, name)
SELECT NULL, c.id, m.name
FROM public.categories c
JOIN (VALUES
  -- Comida (23)
 
  


  
  ('Comida',      '7 Sopas'),
  ('Comida',      'La Lucha'),
  ('Comida',      'Don Tito'),
  ('Comida',      'Subway'),
  ('Comida',      'Domino''s Pizza'),
  ('Comida',      'Popeyes'),
  ('Comida',      'TGI Fridays'),
  ('Comida',      'Chili''s'),
  -- Vestimenta (15)
  ('Vestimenta',  'Ripley'),
  ('Vestimenta',  'Falabella'),
  ('Vestimenta',  'Oechsle'),

  ('Vestimenta',  'Topitop'),
  ('Vestimenta',  'Adidas'),
  ('Vestimenta',  'Nike'),
  ('Vestimenta',  'Puma'),
  ('Vestimenta',  'Zara'),
  ('Vestimenta',  'H&M'),
  ('Vestimenta',  'Stradivarius'),
  ('Vestimenta',  'Pull&Bear'),
  ('Vestimenta',  'Bershka'),
  ('Vestimenta',  'Marathon Sports'),
  -- Mascotas (8)
  ('Mascotas',    'SuperPet'),
  ('Mascotas',    'Groomers'),
  ('Mascotas',    'Casa Mascotas'),
  ('Mascotas',    'Que Patas'),
  ('Mascotas',    'Mastica'),
  ('Mascotas',    'Cochikis'),
  ('Mascotas',    'Pet Store Lima'),
  ('Mascotas',    'Allju'),
  -- Regalos (8)
  ('Regalos',     'Rosatel'),
  ('Regalos',     'Verdíssimo'),
  ('Regalos',     'La Ibérica'),
  ('Regalos',     'Helena'),
  ('Regalos',     'Cacaosuyo'),
  ('Regalos',     'Crisol'),
  ('Regalos',     'Ibero Librerías'),
  ('Regalos',     'El Virrey'),
  -- Salud (12)
  ('Salud',       'Clínica Anglo Americana'),
  ('Salud',       'Clínica Internacional'),
  ('Salud',       'Oncosalud'),
  ('Salud',       'GMO'),
  -- Servicios (4)
  ('Servicios',   'Cálidda'),
  ('Servicios',   'Solgas'),
  ('Servicios',   'Lima Gas'),
  ('Servicios',   'Enel'),
  -- Educación (10)
  ('Educación',   'USIL'),
  ('Educación',   'ULIMA'),
  ('Educación',   'USMP'),
  ('Educación',   'URP'),
  ('Educación',   'UNI'),
  ('Educación',   'UCV'),
  ('Educación',   'ICPNA'),
  -- Ocio (12)
  ('Ocio',        'Cineplanet'),
  ('Ocio',        'Cinemark'),
  ('Ocio',        'Cinépolis'),

  ('Ocio',        'Joinnus'),
  ('Ocio',        'Teleticket'),

  ('Ocio',        'Smart Fit'),
  ('Ocio',        'Steam'),
  ('Ocio',        'PlayStation Store'),
  ('Ocio',        'Xbox'),

  -- Vivienda (6)
  ('Vivienda',    'Sodimac'),
  ('Vivienda',    'Promart'),
  ('Vivienda',    'Maestro'),
  ('Vivienda',    'Cassinelli'),
  ('Vivienda',    'Casaideas'),
  ('Vivienda',    'Tay Loy'),
  -- Otros (10) — supermercados + tecnología
  ('Otros',       'Plaza Vea'),
  ('Otros',       'Tottus'),
  ('Otros',       'Wong'),
  ('Otros',       'Vivanda'),
  ('Otros',       'Makro'),
  ('Otros',       'Hiraoka'),
  ('Otros',       'La Curacao'),
  ('Otros',       'Tiendas EFE'),
  ('Otros',       'Carsa'),
  ('Otros',       'Real Plaza')
) AS m(category_name, name)
  ON c.name = m.category_name
 AND c.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2. Pre-assign logo_slug for each. NULL-guarded UPDATEs.
--    Slugs use kebab-case with diacritic strip + apostrophes/ampersands
--    flattened (dominos-pizza, chilis, hm, pull-and-bear).

-- Comida

UPDATE public.merchants SET logo_slug = 'la-mar'          WHERE user_id IS NULL AND name = 'La Mar'          AND logo_slug IS NULL;

UPDATE public.merchants SET logo_slug = '7-sopas'         WHERE user_id IS NULL AND name = '7 Sopas'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'la-lucha'        WHERE user_id IS NULL AND name = 'La Lucha'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'don-tito'        WHERE user_id IS NULL AND name = 'Don Tito'        AND logo_slug IS NULL;

UPDATE public.merchants SET logo_slug = 'subway'          WHERE user_id IS NULL AND name = 'Subway'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'dominos-pizza'   WHERE user_id IS NULL AND name = 'Domino''s Pizza' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'popeyes'         WHERE user_id IS NULL AND name = 'Popeyes'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'tgi-fridays'     WHERE user_id IS NULL AND name = 'TGI Fridays'     AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'chilis'          WHERE user_id IS NULL AND name = 'Chili''s'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'juan-valdez'     WHERE user_id IS NULL AND name = 'Juan Valdez'     AND logo_slug IS NULL;

UPDATE public.merchants SET logo_slug = 'la-baguette'     WHERE user_id IS NULL AND name = 'La Baguette'     AND logo_slug IS NULL;

-- Vestimenta
UPDATE public.merchants SET logo_slug = 'ripley'          WHERE user_id IS NULL AND name = 'Ripley'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'falabella'       WHERE user_id IS NULL AND name = 'Falabella'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'oechsle'         WHERE user_id IS NULL AND name = 'Oechsle'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'paris'           WHERE user_id IS NULL AND name = 'Paris'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'estilos'         WHERE user_id IS NULL AND name = 'Estilos'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'topitop'         WHERE user_id IS NULL AND name = 'Topitop'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'adidas'          WHERE user_id IS NULL AND name = 'Adidas'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'nike'            WHERE user_id IS NULL AND name = 'Nike'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'puma'            WHERE user_id IS NULL AND name = 'Puma'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'zara'            WHERE user_id IS NULL AND name = 'Zara'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'hm'              WHERE user_id IS NULL AND name = 'H&M'             AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'stradivarius'    WHERE user_id IS NULL AND name = 'Stradivarius'    AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'pull-and-bear'   WHERE user_id IS NULL AND name = 'Pull&Bear'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'bershka'         WHERE user_id IS NULL AND name = 'Bershka'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'marathon-sports' WHERE user_id IS NULL AND name = 'Marathon Sports' AND logo_slug IS NULL;

-- Mascotas
UPDATE public.merchants SET logo_slug = 'superpet'        WHERE user_id IS NULL AND name = 'SuperPet'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'groomers'        WHERE user_id IS NULL AND name = 'Groomers'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'casa-mascotas'   WHERE user_id IS NULL AND name = 'Casa Mascotas'   AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'que-patas'       WHERE user_id IS NULL AND name = 'Que Patas'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'mastica'         WHERE user_id IS NULL AND name = 'Mastica'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cochikis'        WHERE user_id IS NULL AND name = 'Cochikis'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'pet-store-lima'  WHERE user_id IS NULL AND name = 'Pet Store Lima'  AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'allju'           WHERE user_id IS NULL AND name = 'Allju'           AND logo_slug IS NULL;

-- Regalos
UPDATE public.merchants SET logo_slug = 'rosatel'         WHERE user_id IS NULL AND name = 'Rosatel'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'verdissimo'      WHERE user_id IS NULL AND name = 'Verdíssimo'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'la-iberica'      WHERE user_id IS NULL AND name = 'La Ibérica'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'helena'          WHERE user_id IS NULL AND name = 'Helena'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cacaosuyo'       WHERE user_id IS NULL AND name = 'Cacaosuyo'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'crisol'          WHERE user_id IS NULL AND name = 'Crisol'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'ibero-librerias' WHERE user_id IS NULL AND name = 'Ibero Librerías' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'el-virrey'       WHERE user_id IS NULL AND name = 'El Virrey'       AND logo_slug IS NULL;

-- Salud
UPDATE public.merchants SET logo_slug = 'clinica-anglo-americana' WHERE user_id IS NULL AND name = 'Clínica Anglo Americana' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'clinica-internacional'   WHERE user_id IS NULL AND name = 'Clínica Internacional'   AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'oncosalud'         WHERE user_id IS NULL AND name = 'Oncosalud'         AND logo_slug IS NULL;

UPDATE public.merchants SET logo_slug = 'clinica-san-borja'       WHERE user_id IS NULL AND name = 'Clínica San Borja'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'clinica-limatambo'       WHERE user_id IS NULL AND name = 'Clínica Limatambo'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'clinica-centenario'      WHERE user_id IS NULL AND name = 'Clínica Centenario'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'multident'               WHERE user_id IS NULL AND name = 'Multident'               AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'roe'                     WHERE user_id IS NULL AND name = 'Roe'                     AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'suiza-lab'               WHERE user_id IS NULL AND name = 'Suiza Lab'               AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'anglolab'                WHERE user_id IS NULL AND name = 'Anglolab'                AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'gmo'                     WHERE user_id IS NULL AND name = 'GMO'                     AND logo_slug IS NULL;

-- Servicios
UPDATE public.merchants SET logo_slug = 'calidda'         WHERE user_id IS NULL AND name = 'Cálidda'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'solgas'          WHERE user_id IS NULL AND name = 'Solgas'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'lima-gas'        WHERE user_id IS NULL AND name = 'Lima Gas'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'enel'            WHERE user_id IS NULL AND name = 'Enel'            AND logo_slug IS NULL;

-- Educación
UPDATE public.merchants SET logo_slug = 'usil'             WHERE user_id IS NULL AND name = 'USIL'             AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'ulima'            WHERE user_id IS NULL AND name = 'ULIMA'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'usmp'             WHERE user_id IS NULL AND name = 'USMP'             AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'urp'              WHERE user_id IS NULL AND name = 'URP'              AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'uni'              WHERE user_id IS NULL AND name = 'UNI'              AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'upsjb'            WHERE user_id IS NULL AND name = 'UPSJB'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'ucv'              WHERE user_id IS NULL AND name = 'UCV'              AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'icpna'            WHERE user_id IS NULL AND name = 'ICPNA'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'alianza-francesa' WHERE user_id IS NULL AND name = 'Alianza Francesa' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'pamer'            WHERE user_id IS NULL AND name = 'Pamer'            AND logo_slug IS NULL;

-- Ocio
UPDATE public.merchants SET logo_slug = 'cineplanet'        WHERE user_id IS NULL AND name = 'Cineplanet'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cinemark'          WHERE user_id IS NULL AND name = 'Cinemark'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cinepolis'         WHERE user_id IS NULL AND name = 'Cinépolis'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'uvk'               WHERE user_id IS NULL AND name = 'UVK'               AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'joinnus'           WHERE user_id IS NULL AND name = 'Joinnus'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'teleticket'        WHERE user_id IS NULL AND name = 'Teleticket'        AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'ticketmaster'      WHERE user_id IS NULL AND name = 'Ticketmaster'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'smart-fit'         WHERE user_id IS NULL AND name = 'Smart Fit'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'steam'             WHERE user_id IS NULL AND name = 'Steam'             AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'playstation-store' WHERE user_id IS NULL AND name = 'PlayStation Store' AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'xbox'              WHERE user_id IS NULL AND name = 'Xbox'              AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'nintendo-eshop'    WHERE user_id IS NULL AND name = 'Nintendo eShop'    AND logo_slug IS NULL;

-- Vivienda
UPDATE public.merchants SET logo_slug = 'sodimac'         WHERE user_id IS NULL AND name = 'Sodimac'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'promart'         WHERE user_id IS NULL AND name = 'Promart'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'maestro'         WHERE user_id IS NULL AND name = 'Maestro'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'cassinelli'      WHERE user_id IS NULL AND name = 'Cassinelli'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'casaideas'       WHERE user_id IS NULL AND name = 'Casaideas'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'tay-loy'         WHERE user_id IS NULL AND name = 'Tay Loy'         AND logo_slug IS NULL;

-- Otros — supermercados + tecnología
UPDATE public.merchants SET logo_slug = 'plaza-vea'       WHERE user_id IS NULL AND name = 'Plaza Vea'       AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'tottus'          WHERE user_id IS NULL AND name = 'Tottus'          AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'wong'            WHERE user_id IS NULL AND name = 'Wong'            AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'vivanda'         WHERE user_id IS NULL AND name = 'Vivanda'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'makro'           WHERE user_id IS NULL AND name = 'Makro'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'hiraoka'         WHERE user_id IS NULL AND name = 'Hiraoka'         AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'la-curacao'      WHERE user_id IS NULL AND name = 'La Curacao'      AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'tiendas-efe'     WHERE user_id IS NULL AND name = 'Tiendas EFE'     AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'carsa'           WHERE user_id IS NULL AND name = 'Carsa'           AND logo_slug IS NULL;
UPDATE public.merchants SET logo_slug = 'real-plaza'      WHERE user_id IS NULL AND name = 'Real Plaza'      AND logo_slug IS NULL;

COMMIT;
