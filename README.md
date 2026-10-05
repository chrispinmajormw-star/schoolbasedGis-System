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

## Before real use

- Add authentication to `POST /api/schools/:id/assessments` (currently open).
- Replace sample schools and flood boxes with EMIS and DoDMA data.
- Validate the indicator weights with stakeholders (see `METHODOLOGY.md`, section 2).
