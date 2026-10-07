-- Migration 007: road network layer (for automatic distance-to-road).
-- Run ONCE in the Supabase SQL Editor, after migration_006_flood_history.sql. Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS roads (
  id          SERIAL PRIMARY KEY,
  name        TEXT,
  road_class  TEXT,                    -- e.g. trunk / primary / secondary / tertiary / track
  source      TEXT,
  geom        geometry(MultiLineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS roads_geom_idx ON roads USING GIST (geom);
ALTER TABLE roads ENABLE ROW LEVEL SECURITY;

COMMIT;
