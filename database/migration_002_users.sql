-- Migration 002: user accounts (admin + school), self-maintained school info.
-- Run once in the Supabase SQL Editor AFTER schema.sql and seed.sql.
-- Safe to re-run.

-- 1. Extra fields that schools maintain themselves -------------------------
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS photo_url     TEXT,
  ADD COLUMN IF NOT EXISTS notes         TEXT,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ;  -- set when a school or admin edits the record

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS submitted_by UUID;

-- 2. App users: one row per Supabase Auth user -----------------------------
-- role 'admin'  -> can manage every school and all user accounts
-- role 'school' -> can update only the school in school_id
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  full_name  TEXT,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'school')),
  school_id  INTEGER REFERENCES schools(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role = 'admin' OR school_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS profiles_school_idx ON profiles (school_id);

-- Only the backend (database owner) reads these tables; block Supabase's public REST API.
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_weights ENABLE ROW LEVEL SECURITY;

-- 3. Rebuild the map view with the new columns ------------------------------
DROP VIEW IF EXISTS school_status;
CREATE VIEW school_status WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    s.*,
    a.id          AS assessment_id,
    a.assessed_on,
    CASE WHEN a.id IS NULL THEN NULL ELSE compute_spi(a) END AS spi,
    COALESCE(h.level, 0) AS flood_level,
    MAX(s.learners) OVER () AS max_learners
  FROM schools s
  LEFT JOIN LATERAL (
    SELECT * FROM assessments x WHERE x.school_id = s.id
    ORDER BY x.assessed_on DESC, x.id DESC LIMIT 1
  ) a ON TRUE
  LEFT JOIN LATERAL (
    SELECT MAX(z.level) AS level FROM hazard_zones z
    WHERE z.hazard = 'flood' AND ST_Intersects(z.geom, s.geom)
  ) h ON TRUE
)
SELECT
  id, emis_code, name, district, level, learners, teachers,
  dist_to_road_m, dist_to_health_m, geom,
  contact_name, contact_phone, photo_url, notes, updated_at,
  assessment_id, assessed_on, spi,
  CASE
    WHEN spi IS NULL THEN 'unassessed'
    WHEN spi >= 80    THEN 'high'
    WHEN spi >= 60    THEN 'moderate'
    ELSE 'low'
  END AS spi_class,
  flood_level,
  CASE WHEN spi IS NULL THEN NULL ELSE ROUND(
    100 * (flood_level / 3.0)
        * (1 - spi / 100)
        * (learners::numeric / NULLIF(max_learners, 0))
        * (1 + 0.5 * LEAST(COALESCE(dist_to_road_m, 0), 10000) / 10000)
        / 1.5, 1) END AS rps
FROM base;

-- 4. Make yourself the first admin ------------------------------------------
-- a) Supabase dashboard -> Authentication -> Users -> Add user -> Create new user
--    (tick "Auto Confirm User"), using your own email and a strong password.
-- b) Then run this, with that email:
--
-- INSERT INTO profiles (id, email, full_name, role)
-- SELECT id, email, 'System Administrator', 'admin' FROM auth.users
-- WHERE email = 'you@example.com'
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';
