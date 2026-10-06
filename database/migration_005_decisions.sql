-- Migration 005: SafeCom decision support.
--   1. Costs and recommended actions for every checklist item (priority worklist, what-if, budget planner)
--   2. Emergency shelter capacity on facilities (flood scenario mode)
--   3. Administrative boundaries: districts and Traditional Authorities (district shading, TA lookup)
--   4. Crowdsourced flood reports (live flood layer, alerts)
--   5. Action tracker
-- Run ONCE in the Supabase SQL Editor, after migration_004_safecom.sql.
-- Keeps all existing facilities, assessments and accounts. Fresh installs: schema.sql + seed.sql already include this.

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.facilities') IS NULL THEN
    RAISE EXCEPTION 'Run migration_004_safecom.sql first.';
  END IF;
  IF to_regclass('public.actions') IS NOT NULL THEN
    RAISE EXCEPTION 'Already migrated: the actions table exists.';
  END IF;
END $$;

-- 1. Indicative cost (Malawi Kwacha) and recommended action per checklist item ---------
-- Costs are planning estimates for ONE facility to close the gap. Edit them in the app
-- (Priorities -> Unit costs) or here. For percentage items the cost is for reaching 100%.
ALTER TABLE indicator_weights ADD COLUMN cost_mwk NUMERIC CHECK (cost_mwk >= 0);
ALTER TABLE indicator_weights ADD COLUMN action TEXT;

UPDATE indicator_weights w SET cost_mwk = v.cost, action = v.action
FROM (VALUES
  ('emergency_plan',        60000, 'Develop and display an emergency preparedness plan with the committee'),
  ('emergency_contacts',     5000, 'Post emergency contacts (ACPC/VCPC, police, health, DoDMA)'),
  ('evacuation_route',     150000, 'Clear and mark a safe evacuation route to higher ground'),
  ('evacuation_signage',    80000, 'Install evacuation signs along the route'),
  ('safe_assembly_point',   60000, 'Designate and mark a safe assembly point above flood level'),
  ('disaster_drill',        40000, 'Run an evacuation drill with all occupants'),
  ('staff_trained_pct',    300000, 'Train staff in disaster preparedness and first aid'),
  ('early_warning',        250000, 'Link to the area early-warning system (radio, megaphone, SMS)'),
  ('first_aid_kit',         60000, 'Provide and stock a first aid kit'),
  ('fire_extinguisher',    120000, 'Install and service a fire extinguisher'),
  ('learner_awareness',     30000, 'Teach learners flood and disaster safety'),
  ('water_sanitation',    1500000, 'Provide safe water and latrines for evacuees'),
  ('relief_stock',         800000, 'Pre-position food and relief items'),
  ('accessible_for_all',   600000, 'Add ramps and accessible toilets for elderly and disabled people'),
  ('lighting_power',       450000, 'Install solar lighting or backup power'),
  ('backup_power',        3500000, 'Install a generator or solar backup for critical services'),
  ('emergency_stock',     1200000, 'Stock emergency medicines and supplies'),
  ('referral_transport',  2000000, 'Arrange ambulance or motorbike referral transport'),
  ('critical_above_flood',5000000, 'Move critical services (maternity, pharmacy) above flood level'),
  ('drainage',            1500000, 'Repair and clear market drainage'),
  ('clear_exits',          100000, 'Clear and mark access and exit lanes'),
  ('market_committee',      30000, 'Form and train a market disaster committee'),
  ('shelter_ready',        300000, 'Prepare to host evacuees (mats, space plan, caretaker)'),
  ('raised_protected',     900000, 'Raise and protect the water point from floodwater'),
  ('water_tested',          50000, 'Test water quality after every flood'),
  ('water_committee',       30000, 'Revive and train the water point committee'),
  ('spare_parts',          200000, 'Arrange spare parts and an area mechanic')
) AS v(indicator, cost, action)
WHERE w.indicator = v.indicator;

-- weights_for() now also returns cost and action (compute_spi keeps working unchanged)
DROP FUNCTION weights_for(text);
CREATE FUNCTION weights_for(ftype TEXT)
RETURNS TABLE (indicator TEXT, label TEXT, domain TEXT, kind TEXT, weight NUMERIC, sort_order INT, cost_mwk NUMERIC, action TEXT) AS $$
  SELECT DISTINCT ON (w.indicator) w.indicator, w.label, w.domain, w.kind, w.weight, w.sort_order, w.cost_mwk, w.action
    FROM indicator_weights w
   WHERE w.facility_type IN ('*', ftype)
   ORDER BY w.indicator, (w.facility_type = '*')
$$ LANGUAGE sql STABLE;

-- 2. Emergency shelter capacity ------------------------------------------------------
-- How many displaced people the facility can host (schools, churches, halls are often used).
ALTER TABLE facilities ADD COLUMN shelter_capacity INTEGER CHECK (shelter_capacity >= 0);
UPDATE facilities SET shelter_capacity = people_served WHERE facility_type = 'evacuation_centre';

-- 3. Administrative boundaries (uploaded by an administrator as GeoJSON) --------------
CREATE TABLE admin_areas (
  id          SERIAL PRIMARY KEY,
  level       TEXT NOT NULL CHECK (level IN ('district', 'ta')),
  name        TEXT NOT NULL,
  district    TEXT,                      -- parent district (for TAs)
  population  INTEGER CHECK (population >= 0),
  source      TEXT,
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX admin_areas_geom_idx ON admin_areas USING GIST (geom);
CREATE INDEX admin_areas_level_idx ON admin_areas (level);

-- 4. Crowdsourced flood reports --------------------------------------------------------
CREATE TABLE flood_reports (
  id             SERIAL PRIMARY KEY,
  depth          TEXT NOT NULL CHECK (depth IN ('ankle', 'knee', 'waist', 'above_waist')),
  affected       TEXT[] NOT NULL DEFAULT '{}',   -- homes, road, crops, facility, bridge ...
  description    TEXT,
  photo_url      TEXT,
  reporter_name  TEXT,
  reporter_phone TEXT,
  reported_by    UUID,                            -- signed-in reporter, if any
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'resolved')),
  reviewed_by    UUID,
  reviewed_at    TIMESTAMPTZ,
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom           geometry(Point, 4326) NOT NULL
);
CREATE INDEX flood_reports_geom_idx ON flood_reports USING GIST (geom);
CREATE INDEX flood_reports_status_idx ON flood_reports (status, observed_at DESC);

-- 5. Action tracker --------------------------------------------------------------------
CREATE TABLE actions (
  id           SERIAL PRIMARY KEY,
  facility_id  INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  indicator    TEXT,                       -- checklist item this action closes (optional)
  title        TEXT NOT NULL,
  owner        TEXT,                       -- person or organisation responsible
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  cost_mwk     NUMERIC CHECK (cost_mwk >= 0),
  notes        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX actions_facility_idx ON actions (facility_id);
CREATE INDEX actions_status_idx ON actions (status, due_date);

-- facility_status view: adds shelter capacity and Traditional Authority -----------------
DROP VIEW facility_status;
CREATE VIEW facility_status WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    f.*,
    a.id          AS assessment_id,
    a.assessed_on,
    CASE WHEN a.id IS NULL THEN NULL ELSE compute_spi(a.answers, f.facility_type) END AS spi,
    COALESCE(h.level, 0) AS flood_level,
    MAX(f.people_served) OVER (PARTITION BY f.facility_type) AS max_people,
    t.name AS ta
  FROM facilities f
  LEFT JOIN LATERAL (
    SELECT * FROM assessments x WHERE x.facility_id = f.id
    ORDER BY x.assessed_on DESC, x.id DESC LIMIT 1
  ) a ON TRUE
  LEFT JOIN LATERAL (
    SELECT MAX(z.level) AS level FROM hazard_zones z
    WHERE z.hazard = 'flood' AND ST_Intersects(z.geom, f.geom)
  ) h ON TRUE
  LEFT JOIN LATERAL (
    SELECT r.name FROM admin_areas r WHERE r.level = 'ta' AND ST_Intersects(r.geom, f.geom) LIMIT 1
  ) t ON TRUE
  WHERE f.status = 'active'
)
SELECT
  id, facility_type, code, name, district, ta, subtype, people_served, staff, shelter_capacity,
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
        * (people_served::numeric / NULLIF(max_people, 0))
        * (1 + 0.5 * LEAST(COALESCE(dist_to_road_m, 0), 10000) / 10000)
        / 1.5, 1) END AS rps
FROM base;

ALTER TABLE admin_areas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE flood_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions       ENABLE ROW LEVEL SECURITY;

COMMIT;
