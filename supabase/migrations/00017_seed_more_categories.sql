-- 00017_seed_more_categories.sql
-- Six additional system expense categories (user_id IS NULL) on top of
-- the 10 from 00004 + the Telefonía bucket added in 00015. Each ships
-- with a Lucide icon name in kebab-case (matches the convention used by
-- categories.icon → src/lib/category-icons.ts lookups).
--
-- Color choices intentionally avoid hue collisions with the existing
-- palette so the donut + breakdown bars stay legible. See comments
-- inline.
--
-- Idempotent via categories_user_name_kind_uniq covering ON CONFLICT.

INSERT INTO public.categories (user_id, name, kind, color, icon) VALUES
  -- Suscripciones — Netflix / Spotify / Disney / HBO / Prime / etc.
  -- Today these end up in "Ocio" mixed with cinema and dining out, but
  -- recurring digital subs deserve their own bucket so the user can see
  -- "this is plata fija que sale sí o sí". Purple distinct from Vivienda.
  (NULL, 'Suscripciones',    'expense', '#a855f7', 'tv'),
  -- Mascotas — vet + food + accesorios. Common ask from pet-owning users.
  -- Amber-darker so it doesn't collide with Comida's amber.
  (NULL, 'Mascotas',         'expense', '#d97706', 'paw-print'),
  -- Cuidado personal — peluquería, barbería, gimnasio, cosméticos.
  -- Distinct from Salud (médico) which is reactive; this is recurring
  -- self-care spend. Pink-darker, distinct from Ocio's pink.
  (NULL, 'Cuidado personal', 'expense', '#db2777', 'scissors'),
  -- Vestimenta — ropa, calzado, accesorios. Sky-blue so it reads
  -- distinct from Transporte's blue and Educación's cyan.
  (NULL, 'Vestimenta',       'expense', '#0ea5e9', 'shirt'),
  -- Regalos / Ocasiones — cumpleaños, aniversarios, bodas, navidad.
  -- Lime-green, distinct from the Ahorro / Trabajo greens.
  (NULL, 'Regalos',          'expense', '#84cc16', 'gift'),
  -- Impuestos / Trámites — SUNAT, SUNARP, peajes, multas. Slate so it
  -- reads distinct from "Otros" gray.
  (NULL, 'Impuestos',        'expense', '#475569', 'scroll-text')
ON CONFLICT DO NOTHING;
