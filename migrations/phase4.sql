-- Phase 4: site_photos in gallery
-- Run in Supabase SQL Editor

ALTER TABLE site_photos ADD COLUMN IF NOT EXISTS in_gallery BOOLEAN DEFAULT TRUE;
