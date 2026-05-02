-- 00022_receipts.sql
-- Layer the OCR pipeline on top of the existing `receipts` table from
-- migration 00001. The base table already has the right bones:
--   - id, user_id, image_path, ocr_status, ocr_raw, parsed_*, confidence,
--     linked_transaction_id, error_message, created_at, updated_at
-- We add the fields the new pipeline depends on:
--   - source        — classified OCR source (yape / plin / bbva / bcp / unknown)
--   - model_used    — gpt-4o-mini or gpt-4o (for cost telemetry + audit)
--   - expires_at    — 90-day TTL signal for the cleanup cron in 00024
--
-- We also create the `receipts` storage bucket with mime + size caps,
-- plus path-bound RLS policies on storage.objects so a user can never
-- read another user's image.

BEGIN;

-- ─── 1. ALTER receipts — add OCR pipeline fields ──────────────────────
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS source     text,
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

-- CHECK constraints on the new columns. Keep the lists in sync with
-- OCR_SOURCES / OCR_MODELS in src/lib/ocr/types.ts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_source_check'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_source_check
      CHECK (source IS NULL OR source IN ('yape','plin','bbva','bcp','unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_model_used_check'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_model_used_check
      CHECK (model_used IS NULL OR model_used IN ('gpt-4o-mini','gpt-4o'));
  END IF;
END$$;

-- Partial idx on TTL — keeps the cleanup cron's seq scan tight by
-- skipping rows still being processed.
CREATE INDEX IF NOT EXISTS receipts_expires_idx
  ON public.receipts (expires_at)
  WHERE ocr_status IN ('completed', 'failed');

-- ─── 2. receipts storage bucket ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. storage.objects RLS for the receipts bucket ────────────────────
-- The first folder of the object name MUST equal the auth.uid() of
-- the owner. The API route enforces this convention when uploading,
-- and these policies enforce it when reading/deleting — defense in
-- depth so a server-side bug can't accidentally cross-leak.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'receipts_storage_select_own'
  ) THEN
    CREATE POLICY "receipts_storage_select_own"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'receipts_storage_insert_own'
  ) THEN
    CREATE POLICY "receipts_storage_insert_own"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'receipts_storage_delete_own'
  ) THEN
    CREATE POLICY "receipts_storage_delete_own"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END$$;

-- No UPDATE policy — receipts are write-once. To re-OCR, upload a new
-- image and create a fresh receipt row.

COMMIT;
