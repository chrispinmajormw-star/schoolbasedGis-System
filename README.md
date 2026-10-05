# Malawi School Disaster Preparedness and Risk Assessment (GIS)

Stack: React + Leaflet + Tailwind, Node/Express, PostgreSQL/PostGIS, QGIS, Python.
Method: see `METHODOLOGY.md` (School Preparedness Index and Risk Priority Score).

## 1. Database

```bash
createdb school_preparedness
psql school_preparedness -f database/schema.sql
psql school_preparedness -f database/seed.sql
```

PostGIS must be installed (`sudo apt install postgresql-postgis` on Ubuntu/Debian).
The seed file is fictional sample data.

## 2. Backend

```bash
cd backend
cp .env.example .env        # edit DATABASE_URL
npm install
npm run dev
```

Test: `curl http://localhost:4000/api/schools`

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## 4. Statistics

```bash
curl -o school_preparedness.csv http://localhost:4000/api/export.csv
pip install pandas numpy scipy
python analysis/spi_analysis.py school_preparedness.csv
```

## 5. QGIS

1. Layer > Add Layer > Add PostGIS Layers: connect to `school_preparedness`, add `school_status` and `hazard_zones`.
2. Style `school_status` with Categorized on `spi_class` (green high, yellow moderate, red low, grey unassessed).
3. Compute distance to roads: download OSM roads, then use *Join attributes by nearest* (or *Distance to nearest hub*) and write the result into `schools.dist_to_road_m`.
4. Replace the sample flood polygons by loading your real hazard layer into `hazard_zones` (DB Manager > Import layer, or `ogr2ogr`).

## 6. User accounts (admin + school users)

Sign-in uses Supabase Auth. Two roles:

- **Administrator**: manages every school, creates/deletes user accounts, resets passwords.
- **School user**: updates only its own school (basic info, contact, map location, photo, notes, preparedness assessment).

The map is public (read-only). Saved changes appear on the map immediately, and open maps refresh every 30 seconds.

Setup (once):

1. Supabase SQL Editor: run `database/migration_002_users.sql`.
2. Supabase -> Authentication -> Users -> Add user (auto-confirm) with your email, then run the `INSERT INTO profiles ...` line at the bottom of that file to make yourself admin.
3. Supabase -> Authentication -> URL Configuration: set Site URL to `https://school-gis-system.web.app` (used by password-reset emails).
4. Backend environment (Render): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret, server only), `CORS_ORIGIN=https://school-gis-system.web.app`.
5. Frontend `frontend/.env.production`: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the public anon / publishable key).

School photos are stored in the public Supabase Storage bucket `school-photos` (created automatically by the backend).

## Before real use

- Replace sample schools and flood boxes with EMIS and DoDMA data.
- Validate the indicator weights with stakeholders (see `METHODOLOGY.md`, section 2).
