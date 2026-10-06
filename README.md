# SafeCom: Safe Community

**Mapping Community Safety & Resilience (Malawi)**

SafeCom maps the community facilities people depend on during floods and other hazards (schools, evacuation centres,
health facilities, markets, places of worship, community halls and water points) and scores how prepared each one is
with the **Safety Preparedness Index (SPI)**. Facility managers keep their own information up to date; administrators
activate accounts and verify data.

Stack: React + Leaflet (OpenStreetMap tiles) + Tailwind, Node/Express, PostgreSQL/PostGIS (Supabase), Supabase Auth & Storage, QGIS, Python.
Hosting: Firebase Hosting (frontend), Render (API), Supabase (database).

## 1. Database

**Fresh install** (deletes everything):

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql      # fictional sample data
```

**Existing database**: run each migration once, in order, and keep all data and accounts:

1. `migration_004_safecom.sql` (after `migration_002_users.sql`): schools → community facilities.
2. `migration_005_decisions.sql`: decision support — unit costs, shelter capacity, district/TA boundaries,
   crowdsourced flood reports and the action tracker.

In Supabase, paste the files into the SQL Editor instead of using `psql`.

## 2. Backend (`backend/`)

Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase Session pooler connection string |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key, server only |
| `CORS_ORIGIN` | `https://school-gis-system.web.app` (comma-separate several) |

```bash
cd backend && npm install && npm run dev      # http://localhost:4000/api/health
```

## 3. Frontend (`frontend/`)

`frontend/.env.production` (public values only):

```
VITE_API_URL=https://<render-app>.onrender.com/api
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

```bash
cd frontend && npm install && npm run dev     # http://localhost:5173
```

Pushing to `main` builds and deploys to Firebase Hosting through GitHub Actions.

## 4. Accounts

- **Sign-up:** anyone can create an account, choosing the facility they manage or proposing a new one (with its map location).
  The account stays *pending* and cannot edit anything until an administrator activates it.
- **Administrator:** activates or rejects requests (a proposed facility is published on activation), manages all facilities and accounts.
- **Facility manager:** updates only their own facility: basic info, contact, location, photo, notes and preparedness assessment.

First administrator: create the user in Supabase -> Authentication -> Users, then run the `INSERT INTO profiles ...`
line at the bottom of `database/schema.sql` with your email. Set Supabase -> Authentication -> URL Configuration -> Site URL
to the live site for password-reset emails.

## 5. Preparedness checklist

`indicator_weights` holds a **core checklist** shared by every type (`facility_type = '*'`) plus **type-specific rows** that add
items (e.g. backup power for health facilities) or switch a core item off (`weight = 0`, e.g. fire extinguisher for water points).
Weights are data: change them in the table after expert validation (Delphi / AHP). See `METHODOLOGY.md`.

The Risk Priority Score (RPS) combines flood hazard, the preparedness gap, people served (relative to facilities of the same type)
and distance to the nearest road.

## 6. Statistics

```bash
curl -o safecom_facilities.csv https://<render-app>.onrender.com/api/export.csv
pip install pandas numpy scipy
python analysis/spi_analysis.py safecom_facilities.csv            # all types (core indicators)
python analysis/spi_analysis.py safecom_facilities.csv school     # one type
```

## 7. QGIS

1. Layer > Add Layer > Add PostGIS Layers: connect to the database, add `facility_status` and `hazard_zones`.
2. Style `facility_status` by `spi_class` (green high, yellow moderate, red low, grey unassessed); filter or categorise by `facility_type`.
3. Distance to roads: OSM roads + *Join attributes by nearest*; write into `facilities.dist_to_road_m`.
4. Replace the sample flood polygons with real hazard layers in `hazard_zones` (DB Manager > Import layer, or `ogr2ogr`).

## Before real use

- Replace the sample facilities and flood boxes with EMIS, MHFR, DoDMA and district data.
- Validate the checklist and weights with stakeholders (see `METHODOLOGY.md`).
