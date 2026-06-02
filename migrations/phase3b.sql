-- Phase 3b: Builder updates — text-first with optional photos and owner replies

ALTER TABLE builder_updates
  ADD COLUMN IF NOT EXISTS message      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS photo_paths  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replies      JSONB DEFAULT '[]'::jsonb;

-- Allow text-only updates (no photo required)
ALTER TABLE builder_updates ALTER COLUMN storage_path DROP NOT NULL;
