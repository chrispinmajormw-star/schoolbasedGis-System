import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Service-role client: verifies login tokens, creates user accounts, stores photos.
// Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
if (!supabase) console.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: sign-in and editing are disabled.');

const PHOTO_BUCKET = 'school-photos';
const app = express();

const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.includes('*') ? '*' : origins }));

// Small JSON bodies everywhere, except photo uploads (base64 image).
const smallJson = express.json({ limit: '100kb' });
const photoJson = express.json({ limit: '6mb' });
app.use((req, res, next) => (req.path.endsWith('/photo') ? photoJson : smallJson)(req, res, next));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((err) => {
  console.error(err);
  if (res.headersSent) return;
  if (err.code === '23505') return res.status(409).json({ error: 'That value is already used by another record.' });
  res.status(500).json({ error: 'Server error' });
});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const handle = (fn) => wrap(async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

const BINARY = [
  'emergency_plan', 'emergency_contacts', 'evacuation_route', 'evacuation_signage',
  'safe_assembly_point', 'disaster_drill', 'early_warning', 'first_aid_kit', 'fire_extinguisher',
];

const feature = (row, geomKey = 'geometry') => {
  const { [geomKey]: geometry, ...properties } = row;
  return { type: 'Feature', geometry, properties };
};

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
  if (!Number.isFinite(la) || !Number.isFinite(lo)) fail(400, 'Latitude and longitude are both required');
  if (la < MALAWI.minLat || la > MALAWI.maxLat || lo < MALAWI.minLon || lo > MALAWI.maxLon) {
    fail(400, 'That location is outside Malawi. Check latitude (about -17 to -9) and longitude (about 32.5 to 36).');
  }
  return [lo, la];
}

const schoolId = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) fail(400, 'Invalid school id');
  return id;
};

// ---------- auth ----------
const authenticate = handle(async (req, _res, next) => {
  if (!supabase) fail(503, 'Sign-in is not configured on the server');
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) fail(401, 'Please sign in first');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) fail(401, 'Your session has expired. Please sign in again.');
  const { rows } = await pool.query(
    `SELECT p.id, p.email, p.full_name, p.role, p.school_id, s.name AS school_name
       FROM profiles p LEFT JOIN schools s ON s.id = p.school_id WHERE p.id = $1`, [data.user.id]);
  if (!rows[0]) fail(403, 'This account has not been given access yet. Contact the administrator.');
  req.user = rows[0];
  next();
});

const requireAdmin = (req, res, next) => (req.user?.role === 'admin'
  ? next() : res.status(403).json({ error: 'Administrator access required' }));

function assertCanEdit(req, id) {
  if (req.user.role !== 'admin' && req.user.school_id !== id) fail(403, 'You can only update your own school');
}

// ---------- public read endpoints ----------
app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, auth: !!supabase });
}));

app.get('/api/schools', wrap(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT id, emis_code, name, district, level, learners, teachers,
           dist_to_road_m::float AS dist_to_road_m, dist_to_health_m::float AS dist_to_health_m,
           contact_name, contact_phone, photo_url, notes, updated_at,
           assessed_on, spi::float AS spi, spi_class, flood_level, rps::float AS rps,
           ST_AsGeoJSON(geom)::json AS geometry
    FROM school_status ORDER BY name`);
  res.json({ type: 'FeatureCollection', features: rows.map((r) => feature(r)) });
}));

app.get('/api/schools/:id/assessment', handle(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, compute_spi(a)::float AS spi FROM assessments a
      WHERE school_id = $1 ORDER BY assessed_on DESC, id DESC LIMIT 1`, [schoolId(req)]);
  if (rows[0]) delete rows[0].submitted_by;
  res.json(rows[0] || null);
}));

app.get('/api/schools/:id/history', handle(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, assessed_on, assessor, compute_spi(a)::float AS spi
       FROM assessments a WHERE school_id = $1 ORDER BY assessed_on, id`, [schoolId(req)]);
  res.json(rows);
}));

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
    pool.query(`SELECT id, name, district, spi::float AS spi, flood_level, learners, rps::float AS rps
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

app.get('/api/export.csv', wrap(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.emis_code, s.name, s.district, s.level, s.learners, s.teachers, s.dist_to_road_m, s.dist_to_health_m,
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

// ---------- signed-in endpoints ----------
app.get('/api/me', authenticate, (req, res) => res.json(req.user));

// Update school details. School users: their own school, limited fields. Admin: any school, all fields.
app.patch('/api/schools/:id', authenticate, handle(async (req, res) => {
  const id = schoolId(req);
  assertCanEdit(req, id);
  const b = req.body || {};
  const isAdmin = req.user.role === 'admin';

  const fields = {
    level: b.level === undefined ? undefined : (['primary', 'secondary'].includes(b.level) ? b.level : fail(400, 'Level must be primary or secondary')),
    learners: int(b.learners, 'Learners', 0, 20000),
    teachers: int(b.teachers, 'Teachers', 0, 1000),
    contact_name: text(b.contact_name, 'Contact person', 120),
    contact_phone: text(b.contact_phone, 'Phone', 40),
    notes: text(b.notes, 'Notes', 2000),
  };
  if (isAdmin) {
    Object.assign(fields, {
      name: text(b.name, 'School name', 200, { required: b.name !== undefined }),
      emis_code: text(b.emis_code, 'EMIS code', 40),
      district: text(b.district, 'District', 80, { required: b.district !== undefined }),
      dist_to_road_m: int(b.dist_to_road_m, 'Distance to road', 0, 200000),
      dist_to_health_m: int(b.dist_to_health_m, 'Distance to health facility', 0, 200000),
    });
  }
  if (fields.learners === null || fields.teachers === null) fail(400, 'Learners and teachers cannot be empty');

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
    `UPDATE schools SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
  if (!rowCount) fail(404, 'School not found');
  res.json({ ok: true });
}));

// Upload a school photo (base64 data URL, resized in the browser).
app.post('/api/schools/:id/photo', authenticate, handle(async (req, res) => {
  const id = schoolId(req);
  assertCanEdit(req, id);
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(req.body?.dataUrl || '');
  if (!m) fail(400, 'Please upload a JPG, PNG or WebP image');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 4 * 1024 * 1024) fail(400, 'Image is too large (max 4 MB)');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const path = `${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, buf, { contentType: m[1], upsert: false });
  if (error) { console.error(error); fail(500, 'Could not store the photo'); }
  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  await pool.query('UPDATE schools SET photo_url = $1, updated_at = now() WHERE id = $2', [url, id]);
  res.json({ photo_url: url });
}));

app.post('/api/schools/:id/assessments', authenticate, handle(async (req, res) => {
  const id = schoolId(req);
  assertCanEdit(req, id);
  const b = req.body || {};
  const pct = Number(b.teachers_trained_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail(400, 'Teachers trained must be 0-100%');
  const values = BINARY.map((k) => b[k] === true);
  const exists = await pool.query('SELECT 1 FROM schools WHERE id = $1', [id]);
  if (!exists.rowCount) fail(404, 'School not found');
  const assessor = (b.assessor || req.user.full_name || req.user.email || '').slice(0, 120) || null;

  const { rows } = await pool.query(
    `INSERT INTO assessments
       (school_id, assessed_on, assessor, ${BINARY.join(', ')}, teachers_trained_pct, notes, submitted_by)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, ${BINARY.map((_, i) => `$${i + 4}`).join(', ')},
             $${BINARY.length + 4}, $${BINARY.length + 5}, $${BINARY.length + 6})
     RETURNING id, compute_spi(assessments)::float AS spi`,
    [id, b.assessed_on || null, assessor, ...values, pct,
      (b.notes || '').slice(0, 1000) || null, req.user.id]);
  await pool.query('UPDATE schools SET updated_at = now() WHERE id = $1', [id]);
  res.status(201).json(rows[0]);
}));

// ---------- admin: schools ----------
app.post('/api/schools', authenticate, requireAdmin, handle(async (req, res) => {
  const b = req.body || {};
  const point = coords(b.lat, b.lon);
  if (!point) fail(400, 'Set the school location on the map');
  const { rows } = await pool.query(
    `INSERT INTO schools (name, emis_code, district, level, learners, teachers, dist_to_road_m, dist_to_health_m,
                          contact_name, contact_phone, notes, geom)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, ST_SetSRID(ST_MakePoint($12,$13),4326)) RETURNING id`,
    [text(b.name, 'School name', 200, { required: true }), text(b.emis_code ?? null, 'EMIS code', 40),
      text(b.district, 'District', 80, { required: true }),
      ['primary', 'secondary'].includes(b.level) ? b.level : 'primary',
      int(b.learners ?? 0, 'Learners', 0, 20000) ?? 0, int(b.teachers ?? 0, 'Teachers', 0, 1000) ?? 0,
      int(b.dist_to_road_m ?? null, 'Distance to road', 0, 200000),
      int(b.dist_to_health_m ?? null, 'Distance to health facility', 0, 200000),
      text(b.contact_name ?? null, 'Contact person', 120), text(b.contact_phone ?? null, 'Phone', 40),
      text(b.notes ?? null, 'Notes', 2000), point[0], point[1]]);
  res.status(201).json({ id: rows[0].id });
}));

app.delete('/api/schools/:id', authenticate, requireAdmin, handle(async (req, res) => {
  const id = schoolId(req);
  const users = await pool.query('SELECT COUNT(*)::int AS n FROM profiles WHERE school_id = $1', [id]);
  if (users.rows[0].n) fail(409, 'Delete or reassign this school\'s user accounts first');
  const { rowCount } = await pool.query('DELETE FROM schools WHERE id = $1', [id]);
  if (!rowCount) fail(404, 'School not found');
  res.json({ ok: true });
}));

// ---------- admin: user accounts ----------
app.get('/api/users', authenticate, requireAdmin, wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.email, p.full_name, p.role, p.school_id, s.name AS school_name, p.created_at
       FROM profiles p LEFT JOIN schools s ON s.id = p.school_id ORDER BY p.role, s.name NULLS FIRST, p.email`);
  res.json(rows);
}));

app.post('/api/users', authenticate, requireAdmin, handle(async (req, res) => {
  const b = req.body || {};
  const email = text(b.email, 'Email', 200, { required: true }).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email address');
  const password = String(b.password || '');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters');
  const role = b.role === 'admin' ? 'admin' : 'school';
  const sid = role === 'school' ? int(b.school_id, 'School', 1, 2147483647) : null;
  if (role === 'school' && !sid) fail(400, 'Choose the school this account belongs to');
  if (sid) {
    const s = await pool.query('SELECT 1 FROM schools WHERE id = $1', [sid]);
    if (!s.rowCount) fail(400, 'School not found');
  }
  const fullName = text(b.full_name ?? null, 'Name', 120);

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) fail(400, /already/i.test(error.message) ? 'An account with this email already exists' : error.message);
  try {
    await pool.query(
      'INSERT INTO profiles (id, email, full_name, role, school_id) VALUES ($1,$2,$3,$4,$5)',
      [data.user.id, email, fullName, role, sid]);
  } catch (e) {
    await supabase.auth.admin.deleteUser(data.user.id);
    throw e;
  }
  res.status(201).json({ id: data.user.id });
}));

app.patch('/api/users/:id', authenticate, requireAdmin, handle(async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters');
  const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password });
  if (error) fail(400, error.message);
  res.json({ ok: true });
}));

app.delete('/api/users/:id', authenticate, requireAdmin, handle(async (req, res) => {
  if (req.params.id === req.user.id) fail(400, 'You cannot delete your own account');
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) fail(400, error.message);
  await pool.query('DELETE FROM profiles WHERE id = $1', [req.params.id]);
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
  console.log(`API listening on :${port}`);
  ensurePhotoBucket().catch((e) => console.error(e));
});
