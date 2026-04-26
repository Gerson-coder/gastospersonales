-- 00007_seed_system_merchants.sql
-- 22 system merchants visible to all users (user_id IS NULL).
-- category_id is resolved by joining against system categories from 00004 by name.
-- Idempotent: the unique index merchants_user_category_name_uniq covers re-runs.

insert into public.merchants (user_id, category_id, name)
select null, c.id, m.name
from public.categories c
join (values
  -- Comida
  ('Comida',    'KFC'),
  ('Comida',    'Pizza Hut'),
  ('Comida',    'Papa John''s'),
  ('Comida',    'Bembos'),
  ('Comida',    'Norky''s'),
  ('Comida',    'Pardos Chicken'),
  -- Salud
  ('Salud',     'Inkafarma'),
  ('Salud',     'Mifarma'),
  ('Salud',     'Clínica Ricardo Palma'),
  ('Salud',     'Clínica San Pablo'),
  -- Servicios
  ('Servicios', 'Movistar'),
  ('Servicios', 'Claro'),
  ('Servicios', 'Entel'),
  ('Servicios', 'Sedapal'),
  ('Servicios', 'Luz del Sur'),
  -- Educación
  ('Educación', 'PUCP'),
  ('Educación', 'UPC'),
  ('Educación', 'UTP'),
  ('Educación', 'UNMSM')
) as m(category_name, name)
  on c.name = m.category_name
 and c.user_id is null
on conflict do nothing;
