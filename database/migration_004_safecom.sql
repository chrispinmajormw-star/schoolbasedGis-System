-- Migration 004: School Preparedness GIS -> SafeCom (community facilities).
-- Run ONCE in the Supabase SQL Editor, after migration_002_users.sql (003 optional).
-- Keeps all existing schools, assessments and user accounts.
-- Fresh installs: use schema.sql + seed.sql instead.

BEGIN;

DO $$ BEGIN
  IF to_regclass('public.facilities') IS NOT NULL THEN
    RAISE EXCEPTION 'Already migrated: the facilities table exists.';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Run migration_002_users.sql first.';
  END IF;
END $$;

DROP VIEW IF EXISTS school_status;
DROP FUNCTION IF EXISTS compute_spi(assessments);

-- 1. schools -> facilities ----------------------------------------------------
ALTER TABLE schools RENAME TO facilities;
ALTER SEQUENCE IF EXISTS schools_id_seq RENAME TO facilities_id_seq;
ALTER INDEX IF EXISTS schools_geom_idx RENAME TO facilities_geom_idx;
ALTER TABLE facilities RENAME COLUMN emis_code TO code;
ALTER TABLE facilities RENAME COLUMN learners TO people_served;
ALTER TABLE facilities RENAME COLUMN teachers TO staff;
ALTER TABLE facilities RENAME COLUMN level TO subtype;
ALTER TABLE facilities DROP CONSTRAINT IF EXISTS schools_level_check;
ALTER TABLE facilities ALTER COLUMN subtype DROP NOT NULL, ALTER COLUMN subtype DROP DEFAULT;
UPDATE facilities SET subtype = initcap(subtype);
ALTER TABLE facilities ALTER COLUMN updated_at DROP NOT NULL, ALTER COLUMN updated_at DROP DEFAULT;

ALTER TABLE facilities ADD COLUMN facility_type TEXT NOT NULL DEFAULT 'school'
  CHECK (facility_type IN ('school', 'evacuation_centre', 'health_facility', 'market',
                           'place_of_worship', 'community_hall', 'water_point'));
ALTER TABLE facilities ALTER COLUMN facility_type DROP DEFAULT;
ALTER TABLE facilities ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending'));
CREATE INDEX facilities_type_idx ON facilities (facility_type);

-- 2. Assessments: fixed columns -> answers JSON --------------------------------
ALTER TABLE assessments RENAME COLUMN school_id TO facility_id;
ALTER INDEX IF EXISTS assessments_school_idx RENAME TO assessments_facility_idx;
ALTER TABLE assessments ADD COLUMN answers JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE assessments SET answers = jsonb_build_object(
  'emergency_plan', emergency_plan, 'emergency_contacts', emergency_contacts,
  'evacuation_route', evacuation_route, 'evacuation_signage', evacuation_signage,
  'safe_assembly_point', safe_assembly_point, 'disaster_drill', disaster_drill,
  'staff_trained_pct', teachers_trained_pct, 'early_warning', early_warning,
  'first_aid_kit', first_aid_kit, 'fire_extinguisher', fire_extinguisher);
ALTER TABLE assessments
  DROP COLUMN emergency_plan, DROP COLUMN emergency_contacts, DROP COLUMN evacuation_route,
  DROP COLUMN evacuation_signage, DROP COLUMN safe_assembly_point, DROP COLUMN disaster_drill,
  DROP COLUMN teachers_trained_pct, DROP COLUMN early_warning, DROP COLUMN first_aid_kit,
  DROP COLUMN fire_extinguisher;

-- 3. Checklist per facility type ---------------------------------------------
DROP TABLE indicator_weights;
CREATE TABLE indicator_weights (
  indicator     TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT '*',
  label         TEXT NOT NULL,
  domain        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('binary', 'percent')),
  weight        NUMERIC NOT NULL CHECK (weight >= 0),
  sort_order    INT NOT NULL,
  PRIMARY KEY (indicator, facility_type)
);
INSERT INTO indicator_weights (indicator, facility_type, label, domain, kind, weight, sort_order) VALUES
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
  ('staff_trained_pct',    'school', 'Teachers trained (%)', 'Training and drills', 'percent', 12, 7),
  ('learner_awareness',    'school', 'Learners taught flood & disaster safety', 'Training and drills', 'binary', 8, 11),
  ('water_sanitation',     'evacuation_centre', 'Safe water and sanitation',         'Shelter services', 'binary', 10, 11),
  ('relief_stock',         'evacuation_centre', 'Food and relief items in stock',    'Shelter services', 'binary',  8, 12),
  ('accessible_for_all',   'evacuation_centre', 'Accessible for elderly / disabled', 'Shelter services', 'binary',  6, 13),
  ('lighting_power',       'evacuation_centre', 'Lighting or backup power',          'Shelter services', 'binary',  6, 14),
  ('backup_power',         'health_facility', 'Backup power / generator',              'Continuity of care', 'binary', 10, 11),
  ('emergency_stock',      'health_facility', 'Emergency medicines and supplies',      'Continuity of care', 'binary', 10, 12),
  ('referral_transport',   'health_facility', 'Ambulance or referral transport',       'Continuity of care', 'binary',  8, 13),
  ('critical_above_flood', 'health_facility', 'Critical services above flood level',   'Continuity of care', 'binary',  8, 14),
  ('drainage',             'market', 'Working drainage',               'Site safety', 'binary', 10, 11),
  ('clear_exits',          'market', 'Clear access and exit lanes',    'Site safety', 'binary',  8, 12),
  ('market_committee',     'market', 'Market disaster committee',      'Site safety', 'binary',  8, 13),
  ('shelter_ready',        'place_of_worship', 'Ready to host evacuees (space, mats)', 'Shelter services', 'binary', 8, 11),
  ('water_sanitation',     'place_of_worship', 'Safe water and sanitation',            'Shelter services', 'binary', 8, 12),
  ('shelter_ready',        'community_hall', 'Ready to host evacuees (space, mats)', 'Shelter services', 'binary', 8, 11),
  ('water_sanitation',     'community_hall', 'Safe water and sanitation',            'Shelter services', 'binary', 8, 12),
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

CREATE FUNCTION weights_for(ftype TEXT)
RETURNS TABLE (indicator TEXT, label TEXT, domain TEXT, kind TEXT, weight NUMERIC, sort_order INT) AS $$
  SELECT DISTINCT ON (w.indicator) w.indicator, w.label, w.domain, w.kind, w.weight, w.sort_order
    FROM indicator_weights w
   WHERE w.facility_type IN ('*', ftype)
   ORDER BY w.indicator, (w.facility_type = '*')
$$ LANGUAGE sql STABLE;

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

-- 4. Profiles: school users -> facility managers, sign-up with approval -------
ALTER TABLE profiles RENAME COLUMN school_id TO facility_id;
ALTER INDEX IF EXISTS profiles_school_idx RENAME TO profiles_facility_idx;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_check;
UPDATE profiles SET role = 'manager' WHERE role = 'school';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'manager'));
ALTER TABLE profiles ADD CONSTRAINT profiles_check CHECK (role = 'admin' OR facility_id IS NOT NULL);
ALTER TABLE profiles
  ADD COLUMN phone        TEXT,
  ADD COLUMN organisation TEXT,
  ADD COLUMN status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled')),
  ADD COLUMN request_note TEXT;

-- 5. Map view ------------------------------------------------------------------
CREATE VIEW facility_status WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    f.*,
    a.id          AS assessment_id,
    a.assessed_on,
    CASE WHEN a.id IS NULL THEN NULL ELSE compute_spi(a.answers, f.facility_type) END AS spi,
    COALESCE(h.level, 0) AS flood_level,
    MAX(f.people_served) OVER (PARTITION BY f.facility_type) AS max_people  -- people compared within the same type
  FROM facilities f
  LEFT JOIN LATERAL (
    SELECT * FROM assessments x WHERE x.facility_id = f.id
    ORDER BY x.assessed_on DESC, x.id DESC LIMIT 1
  ) a ON TRUE
  LEFT JOIN LATERAL (
    SELECT MAX(z.level) AS level FROM hazard_zones z
    WHERE z.hazard = 'flood' AND ST_Intersects(z.geom, f.geom)
  ) h ON TRUE
  WHERE f.status = 'active'
)
SELECT
  id, facility_type, code, name, district, subtype, people_served, staff,
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

ALTER TABLE facilities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_weights ENABLE ROW LEVEL SECURITY;

COMMIT;
