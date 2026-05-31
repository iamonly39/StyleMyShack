-- Phase 3a: add in_gallery column to photos
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/yoikyxyrkcnvszogsyut/sql/new

ALTER TABLE photos ADD COLUMN IF NOT EXISTS in_gallery BOOLEAN DEFAULT TRUE;
