import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '100kb' }));

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const BINARY = [
  'emergency_plan', 'emergency_contacts', 'evacuation_route', 'evacuation_signage',
  'safe_assembly_point', 'disaster_drill', 'early_warning', 'first_aid_kit', 'fire_extinguisher',
];

const feature = (row, geomKey = 'geometry') => {
  const { [geomKey]: geometry, ...properties } = row;
  return { type: 'Feature', geometry, properties };
};

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

// Schools with latest SPI, class, flood level, RPS
app.get('/api/schools', wrap(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT id, emis_code, name, district, level, learners, teachers,
           dist_to_road_m, dist_to_health_m, assessed_on, spi, spi_class,
           flood_level, rps, ST_AsGeoJSON(geom)::json AS geometry
    FROM school_status ORDER BY id`);
  res.json({ type: 'FeatureCollection', features: rows.map((r) => feature(r)) });
}));

// Latest assessment details for one school (popup / form prefill)
app.get('/api/schools/:id/assessment', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM assessments WHERE school_id = $1 ORDER BY assessed_on DESC, id DESC LIMIT 1`,
    [req.params.id]);
  res.json(rows[0] || null);
}));

app.get('/api/schools/:id/history', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, assessed_on, assessor, compute_spi(a) AS spi
       FROM assessments a WHERE school_id = $1 ORDER BY assessed_on, id`,
    [req.params.id]);
  res.json(rows);
}));

// Flood (or other) hazard polygons
app.get('/api/hazards', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, hazard, level, name, ST_AsGeoJSON(geom)::json AS geometry FROM hazard_zones`);
  res.json({ type: 'FeatureCollection', features: rows.map((r) => feature(r)) });
}));

app.get('/api/weights', wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT indicator, label, domain, kind, weight::float AS weight FROM indicator_weights ORDER BY sort_order`);
  res.json(rows);
}));

// Record a new assessment
app.post('/api/schools/:id/assessments', wrap(async (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId)) return res.status(400).json({ error: 'Invalid school id' });
  const b = req.body || {};
  const pct = Number(b.teachers_trained_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: 'teachers_trained_pct must be 0-100' });
  }
  const values = BINARY.map((k) => b[k] === true);
  const exists = await pool.query('SELECT 1 FROM schools WHERE id = $1', [schoolId]);
  if (!exists.rowCount) return res.status(404).json({ error: 'School not found' });

  const { rows } = await pool.query(
    `INSERT INTO assessments
       (school_id, assessed_on, assessor, ${BINARY.join(', ')}, teachers_trained_pct, notes)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, ${BINARY.map((_, i) => `$${i + 4}`).join(', ')},
             $${BINARY.length + 4}, $${BINARY.length + 5})
     RETURNING id, compute_spi(assessments) AS spi`,
    [schoolId, b.assessed_on || null, (b.assessor || '').slice(0, 120) || null, ...values, pct,
      (b.notes || '').slice(0, 1000) || null]);
  res.status(201).json(rows[0]);
}));

// Dashboard summary
app.get('/api/summary', wrap(async (_req, res) => {
  const [totals, byClass, byDistrict, exposed, top] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS schools, COALESCE(SUM(learners),0)::int AS learners,
                       COUNT(spi)::int AS assessed, ROUND(AVG(spi),1)::float AS mean_spi
                  FROM school_status`),
    pool.query(`SELECT spi_class, COUNT(*)::int AS schools, COALESCE(SUM(learners),0)::int AS learners
                  FROM school_status GROUP BY spi_class`),
    pool.query(`SELECT district, COUNT(*)::int AS schools, ROUND(AVG(spi),1)::float AS mean_spi
                  FROM school_status GROUP BY district ORDER BY mean_spi NULLS LAST`),
    pool.query(`SELECT COUNT(*)::int AS schools, COALESCE(SUM(learners),0)::int AS learners
                  FROM school_status WHERE flood_level >= 2 AND spi_class = 'low'`),
    pool.query(`SELECT id, name, district, spi, flood_level, learners, rps
                  FROM school_status WHERE rps IS NOT NULL ORDER BY rps DESC LIMIT 5`),
  ]);
  res.json({
    totals: totals.rows[0],
    byClass: byClass.rows,
    byDistrict: byDistrict.rows,
    lowPrepInFloodZones: exposed.rows[0],
    topPriority: top.rows,
  });
}));

// CSV export for R / Python / Excel / QGIS
app.get('/api/export.csv', wrap(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.name, s.district, s.level, s.learners, s.teachers, s.dist_to_road_m, s.dist_to_health_m,
           ST_X(s.geom) AS lon, ST_Y(s.geom) AS lat, s.flood_level, s.spi, s.spi_class, s.rps,
           a.assessed_on, a.emergency_plan, a.emergency_contacts, a.evacuation_route, a.evacuation_signage,
           a.safe_assembly_point, a.disaster_drill, a.teachers_trained_pct, a.early_warning,
           a.first_aid_kit, a.fire_extinguisher
      FROM school_status s LEFT JOIN assessments a ON a.id = s.assessment_id ORDER BY s.id`);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v) => (v === null || v === undefined ? '' : `"${String(v instanceof Date ? v.toISOString().slice(0, 10) : v).replace(/"/g, '""')}"`);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  res.type('text/csv').attachment('school_preparedness.csv').send(csv);
}));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
