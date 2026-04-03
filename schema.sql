-- ─── StyleMyShack — Supabase Schema ─────────────────────────────────────────
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─── Storage bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-photos', 'room-photos', true)
ON CONFLICT DO NOTHING;

-- ─── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  description TEXT DEFAULT '',
  emoji      TEXT DEFAULT '🏠',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recommendations (
  room_id      TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  paint_notes  TEXT DEFAULT '',
  flooring     TEXT DEFAULT '',
  lighting     TEXT DEFAULT '',
  furniture    TEXT DEFAULT '',
  general_notes TEXT DEFAULT '',
  swatches     JSONB DEFAULT '[]'::jsonb,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  tab          TEXT NOT NULL CHECK (tab IN ('actual', 'model3d', 'floorPlan')),
  storage_path TEXT NOT NULL,
  is_pinned    BOOLEAN DEFAULT FALSE,
  sort_order   BIGINT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Seed data ────────────────────────────────────────────────────────────────
INSERT INTO settings (key, value)
VALUES ('cabin_name', 'My Cabin')
ON CONFLICT DO NOTHING;

INSERT INTO rooms (id, name, description, emoji, sort_order) VALUES
  ('living-room', 'Living Room', 'Main gathering and relaxation space', '🛋️', 1),
  ('kitchen',     'Kitchen',     'Cooking and dining area',             '🍳', 2),
  ('bedroom',     'Bedroom',     'Primary sleeping quarters',           '🛏️', 3),
  ('bathroom',    'Bathroom',    'Full bath and fixtures',              '🚿', 4)
ON CONFLICT DO NOTHING;

INSERT INTO recommendations (room_id) VALUES
  ('living-room'), ('kitchen'), ('bedroom'), ('bathroom')
ON CONFLICT DO NOTHING;

-- ─── Migration: prototype features ───────────────────────────────────────────
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not-started'
  CHECK (status IN ('complete', 'in-progress', 'not-started'));

-- Expand photos tab constraint to include 'inspiration'
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_tab_check;
ALTER TABLE photos ADD CONSTRAINT photos_tab_check
  CHECK (tab IN ('actual', 'model3d', 'floorPlan', 'inspiration'));

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS swatch_sets     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS client_swatches JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reactions       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS paint_items     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS flooring_items  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lighting_items  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS furniture_items JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS site_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  sort_order   BIGINT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  from_role  TEXT NOT NULL CHECK (from_role IN ('designer', 'client')),
  text       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_photos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this script is safe to re-run
DROP POLICY IF EXISTS "public read settings"      ON settings;
DROP POLICY IF EXISTS "anon all settings"         ON settings;
DROP POLICY IF EXISTS "public read rooms"         ON rooms;
DROP POLICY IF EXISTS "anon all recommendations"  ON recommendations;
DROP POLICY IF EXISTS "anon all photos"           ON photos;
DROP POLICY IF EXISTS "anon all site_photos"      ON site_photos;
DROP POLICY IF EXISTS "anon all messages"         ON messages;
DROP POLICY IF EXISTS "room-photos public read"   ON storage.objects;
DROP POLICY IF EXISTS "room-photos anon upload"   ON storage.objects;
DROP POLICY IF EXISTS "room-photos anon delete"   ON storage.objects;

-- Public read-only for rooms; full access for settings (single-user tool, cabin name editable)
CREATE POLICY "anon all settings"    ON settings        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public read rooms"    ON rooms           FOR SELECT USING (true);

-- Full access for recommendations, photos, site_photos, messages (single-user designer tool)
CREATE POLICY "anon all recommendations" ON recommendations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all photos"          ON photos          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all site_photos"     ON site_photos     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all messages"        ON messages        FOR ALL USING (true) WITH CHECK (true);

-- Storage policies
CREATE POLICY "room-photos public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'room-photos');

CREATE POLICY "room-photos anon upload"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'room-photos');

CREATE POLICY "room-photos anon delete"
  ON storage.objects FOR DELETE USING (bucket_id = 'room-photos');
