-- 00021_auth_pin_otp.sql
-- Auth layer additions for the PIN + email-OTP flow:
--   1. Extend `profiles` with the extra fields the new register form
--      collects (full_name, birth_date, phone, email_verified_at).
--   2. `user_pins` — server-side bcrypt hash of the user's 6-digit PIN
--      plus a rate-limit counter. The PIN is a SECONDARY credential on
--      top of the Supabase email+password session, not a replacement.
--   3. `trusted_devices` — one row per (user, device fingerprint). Marks
--      a device as "PIN-only" eligible after a successful email+OTP
--      verification on first contact.
--   4. `auth_otps` — one-time codes for email verification, new-device
--      challenges, and PIN reset. Code is hashed (never stored plain).
--   5. `auth_attempts` — anti-bruteforce log for PIN/OTP/password
--      attempts. Used by the API routes to enforce per-user/per-IP
--      lockouts.
--
-- All new tables: RLS enabled, only the owner can read their own rows.
-- Writes go through the service role (API routes) so the server can
-- enforce hashing + rate limits before the row hits Postgres.

BEGIN;

-- ─── 1. profiles extension ─────────────────────────────────────────────
-- Idempotent ADD COLUMN — re-running this migration is safe even after
-- a previous partial apply.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name         text,
  ADD COLUMN IF NOT EXISTS birth_date        date,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- ─── 2. user_pins ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_pins (
  user_id           uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash          text NOT NULL,
  set_at            timestamptz NOT NULL DEFAULT now(),
  failed_attempts   int NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

-- The user can READ their own row to check if a PIN is set + lock status.
-- They CANNOT update directly — the API route hashes + rate-limits
-- before writing. Service role bypasses RLS for those writes.
CREATE POLICY user_pins_select_own ON public.user_pins
  FOR SELECT USING (auth.uid() = user_id);

-- ─── 3. trusted_devices ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- sha256 of (user_agent + screen_res + tz + accept_language). NOT a
  -- privacy-invasive fingerprint library — just enough entropy to tell
  -- "is this the same browser as last time".
  fingerprint_hash  text NOT NULL,
  device_name       text NOT NULL,
  trusted_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint_hash)
);

CREATE INDEX trusted_devices_user_idx ON public.trusted_devices(user_id);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

-- Users can list their own devices (for the future "revoke device" UI).
CREATE POLICY trusted_devices_select_own ON public.trusted_devices
  FOR SELECT USING (auth.uid() = user_id);

-- Users can revoke (delete) their own devices from the settings UI.
CREATE POLICY trusted_devices_delete_own ON public.trusted_devices
  FOR DELETE USING (auth.uid() = user_id);

-- ─── 4. auth_otps ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- bcrypt hash of the 6-digit code. Plaintext only exists between
  -- generation and the Resend send call, then it's gone.
  code_hash   text NOT NULL,
  purpose     text NOT NULL CHECK (purpose IN (
    'email_verification',
    'new_device',
    'pin_reset'
  )),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_otps_user_purpose_idx
  ON public.auth_otps(user_id, purpose, created_at DESC);

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;

-- No client-readable policy. All access goes through the API route via
-- the service-role client; users never query this table directly.

-- ─── 5. auth_attempts ──────────────────────────────────────────────────
-- Lightweight audit log. Service-role only.
CREATE TABLE IF NOT EXISTS public.auth_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip           text,
  action       text NOT NULL CHECK (action IN ('pin', 'password', 'otp')),
  succeeded    boolean NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_attempts_user_action_idx
  ON public.auth_attempts(user_id, action, occurred_at DESC);
CREATE INDEX auth_attempts_ip_idx
  ON public.auth_attempts(ip, occurred_at DESC) WHERE ip IS NOT NULL;

ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
-- No policies — service role only.

-- ─── 6. Auto-update updated_at on user_pins ────────────────────────────
-- Mirrors the pattern from migration 00003 for profiles / accounts.
CREATE TRIGGER tg_user_pins_updated_at
  BEFORE UPDATE ON public.user_pins
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();

COMMIT;
