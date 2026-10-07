-- SafeCom (Safe Community): Mapping Community Safety & Resilience
-- PostgreSQL / PostGIS schema for a FRESH install (Supabase SQL Editor or psql).
-- Existing databases: run the migrations (004, 005, then 006) instead. This file deletes all data.
CREATE EXTENSION IF NOT EXISTS postgis;

DROP VIEW IF EXISTS facility_status, school_status;
DROP FUNCTION IF EXISTS compute_spi(jsonb, text);
DROP FUNCTION IF EXISTS weights_for(text);
DROP TABLE IF EXISTS actions, flood_reports, admin_areas, profiles, assessments, hazard_zones, indicator_weights, facilities, schools CASCADE;

-- Community facilities -------------------------------------------------------
CREATE TABLE facilities (
  id               SERIAL PRIMARY KEY,
  facility_type    TEXT NOT NULL CHECK (facility_type IN (
                     'school', 'evacuation_centre', 'health_facility', 'market',
                     'place_of_worship', 'community_hall', 'water_point')),
  code             TEXT UNIQUE,              -- EMIS code, MHFR code, etc.
  name             TEXT NOT NULL,
  district         TEXT NOT NULL,
  subtype          TEXT,                     -- e.g. primary / hospital / borehole
  people_served    INTEGER NOT NULL DEFAULT 0 CHECK (people_served >= 0),  -- learners, catchment, shelter capacity ...
  staff            INTEGER NOT NULL DEFAULT 0 CHECK (staff >= 0),
  shelter_capacity INTEGER CHECK (shelter_capacity >= 0),  -- displaced people it can host in an emergency
  dist_to_road_m   NUMERIC CHECK (dist_to_road_m >= 0),
  dist_to_health_m NUMERIC CHECK (dist_to_health_m >= 0),
  contact_name     TEXT,
  contact_phone    TEXT,
  photo_url        TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),  -- pending = proposed at sign-up
  updated_at       TIMESTAMPTZ,              -- last edit of facility info
  geom             geometry(Point, 4326) NOT NULL
);
CREATE INDEX facilities_geom_idx ON facilities USING GIST (geom);
CREATE INDEX facilities_type_idx ON facilities (facility_type);

-- Preparedness checklist -------------------------------------------------------
-- facility_type '*' = core indicator for every type.
-- A row for a specific type adds an extra indicator, or overrides a core one (weight 0 = not applicable).
-- Weights are data, not code: edit here after expert validation (Delphi / AHP).
CREATE TABLE indicator_weights (
  indicator     TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT '*',
  label         TEXT NOT NULL,
  domain        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('binary', 'percent')),
  weight        NUMERIC NOT NULL CHECK (weight >= 0),
  sort_order    INT NOT NULL,
  cost_mwk      NUMERIC CHECK (cost_mwk >= 0),   -- indicative cost to close the gap (MWK); percent items: cost to reach 100%
  action        TEXT,                            -- recommended action
  PRIMARY KEY (indicator, facility_type)
);

INSERT INTO indicator_weights (indicator, facility_type, label, domain, kind, weight, sort_order) VALUES
  -- Core: every facility type
  ('emergency_plan',       '*', 'Emergency plan',           'Planning and governance',   'binary', 12, 1),
  ('emergency_contacts',   '*', 'Emergency contacts',       'Planning and governance',   'binary',  8, 2),
  ('evacuation_route',     '*', 'Evacuation route',         'Evacuation',                'binary', 10, 3),
  ('evacuation_signage',   '*', 'Evacuation signage',       'Evacuation',                'binary',  5, 4),
  ('safe_assembly_point',  '*', 'Safe assembly point',      'Evacuation',                'binary', 10, 5),
  ('disaster_drill',       '*', 'Disaster drill conducted', 'Training and drills',       'binary', 12, 6),
  ('staff_trained_pct',    '*', 'Staff trained (%)',        'Training and drills',       'percent',12, 7),
  ('early_warning',        '*', 'Early warning mechanism',  'Warning and communication', 'binary', 12, 8),
  ('first_aid_kit',        '*', 'First aid kit',            'Response equipment',        'binary', 10, 9),
  ('fire_extinguisher',    '*', 'Fire extinguisher',        'Response equipment',        'binary',  9, 10),
  -- Schools
  ('staff_trained_pct',    'school', 'Teachers trained (%)', 'Training and drills', 'percent', 12, 7),
  ('learner_awareness',    'school', 'Learners taught flood & disaster safety', 'Training and drills', 'binary', 8, 11),
  -- Evacuation centres
  ('water_sanitation',     'evacuation_centre', 'Safe water and sanitation',         'Shelter services', 'binary', 10, 11),
  ('relief_stock',         'evacuation_centre', 'Food and relief items in stock',    'Shelter services', 'binary',  8, 12),
  ('accessible_for_all',   'evacuation_centre', 'Accessible for elderly / disabled', 'Shelter services', 'binary',  6, 13),
  ('lighting_power',       'evacuation_centre', 'Lighting or backup power',          'Shelter services', 'binary',  6, 14),
  -- Health facilities
  ('backup_power',         'health_facility', 'Backup power / generator',              'Continuity of care', 'binary', 10, 11),
  ('emergency_stock',      'health_facility', 'Emergency medicines and supplies',      'Continuity of care', 'binary', 10, 12),
  ('referral_transport',   'health_facility', 'Ambulance or referral transport',       'Continuity of care', 'binary',  8, 13),
  ('critical_above_flood', 'health_facility', 'Critical services above flood level',   'Continuity of care', 'binary',  8, 14),
  -- Markets
  ('drainage',             'market', 'Working drainage',               'Site safety', 'binary', 10, 11),
  ('clear_exits',          'market', 'Clear access and exit lanes',    'Site safety', 'binary',  8, 12),
  ('market_committee',     'market', 'Market disaster committee',      'Site safety', 'binary',  8, 13),
  -- Places of worship
  ('shelter_ready',        'place_of_worship', 'Ready to host evacuees (space, mats)', 'Shelter services', 'binary', 8, 11),
  ('water_sanitation',     'place_of_worship', 'Safe water and sanitation',            'Shelter services', 'binary', 8, 12),
  -- Community halls
  ('shelter_ready',        'community_hall', 'Ready to host evacuees (space, mats)', 'Shelter services', 'binary', 8, 11),
  ('water_sanitation',     'community_hall', 'Safe water and sanitation',            'Shelter services', 'binary', 8, 12),
  -- Water points: most building items do not apply
  ('evacuation_route',     'water_point', 'Evacuation route',    'Evacuation',         'binary', 0, 3),
  ('evacuation_signage',   'water_point', 'Evacuation signage',  'Evacuation',         'binary', 0, 4),
  ('safe_assembly_point',  'water_point', 'Safe assembly point', 'Evacuation',         'binary', 0, 5),
  ('fire_extinguisher',    'water_point', 'Fire extinguisher',   'Response equipment', 'binary', 0, 10),
  ('first_aid_kit',        'water_point', 'First aid kit',       'Response equipment', 'binary', 0, 9),
  ('staff_trained_pct',    'water_point', 'Caretakers trained (%)', 'Training and drills', 'percent', 12, 7),
  ('raised_protected',     'water_point', 'Raised / protected from floodwater', 'Water safety', 'binary', 12, 11),
  ('water_tested',         'water_point', 'Water quality tested after floods',  'Water safety', 'binary', 10, 12),
  ('water_committee',      'water_point', 'Active water point committee',       'Water safety', 'binary',  8, 13),
  ('spare_parts',          'water_point', 'Spare parts / repair arrangement',   'Water safety', 'binary',  6, 14);

-- Effective checklist for one facility type (type rows override core rows).
-- Indicative costs (MWK) and recommended actions
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

-- Effective checklist for one facility type (type rows override core rows).
CREATE FUNCTION weights_for(ftype TEXT)
RETURNS TABLE (indicator TEXT, label TEXT, domain TEXT, kind TEXT, weight NUMERIC, sort_order INT, cost_mwk NUMERIC, action TEXT) AS $$
  SELECT DISTINCT ON (w.indicator) w.indicator, w.label, w.domain, w.kind, w.weight, w.sort_order, w.cost_mwk, w.action
    FROM indicator_weights w
   WHERE w.facility_type IN ('*', ftype)
   ORDER BY w.indicator, (w.facility_type = '*')
$$ LANGUAGE sql STABLE;

-- Assessments: answers = {"emergency_plan": true, "staff_trained_pct": 60, ...}
CREATE TABLE assessments (
  id           SERIAL PRIMARY KEY,
  facility_id  INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  assessed_on  DATE NOT NULL DEFAULT CURRENT_DATE,
  assessor     TEXT,
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes        TEXT,
  submitted_by UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessments_facility_idx ON assessments (facility_id, assessed_on DESC);

-- SPI = 100 * sum(weight * score) / sum(weight), over the checklist of that facility type
CREATE FUNCTION compute_spi(answers JSONB, ftype TEXT) RETURNS NUMERIC AS $$
  SELECT ROUND(
    100 * SUM(
      w.weight * CASE w.kind
        WHEN 'percent' THEN LEAST(GREATEST(COALESCE((answers ->> w.indicator)::numeric, 0), 0), 100) / 100
        ELSE CASE WHEN COALESCE((answers ->> w.indicator)::boolean, false) THEN 1 ELSE 0 END
      END
    ) / NULLIF(SUM(w.weight), 0), 1)
  FROM weights_for(ftype) w WHERE w.weight > 0;
$$ LANGUAGE sql STABLE;

CREATE TABLE hazard_zones (
  id     SERIAL PRIMARY KEY,
  hazard TEXT NOT NULL DEFAULT 'flood',
  level  SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),   -- 1 low, 2 medium, 3 high
  name   TEXT,
  source TEXT,
  geom   geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX hazard_zones_geom_idx ON hazard_zones USING GIST (geom);

-- App users (one row per Supabase Auth user) ----------------------------------
-- admin   -> manages every facility and all accounts
-- manager -> updates only facility_id, once an admin has activated the account
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  full_name    TEXT,
  phone        TEXT,
  organisation TEXT,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled')),
  facility_id  INTEGER REFERENCES facilities(id),
  request_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role = 'admin' OR facility_id IS NOT NULL)
);
CREATE INDEX profiles_facility_idx ON profiles (facility_id);

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

-- 4. Flood history: crowdsourced records of PAST floods (planning and hazard-map checks, not warnings) --
CREATE TABLE flood_reports (
  id             SERIAL PRIMARY KEY,
  depth          TEXT NOT NULL CHECK (depth IN ('ankle', 'knee', 'waist', 'above_waist')),
  affected       TEXT[] NOT NULL DEFAULT '{}',   -- homes, road, crops, facility, bridge ...
  description    TEXT,
  photo_url      TEXT,
  reporter_name  TEXT,
  reporter_phone TEXT,
  event_name     TEXT,                            -- e.g. "Cyclone Freddy, March 2023"
  facility_id    INTEGER REFERENCES facilities(id) ON DELETE SET NULL,  -- facility that was flooded
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

-- One row per ACTIVE facility: latest assessment, SPI, class, hazard overlay, TA, Risk Priority Score.
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

-- Only the backend (database owner) reads these tables; block Supabase's public REST API.
ALTER TABLE facilities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_areas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE flood_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions           ENABLE ROW LEVEL SECURITY;

-- Make yourself the first admin: create the user in Supabase -> Authentication -> Users,
-- then run (with your email):
-- INSERT INTO profiles (id, email, full_name, role, status)
-- SELECT id, email, 'System Administrator', 'admin', 'active' FROM auth.users WHERE email = 'you@example.com'
-- ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active';
