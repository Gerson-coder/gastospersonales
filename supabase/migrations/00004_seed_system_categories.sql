-- 00004_seed_system_categories.sql
-- Ten system categories visible to all users (user_id IS NULL).
-- Icons are Lucide icon names (kebab-case). Idempotent via on conflict do nothing
-- (the unique index categories_user_name_kind_uniq covers this).

insert into public.categories (user_id, name, kind, color, icon) values
  (null, 'Comida',     'expense', '#f59e0b', 'utensils-crossed'),
  (null, 'Transporte', 'expense', '#3b82f6', 'car'),
  (null, 'Vivienda',   'expense', '#8b5cf6', 'home'),
  (null, 'Salud',      'expense', '#ef4444', 'heart-pulse'),
  (null, 'Ocio',       'expense', '#ec4899', 'gamepad-2'),
  (null, 'Servicios',  'expense', '#14b8a6', 'plug'),
  (null, 'Educación',  'expense', '#06b6d4', 'book-open'),
  (null, 'Ahorro',     'expense', '#10b981', 'piggy-bank'),
  (null, 'Trabajo',    'income',  '#22c55e', 'briefcase'),
  (null, 'Otros',      'expense', '#6b7280', 'circle-ellipsis')
on conflict do nothing;
