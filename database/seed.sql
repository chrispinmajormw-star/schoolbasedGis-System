-- FICTIONAL SAMPLE DATA for testing only. Replace with EMIS / MHFR / DoDMA / district data.
-- Coordinates are approximate district locations; flood boxes are coarse placeholders.

INSERT INTO facilities (facility_type, code, name, district, subtype, people_served, staff, dist_to_road_m, dist_to_health_m, geom) VALUES
 ('school','SAMPLE-001','Sample Primary School A (Nsanje)',     'Nsanje',     'Primary',   820, 14, 2500, 6000, ST_SetSRID(ST_MakePoint(35.26,-16.92),4326)),
 ('school','SAMPLE-002','Sample Primary School B (Chikwawa)',   'Chikwawa',   'Primary',  1150, 18, 6800, 9000, ST_SetSRID(ST_MakePoint(34.80,-16.03),4326)),
 ('school','SAMPLE-003','Sample Primary School C (Karonga)',    'Karonga',    'Primary',   640, 11, 1200, 3500, ST_SetSRID(ST_MakePoint(33.93, -9.93),4326)),
 ('school','SAMPLE-004','Sample Secondary School D (Mzuzu)',    'Mzimba',     'Secondary', 900, 32,  300, 1200, ST_SetSRID(ST_MakePoint(34.02,-11.46),4326)),
 ('school','SAMPLE-005','Sample Primary School E (Lilongwe)',   'Lilongwe',   'Primary',  1400, 22,  200,  900, ST_SetSRID(ST_MakePoint(33.78,-13.98),4326)),
 ('school','SAMPLE-006','Sample Primary School F (Salima)',     'Salima',     'Primary',   760, 12, 3200, 5200, ST_SetSRID(ST_MakePoint(34.46,-13.78),4326)),
 ('school','SAMPLE-007','Sample Primary School G (Zomba)',      'Zomba',      'Primary',   980, 16,  800, 2500, ST_SetSRID(ST_MakePoint(35.33,-15.39),4326)),
 ('school','SAMPLE-008','Sample Secondary School H (Blantyre)', 'Blantyre',   'Secondary',1250, 40,  150,  700, ST_SetSRID(ST_MakePoint(35.00,-15.79),4326)),
 ('school','SAMPLE-009','Sample Primary School I (Mangochi)',   'Mangochi',   'Primary',   870, 13, 4100, 7500, ST_SetSRID(ST_MakePoint(35.26,-14.48),4326)),
 ('school','SAMPLE-010','Sample Primary School J (Phalombe)',   'Phalombe',   'Primary',   930, 15, 5200, 8000, ST_SetSRID(ST_MakePoint(35.65,-15.80),4326)),
 ('school','SAMPLE-011','Sample Primary School K (Nkhotakota)', 'Nkhotakota', 'Primary',   710, 12, 2100, 4300, ST_SetSRID(ST_MakePoint(34.30,-12.93),4326)),
 ('school','SAMPLE-012','Sample Primary School L (Kasungu)',    'Kasungu',    'Primary',   600, 10,  900, 2800, ST_SetSRID(ST_MakePoint(33.48,-13.03),4326)),
 ('evacuation_centre','SAMPLE-EC1','Sample Evacuation Centre (Bangula)',  'Nsanje',   'Designated camp',  2500,  6, 1500, 3000, ST_SetSRID(ST_MakePoint(35.12,-16.58),4326)),
 ('evacuation_centre','SAMPLE-EC2','Sample Evacuation Centre (Makhanga)', 'Nsanje',   'Designated camp',  1800,  4, 3800, 5000, ST_SetSRID(ST_MakePoint(35.20,-16.70),4326)),
 ('health_facility', 'SAMPLE-HF1','Sample District Hospital (Chikwawa)', 'Chikwawa', 'Hospital',        120000, 180, 300,   0, ST_SetSRID(ST_MakePoint(34.78,-16.04),4326)),
 ('health_facility', 'SAMPLE-HF2','Sample Health Centre (Karonga)',      'Karonga',  'Health centre',    25000,  22, 900,   0, ST_SetSRID(ST_MakePoint(33.95,-9.95),4326)),
 ('market',          'SAMPLE-MK1','Sample Market (Nsanje Boma)',         'Nsanje',   'Daily',             3000,  12, 100, 1500, ST_SetSRID(ST_MakePoint(35.27,-16.93),4326)),
 ('market',          'SAMPLE-MK2','Sample Market (Salima)',              'Salima',   'Weekly',            4500,  10, 200, 1800, ST_SetSRID(ST_MakePoint(34.45,-13.77),4326)),
 ('place_of_worship','SAMPLE-PW1','Sample Church (Phalombe)',            'Phalombe', 'Church',             600,   4, 1100, 4000, ST_SetSRID(ST_MakePoint(35.62,-15.78),4326)),
 ('community_hall',  'SAMPLE-CH1','Sample Community Hall (Mangochi)',    'Mangochi', NULL,                 400,   2, 600, 3000, ST_SetSRID(ST_MakePoint(35.24,-14.46),4326)),
 ('water_point',     'SAMPLE-WP1','Sample Borehole (Chikwawa)',          'Chikwawa', 'Borehole',           350,   2, 2200, 5000, ST_SetSRID(ST_MakePoint(34.84,-16.08),4326)),
 ('water_point',     'SAMPLE-WP2','Sample Water Kiosk (Zomba)',          'Zomba',    'Water kiosk',        900,   1, 400, 1500, ST_SetSRID(ST_MakePoint(35.31,-15.40),4326));

INSERT INTO hazard_zones (hazard, level, name, source, geom) VALUES
 ('flood',3,'Lower Shire (Nsanje) - sample',   'placeholder', ST_Multi(ST_MakeEnvelope(35.00,-17.10,35.50,-16.60,4326))),
 ('flood',3,'Lower Shire (Chikwawa) - sample', 'placeholder', ST_Multi(ST_MakeEnvelope(34.55,-16.25,35.05,-15.80,4326))),
 ('flood',2,'Karonga lakeshore - sample',      'placeholder', ST_Multi(ST_MakeEnvelope(33.80,-10.10,34.10, -9.80,4326))),
 ('flood',2,'Salima lakeshore - sample',       'placeholder', ST_Multi(ST_MakeEnvelope(34.30,-13.95,34.65,-13.60,4326))),
 ('flood',2,'Phalombe plain - sample',         'placeholder', ST_Multi(ST_MakeEnvelope(35.50,-15.95,35.80,-15.65,4326))),
 ('flood',1,'Mangochi lakeshore - sample',     'placeholder', ST_Multi(ST_MakeEnvelope(35.10,-14.65,35.40,-14.30,4326)));

-- Facilities are looked up by code so the ids do not matter.
INSERT INTO assessments (facility_id, assessed_on, assessor, answers)
SELECT f.id, v.d::date, 'Sample assessor', v.a::jsonb
FROM (VALUES
 ('SAMPLE-001','2026-09-15','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"evacuation_signage":false,"safe_assembly_point":true,"disaster_drill":true,"staff_trained_pct":60,"early_warning":true,"first_aid_kit":true,"fire_extinguisher":false}'),
 ('SAMPLE-002','2026-09-16','{"emergency_contacts":true,"staff_trained_pct":10,"first_aid_kit":true}'),
 ('SAMPLE-003','2026-09-17','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"evacuation_signage":true,"safe_assembly_point":true,"staff_trained_pct":40,"early_warning":true,"first_aid_kit":true}'),
 ('SAMPLE-004','2026-09-18','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"evacuation_signage":true,"safe_assembly_point":true,"disaster_drill":true,"staff_trained_pct":90,"early_warning":true,"first_aid_kit":true,"fire_extinguisher":true,"learner_awareness":true}'),
 ('SAMPLE-005','2026-09-19','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"evacuation_signage":true,"safe_assembly_point":true,"disaster_drill":true,"staff_trained_pct":80,"early_warning":true,"first_aid_kit":true,"fire_extinguisher":true}'),
 ('SAMPLE-006','2026-09-20','{"emergency_plan":true,"evacuation_route":true,"safe_assembly_point":true,"staff_trained_pct":30,"first_aid_kit":true}'),
 ('SAMPLE-007','2026-09-21','{"emergency_plan":true,"emergency_contacts":true,"safe_assembly_point":true,"disaster_drill":true,"staff_trained_pct":50,"early_warning":true,"first_aid_kit":true,"fire_extinguisher":true}'),
 ('SAMPLE-008','2026-09-22','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"evacuation_signage":true,"safe_assembly_point":true,"disaster_drill":true,"staff_trained_pct":70,"early_warning":true,"first_aid_kit":true,"fire_extinguisher":true,"learner_awareness":true}'),
 ('SAMPLE-009','2026-09-23','{"emergency_contacts":true,"staff_trained_pct":0}'),
 ('SAMPLE-010','2026-09-24','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"disaster_drill":true,"staff_trained_pct":45,"first_aid_kit":true}'),
 ('SAMPLE-EC1','2026-09-10','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"safe_assembly_point":true,"staff_trained_pct":50,"early_warning":true,"first_aid_kit":true,"water_sanitation":true,"relief_stock":false,"accessible_for_all":false,"lighting_power":true}'),
 ('SAMPLE-HF1','2026-09-12','{"emergency_plan":true,"emergency_contacts":true,"evacuation_route":true,"evacuation_signage":true,"safe_assembly_point":true,"disaster_drill":true,"staff_trained_pct":65,"early_warning":true,"first_aid_kit":true,"fire_extinguisher":true,"backup_power":true,"emergency_stock":true,"referral_transport":true,"critical_above_flood":false}'),
 ('SAMPLE-MK1','2026-09-14','{"emergency_contacts":true,"staff_trained_pct":5,"drainage":false,"clear_exits":true}'),
 ('SAMPLE-WP1','2026-09-08','{"emergency_plan":false,"emergency_contacts":true,"staff_trained_pct":50,"raised_protected":false,"water_tested":true,"water_committee":true}')
) AS v(code, d, a)
JOIN facilities f ON f.code = v.code;
-- Some facilities are left unassessed on purpose, to test the grey "not assessed" class.

-- Emergency shelter capacity (schools, halls and churches commonly host displaced people)
UPDATE facilities f SET shelter_capacity = v.cap
FROM (VALUES ('SAMPLE-001', 600), ('SAMPLE-002', 900), ('SAMPLE-003', 500), ('SAMPLE-006', 450), ('SAMPLE-007', 700),
             ('SAMPLE-009', 650), ('SAMPLE-010', 700), ('SAMPLE-EC1', 2500), ('SAMPLE-EC2', 1800),
             ('SAMPLE-PW1', 400), ('SAMPLE-CH1', 350)) AS v(code, cap)
WHERE f.code = v.code;

-- Crowdsourced flood reports (one waiting for review)
INSERT INTO flood_reports (depth, affected, description, reporter_name, status, observed_at, reviewed_at, geom) VALUES
 ('waist', '{homes,road}', 'Shire river burst its banks near the boma. Houses flooded.', 'Sample reporter', 'verified', now() - interval '6 hours',  now() - interval '5 hours', ST_SetSRID(ST_MakePoint(35.25,-16.90),4326)),
 ('knee',  '{road,crops}', 'Road to Makhanga under water, crops submerged.',             'Sample reporter', 'verified', now() - interval '20 hours', now() - interval '18 hours', ST_SetSRID(ST_MakePoint(35.18,-16.72),4326)),
 ('ankle', '{road}',       'Water over the road after heavy rain.',                      'Sample reporter', 'pending',  now() - interval '2 hours',  NULL,                        ST_SetSRID(ST_MakePoint(34.82,-16.06),4326));

-- Action tracker examples
INSERT INTO actions (facility_id, indicator, title, owner, due_date, status, cost_mwk)
SELECT f.id, v.ind, v.title, v.owner, (CURRENT_DATE + v.days)::date, v.status, v.cost
FROM (VALUES
 ('SAMPLE-002', 'emergency_plan', 'Develop and display an emergency preparedness plan with the committee', 'Head teacher', 30, 'in_progress', 60000),
 ('SAMPLE-002', 'disaster_drill', 'Run an evacuation drill with all occupants',                         'ACPC Chikwawa', -5, 'open', 40000),
 ('SAMPLE-009', 'early_warning',  'Link to the area early-warning system (radio, megaphone, SMS)',      'DoDMA district office', 60, 'open', 250000),
 ('SAMPLE-001', 'evacuation_signage', 'Install evacuation signs along the route',                       'Head teacher', -20, 'done', 80000)
) AS v(code, ind, title, owner, days, status, cost)
JOIN facilities f ON f.code = v.code;
UPDATE actions SET completed_at = now() - interval '3 days' WHERE status = 'done';
