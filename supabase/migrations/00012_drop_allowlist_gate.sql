-- 00012_drop_allowlist_gate.sql
-- Opens signup to any email. The `before_auth_user_insert_allowlist` trigger
-- (defined in 00003_triggers.sql) was a private-beta gate that rejected any
-- email not seeded in `public.allowed_emails`. Now that the product is moving
-- to general availability, we drop the trigger so anyone can create an
-- account through the normal signup flow.
--
-- We DO NOT drop:
--   - public.check_allowed_email()      (function kept for future opt-in use)
--   - public.allowed_emails             (table kept; can be repurposed as a
--                                        denylist or invite list later)
-- so re-enabling the gate is one CREATE TRIGGER away.
--
-- Idempotent: DROP TRIGGER IF EXISTS is a no-op when already dropped.

BEGIN;

DROP TRIGGER IF EXISTS before_auth_user_insert_allowlist ON auth.users;

COMMENT ON FUNCTION public.check_allowed_email() IS
  'Was wired as a BEFORE INSERT trigger on auth.users until 00012 dropped that trigger. Function kept for future opt-in use (e.g. promo-code allowlist, employee invites).';

COMMIT;
