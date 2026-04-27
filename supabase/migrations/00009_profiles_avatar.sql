-- 00009_profiles_avatar.sql
-- Adds avatar_url to profiles + creates the public 'avatars' Storage bucket
-- with per-user RLS so users can upload/replace/delete their OWN avatar
-- and read everyone else's (avatars are public branding).

BEGIN;

-- 1. Column on profiles (skip if it already exists)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL
    CHECK (avatar_url IS NULL OR length(avatar_url) BETWEEN 1 AND 500);

COMMENT ON COLUMN profiles.avatar_url IS
  'Public URL of the user avatar in Supabase Storage avatars bucket. NULL = render initials.';

-- 2. Create the public avatars bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  2 * 1024 * 1024, -- 2 MB max per file
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS on storage.objects for the avatars bucket
-- Convention: file path = '{user_id}/{filename}'. We extract user_id from
-- the path's first folder using split_part.

-- Anyone authenticated can SELECT (read) from avatars bucket
CREATE POLICY "avatars_select_auth"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- Anonymous can also read (avatars are public — used in marketing pages,
-- magic-link emails, etc). If you don't want this, drop this policy.
CREATE POLICY "avatars_select_anon"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'avatars');

-- Only owner can INSERT into their folder
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Only owner can UPDATE their files
CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Only owner can DELETE their files
CREATE POLICY "avatars_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

COMMIT;
