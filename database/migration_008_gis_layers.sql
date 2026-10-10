-- Migration 008: extra GIS layers for the spatial analysis tools (rivers, settlements, land use, population ...).
-- Run ONCE in the Supabase SQL Editor, after migration_007_roads.sql. Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS gis_layers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL DEFAULT 'other',   -- river / settlement / land_use / population / market / other
  geom_type   TEXT NOT NULL CHECK (geom_type IN ('point', 'line', 'polygon')),
  fields      JSONB NOT NULL DEFAULT '[]',     -- [{ "name": "POP2018", "numeric": true }]
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gis_features (
  id        SERIAL PRIMARY KEY,
  layer_id  INTEGER NOT NULL REFERENCES gis_layers(id) ON DELETE CASCADE,
  props     JSONB NOT NULL DEFAULT '{}',
  geom      geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS gis_features_layer_idx ON gis_features (layer_id);
CREATE INDEX IF NOT EXISTS gis_features_geom_idx ON gis_features USING GIST (geom);

ALTER TABLE gis_layers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gis_features ENABLE ROW LEVEL SECURITY;

COMMIT;
