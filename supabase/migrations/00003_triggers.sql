-- 00003_triggers.sql
-- Three concerns:
--   1) Allowlist gate (BEFORE INSERT on auth.users) — rejects unknown emails.
--   2) Profile + Efectivo auto-create (AFTER INSERT on auth.users).
--   3) updated_at autoupdate on every public table that has the column.
--
-- IMPORTANT — manual GRANTs:
-- Hosted Supabase usually picks up the GRANTs below automatically because
-- migrations are pushed via the supabase_admin role. If you ever see a
-- "permission denied for function" error during signup, run these manually
-- in the SQL editor as supabase_admin:
--
--   GRANT EXECUTE ON FUNCTION public.check_allowed_email() TO supabase_auth_admin;
--   GRANT EXECUTE ON FUNCTION public.handle_new_user()    TO supabase_auth_admin;
--
-- Both functions are SECURITY DEFINER with `set search_path = public` to keep
-- the trusted resolution path inside the public schema.

-- =================================================================
-- 1. Allowlist gate
-- =================================================================
create or replace function public.check_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where email = new.email
  ) then
    raise exception 'Email % is not in the allowlist', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists before_auth_user_insert_allowlist on auth.users;
create trigger before_auth_user_insert_allowlist
  before insert on auth.users
  for each row execute function public.check_allowed_email();

-- =================================================================
-- 2. Profile + Efectivo auto-create
-- =================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Idempotent on retry (TRIG-1.b).
  insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;

  -- One Efectivo cash account per user. The unique index categories_user_name_kind_uniq
  -- is on categories, so for accounts we rely on the trigger only running once per
  -- auth.users INSERT — sufficient for our use case.
  insert into public.accounts (user_id, name, type, currency)
    values (new.id, 'Efectivo', 'cash', 'PEN');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- supabase_auth_admin is the role that runs auth.users mutations.
grant execute on function public.check_allowed_email() to supabase_auth_admin;
grant execute on function public.handle_new_user()    to supabase_auth_admin;

-- =================================================================
-- 3. updated_at autoupdate
-- =================================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.tg_set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.tg_set_updated_at();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.tg_set_updated_at();

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.tg_set_updated_at();
