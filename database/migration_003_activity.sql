-- Migration 003: "Info updated" should mean a real edit, not the date migration 002 ran.
-- Run once in the Supabase SQL Editor. Safe to re-run.
ALTER TABLE schools ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE schools ALTER COLUMN updated_at DROP NOT NULL;

-- Clear the timestamp that migration 002 stamped on every school at the same moment.
UPDATE schools SET updated_at = NULL
WHERE updated_at IS NOT NULL
  AND (SELECT COUNT(*) FROM schools s2 WHERE s2.updated_at = schools.updated_at) > 1;
