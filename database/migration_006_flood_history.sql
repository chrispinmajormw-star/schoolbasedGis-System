-- Migration 006: flood reports become FLOOD HISTORY (records of past floods).
-- SafeCom is a preparedness and planning tool, not an early warning system: records are used
-- to check the flood hazard map and to plan, not to send warnings.
-- Run ONCE in the Supabase SQL Editor, after migration_005_decisions.sql. Safe to run twice.

BEGIN;

ALTER TABLE flood_reports ADD COLUMN IF NOT EXISTS event_name  TEXT;      -- e.g. "Cyclone Freddy, March 2023"
ALTER TABLE flood_reports ADD COLUMN IF NOT EXISTS facility_id INTEGER REFERENCES facilities(id) ON DELETE SET NULL;  -- facility that was flooded
CREATE INDEX IF NOT EXISTS flood_reports_facility_idx ON flood_reports (facility_id);

-- "people_trapped" was an emergency-response option; it is no longer collected
UPDATE flood_reports SET affected = array_remove(affected, 'people_trapped') WHERE 'people_trapped' = ANY (affected);

COMMIT;
