-- ============================================================
-- Migration 001: Add content_md column + admin_config table
-- Run this in the Supabase SQL Editor (Dashboard → SQL)
-- ============================================================

-- 1. Add markdown column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_md text DEFAULT '';

-- 2. Create admin_config table (stores hashed admin password)
CREATE TABLE IF NOT EXISTS admin_config (
  id            int PRIMARY KEY DEFAULT 1,
  password_hash text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

-- 3. Lock down admin_config: no anonymous access at all
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon role (Supabase default)

-- 4. Fix posts table RLS policies
--    (verified existing policies: "Allow public read access" SELECT,
--     "Allow full access for anon" ALL — the latter is a security hole, drop it)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Drop ALL pre-existing policies first (RLS policies are OR-combined,
-- so any leftover permissive write policy would defeat the lockdown)
DROP POLICY IF EXISTS "Allow full access for anon" ON posts;
DROP POLICY IF EXISTS "Allow public read access" ON posts;
DROP POLICY IF EXISTS "Public read access" ON posts;
DROP POLICY IF EXISTS "No anon writes" ON posts;

-- Recreate clean state: anonymous read-only.
-- Writes go exclusively through the Edge Function (service role bypasses RLS).
CREATE POLICY "Public read access" ON posts
  FOR SELECT USING (true);

-- 5. Seed default admin password (bcrypt hash of "admin123")
-- ⚠️ CHANGE THIS PASSWORD after first login!
-- The hash below is bcrypt for "admin123":
INSERT INTO admin_config (id, password_hash)
VALUES (1, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- After running this migration:
--   1. Deploy the Edge Function: supabase functions deploy posts
--   2. Set the SESSION_SECRET: supabase secrets set SESSION_SECRET=your-random-secret
--   3. Change the admin password using the setup script
-- ============================================================
