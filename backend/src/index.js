import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

// SafeCom API - Safe Community: Mapping Community Safety & Resilience

// Return DATE columns as 'YYYY-MM-DD' strings (no timezone shifts)
pg.types.setTypeParser(1082, (v) => v);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Service-role client: verifies login tokens, creates user accounts, stores photos.
// Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
if (!supabase) console.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: sign-in and editing are disabled.');

const PHOTO_BUCKET = 'facility-photos';
const FACILITY_TYPES = ['school', 'evacuation_centre', 'health_facility', 'market', 'place_of_worship', 'community_hall', 'water_point'];

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for per-IP sign-up limits

const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.includes('*') ? '*' : origins }));

// Small JSON bodies everywhere, except photo uploads (base64 image) and boundary uploads (GeoJSON).
const smallJson = express.json({ limit: '100kb' });
const photoJson = express.json({ limit: '6mb' });
const geoJson = express.json({ limit: '40mb' });
app.use((req, res, next) => {
  const parser = req.path === '/api/admin-areas' ? geoJson
    : req.path.endsWith('/photo') || req.path === '/api/flood-reports' ? photoJson : smallJson;
  return parser(req, res, next);
});

// ---------- error handling ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  if (res.headersSent) return;
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'That code is already used by another facility.' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const feature = ({ geometry, ...properties }) => ({ type: 'Feature', geometry, properties });

// ---------- validation helpers ----------
const MALAWI = { minLat: -17.5, maxLat: -9.0, minLon: 32.5, maxLon: 36.5 };

function text(v, field, max, { required = false } = {}) {
  if (v === undefined) { if (required) fail(400, `${field} is required`); return undefined; }
  const s = v === null ? '' : String(v).trim();
  if (!s) { if (required) fail(400, `${field} is required`); return null; }
  if (s.length > max) fail(400, `${field} must be at most ${max} characters`);
  return s;
}

function int(v, field, min, max) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${field} must be a whole number from ${min} to ${max}`);
  return n;
}

function coords(lat, lon) {
  if (lat === undefined && lon === undefined) return undefined;
  const la = Number(lat); const lo = Number(lon);
  if (lat === null || lon === null || lat === '' || lon === '' || !Number.isFinite(la) || !Number.isFinite(lo)) {
    fail(400, 'Latitude and longitude are both required');
  }
  if (la < MALAWI.minLat || la > MALAWI.maxLat || lo < MALAWI.minLon || lo > MALAWI.maxLon) {
    fail(400, 'That location is outside Malawi. Check latitude (about -17 to -9) and longitude (about 32.5 to 36).');
  }
  return [lo, la];
}

function facilityType(v, { required = false } = {}) {
  if (v === undefined && !required) return undefined;
  if (!FACILITY_TYPES.includes(v)) fail(400, 'Choose a valid facility type');
  return v;
}

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) fail(400, 'Invalid facility id');
  return id;
};

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

// ---------- auth ----------
const authenticate = handle(async (req, _res, next) => {
  if (!supabase) fail(503, 'Sign-in is not configured on the server');
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) fail(401, 'Please sign in first');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) fail(401, 'Your session has expired. Please sign in again.');
  const { rows } = await pool.query(
    `SELECT p.id, p.email, p.full_name, p.phone, p.organisation, p.role, p.status, p.facility_id,
            f.name AS facility_name, f.facility_type, f.status AS facility_status
       FROM profiles p LEFT JOIN facilities f ON f.id = p.facility_id WHERE p.id = $1`, [data.user.id]);
  if (!rows[0]) fail(403, 'This account has no SafeCom profile. Contact the administrator.');
  req.user = rows[0];
  next();
});

// Like authenticate, but never fails: req.user is the active profile or null (public endpoints).
const optionalUser = handle(async (req, _res, next) => {
  req.user = null;
  const h = req.headers.authorization || '';
  if (supabase && h.startsWith('Bearer ')) {
    const { data } = await supabase.auth.getUser(h.slice(7));
    if (data?.user) {
      const { rows } = await pool.query(`SELECT id, role, status, facility_id, full_name FROM profiles WHERE id = $1`, [data.user.id]);
      if (rows[0]?.status === 'active') req.user = rows[0];
    }
  }
  next();
});

// Signed in AND activated by an administrator
const requireActive = (req, res, next) => {
  if (req.user.status === 'active') return next();
  return res.status(403).json({
    error: req.user.status === 'pending'
      ? 'Your account is waiting for an administrator to activate it.'
      : 'Your account has been disabled. Contact the administrator.',
  });
};
const signedIn = [authenticate, requireActive];
const adminOnly = [authenticate, requireActive, (req, res, next) => (req.user.role === 'admin'
  ? next() : res.status(403).json({ error: 'Administrator access required' }))];

function assertCanEdit(req, id) {
  if (req.user.role !== 'admin' && req.user.facility_id !== id) fail(403, 'You can only update your own facility');
}

// Effective checklist per type: { school: [...], market: [...] }
async function checklists() {
  const { rows } = await pool.query(`
    SELECT t.ftype AS facility_type, w.indicator, w.label, w.domain, w.kind, w.weight::float AS weight, w.sort_order,
           w.cost_mwk::float AS cost_mwk, w.action
      FROM unnest($1::text[]) AS t(ftype), LATERAL weights_for(t.ftype) w
     WHERE w.weight > 0 ORDER BY t.ftype, w.sort_order, w.indicator`, [FACILITY_TYPES]);
  const out = Object.fromEntries(FACILITY_TYPES.map((t) => [t, []]));
  rows.forEach(({ facility_type: t, ...w }) => out[t].push(w));
  return out;
}

// ---------- public read endpoints ----------
app.get('/api/health', handle(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, auth: !!supabase });
}));

const FACILITY_COLUMNS = `
  id, facility_type, code, name, district, ta, subtype, people_served, staff, shelter_capacity,
  dist_to_road_m::float AS dist_to_road_m, dist_to_health_m::float AS dist_to_health_m,
  contact_name, contact_phone, photo_url, notes, updated_at,
  assessed_on, spi::float AS spi, spi_class, flood_level, rps::float AS rps,
  ST_AsGeoJSON(geom)::json AS geometry`;

app.get('/api/facilities', handle(async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${FACILITY_COLUMNS} FROM facility_status ORDER BY name`);
  res.json({ type: 'FeatureCollection', features: rows.map(feature) });
}));

app.get('/api/facilities/:id/assessment', handle(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.assessed_on, a.assessor, a.answers, a.notes, compute_spi(a.answers, f.facility_type)::float AS spi
       FROM assessments a JOIN facilities f ON f.id = a.facility_id
      WHERE a.facility_id = $1 ORDER BY a.assessed_on DESC, a.id DESC LIMIT 1`, [idParam(req)]);
  res.json(rows[0] || null);
}));

app.get('/api/facilities/:id/history', handle(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.assessed_on, a.assessor, compute_spi(a.answers, f.facility_type)::float AS spi
       FROM assessments a JOIN facilities f ON f.id = a.facility_id
      WHERE a.facility_id = $1 ORDER BY a.assessed_on, a.id`, [idParam(req)]);
  res.json(rows);
}));

app.get('/api/hazards', handle(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, hazard, level, name, ST_AsGeoJSON(geom)::json AS geometry FROM hazard_zones`);
  res.json({ type: 'FeatureCollection', features: rows.map(feature) });
}));

app.get('/api/checklists', handle(async (_req, res) => res.json(await checklists())));

// Latest checklist answers of every active facility: { "<id>": { indicator: value } }.
// Used for priority gaps, what-if, budget planning and the gap heatmap.
app.get('/api/answers', handle(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, a.answers FROM facility_status s JOIN assessments a ON a.id = s.assessment_id`);
  res.json(Object.fromEntries(rows.map((r) => [r.id, r.answers])));
}));

// Mean SPI per quarter (assessments made in that quarter), optionally for one district.
app.get('/api/trend', handle(async (req, res) => {
  const district = typeof req.query.district === 'string' && req.query.district ? req.query.district : null;
  const { rows } = await pool.query(
    `SELECT to_char(date_trunc('quarter', a.assessed_on), 'YYYY-"Q"Q') AS quarter,
            COUNT(*)::int AS assessments, ROUND(AVG(compute_spi(a.answers, f.facility_type)), 1)::float AS mean_spi
       FROM assessments a JOIN facilities f ON f.id = a.facility_id
      WHERE f.status = 'active' AND ($1::text IS NULL OR f.district = $1)
        AND a.assessed_on >= CURRENT_DATE - INTERVAL '3 years'
      GROUP BY 1 ORDER BY 1`, [district]);
  res.json(rows);
}));

// ---------- administrative boundaries ----------
app.get('/api/admin-areas', handle(async (req, res) => {
  const level = req.query.level === 'ta' ? 'ta' : 'district';
  const { rows } = await pool.query(
    `SELECT id, level, name, district, population,
            ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, $2), 5)::json AS geometry
       FROM admin_areas WHERE level = $1 ORDER BY name`, [level, level === 'ta' ? 0.002 : 0.004]);
  res.json({ type: 'FeatureCollection', features: rows.map(feature) });
}));

app.get('/api/admin-areas/summary', handle(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT level, COUNT(*)::int AS areas, SUM(population)::bigint AS population, MAX(source) AS source
       FROM admin_areas GROUP BY level`);
  res.json(rows);
}));

// Upload district or TA polygons (GeoJSON in WGS84). Replaces the existing areas of that level.
app.post('/api/admin-areas', ...adminOnly, handle(async (req, res) => {
  const b = req.body || {};
  const level = b.level === 'ta' ? 'ta' : b.level === 'district' ? 'district' : fail(400, 'Choose districts or TAs');
  const items = Array.isArray(b.features) ? b.features : fail(400, 'No features found in the file');
  if (!items.length) fail(400, 'No features found in the file');
  if (items.length > 2000) fail(400, 'Too many areas (max 2000)');
  const source = text(b.source ?? null, 'Source', 200);
  const client = await pool.connect();
  let n = 0;
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM admin_areas WHERE level = $1', [level]);
    for (const it of items) {
      const g = it.geometry;
      if (!g || !['Polygon', 'MultiPolygon'].includes(g.type)) continue;
      const name = text(it.name ?? null, 'Area name', 120);
      if (!name) continue;
      const pop = Number(it.population);
      await client.query(
        `INSERT INTO admin_areas (level, name, district, population, source, geom)
         VALUES ($1, $2, $3, $4, $5, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)), 3)))`,
        [level, name, text(it.district ?? null, 'District', 80), Number.isFinite(pop) && pop >= 0 ? Math.round(pop) : null,
          source, JSON.stringify(g)]);
      n += 1;
    }
    if (!n) fail(400, 'No polygons with a name were found. Check the name field.');
    const out = await client.query(
      `SELECT COUNT(*)::int AS n FROM admin_areas WHERE level = $1
         AND NOT ST_Intersects(geom, ST_MakeEnvelope(32.5, -17.5, 36.5, -9.0, 4326))`, [level]);
    if (out.rows[0].n === n) fail(400, 'These areas are not in Malawi. Export the layer in WGS 84 (EPSG:4326) and try again.');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ imported: n });
}));

app.delete('/api/admin-areas', ...adminOnly, handle(async (req, res) => {
  const level = req.query.level === 'ta' ? 'ta' : 'district';
  const { rowCount } = await pool.query('DELETE FROM admin_areas WHERE level = $1', [level]);
  res.json({ deleted: rowCount });
}));

// ---------- flood history: crowdsourced records of PAST floods ----------
// Used to check the hazard map and to plan. SafeCom does not issue warnings: official forecasts and
// warnings come from DCCMS and DoDMA.
const DEPTHS = ['ankle', 'knee', 'waist', 'above_waist'];
const AFFECTED = ['homes', 'road', 'bridge', 'crops', 'facility', 'livestock', 'water_point'];
const REPORT_COLUMNS = `r.id, r.depth, r.affected, r.description, r.event_name, r.facility_id, f.name AS facility_name,
  r.photo_url, r.status, r.observed_at, r.created_at, r.reviewed_at, ST_AsGeoJSON(r.geom)::json AS geometry`;
const REPORT_FROM = 'flood_reports r LEFT JOIN facilities f ON f.id = r.facility_id';

async function storePhoto(dataUrl, folder) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) fail(400, 'Please upload a JPG, PNG or WebP image');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 4 * 1024 * 1024) fail(400, 'Image is too large (max 4 MB)');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: m[1], upsert: false });
  if (error) { console.error(error); fail(500, 'Could not store the photo'); }
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Public: confirmed flood records (all years, or the last N years).
app.get('/api/flood-reports', handle(async (req, res) => {
  const years = Math.min(Math.max(Number(req.query.years) || 100, 1), 100);
  const { rows } = await pool.query(
    `SELECT ${REPORT_COLUMNS} FROM ${REPORT_FROM}
      WHERE r.status IN ('verified', 'resolved') AND r.observed_at >= now() - make_interval(years => $1)
      ORDER BY r.observed_at DESC LIMIT 5000`, [years]);
  res.json({ type: 'FeatureCollection', features: rows.map(feature) });
}));

// Admin: every record, including those waiting for review, with reporter contacts.
app.get('/api/flood-reports/all', ...adminOnly, handle(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${REPORT_COLUMNS}, r.reporter_name, r.reporter_phone FROM ${REPORT_FROM}
      ORDER BY (r.status = 'pending') DESC, r.observed_at DESC LIMIT 5000`);
  res.json({ type: 'FeatureCollection', features: rows.map(feature) });
}));

// Anyone can record a past flood. Records from administrators are confirmed straight away.
app.post('/api/flood-reports', optionalUser, handle(async (req, res) => {
  const b = req.body || {};
  if (b.website) fail(400, 'Invalid request'); // honeypot
  if (!req.user) rateLimit(`report:${req.ip}`, 10, 60 * 60 * 1000, 'Too many records from this connection. Please try again in an hour.');
  const point = coords(b.lat, b.lon);
  if (!point) fail(400, 'Set the flooded location on the map');
  if (!DEPTHS.includes(b.depth)) fail(400, 'Choose how deep the water got');
  const affected = (Array.isArray(b.affected) ? b.affected : []).filter((a) => AFFECTED.includes(a));
  const observed = b.observed_at ? new Date(b.observed_at) : null;
  if (!observed || Number.isNaN(observed.getTime())) fail(400, 'Enter the date of the flood');
  if (observed > new Date(Date.now() + 864e5)) fail(400, 'The flood date cannot be in the future');
  if (observed < new Date('1950-01-01')) fail(400, 'Enter a date after 1950');
  const facilityId = int(b.facility_id ?? null, 'Facility', 1, 2147483647);
  if (facilityId) {
    const f = await pool.query(`SELECT 1 FROM facilities WHERE id = $1 AND status = 'active'`, [facilityId]);
    if (!f.rowCount) fail(400, 'Facility not found');
  }
  const photoUrl = b.photo && supabase ? await storePhoto(b.photo, 'reports') : null;
  const verified = req.user?.role === 'admin';
  const { rows } = await pool.query(
    `INSERT INTO flood_reports (depth, affected, description, photo_url, reporter_name, reporter_phone, reported_by,
                                status, reviewed_by, reviewed_at, observed_at, geom, event_name, facility_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, ST_SetSRID(ST_MakePoint($12,$13),4326), $14, $15) RETURNING id, status`,
    [b.depth, affected, text(b.description ?? null, 'Description', 1000), photoUrl,
      text(b.reporter_name ?? null, 'Name', 120) || req.user?.full_name || null, text(b.reporter_phone ?? null, 'Phone', 40),
      req.user?.id || null, verified ? 'verified' : 'pending', verified ? req.user.id : null, verified ? new Date() : null,
      observed, point[0], point[1], text(b.event_name ?? null, 'Flood event', 120), facilityId ?? null]);
  res.status(201).json(rows[0]);
}));

app.patch('/api/flood-reports/:id', ...adminOnly, handle(async (req, res) => {
  const status = req.body?.status;
  if (!['pending', 'verified', 'rejected'].includes(status)) fail(400, 'Invalid status');
  const { rowCount } = await pool.query(
    `UPDATE flood_reports SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
    [idParam(req), status, req.user.id]);
  if (!rowCount) fail(404, 'Record not found');
  res.json({ ok: true });
}));

app.delete('/api/flood-reports/:id', ...adminOnly, handle(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM flood_reports WHERE id = $1', [idParam(req)]);
  if (!rowCount) fail(404, 'Record not found');
  res.json({ ok: true });
}));

app.get('/api/summary', handle(async (_req, res) => {
  const [totals, byClass, byDistrict, byType, exposed, top] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS facilities, COALESCE(SUM(people_served),0)::int AS people,
                       COUNT(spi)::int AS assessed, ROUND(AVG(spi),1)::float AS mean_spi
                  FROM facility_status`),
    pool.query(`SELECT spi_class, COUNT(*)::int AS facilities, COALESCE(SUM(people_served),0)::int AS people
                  FROM facility_status GROUP BY spi_class`),
    pool.query(`SELECT district, COUNT(*)::int AS facilities, ROUND(AVG(spi),1)::float AS mean_spi
                  FROM facility_status GROUP BY district ORDER BY mean_spi NULLS LAST, district`),
    pool.query(`SELECT facility_type, COUNT(*)::int AS facilities, COUNT(spi)::int AS assessed,
                       ROUND(AVG(spi),1)::float AS mean_spi, COALESCE(SUM(people_served),0)::int AS people
                  FROM facility_status GROUP BY facility_type ORDER BY facilities DESC`),
    pool.query(`SELECT COUNT(*)::int AS facilities, COALESCE(SUM(people_served),0)::int AS people
                  FROM facility_status WHERE flood_level >= 2 AND spi_class = 'low'`),
    pool.query(`SELECT id, facility_type, name, district, spi::float AS spi, flood_level, people_served, rps::float AS rps
                  FROM facility_status WHERE rps IS NOT NULL ORDER BY rps DESC LIMIT 5`),
  ]);
  res.json({
    totals: totals.rows[0],
    byClass: byClass.rows,
    byDistrict: byDistrict.rows,
    byType: byType.rows,
    lowPrepInFloodZones: exposed.rows[0],
    topPriority: top.rows,
  });
}));

// CSV for R / Python / Excel / QGIS: one row per facility, latest answers as columns.
app.get('/api/export.csv', handle(async (_req, res) => {
  const [{ rows }, keys] = await Promise.all([
    pool.query(`
      SELECT s.id, s.facility_type, s.code, s.name, s.district, s.ta, s.subtype, s.people_served, s.staff, s.shelter_capacity,
             s.dist_to_road_m, s.dist_to_health_m, ST_X(s.geom) AS lon, ST_Y(s.geom) AS lat,
             s.flood_level, s.spi, s.spi_class, s.rps, a.assessed_on, a.answers
        FROM facility_status s LEFT JOIN assessments a ON a.id = s.assessment_id ORDER BY s.id`),
    pool.query(`SELECT indicator FROM indicator_weights GROUP BY indicator ORDER BY MIN(sort_order), indicator`),
  ]);
  const indicators = keys.rows.map((r) => r.indicator);
  const flat = rows.map(({ answers, ...r }) => ({ ...r, ...Object.fromEntries(indicators.map((k) => [k, answers?.[k]])) }));
  const cols = rows.length ? Object.keys(flat[0]) : [];
  const esc = (v) => (v === null || v === undefined ? '' : `"${String(v instanceof Date ? v.toISOString().slice(0, 10) : v).replace(/"/g, '""')}"`);
  const csv = [cols.join(','), ...flat.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  res.type('text/csv').attachment('safecom_facilities.csv').send(csv);
}));

// ---------- public sign-up (admin activates later) ----------
const signups = new Map(); // ip -> timestamps
function rateLimit(ip, max = 5, windowMs = 60 * 60 * 1000, message = 'Too many sign-up attempts. Please try again later.') {
  const now = Date.now();
  const recent = (signups.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) fail(429, message);
  recent.push(now);
  signups.set(ip, recent);
}

app.post('/api/register', handle(async (req, res) => {
  if (!supabase) fail(503, 'Sign-up is not configured on the server');
  rateLimit(req.ip);
  const b = req.body || {};
  if (b.website) fail(400, 'Invalid request'); // honeypot field, invisible to people
  const fullName = text(b.full_name, 'Full name', 120, { required: true });
  const email = (text(b.email, 'Email', 200, { required: true })).toLowerCase();
  if (!isEmail(email)) fail(400, 'Enter a valid email address');
  const password = String(b.password || '');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters');
  const phone = text(b.phone ?? null, 'Phone', 40);
  const organisation = text(b.organisation ?? null, 'Organisation', 160);
  const note = text(b.note ?? null, 'Message', 1000);

  let facilityId = null; let newFacility = null;
  if (b.new_facility) {
    const n = b.new_facility;
    const point = coords(n.lat, n.lon);
    if (!point) fail(400, 'Set the facility location on the map');
    newFacility = {
      type: facilityType(n.facility_type, { required: true }),
      name: text(n.name, 'Facility name', 200, { required: true }),
      district: text(n.district, 'District', 80, { required: true }),
      subtype: text(n.subtype ?? null, 'Category', 80),
      point,
    };
  } else {
    facilityId = int(b.facility_id, 'Facility', 1, 2147483647);
    if (!facilityId) fail(400, 'Choose the facility you manage, or propose a new one');
    const f = await pool.query(`SELECT 1 FROM facilities WHERE id = $1 AND status = 'active'`, [facilityId]);
    if (!f.rowCount) fail(400, 'Facility not found');
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) fail(400, /already|exists|registered/i.test(error.message) ? 'An account with this email already exists. Try signing in.' : error.message);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (newFacility) {
      const r = await client.query(
        `INSERT INTO facilities (facility_type, name, district, subtype, status, geom)
         VALUES ($1,$2,$3,$4,'pending', ST_SetSRID(ST_MakePoint($5,$6),4326)) RETURNING id`,
        [newFacility.type, newFacility.name, newFacility.district, newFacility.subtype, ...newFacility.point]);
      facilityId = r.rows[0].id;
    }
    await client.query(
      `INSERT INTO profiles (id, email, full_name, phone, organisation, role, status, facility_id, request_note)
       VALUES ($1,$2,$3,$4,$5,'manager','pending',$6,$7)`,
      [data.user.id, email, fullName, phone, organisation, facilityId, note]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    await supabase.auth.admin.deleteUser(data.user.id);
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ ok: true });
}));

// ---------- signed-in endpoints ----------
app.get('/api/me', authenticate, (req, res) => res.json(req.user));

// Users edit their own name, phone and organisation (role, status and facility are admin-only).
app.patch('/api/me', authenticate, handle(async (req, res) => {
  const b = req.body || {};
  const fields = {
    full_name: text(b.full_name, 'Full name', 120, { required: b.full_name !== undefined }),
    phone: text(b.phone, 'Phone', 40),
    organisation: text(b.organisation, 'Organisation', 160),
  };
  const sets = []; const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    vals.push(v); sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) fail(400, 'Nothing to update');
  vals.push(req.user.id);
  await pool.query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  res.json({ ok: true });
}));

// Update facility details. Managers: their own facility, limited fields. Admin: any facility, all fields.
app.patch('/api/facilities/:id', ...signedIn, handle(async (req, res) => {
  const id = idParam(req);
  assertCanEdit(req, id);
  const b = req.body || {};
  const isAdmin = req.user.role === 'admin';

  const fields = {
    subtype: text(b.subtype, 'Category', 80),
    people_served: int(b.people_served, 'People served', 0, 10000000),
    shelter_capacity: int(b.shelter_capacity, 'Shelter capacity', 0, 1000000),
    staff: int(b.staff, 'Staff', 0, 100000),
    contact_name: text(b.contact_name, 'Contact person', 120),
    contact_phone: text(b.contact_phone, 'Phone', 40),
    notes: text(b.notes, 'Notes', 2000),
  };
  if (isAdmin) {
    Object.assign(fields, {
      facility_type: facilityType(b.facility_type),
      name: text(b.name, 'Facility name', 200, { required: b.name !== undefined }),
      code: text(b.code, 'Code', 40),
      district: text(b.district, 'District', 80, { required: b.district !== undefined }),
      dist_to_road_m: int(b.dist_to_road_m, 'Distance to road', 0, 200000),
      dist_to_health_m: int(b.dist_to_health_m, 'Distance to health facility', 0, 200000),
    });
  }
  if (fields.people_served === null || fields.staff === null) fail(400, 'People served and staff cannot be empty');

  const sets = []; const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    vals.push(v); sets.push(`${k} = $${vals.length}`);
  }
  const point = coords(b.lat, b.lon);
  if (point) {
    vals.push(point[0], point[1]);
    sets.push(`geom = ST_SetSRID(ST_MakePoint($${vals.length - 1}, $${vals.length}), 4326)`);
  }
  if (!sets.length) fail(400, 'Nothing to update');
  vals.push(id);
  const { rowCount } = await pool.query(
    `UPDATE facilities SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
  if (!rowCount) fail(404, 'Facility not found');
  res.json({ ok: true });
}));

// Upload a facility photo (base64 data URL, resized in the browser).
app.post('/api/facilities/:id/photo', ...signedIn, handle(async (req, res) => {
  const id = idParam(req);
  assertCanEdit(req, id);
  const url = await storePhoto(req.body?.dataUrl, String(id));
  await pool.query('UPDATE facilities SET photo_url = $1, updated_at = now() WHERE id = $2', [url, id]);
  res.json({ photo_url: url });
}));

app.post('/api/facilities/:id/assessments', ...signedIn, handle(async (req, res) => {
  const id = idParam(req);
  assertCanEdit(req, id);
  const b = req.body || {};
  const f = await pool.query('SELECT facility_type FROM facilities WHERE id = $1', [id]);
  if (!f.rowCount) fail(404, 'Facility not found');
  const list = (await checklists())[f.rows[0].facility_type];

  const given = b.answers || {};
  const answers = {};
  for (const w of list) {
    if (w.kind === 'percent') {
      const n = Number(given[w.indicator] ?? 0);
      if (!Number.isFinite(n) || n < 0 || n > 100) fail(400, `${w.label} must be 0-100%`);
      answers[w.indicator] = n;
    } else {
      answers[w.indicator] = given[w.indicator] === true;
    }
  }
  const assessedOn = b.assessed_on && /^\d{4}-\d{2}-\d{2}$/.test(b.assessed_on) ? b.assessed_on : null;
  const assessor = (b.assessor || req.user.full_name || req.user.email || '').slice(0, 120) || null;

  const { rows } = await pool.query(
    `INSERT INTO assessments (facility_id, assessed_on, assessor, answers, notes, submitted_by)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6)
     RETURNING id, compute_spi(answers, $7)::float AS spi`,
    [id, assessedOn, assessor, answers, (b.notes || '').slice(0, 1000) || null, req.user.id, f.rows[0].facility_type]);
  res.status(201).json(rows[0]);
}));

// ---------- action tracker ----------
const ACTION_STATUS = ['open', 'in_progress', 'done'];
const dateOrNull = (v, field) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) fail(400, `${field} must be a date`);
  return String(v);
};
const money = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) fail(400, 'Cost must be a positive amount');
  return Math.round(n);
};

// Admins see every action; facility managers see their own facility's actions.
app.get('/api/actions', ...signedIn, handle(async (req, res) => {
  const mine = req.user.role === 'admin' ? null : req.user.facility_id;
  const { rows } = await pool.query(
    `SELECT a.id, a.facility_id, a.indicator, a.title, a.owner, a.due_date, a.status, a.cost_mwk::float AS cost_mwk,
            a.notes, a.created_at, a.updated_at, a.completed_at,
            f.name AS facility_name, f.facility_type, f.district
       FROM actions a JOIN facilities f ON f.id = a.facility_id
      WHERE ($1::int IS NULL OR a.facility_id = $1)
      ORDER BY (a.status = 'done'), a.due_date NULLS LAST, a.id`, [mine]);
  res.json(rows);
}));

function actionFields(b, { creating }) {
  const status = b.status === undefined ? undefined : ACTION_STATUS.includes(b.status) ? b.status : fail(400, 'Invalid status');
  return {
    title: text(b.title, 'Action', 300, { required: creating || b.title !== undefined }),
    indicator: text(b.indicator, 'Checklist item', 60),
    owner: text(b.owner, 'Responsible', 160),
    due_date: dateOrNull(b.due_date, 'Due date'),
    status,
    cost_mwk: money(b.cost_mwk),
    notes: text(b.notes, 'Notes', 2000),
  };
}

async function insertAction(db, user, b) {
  const facilityId = int(b.facility_id, 'Facility', 1, 2147483647) || fail(400, 'Choose a facility');
  if (user.role !== 'admin' && user.facility_id !== facilityId) fail(403, 'You can only plan actions for your own facility');
  const f = actionFields(b, { creating: true });
  const { rows } = await db.query(
    `INSERT INTO actions (facility_id, indicator, title, owner, due_date, status, cost_mwk, notes, created_by, completed_at)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'open'),$7,$8,$9, CASE WHEN $6 = 'done' THEN now() END) RETURNING id`,
    [facilityId, f.indicator ?? null, f.title, f.owner ?? null, f.due_date ?? null, f.status ?? null, f.cost_mwk ?? null,
      f.notes ?? null, user.id]);
  return rows[0].id;
}

app.post('/api/actions', ...signedIn, handle(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body || {}];
  if (!items.length || items.length > 500) fail(400, 'Add between 1 and 500 actions at a time');
  const client = await pool.connect();
  const ids = [];
  try {
    await client.query('BEGIN');
    for (const it of items) ids.push(await insertAction(client, req.user, it));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ ids });
}));

async function assertActionAccess(req) {
  const { rows } = await pool.query('SELECT facility_id FROM actions WHERE id = $1', [idParam(req)]);
  if (!rows[0]) fail(404, 'Action not found');
  assertCanEdit(req, rows[0].facility_id);
}

app.patch('/api/actions/:id', ...signedIn, handle(async (req, res) => {
  await assertActionAccess(req);
  const fields = actionFields(req.body || {}, { creating: false });
  const sets = []; const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    vals.push(v); sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) fail(400, 'Nothing to update');
  if (fields.status) {
    const i = Object.keys(fields).filter((k) => fields[k] !== undefined).indexOf('status') + 1;
    sets.push(`completed_at = CASE WHEN $${i} = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END`);
  }
  vals.push(idParam(req));
  await pool.query(`UPDATE actions SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
  res.json({ ok: true });
}));

app.delete('/api/actions/:id', ...signedIn, handle(async (req, res) => {
  await assertActionAccess(req);
  await pool.query('DELETE FROM actions WHERE id = $1', [idParam(req)]);
  res.json({ ok: true });
}));

// ---------- admin ----------
// Edit indicative costs / recommended actions of checklist items (applies to every facility type).
app.patch('/api/indicator-costs', ...adminOnly, handle(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : fail(400, 'Nothing to update');
  for (const it of items) {
    const cost = money(it.cost_mwk);
    const action = text(it.action, 'Recommended action', 300);
    await pool.query(
      `UPDATE indicator_weights SET cost_mwk = COALESCE($2, cost_mwk), action = COALESCE($3, action) WHERE indicator = $1`,
      [String(it.indicator || ''), cost ?? null, action ?? null]);
  }
  res.json({ ok: true });
}));

app.get('/api/activity', ...adminOnly, handle(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM (
      SELECT 'assessment' AS kind, a.created_at AS at, f.id AS facility_id, f.name AS facility_name, f.facility_type,
             compute_spi(a.answers, f.facility_type)::float AS spi, COALESCE(p.full_name, a.assessor) AS actor
        FROM assessments a JOIN facilities f ON f.id = a.facility_id
        LEFT JOIN profiles p ON p.id = a.submitted_by
      UNION ALL
      SELECT 'info', f.updated_at, f.id, f.name, f.facility_type, NULL, NULL
        FROM facilities f WHERE f.updated_at IS NOT NULL AND f.status = 'active'
      UNION ALL
      SELECT 'signup', p.created_at, p.facility_id, COALESCE(f.name, '—'), f.facility_type, NULL, p.full_name
        FROM profiles p LEFT JOIN facilities f ON f.id = p.facility_id WHERE p.status = 'pending'
    ) x ORDER BY at DESC LIMIT 15`);
  res.json(rows);
}));

app.post('/api/facilities', ...adminOnly, handle(async (req, res) => {
  const b = req.body || {};
  const point = coords(b.lat, b.lon);
  if (!point) fail(400, 'Set the facility location on the map');
  const { rows } = await pool.query(
    `INSERT INTO facilities (facility_type, name, code, district, subtype, people_served, staff, dist_to_road_m,
                             dist_to_health_m, contact_name, contact_phone, notes, shelter_capacity, geom, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$15, ST_SetSRID(ST_MakePoint($13,$14),4326), now()) RETURNING id`,
    [facilityType(b.facility_type, { required: true }), text(b.name, 'Facility name', 200, { required: true }),
      text(b.code ?? null, 'Code', 40), text(b.district, 'District', 80, { required: true }), text(b.subtype ?? null, 'Category', 80),
      int(b.people_served ?? 0, 'People served', 0, 10000000) ?? 0, int(b.staff ?? 0, 'Staff', 0, 100000) ?? 0,
      int(b.dist_to_road_m ?? null, 'Distance to road', 0, 200000),
      int(b.dist_to_health_m ?? null, 'Distance to health facility', 0, 200000),
      text(b.contact_name ?? null, 'Contact person', 120), text(b.contact_phone ?? null, 'Phone', 40),
      text(b.notes ?? null, 'Notes', 2000), point[0], point[1], int(b.shelter_capacity ?? null, 'Shelter capacity', 0, 1000000)]);
  res.status(201).json({ id: rows[0].id });
}));

app.delete('/api/facilities/:id', ...adminOnly, handle(async (req, res) => {
  const id = idParam(req);
  const users = await pool.query('SELECT COUNT(*)::int AS n FROM profiles WHERE facility_id = $1', [id]);
  if (users.rows[0].n) fail(409, 'Delete or reassign this facility\'s user accounts first');
  const { rowCount } = await pool.query('DELETE FROM facilities WHERE id = $1', [id]);
  if (!rowCount) fail(404, 'Facility not found');
  res.json({ ok: true });
}));

app.get('/api/users', ...adminOnly, handle(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.email, p.full_name, p.phone, p.organisation, p.role, p.status, p.request_note, p.created_at,
            p.facility_id, f.name AS facility_name, f.facility_type, f.district AS facility_district,
            f.status AS facility_status, ST_Y(f.geom) AS facility_lat, ST_X(f.geom) AS facility_lon
       FROM profiles p LEFT JOIN facilities f ON f.id = p.facility_id
      ORDER BY (p.status = 'pending') DESC, p.created_at DESC`);
  res.json(rows);
}));

app.post('/api/users', ...adminOnly, handle(async (req, res) => {
  const b = req.body || {};
  const email = text(b.email, 'Email', 200, { required: true }).toLowerCase();
  if (!isEmail(email)) fail(400, 'Enter a valid email address');
  const password = String(b.password || '');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters');
  const role = b.role === 'admin' ? 'admin' : 'manager';
  const fid = role === 'manager' ? int(b.facility_id, 'Facility', 1, 2147483647) : null;
  if (role === 'manager' && !fid) fail(400, 'Choose the facility this account manages');
  if (fid) {
    const s = await pool.query('SELECT 1 FROM facilities WHERE id = $1', [fid]);
    if (!s.rowCount) fail(400, 'Facility not found');
  }
  const fullName = text(b.full_name ?? null, 'Name', 120);
  const phone = text(b.phone ?? null, 'Phone', 40);

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) fail(400, /already|exists|registered/i.test(error.message) ? 'An account with this email already exists' : error.message);
  try {
    await pool.query(
      `INSERT INTO profiles (id, email, full_name, phone, role, status, facility_id) VALUES ($1,$2,$3,$4,$5,'active',$6)`,
      [data.user.id, email, fullName, phone, role, fid]);
  } catch (e) {
    await supabase.auth.admin.deleteUser(data.user.id);
    throw e;
  }
  res.status(201).json({ id: data.user.id });
}));

// Activate a pending sign-up (optionally reassigning the facility). Also publishes a proposed facility.
app.post('/api/users/:id/approve', ...adminOnly, handle(async (req, res) => {
  const fid = int(req.body?.facility_id, 'Facility', 1, 2147483647);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query('SELECT facility_id FROM profiles WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!p.rowCount) fail(404, 'User not found');
    const oldFacility = p.rows[0].facility_id;
    const target = fid || oldFacility;
    await client.query(`UPDATE profiles SET status = 'active', facility_id = $2 WHERE id = $1`, [req.params.id, target]);
    await client.query(`UPDATE facilities SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'pending'`, [target]);
    // A proposed facility that was replaced by an existing one is no longer needed
    if (fid && oldFacility && fid !== oldFacility) {
      await client.query(`DELETE FROM facilities f WHERE f.id = $1 AND f.status = 'pending'
                            AND NOT EXISTS (SELECT 1 FROM profiles WHERE facility_id = f.id)`, [oldFacility]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));

app.patch('/api/users/:id', ...adminOnly, handle(async (req, res) => {
  const b = req.body || {};
  if (b.password !== undefined) {
    const password = String(b.password || '');
    if (password.length < 8) fail(400, 'Password must be at least 8 characters');
    const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password });
    if (error) fail(400, error.message);
  }
  if (b.status !== undefined) {
    if (!['active', 'disabled'].includes(b.status)) fail(400, 'Invalid status');
    if (req.params.id === req.user.id) fail(400, 'You cannot disable your own account');
    const r = await pool.query('UPDATE profiles SET status = $2 WHERE id = $1', [req.params.id, b.status]);
    if (!r.rowCount) fail(404, 'User not found');
  }
  res.json({ ok: true });
}));

// Delete an account, or reject a sign-up request (also removes a facility it proposed).
app.delete('/api/users/:id', ...adminOnly, handle(async (req, res) => {
  if (req.params.id === req.user.id) fail(400, 'You cannot delete your own account');
  const p = await pool.query('DELETE FROM profiles WHERE id = $1 RETURNING facility_id', [req.params.id]);
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error && !p.rowCount) fail(400, error.message);
  const fid = p.rows[0]?.facility_id;
  if (fid) {
    await pool.query(`DELETE FROM facilities f WHERE f.id = $1 AND f.status = 'pending'
                        AND NOT EXISTS (SELECT 1 FROM profiles WHERE facility_id = f.id)`, [fid]);
  }
  res.json({ ok: true });
}));

// ---------- startup ----------
async function ensurePhotoBucket() {
  if (!supabase) return;
  const { data } = await supabase.storage.getBucket(PHOTO_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(PHOTO_BUCKET, { public: true, fileSizeLimit: '5MB' });
  if (error) console.error('Could not create photo bucket:', error.message);
  else console.log(`Created storage bucket "${PHOTO_BUCKET}"`);
}

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`SafeCom API listening on :${port}`);
  ensurePhotoBucket().catch((e) => console.error(e));
});
