-- FICTIONAL SAMPLE DATA for testing only. Replace with EMIS / DoDMA data.
-- Coordinates are approximate district locations; flood boxes are coarse placeholders.

INSERT INTO schools (emis_code, name, district, level, learners, teachers, dist_to_road_m, dist_to_health_m, geom) VALUES
 ('SAMPLE-001','Sample Primary School A (Nsanje)',     'Nsanje',     'primary',   820, 14, 2500, 6000, ST_SetSRID(ST_MakePoint(35.26,-16.92),4326)),
 ('SAMPLE-002','Sample Primary School B (Chikwawa)',   'Chikwawa',   'primary',  1150, 18, 6800, 9000, ST_SetSRID(ST_MakePoint(34.80,-16.03),4326)),
 ('SAMPLE-003','Sample Primary School C (Karonga)',    'Karonga',    'primary',   640, 11, 1200, 3500, ST_SetSRID(ST_MakePoint(33.93, -9.93),4326)),
 ('SAMPLE-004','Sample Secondary School D (Mzuzu)',    'Mzimba',     'secondary', 900, 32,  300, 1200, ST_SetSRID(ST_MakePoint(34.02,-11.46),4326)),
 ('SAMPLE-005','Sample Primary School E (Lilongwe)',   'Lilongwe',   'primary',  1400, 22,  200,  900, ST_SetSRID(ST_MakePoint(33.78,-13.98),4326)),
 ('SAMPLE-006','Sample Primary School F (Salima)',     'Salima',     'primary',   760, 12, 3200, 5200, ST_SetSRID(ST_MakePoint(34.46,-13.78),4326)),
 ('SAMPLE-007','Sample Primary School G (Zomba)',      'Zomba',      'primary',   980, 16,  800, 2500, ST_SetSRID(ST_MakePoint(35.33,-15.39),4326)),
 ('SAMPLE-008','Sample Secondary School H (Blantyre)', 'Blantyre',   'secondary',1250, 40,  150,  700, ST_SetSRID(ST_MakePoint(35.00,-15.79),4326)),
 ('SAMPLE-009','Sample Primary School I (Mangochi)',   'Mangochi',   'primary',   870, 13, 4100, 7500, ST_SetSRID(ST_MakePoint(35.26,-14.48),4326)),
 ('SAMPLE-010','Sample Primary School J (Phalombe)',   'Phalombe',   'primary',   930, 15, 5200, 8000, ST_SetSRID(ST_MakePoint(35.65,-15.80),4326)),
 ('SAMPLE-011','Sample Primary School K (Nkhotakota)', 'Nkhotakota', 'primary',   710, 12, 2100, 4300, ST_SetSRID(ST_MakePoint(34.30,-12.93),4326)),
 ('SAMPLE-012','Sample Primary School L (Kasungu)',    'Kasungu',    'primary',   600, 10,  900, 2800, ST_SetSRID(ST_MakePoint(33.48,-13.03),4326));

INSERT INTO hazard_zones (hazard, level, name, source, geom) VALUES
 ('flood',3,'Lower Shire (Nsanje) - sample',   'placeholder', ST_Multi(ST_MakeEnvelope(35.00,-17.10,35.50,-16.60,4326))),
 ('flood',3,'Lower Shire (Chikwawa) - sample', 'placeholder', ST_Multi(ST_MakeEnvelope(34.55,-16.25,35.05,-15.80,4326))),
 ('flood',2,'Karonga lakeshore - sample',      'placeholder', ST_Multi(ST_MakeEnvelope(33.80,-10.10,34.10, -9.80,4326))),
 ('flood',2,'Salima lakeshore - sample',       'placeholder', ST_Multi(ST_MakeEnvelope(34.30,-13.95,34.65,-13.60,4326))),
 ('flood',2,'Phalombe plain - sample',         'placeholder', ST_Multi(ST_MakeEnvelope(35.50,-15.95,35.80,-15.65,4326))),
 ('flood',1,'Mangochi lakeshore - sample',     'placeholder', ST_Multi(ST_MakeEnvelope(35.10,-14.65,35.40,-14.30,4326)));

-- School A uses the indicator values from the project brief (teachers trained 60%).
INSERT INTO assessments
 (school_id, assessed_on, assessor, emergency_plan, emergency_contacts, evacuation_route, evacuation_signage,
  safe_assembly_point, disaster_drill, teachers_trained_pct, early_warning, first_aid_kit, fire_extinguisher) VALUES
 (1,'2026-09-15','Sample assessor', true, true, true, false, true, true, 60, true, true, false),
 (2,'2026-09-16','Sample assessor', false,true, false,false,false,false, 10, false,true, false),
 (3,'2026-09-17','Sample assessor', true, true, true, true, true, false, 40, true, true, false),
 (4,'2026-09-18','Sample assessor', true, true, true, true, true, true,  90, true, true, true),
 (5,'2026-09-19','Sample assessor', true, true, true, true, true, true,  80, true, true, true),
 (6,'2026-09-20','Sample assessor', true, false,true, false,true, false, 30, false,true, false),
 (7,'2026-09-21','Sample assessor', true, true, false,false,true, true,  50, true, true, true),
 (8,'2026-09-22','Sample assessor', true, true, true, true, true, true,  70, true, true, true),
 (9,'2026-09-23','Sample assessor', false,true, false,false,false,false,  0, false,false,false),
 (10,'2026-09-24','Sample assessor',true, true, true, false,false,true,  45, false,true, false);
-- School 11 and 12 are left unassessed on purpose, to test the grey "not assessed" class.
