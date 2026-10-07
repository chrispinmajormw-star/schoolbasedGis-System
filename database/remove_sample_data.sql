-- Remove the FICTIONAL sample data (seed.sql) and keep everything you added yourself.
-- Easiest: Admin -> Data import -> Sample data -> "Remove sample data" in the app.
-- This script does the same in the Supabase SQL Editor.
--
-- Sample facilities have codes starting with SAMPLE-. Their assessments and actions are removed with them.
-- If a user account is linked to a sample facility the script stops: delete or reassign that account first
-- (User accounts page), then run it again.

BEGIN;

DO $$
DECLARE linked TEXT;
BEGIN
  SELECT string_agg(p.email, ', ') INTO linked
    FROM profiles p JOIN facilities f ON f.id = p.facility_id
   WHERE f.code LIKE 'SAMPLE-%';
  IF linked IS NOT NULL THEN
    RAISE EXCEPTION 'These accounts are linked to sample facilities. Delete or reassign them first: %', linked;
  END IF;
END $$;

DELETE FROM flood_reports WHERE reporter_name = 'Sample reporter';
DELETE FROM hazard_zones  WHERE source = 'placeholder';
DELETE FROM facilities    WHERE code LIKE 'SAMPLE-%';   -- assessments and actions are deleted with them

COMMIT;

-- Check: all three should be 0
SELECT (SELECT COUNT(*) FROM facilities WHERE code LIKE 'SAMPLE-%') AS sample_facilities,
       (SELECT COUNT(*) FROM hazard_zones WHERE source = 'placeholder') AS sample_flood_zones,
       (SELECT COUNT(*) FROM flood_reports WHERE reporter_name = 'Sample reporter') AS sample_flood_records;
