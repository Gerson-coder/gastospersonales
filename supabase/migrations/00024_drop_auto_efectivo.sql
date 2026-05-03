-- 00024_drop_auto_efectivo.sql
-- Stop auto-creating an "Efectivo" account on signup.
--
-- Originally `public.handle_new_user()` (00003_triggers.sql) did two things:
--   1) Insert a row into `public.profiles` for the new auth user.
--   2) Insert a default `Efectivo` cash account in PEN.
--
-- Step 2 turned out to be opinionated UX: brand-new users opening the app
-- saw a pre-seeded Efectivo card on the dashboard and `/accounts` instead
-- of the empty state ("Crea tu cuenta") that we want them to land on, so
-- they're forced to consciously pick the wallet/bank where their money
-- actually lives.
--
-- This migration:
--   * Replaces `handle_new_user()` to keep ONLY the profile insert.
--   * Re-creates the AFTER INSERT trigger on auth.users so signup keeps
--     working (profiles row is still required by RLS policies).
--   * Re-grants EXECUTE to supabase_auth_admin (the role that runs
--     auth.users mutations) — same convention as 00003.
--
-- Existing users are unaffected: their already-seeded `Efectivo` row in
-- `public.accounts` is untouched. Only NEW signups from this migration
-- onward start with zero accounts.
--
-- IMPORTANT — manual GRANT:
-- Hosted Supabase usually picks up the GRANT automatically because
-- migrations are pushed via the supabase_admin role. If you ever see a
-- "permission denied for function" error during signup, run this manually
-- in the SQL editor as supabase_admin:
--
--   GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Idempotent on retry (TRIG-1.b in 00003).
  INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

  -- NOTE: Auto "Efectivo" insert removed in 00024. New users start with
  -- zero accounts and create their first one from the empty state.

  RETURN NEW;
END;
$$;

-- Re-create the trigger so it picks up the new function body. CREATE OR
-- REPLACE FUNCTION already swaps the body in place, but we DROP+CREATE
-- the trigger defensively in case a future hand-edit reattached the old
-- function body to a different trigger name.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

COMMIT;
