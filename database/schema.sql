-- School Preparedness & Risk Assessment: PostgreSQL / PostGIS schema
CREATE EXTENSION IF NOT EXISTS postgis;

DROP VIEW IF EXISTS school_status;
DROP FUNCTION IF EXISTS compute_spi(assessments);
DROP TABLE IF EXISTS assessments, hazard_zones, indicator_weights, schools CASCADE;

CREATE TABLE schools (
  id               SERIAL PRIMARY KEY,
  emis_code        TEXT UNIQUE,
  name             TEXT NOT NULL,
  district         TEXT NOT NULL,
  level            TEXT NOT NULL DEFAULT 'primary' CHECK (level IN ('primary', 'secondary')),
  learners         INTEGER NOT NULL DEFAULT 0 CHECK (learners >= 0),
  teachers         INTEGER NOT NULL DEFAULT 0 CHECK (teachers >= 0),
  dist_to_road_m   NUMERIC CHECK (dist_to_road_m >= 0),
  dist_to_health_m NUMERIC CHECK (dist_to_health_m >= 0),
  geom             geometry(Point, 4326) NOT NULL
);
CREATE INDEX schools_geom_idx ON schools USING GIST (geom);

-- Weights are data, not code: edit here after expert validation (Delphi / AHP).
CREATE TABLE indicator_weights (
  indicator TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  domain    TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('binary', 'percent')),
  weight    NUMERIC NOT NULL CHECK (weight >= 0),
  sort_order INT NOT NULL
);

INSERT INTO indicator_weights (indicator, label, domain, kind, weight, sort_order) VALUES
  ('emergency_plan',       'Emergency plan',           'Planning and governance',   'binary', 12, 1),
  ('emergency_contacts',   'Emergency contacts',       'Planning and governance',   'binary',  8, 2),
  ('evacuation_route',     'Evacuation route',         'Evacuation',                'binary', 10, 3),
  ('evacuation_signage',   'Evacuation signage',       'Evacuation',                'binary',  5, 4),
  ('safe_assembly_point',  'Safe assembly point',      'Evacuation',                'binary', 10, 5),
  ('disaster_drill',       'Disaster drill conducted', 'Training and drills',       'binary', 12, 6),
  ('teachers_trained_pct', 'Teachers trained (%)',     'Training and drills',       'percent',12, 7),
  ('early_warning',        'Early warning mechanism',  'Warning and communication', 'binary', 12, 8),
  ('first_aid_kit',        'First aid kit',            'Response equipment',        'binary', 10, 9),
  ('fire_extinguisher',    'Fire extinguisher',        'Response equipment',        'binary',  9, 10);

CREATE TABLE assessments (
  id                   SERIAL PRIMARY KEY,
  school_id            INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assessed_on          DATE NOT NULL DEFAULT CURRENT_DATE,
  assessor             TEXT,
  emergency_plan       BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_contacts   BOOLEAN NOT NULL DEFAULT FALSE,
  evacuation_route     BOOLEAN NOT NULL DEFAULT FALSE,
  evacuation_signage   BOOLEAN NOT NULL DEFAULT FALSE,
  safe_assembly_point  BOOLEAN NOT NULL DEFAULT FALSE,
  disaster_drill       BOOLEAN NOT NULL DEFAULT FALSE,
  teachers_trained_pct NUMERIC NOT NULL DEFAULT 0 CHECK (teachers_trained_pct BETWEEN 0 AND 100),
  early_warning        BOOLEAN NOT NULL DEFAULT FALSE,
  first_aid_kit        BOOLEAN NOT NULL DEFAULT FALSE,
  fire_extinguisher    BOOLEAN NOT NULL DEFAULT FALSE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessments_school_idx ON assessments (school_id, assessed_on DESC);

CREATE TABLE hazard_zones (
  id     SERIAL PRIMARY KEY,
  hazard TEXT NOT NULL DEFAULT 'flood',
  level  SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),   -- 1 low, 2 medium, 3 high
  name   TEXT,
  source TEXT,
  geom   geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX hazard_zones_geom_idx ON hazard_zones USING GIST (geom);

-- SPI = 100 * sum(weight * score) / sum(weight)
CREATE FUNCTION compute_spi(a assessments) RETURNS NUMERIC AS $$
  SELECT ROUND(
    100 * SUM(
      w.weight * CASE w.kind
        WHEN 'percent' THEN (to_jsonb(a) ->> w.indicator)::numeric / 100
        ELSE CASE WHEN (to_jsonb(a) ->> w.indicator)::boolean THEN 1 ELSE 0 END
      END
    ) / NULLIF(SUM(w.weight), 0), 1)
  FROM indicator_weights w;
$$ LANGUAGE sql STABLE;

-- One row per school: latest assessment, SPI, class, hazard overlay, Risk Priority Score.
CREATE VIEW school_status AS
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
