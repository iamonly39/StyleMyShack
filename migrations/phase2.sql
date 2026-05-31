-- Phase 2 Migration: user_roles, builder_updates, comments
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/yoikyxyrkcnvszogsyut/sql
-- This file is idempotent — safe to run multiple times.
-- Tables are also appended to schema.sql for reference.

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- 1. user_roles: maps email → elevated role (only 'builder' for now; owner is hardcoded)
CREATE TABLE IF NOT EXISTS user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('builder')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. builder_updates: builder-uploaded status photos per room
CREATE TABLE IF NOT EXISTS builder_updates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  storage_path        TEXT NOT NULL,
  caption             TEXT DEFAULT '',
  uploaded_by         TEXT NOT NULL,
  promoted_to_gallery BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. comments: public comments; room_id NULL = project-level (home page)
CREATE TABLE IF NOT EXISTS comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  user_email   TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  text         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE user_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments      ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this script is safe to re-run
DROP POLICY IF EXISTS "anon all user_roles"     ON user_roles;
DROP POLICY IF EXISTS "anon all builder_updates" ON builder_updates;
DROP POLICY IF EXISTS "anon read comments"       ON comments;
DROP POLICY IF EXISTS "anon insert comments"     ON comments;

-- user_roles: anon can read (for auth.js resolveRole) and write
CREATE POLICY "anon all user_roles"
  ON user_roles FOR ALL USING (true) WITH CHECK (true);

-- builder_updates: anon can read and write (Phase 3 will tighten)
CREATE POLICY "anon all builder_updates"
  ON builder_updates FOR ALL USING (true) WITH CHECK (true);

-- comments: anon can read; anon can INSERT (client-side validation for now)
CREATE POLICY "anon read comments"
  ON comments FOR SELECT USING (true);

CREATE POLICY "anon insert comments"
  ON comments FOR INSERT WITH CHECK (true);
