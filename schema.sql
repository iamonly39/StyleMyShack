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

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos          ENABLE ROW LEVEL SECURITY;

-- Public read-only for rooms/settings
CREATE POLICY "public read settings" ON settings        FOR SELECT USING (true);
CREATE POLICY "public read rooms"    ON rooms           FOR SELECT USING (true);

-- Full access for recommendations and photos (single-user designer tool)
CREATE POLICY "anon all recommendations" ON recommendations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon all photos"          ON photos          FOR ALL USING (true) WITH CHECK (true);

-- Storage policies
CREATE POLICY "room-photos public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'room-photos');

CREATE POLICY "room-photos anon upload"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'room-photos');

CREATE POLICY "room-photos anon delete"
  ON storage.objects FOR DELETE USING (bucket_id = 'room-photos');
