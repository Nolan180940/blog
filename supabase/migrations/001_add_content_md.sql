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

-- 4. Ensure posts table has RLS enabled with public read
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous SELECT on posts
DROP POLICY IF EXISTS "Public read access" ON posts;
CREATE POLICY "Public read access" ON posts
  FOR SELECT USING (true);

-- Deny all anonymous writes (writes go through Edge Function with service role)
DROP POLICY IF EXISTS "No anon writes" ON posts;
CREATE POLICY "No anon writes" ON posts
  FOR ALL
  USING (false)
  WITH CHECK (false);

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
