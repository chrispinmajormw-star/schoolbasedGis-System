// GIS spatial analysis tools (Lecture 8 - Vector spatial analysis): measurement, selection by attribute / location,
// classification, overlay, buffers, Thiessen polygons and nearest-facility distance. Everything runs in PostGIS on the
// real layers in the database; distances and areas are computed on the ellipsoid (geography) unless stated otherwise.

const FAC_TYPES = {
  school: 'Schools', health_facility: 'Health facilities', evacuation_centre: 'Evacuation centres', market: 'Markets',
  place_of_worship: 'Places of worship', community_hall: 'Community halls', water_point: 'Water points',
};
const FAC_FIELDS = [['name', 0], ['district', 0], ['ta', 0], ['type', 0], ['subtype', 0], ['people_served', 1], ['staff', 1],
  ['shelter_capacity', 1], ['spi', 1], ['spi_class', 0], ['flood_level', 1], ['rps', 1], ['dist_to_road_m', 1], ['dist_to_health_m', 1]]
  .map(([name, n]) => ({ name, numeric: !!n }));

// Categories for uploaded layers (Data import -> Other layers)
export const CATEGORIES = {
  river: 'Rivers', settlement: 'Settlements / villages', land_use: 'Land use', population: 'Population', other: 'Other',
};

const MAX_IN = 20000; // features read from one layer
const MAX_OUT = 5000; // features sent back to the map
const TABLE_ROWS = 500;

const NUM = (expr) => `(CASE WHEN ${expr} ~ '^ *-?[0-9]+([.][0-9]+)? *$' THEN (${expr})::float END)`;
const OPS = { '=': '=', '<>': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=', contains: 'ILIKE' };
const r2 = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const fmt = (n, d = 0) => (n === null || n === undefined ? 'n/a' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: d }));
const geo = (expr, kind) => (kind === 'point' ? `ST_AsGeoJSON(${expr}, 6)::json` : `ST_AsGeoJSON(ST_SimplifyPreserveTopology(${expr}, 0.0002), 5)::json`);
const kindOfType = (t) => (/point/i.test(t) ? 'point' : /line/i.test(t) ? 'line' : /polygon/i.test(t) ? 'polygon' : null);
const DIM = { point: 1, line: 2, polygon: 3 };

class Q { constructor() { this.v = []; } p(x) { this.v.push(x); return `$${this.v.length}`; } }

// Queries share one parameter list; send each query only the parameters it uses, renumbered $1..$n
function compact(sql, vals) {
  const used = [...new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const map = new Map(used.map((n, i) => [n, i + 1]));
  return [sql.replace(/\$(\d+)/g, (_, n) => `$${map.get(Number(n))}`), used.map((n) => vals[n - 1])];
}

export function registerGis(app, { pool, handle, fail, adminOnly, clip }) {
  // ---------- layer catalogue ----------
  async function catalogue(db) {
    const { rows: [c] } = await db.query(`
      SELECT (SELECT json_object_agg(facility_type, n) FROM (SELECT facility_type, COUNT(*)::int n FROM facility_status GROUP BY 1) t) AS fac,
             (SELECT COUNT(*)::int FROM roads) AS roads,
             (SELECT COUNT(*)::int FROM hazard_zones) AS zones,
             (SELECT COUNT(*)::int FROM admin_areas WHERE level = 'district') AS districts,
             (SELECT COUNT(*)::int FROM admin_areas WHERE level = 'ta') AS tas,
             (SELECT COUNT(*)::int FROM flood_reports WHERE status IN ('verified', 'resolved')) AS floods`);
    let custom = []; let customReady = true;
    try {
      ({ rows: custom } = await db.query(`
        SELECT l.id, l.name, l.category, l.geom_type, l.fields, (SELECT COUNT(*) FROM gis_features f WHERE f.layer_id = l.id)::int AS n
          FROM gis_layers l ORDER BY l.name`));
    } catch (e) {
      if (e.code !== '42P01') throw e; // table missing = migration 008 not run yet
      customReady = false;
    }
    const fac = c.fac || {};
    const L = [];
    const facBase = (type) => () => `SELECT id, name AS label, jsonb_strip_nulls(jsonb_build_object('name', name, 'type', facility_type,
        'district', district, 'ta', ta, 'subtype', subtype, 'people_served', people_served, 'staff', staff, 'shelter_capacity', shelter_capacity,
        'spi', spi, 'spi_class', spi_class, 'flood_level', flood_level, 'rps', rps, 'dist_to_road_m', dist_to_road_m,
        'dist_to_health_m', dist_to_health_m)) AS props, geom FROM facility_status${type ? ` WHERE facility_type = '${type}'` : ''}`;
    L.push({ key: 'facilities', name: 'All facilities', group: 'Facilities', kind: 'point', count: Object.values(fac).reduce((a, b) => a + b, 0), fields: FAC_FIELDS, base: facBase(null), missing: 'No facilities loaded yet. An administrator can import them under Data import → Facilities.' });
    Object.entries(FAC_TYPES).forEach(([t, name]) => L.push({
      key: `fac:${t}`, name, group: 'Facilities', kind: 'point', count: fac[t] || 0, fields: FAC_FIELDS, base: facBase(t),
      missing: `No ${name.toLowerCase()} loaded yet. An administrator can import them under Data import → Facilities.`,
    }));
    L.push({ key: 'roads', name: 'Roads', group: 'Base layers', kind: 'line', count: c.roads, fields: [{ name: 'name' }, { name: 'road_class' }],
      base: () => `SELECT id, COALESCE(name, road_class, 'Road') AS label, jsonb_strip_nulls(jsonb_build_object('name', name, 'road_class', road_class)) AS props, geom FROM roads`,
      missing: 'No roads loaded yet. An administrator can upload them under Data import → Roads.' });
    L.push({ key: 'flood_zones', name: 'Flood hazard zones', group: 'Base layers', kind: 'polygon', count: c.zones,
      fields: [{ name: 'level', numeric: true }, { name: 'level_name' }, { name: 'name' }],
      base: () => `SELECT id, COALESCE(name, CASE level WHEN 3 THEN 'High' WHEN 2 THEN 'Medium' ELSE 'Low' END || ' flood zone') AS label,
          jsonb_strip_nulls(jsonb_build_object('level', level, 'level_name', CASE level WHEN 3 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END, 'name', name)) AS props, geom FROM hazard_zones`,
      missing: 'No flood hazard zones loaded yet. An administrator can upload them under Data import → Flood zones.' });
    L.push({ key: 'districts', name: 'Districts', group: 'Base layers', kind: 'polygon', count: c.districts,
      fields: [{ name: 'name' }, { name: 'population', numeric: true }],
      base: () => `SELECT id, name AS label, jsonb_strip_nulls(jsonb_build_object('name', name, 'population', population)) AS props, geom FROM admin_areas WHERE level = 'district'`,
      missing: 'No district boundaries loaded yet. An administrator can upload them under Data import → Boundaries.' });
    L.push({ key: 'tas', name: 'Traditional Authorities', group: 'Base layers', kind: 'polygon', count: c.tas,
      fields: [{ name: 'name' }, { name: 'district' }, { name: 'population', numeric: true }],
      base: () => `SELECT id, name AS label, jsonb_strip_nulls(jsonb_build_object('name', name, 'district', district, 'population', population)) AS props, geom FROM admin_areas WHERE level = 'ta'`,
      missing: 'No Traditional Authority boundaries loaded yet. An administrator can upload them under Data import → Boundaries.' });
    L.push({ key: 'flood_history', name: 'Past floods (confirmed)', group: 'Base layers', kind: 'point', count: c.floods,
      fields: [{ name: 'event_name' }, { name: 'depth' }, { name: 'date' }],
      base: () => `SELECT id, COALESCE(event_name, 'Flood record') AS label, jsonb_strip_nulls(jsonb_build_object('event_name', event_name, 'depth', depth,
          'date', to_char(observed_at, 'YYYY-MM-DD'))) AS props, geom FROM flood_reports WHERE status IN ('verified', 'resolved')`,
      missing: 'No confirmed flood records yet. Record past floods on the Flood history page.' });
    custom.forEach((l) => {
      const fields = Array.isArray(l.fields) ? l.fields : [];
      const nameField = fields.find((f) => /^(name|nam|.*_name|.*name)$/i.test(f.name) && !f.numeric)?.name;
      L.push({
        key: `layer:${l.id}`, name: l.name, group: 'Uploaded layers', kind: l.geom_type, category: l.category, count: l.n, fields,
        base: (q) => `SELECT id, COALESCE(${nameField ? `NULLIF(props->>${q.p(nameField)}, '')` : 'NULL'}, '#' || id) AS label, props, geom
            FROM gis_features WHERE layer_id = ${Number(l.id)}`,
        missing: `The layer "${l.name}" is empty. Upload it again under Data import → Other layers.`,
      });
    });
    const have = new Set(custom.filter((l) => l.n > 0).map((l) => l.category));
    const missingCategories = Object.keys(CATEGORIES).filter((k) => k !== 'other' && !have.has(k));
    return { layers: L, byKey: new Map(L.map((l) => [l.key, l])), missingCategories, customReady };
  }

  const layerOf = (cat, key, role = 'Layer') => {
    const l = cat.byKey.get(String(key || ''));
    if (!l) fail(400, `${role}: choose a layer.`);
    if (!l.count) fail(400, l.missing);
    if (l.count > MAX_IN) fail(400, `${l.name} has ${fmt(l.count)} features, more than this tool can handle at once (${fmt(MAX_IN)}). Filter by district first.`);
    return l;
  };

  // WHERE clause from [{ field, op, value }] joined with AND / OR, optionally negated (NOT)
  function whereSql(q, layer, where) {
    const conds = (where?.conditions || []).filter((c) => c && c.field).slice(0, 6);
    if (!conds.length) return 'TRUE';
    const parts = conds.map((c) => {
      const f = layer.fields.find((x) => x.name === c.field) || fail(400, `"${c.field}" is not a field of ${layer.name}.`);
      const op = OPS[c.op] || fail(400, `Unknown operator "${c.op}".`);
      const col = `(l.props->>${q.p(f.name)})`;
      const raw = String(c.value ?? '').trim();
      if (c.op === 'contains') return `${col} ILIKE ${q.p(`%${raw}%`)}`;
      const num = Number(raw);
      if (raw !== '' && Number.isFinite(num) && (f.numeric || !['=', '<>'].includes(c.op))) return `${NUM(col)} ${op} ${q.p(num)}::float`;
      if (!['=', '<>'].includes(c.op)) fail(400, `${c.op} needs a number for ${f.name}.`);
      return `lower(${col}) ${op} lower(${q.p(raw)})`;
    });
    const joined = parts.join(where.join === 'or' ? ' OR ' : ' AND ');
    return where.not ? `NOT COALESCE((${joined}), FALSE)` : `COALESCE((${joined}), FALSE)`;
  }

  // Study area: a district (or TA) name. Uses the boundary polygon; falls back to the district field of facilities.
  async function areaInfo(db, area) {
    const name = String(area || '').trim();
    if (!name) return null;
    const { rows } = await db.query(`SELECT level FROM admin_areas WHERE lower(name) = lower($1) ORDER BY level = 'district' DESC LIMIT 1`, [name]);
    return { name, level: rows[0]?.level || null };
  }
  function areaSql(q, layer, area) {
    if (!area) return 'TRUE';
    if (area.level) return `ST_Intersects(l.geom, (SELECT ST_Union(geom) FROM admin_areas WHERE lower(name) = lower(${q.p(area.name)}) AND level = ${q.p(area.level)}))`;
    if (layer.fields.some((f) => f.name === 'district')) return `lower(l.props->>'district') = lower(${q.p(area.name)})`;
    return fail(400, `No boundary called "${area.name}". Upload district boundaries under Data import → Boundaries.`);
  }
  // Small lookup layers are computed once; big ones (roads, uploaded layers) stay inline so the spatial index is used
  // Merged (dissolved) buffers: one buffer of all features together, in UTM zone 36S metres, per distance
  const BUF = (dsP) => `buf AS (SELECT d.km, ST_Transform(ST_Buffer(ST_Collect(ST_Transform(a.geom, 32736)), d.km * 1000), 4326) g FROM a, unnest(${dsP}::float[]) d(km) GROUP BY d.km)`;
  const mat = (layer) => (layer.count > 2000 ? 'NOT MATERIALIZED' : 'MATERIALIZED');
  const layerSql = (q, layer, where, area) => `SELECT l.id, l.label, l.props, l.geom FROM (${layer.base(q)}) l WHERE ${whereSql(q, layer, where)} AND ${areaSql(q, layer, area)}`;

  // Features of another layer drawn for context (the zones used for a selection, the facilities that were buffered ...)
  async function ctxLayer(db, layer, where, area, name, role = 'reference', max = 3000) {
    if (!layer || layer.count > max * 3) return [];
    const q = new Q();
    const { rows } = await db.query(`WITH a AS MATERIALIZED (${layerSql(q, layer, where, area)})
      SELECT a.label, ${geo('a.geom', layer.kind)} AS geometry FROM a LIMIT ${max}`, q.v);
    return rows.length ? [{ name, role, kind: layer.kind, features: rows.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { name: r.label } })) }] : [];
  }
  const feat = (row, extra = {}) => ({ type: 'Feature', geometry: row.geometry, properties: { name: row.label, ...(row.props || {}), ...extra } });
  const table = (features, cols) => {
    const columns = cols || [...new Set(features.slice(0, 50).flatMap((f) => Object.keys(f.properties)))].slice(0, 14);
    return { columns, rows: features.slice(0, TABLE_ROWS).map((f) => columns.map((c) => f.properties[c] ?? '')), total: features.length };
  };
  const capped = (features, notes) => {
    if (features.length > MAX_OUT) notes.push(`Showing the first ${fmt(MAX_OUT)} of ${fmt(features.length)} features on the map.`);
    return features.slice(0, MAX_OUT);
  };
  // Fields worth adding up, best first (population before households, capacity ...)
  const sumFields = (layer) => {
    const rank = (n) => (/pop/i.test(n) ? 0 : /people|served/i.test(n) ? 1 : /household|hh/i.test(n) ? 2 : /capacity|total/i.test(n) ? 3 : 9);
    return layer.fields.filter((f) => f.numeric && rank(f.name) < 9).sort((a, b) => rank(a.name) - rank(b.name)).map((f) => f.name);
  };
  const describe = (layer, where, area, lower = false) => {
    const c = (where?.conditions || []).filter((x) => x.field);
    const w = c.length ? ` where ${where.not ? 'NOT (' : ''}${c.map((x) => `${x.field} ${x.op} ${x.value}`).join(where.join === 'or' ? ' OR ' : ' AND ')}${where.not ? ')' : ''}` : '';
    return `${lower ? layer.name.toLowerCase() : layer.name}${w}${area ? ` in ${area.name}` : ''}`;
  };

  // ---------- tools ----------
  const tools = {
    // Length / area / perimeter of a drawn shape or of a layer, and its bounding box
    async measure(db, cat, p) {
      const notes = [];
      if (p.geometry) {
        const g = p.geometry;
        if (!['LineString', 'Polygon'].includes(g?.type)) fail(400, 'Draw a line (distance) or a polygon (area) on the map.');
        if (JSON.stringify(g).length > 200000) fail(400, 'The drawn shape is too large.');
        const { rows: [m] } = await db.query(`WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) g)
          SELECT ST_Length(g::geography) / 1000 AS len, ST_Area(g::geography) / 1e6 AS area, ST_Perimeter(g::geography) / 1000 AS per,
                 ST_NPoints(g) AS n FROM g`, [JSON.stringify(g)]);
        const line = g.type === 'LineString';
        const f = { type: 'Feature', geometry: g, properties: line ? { length_km: r2(m.len) } : { area_km2: r2(m.area), area_ha: r2(m.area * 100), perimeter_km: r2(m.per) } };
        return {
          headline: line ? `Distance along the line: ${fmt(m.len, 2)} km` : `Area: ${fmt(m.area, 2)} km² (${fmt(m.area * 100, 0)} ha), perimeter ${fmt(m.per, 2)} km`,
          summary: line ? [['Length', `${fmt(m.len, 2)} km`], ['Vertices', m.n]] : [['Area', `${fmt(m.area, 2)} km²`], ['Hectares', fmt(m.area * 100, 1)], ['Perimeter', `${fmt(m.per, 2)} km`]],
          layers: [{ name: 'Drawn shape', role: 'result', kind: line ? 'line' : 'polygon', features: [f] }], table: table([f]), notes,
        };
      }
      const layer = layerOf(cat, p.layer); const area = await areaInfo(db, p.area); const q = new Q();
      const { rows } = await db.query(`WITH a AS MATERIALIZED (${layerSql(q, layer, p.where, area)})
        SELECT a.id, a.label, a.props, ST_Length(a.geom::geography) / 1000 AS len, ST_Area(a.geom::geography) / 1e6 AS area,
               ST_Perimeter(a.geom::geography) / 1000 AS per, ${geo('a.geom', layer.kind)} AS geometry FROM a`, q.v);
      if (!rows.length) fail(400, `No ${describe(layer, p.where, area)} found.`);
      const { rows: [bb] } = await db.query(`WITH a AS MATERIALIZED (${layerSql(q, layer, p.where, area)}), e AS (SELECT ST_SetSRID(ST_Extent(geom)::geometry, 4326) g FROM a)
        SELECT ST_XMin(g) x1, ST_YMin(g) y1, ST_XMax(g) x2, ST_YMax(g) y2,
               ST_Distance(ST_SetSRID(ST_MakePoint(ST_XMin(g), (ST_YMin(g) + ST_YMax(g)) / 2), 4326)::geography, ST_SetSRID(ST_MakePoint(ST_XMax(g), (ST_YMin(g) + ST_YMax(g)) / 2), 4326)::geography) / 1000 AS w,
               ST_Distance(ST_SetSRID(ST_MakePoint(ST_XMin(g), ST_YMin(g)), 4326)::geography, ST_SetSRID(ST_MakePoint(ST_XMin(g), ST_YMax(g)), 4326)::geography) / 1000 AS h FROM e`, q.v);
      const features = rows.map((r) => feat(r, layer.kind === 'line' ? { length_km: r2(r.len) } : layer.kind === 'polygon' ? { area_km2: r2(r.area), perimeter_km: r2(r.per) } : {}));
      const tLen = rows.reduce((s, r) => s + r.len, 0); const tArea = rows.reduce((s, r) => s + r.area, 0);
      const box = { type: 'Feature', properties: { name: 'Bounding box', width_km: r2(bb.w), height_km: r2(bb.h) }, geometry: { type: 'Polygon', coordinates: [[[bb.x1, bb.y1], [bb.x2, bb.y1], [bb.x2, bb.y2], [bb.x1, bb.y2], [bb.x1, bb.y1]]] } };
      const what = describe(layer, p.where, area);
      return {
        headline: layer.kind === 'line' ? `${what}: ${fmt(rows.length)} features, total length ${fmt(tLen, 1)} km`
          : layer.kind === 'polygon' ? `${what}: ${fmt(rows.length)} areas, total ${fmt(tArea, 1)} km²` : `${what}: ${fmt(rows.length)} points, spread over ${fmt(bb.w, 0)} × ${fmt(bb.h, 0)} km`,
        summary: [['Features', fmt(rows.length)],
          ...(layer.kind === 'line' ? [['Total length', `${fmt(tLen, 1)} km`], ['Longest', `${fmt(Math.max(...rows.map((r) => r.len)), 2)} km`]] : []),
          ...(layer.kind === 'polygon' ? [['Total area', `${fmt(tArea, 1)} km²`], ['Largest', `${fmt(Math.max(...rows.map((r) => r.area)), 1)} km²`]] : []),
          ['Bounding box', `${fmt(bb.w, 1)} × ${fmt(bb.h, 1)} km`]],
        layers: [{ name: 'Bounding box', role: 'context', kind: 'polygon', features: [box] }, { name: layer.name, role: 'result', kind: layer.kind, features: capped(features, notes) }],
        table: table(features.sort((a, b) => (b.properties.area_km2 ?? b.properties.length_km ?? 0) - (a.properties.area_km2 ?? a.properties.length_km ?? 0))), notes,
      };
    },

    // Selection by attribute and/or by location (intersects, within, touches, within distance, farther than, outside)
    async select(db, cat, p) {
      const layer = layerOf(cat, p.layer); const area = await areaInfo(db, p.area); const q = new Q(); const notes = [];
      const loc = p.location?.relation ? p.location : null;
      let locSql = 'TRUE'; let nearestSel = 'NULL::float'; let ref = null; let bSql = '';
      if (loc) {
        ref = layerOf(cat, loc.layer, 'Reference layer');
        bSql = layerSql(q, ref, loc.where, null);
        const d = Number(loc.distance_km);
        if (['within_distance', 'farther_than'].includes(loc.relation) && !(d > 0 && d <= 200)) fail(400, 'Enter a distance between 0 and 200 km.');
        const dm = q.p(d * 1000); const deg = q.p(d / 90);
        const near = `EXISTS (SELECT 1 FROM b WHERE b.geom && ST_Expand(a.geom, ${deg}::float) AND ST_DWithin(a.geom::geography, b.geom::geography, ${dm}::float))`;
        locSql = {
          intersects: 'EXISTS (SELECT 1 FROM b WHERE ST_Intersects(a.geom, b.geom))',
          within: 'EXISTS (SELECT 1 FROM b WHERE ST_Within(a.geom, b.geom))',
          touches: 'EXISTS (SELECT 1 FROM b WHERE ST_Touches(a.geom, b.geom))',
          outside: 'NOT EXISTS (SELECT 1 FROM b WHERE ST_Intersects(a.geom, b.geom))',
          within_distance: near, farther_than: `NOT ${near}`,
        }[loc.relation] || fail(400, 'Unknown spatial relation.');
        if (['within_distance', 'farther_than'].includes(loc.relation)) {
          nearestSel = `(SELECT MIN(ST_Distance(a.geom::geography, n.geom::geography)) / 1000 FROM (SELECT b.geom FROM b ORDER BY b.geom <-> a.geom LIMIT 5) n)`;
        }
      }
      const aSql = layerSql(q, layer, p.where, area);
      const { rows } = await db.query(`WITH a AS MATERIALIZED (${aSql})${loc ? `, b AS ${mat(ref)} (${bSql})` : ''},
          sel AS (SELECT a.* FROM a WHERE ${locSql})
        SELECT sel.id, sel.label, sel.props, ${nearestSel.replaceAll('a.geom', 'sel.geom')} AS nearest_km, ${geo('sel.geom', layer.kind)} AS geometry
          FROM sel`, q.v);
      const { rows: [tot] } = await db.query(`WITH a AS MATERIALIZED (${layerSql(q, layer, null, area)}) SELECT COUNT(*)::int n FROM a`, q.v);
      const features = rows.map((r) => feat(r, r.nearest_km === null || r.nearest_km === undefined ? {} : { nearest_km: r2(r.nearest_km) }));
      const sums = sumFields(layer).map((f) => [f, features.reduce((s, x) => s + (Number(x.properties[f]) || 0), 0)]).filter(([, v]) => v > 0).map(([f, v]) => [`Total ${f.replaceAll('_', ' ')}`, fmt(v)]);
      const rel = loc ? ({ intersects: 'intersecting', within: 'inside', touches: 'adjacent to (touching)', outside: 'outside', within_distance: `within ${loc.distance_km} km of`, farther_than: `farther than ${loc.distance_km} km from` }[loc.relation]) : '';
      const what = `${describe(layer, p.where, area)}${loc ? ` ${rel} ${describe(ref, loc.where, null)}` : ''}`;
      const pct = tot.n ? (100 * rows.length) / tot.n : 0;
      return {
        headline: `${fmt(rows.length)} of ${fmt(tot.n)} ${layer.name.toLowerCase()} (${fmt(pct, 1)}%) match: ${what}.`,
        summary: [['Selected', fmt(rows.length)], ['Out of', fmt(tot.n)], ['Share', `${fmt(pct, 1)}%`], ...sums],
        layers: [...(loc ? await ctxLayer(db, ref, loc.where, null, describe(ref, loc.where, null)) : []),
          { name: `Selected ${layer.name.toLowerCase()}`, role: 'result', kind: layer.kind, features: capped(features, notes) }],
        table: table(features), notes,
      };
    },

    // Classification of a numeric field (equal interval, quantile, natural breaks) or of community flood risk
    async classify(db, cat, p) {
      const layer = layerOf(cat, p.layer); const area = await areaInfo(db, p.area); const q = new Q(); const notes = [];
      const k = Math.min(5, Math.max(2, Number(p.classes) || 3));
      const method = ['equal', 'quantile', 'natural'].includes(p.method) ? p.method : 'natural';
      const field = String(p.field || 'derived:risk');
      const floodX = '(SELECT COALESCE(MAX(h.level), 0) FROM hazard_zones h WHERE ST_Intersects(h.geom, a.geom))';
      const healthX = `(SELECT MIN(ST_Distance(a.geom::geography, h.geom::geography)) / 1000 FROM (SELECT f.geom FROM facilities f WHERE f.facility_type = 'health_facility' AND f.status = 'active' ORDER BY f.geom <-> a.geom LIMIT 5) h)`;
      const roadX = '(SELECT MIN(ST_Distance(a.geom::geography, r.geom::geography)) / 1000 FROM (SELECT r.geom FROM roads r ORDER BY r.geom <-> a.geom LIMIT 5) r)';
      let valueX; let extra = ''; let label = field;
      if (field === 'derived:risk') {
        const { rows: [has] } = await db.query(`SELECT EXISTS (SELECT 1 FROM hazard_zones) z, EXISTS (SELECT 1 FROM facilities WHERE facility_type = 'health_facility') h, EXISTS (SELECT 1 FROM roads) r`);
        if (!has.z) fail(400, 'Community risk needs flood hazard zones. Upload them under Data import → Flood zones.');
        if (!has.h) notes.push('No health facilities loaded: distance to health care is left out of the risk score.');
        if (!has.r) notes.push('No roads loaded: distance to a road is left out of the risk score.');
        extra = `, ${floodX} AS flood_level_x, ${healthX} AS dist_health_km, ${roadX} AS dist_road_km`;
        valueX = null; label = 'Community flood risk score (0-100)';
      } else if (field === 'derived:flood_level') { valueX = floodX; label = 'Flood hazard level (0 none - 3 high)'; } else if (field === 'derived:dist_health_km') { valueX = healthX; label = 'Distance to nearest health facility (km)'; } else if (field === 'derived:dist_road_km') { valueX = roadX; label = 'Distance to nearest road (km)'; } else if (field === 'derived:area_km2') { valueX = 'ST_Area(a.geom::geography) / 1e6'; label = 'Area (km²)'; } else if (field === 'derived:length_km') { valueX = 'ST_Length(a.geom::geography) / 1000'; label = 'Length (km)'; } else {
        const f = layer.fields.find((x) => x.name === field && x.numeric) || fail(400, `Choose a numeric field of ${layer.name} to classify.`);
        valueX = NUM(`(a.props->>${q.p(f.name)})`); label = f.name;
      }
      const aSql = layerSql(q, layer, p.where, area);
      const { rows } = await db.query(`WITH a AS MATERIALIZED (${aSql})
        SELECT a.id, a.label, a.props, ${valueX || 'NULL::float'} AS v ${extra}, ${geo('a.geom', layer.kind)} AS geometry FROM a`, q.v);
      if (!rows.length) fail(400, `No ${describe(layer, p.where, area)} found.`);
      if (field === 'derived:risk') {
        rows.forEach((r) => {
          const h = r.dist_health_km === null ? 0 : Math.min(r.dist_health_km, 10) / 10;
          const d = r.dist_road_km === null ? 0 : Math.min(r.dist_road_km, 10) / 10;
          r.v = Math.round(100 * (0.5 * (r.flood_level_x / 3) + 0.25 * h + 0.25 * d));
        });
      }
      const vals = rows.map((r) => r.v).filter((v) => v !== null && Number.isFinite(v));
      if (vals.length < 2) fail(400, `Only ${vals.length} of ${layer.name.toLowerCase()} ${vals.length === 1 ? 'has' : 'have'} a value for ${label}; at least 2 are needed to classify. Load more features (Data import) or choose another layer.`);
      const br = field === 'derived:risk' && p.method === 'fixed' ? [33, 66].slice(0, k - 1) : breaks(vals, method, k);
      const names = LABELS[k];
      const lo = Math.min(...vals); const hi = Math.max(...vals);
      const bounds = names.map((_, i) => [i === 0 ? lo : br[i - 1], i === k - 1 ? hi : br[i]]);
      const sf = sumFields(layer)[0];
      const counts = names.map(() => ({ n: 0, sum: 0 }));
      const features = rows.map((r) => {
        const cls = r.v === null ? null : br.filter((b) => r.v > b).length;
        if (cls !== null) { counts[cls].n += 1; if (sf) counts[cls].sum += Number(r.props?.[sf]) || 0; }
        return feat(r, {
          value: r2(r.v), class: cls === null ? null : cls + 1, class_label: cls === null ? 'No data' : names[cls],
          ...(field === 'derived:risk' ? { flood_level: r.flood_level_x, dist_health_km: r2(r.dist_health_km), dist_road_km: r2(r.dist_road_km) } : {}),
        });
      });
      let layers = [{ name: `${layer.name} by class`, role: 'classes', kind: layer.kind, classes: k, features: capped(features, notes) }];
      if (p.dissolve && layer.kind === 'polygon') {
        const ids = []; const cls = [];
        features.forEach((f, i) => { if (f.properties.class) { ids.push(rows[i].id); cls.push(f.properties.class); } });
        const q2 = new Q(); const a2 = layerSql(q2, layer, p.where, area);
        const { rows: dis } = await db.query(`WITH a AS MATERIALIZED (${a2}), c AS (SELECT * FROM unnest(${q2.p(ids)}::int[], ${q2.p(cls)}::int[]) AS t(id, cls))
          SELECT c.cls, COUNT(*)::int n, ST_Area(ST_Union(a.geom)::geography) / 1e6 AS area, ${geo('ST_Union(a.geom)', 'polygon')} AS geometry
            FROM a JOIN c ON c.id = a.id GROUP BY c.cls ORDER BY c.cls`, q2.v);
        layers = [{ name: 'Dissolved classes', role: 'classes', kind: 'polygon', classes: k,
          features: dis.map((d) => ({ type: 'Feature', geometry: d.geometry, properties: { name: names[d.cls - 1], class: d.cls, class_label: names[d.cls - 1], areas: d.n, area_km2: r2(d.area) } })) }];
      }
      const legend = names.map((n, i) => ({ class: i + 1, label: n, from: r2(bounds[i][0]), to: r2(bounds[i][1]), count: counts[i].n, ...(sf ? { [sf]: counts[i].sum } : {}) }));
      const top = names.length - 1;
      return {
        headline: `${describe(layer, p.where, area)} classified by ${label} (${method === 'natural' ? 'natural breaks' : method === 'equal' ? 'equal interval' : 'quantile'}, ${k} classes): ${fmt(counts[top].n)} in "${names[top]}".`,
        summary: legend.map((c) => [`${c.label} (${fmt(c.from, 1)}–${fmt(c.to, 1)})`, `${fmt(c.count)}${sf ? ` · ${fmt(c[sf])} ${sf.replaceAll('_', ' ')}` : ''}`]),
        legend, layers, notes,
        table: table([...features].sort((a, b) => (b.properties.value ?? -1) - (a.properties.value ?? -1)), ['name', 'value', 'class_label', ...(field === 'derived:risk' ? ['flood_level', 'dist_health_km', 'dist_road_km'] : []), ...(sf ? [sf] : []), ...(layer.fields.some((f) => f.name === 'district') ? ['district'] : [])]),
      };
    },

    // Overlay: intersect, clip, erase (with a polygon layer) and dissolve (merge features by a field)
    async overlay(db, cat, p) {
      const op = p.op; const layer = layerOf(cat, p.layer); const area = await areaInfo(db, p.area); const q = new Q(); const notes = [];
      const aSql = layerSql(q, layer, p.where, area);
      const measureX = (g, kind) => (kind === 'polygon' ? `ST_Area(${g}::geography) / 1e6` : kind === 'line' ? `ST_Length(${g}::geography) / 1000` : 'NULL::float');
      const mKey = layer.kind === 'polygon' ? 'area_km2' : layer.kind === 'line' ? 'length_km' : null;
      if (op === 'dissolve') {
        const f = p.field ? (layer.fields.find((x) => x.name === p.field) || fail(400, `"${p.field}" is not a field of ${layer.name}.`)) : null;
        const sums = layer.fields.filter((x) => x.numeric && x.name !== f?.name && !/spi|rps|level|dist|class|order|^id$|lat|lon/i.test(x.name)).slice(0, 4);
        const { rows } = await db.query(`WITH a AS MATERIALIZED (${aSql})
          SELECT ${f ? `COALESCE(a.props->>${q.p(f.name)}, '(blank)')` : "'All features'"} AS grp, COUNT(*)::int AS n,
                 ${sums.map((s) => `SUM(${NUM(`(a.props->>${q.p(s.name)})`)}) AS "s_${s.name.replace(/"/g, '')}"`).join(', ')}${sums.length ? ',' : ''}
                 ${measureX('ST_Union(a.geom)', layer.kind)} AS m, ${geo('ST_Union(a.geom)', layer.kind)} AS geometry
            FROM a GROUP BY 1 ORDER BY n DESC LIMIT 2000`, q.v);
        if (!rows.length) fail(400, `No ${describe(layer, p.where, area)} found.`);
        const features = rows.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: {
          name: r.grp, ...(f ? { [f.name]: r.grp } : {}), features: r.n, ...(mKey ? { [mKey]: r2(r.m) } : {}),
          ...Object.fromEntries(sums.map((s) => [`sum_${s.name}`, r2(r[`s_${s.name.replace(/"/g, '')}`])])),
        } }));
        return {
          headline: `Dissolved ${fmt(rows.reduce((s, r) => s + r.n, 0))} ${layer.name.toLowerCase()} into ${fmt(rows.length)} ${f ? `groups by ${f.name}` : 'feature'}.`,
          summary: [['Input features', fmt(rows.reduce((s, r) => s + r.n, 0))], ['Output features', fmt(rows.length)], ...(mKey ? [[mKey === 'area_km2' ? 'Total area' : 'Total length', `${fmt(rows.reduce((s, r) => s + (r.m || 0), 0), 1)} ${mKey === 'area_km2' ? 'km²' : 'km'}`]] : [])],
          layers: [{ name: 'Dissolved', role: 'categories', kind: layer.kind, features }], table: table(features), notes,
        };
      }
      if (!['intersect', 'clip', 'erase'].includes(op)) fail(400, 'Choose intersect, clip, erase or dissolve.');
      const over = layerOf(cat, p.overlay, 'Overlay layer');
      if (over.kind !== 'polygon') fail(400, `${op[0].toUpperCase() + op.slice(1)} needs a polygon overlay layer (for example flood zones, districts or land use). ${over.name} is a ${over.kind} layer.`);
      const bSql = layerSql(q, over, p.overlay_where, null);
      const dim = DIM[layer.kind];
      let rows;
      if (op === 'intersect') {
        ({ rows } = await db.query(`WITH a AS MATERIALIZED (${aSql}), b AS ${mat(over)} (${bSql}),
            x AS (SELECT a.id, a.label, a.props, b.label AS b_label, b.props AS b_props,
                         CASE WHEN ST_Within(a.geom, b.geom) THEN a.geom ELSE ST_CollectionExtract(ST_Intersection(a.geom, b.geom), ${dim}) END AS g
                    FROM a JOIN b ON ST_Intersects(a.geom, b.geom))
          SELECT id, label, props, b_label, b_props, ${measureX('g', layer.kind)} AS m, ${geo('g', layer.kind)} AS geometry FROM x WHERE NOT ST_IsEmpty(g) LIMIT ${MAX_IN}`, q.v));
      } else {
        const g = op === 'clip'
          ? `CASE WHEN ${dim} = 1 OR ST_Within(a.geom, u.g) THEN a.geom ELSE ST_CollectionExtract(ST_Intersection(a.geom, u.g), ${dim}) END`
          : `CASE WHEN NOT ST_Intersects(a.geom, u.g) THEN a.geom WHEN ${dim} = 1 THEN NULL ELSE ST_CollectionExtract(ST_Difference(a.geom, u.g), ${dim}) END`;
        ({ rows } = await db.query(`WITH a AS MATERIALIZED (${aSql}), b AS (${bSql}),
            u AS (SELECT ST_Union(geom) AS g FROM b WHERE geom && (SELECT ST_SetSRID(ST_Extent(geom)::geometry, 4326) FROM a)),
            x AS (SELECT a.id, a.label, a.props, ${g} AS g FROM a, u WHERE ${op === 'clip' ? 'ST_Intersects(a.geom, u.g)' : 'TRUE'})
          SELECT id, label, props, ${measureX('g', layer.kind)} AS m, ${geo('g', layer.kind)} AS geometry FROM x WHERE g IS NOT NULL AND NOT ST_IsEmpty(g)
          UNION ALL SELECT a.id, a.label, a.props, ${measureX('a.geom', layer.kind)}, ${geo('a.geom', layer.kind)} FROM a, u WHERE u.g IS NULL AND ${op === 'erase' ? 'TRUE' : 'FALSE'}`, q.v));
      }
      const { rows: [tot] } = await db.query(`WITH a AS MATERIALIZED (${aSql}) SELECT COUNT(*)::int n, ${measureX('ST_Union(a.geom)', layer.kind)} m FROM a`, q.v);
      const slug = over.key.replace(/^.*:/, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 12);
      const features = rows.map((r) => feat(r, {
        ...(mKey ? { [mKey]: r2(r.m) } : {}),
        ...(r.b_props ? Object.fromEntries(Object.entries(r.b_props).map(([key, v]) => [`${slug}_${key}`, v])) : {}),
      }));
      const tm = rows.reduce((s, r) => s + (r.m || 0), 0);
      const verb = { intersect: 'intersecting', clip: 'clipped to', erase: 'with the area of' }[op];
      const ow = describe(over, p.overlay_where, null);
      return {
        headline: op === 'erase'
          ? `${describe(layer, p.where, area)} with ${ow} erased: ${fmt(features.length)} of ${fmt(tot.n)} features remain${mKey ? ` (${fmt(tm, 1)} of ${fmt(tot.m, 1)} ${mKey === 'area_km2' ? 'km²' : 'km'})` : ''}.`
          : `${describe(layer, p.where, area)} ${verb} ${ow}: ${fmt(features.length)} features${mKey ? `, ${fmt(tm, 1)} ${mKey === 'area_km2' ? 'km²' : 'km'} (${fmt(tot.m ? (100 * tm) / tot.m : 0, 1)}% of the input)` : ` (${fmt(tot.n ? (100 * new Set(rows.map((r) => r.id)).size) / tot.n : 0, 1)}% of ${fmt(tot.n)})`}.`,
        summary: [['Input features', fmt(tot.n)], ['Output features', fmt(features.length)],
          ...(mKey ? [[mKey === 'area_km2' ? 'Input area' : 'Input length', `${fmt(tot.m, 1)} ${mKey === 'area_km2' ? 'km²' : 'km'}`], [mKey === 'area_km2' ? 'Output area' : 'Output length', `${fmt(tm, 1)} ${mKey === 'area_km2' ? 'km²' : 'km'}`]] : []),
          ...sumFields(layer).slice(0, 1).map((f) => [`Total ${f.replaceAll('_', ' ')}`, fmt(features.reduce((s, x) => s + (Number(x.properties[f]) || 0), 0))])],
        layers: [...await ctxLayer(db, over, p.overlay_where, null, ow),
          { name: `${op[0].toUpperCase() + op.slice(1)} result`, role: 'result', kind: layer.kind, features: capped(features, notes) }],
        table: table(features), notes,
      };
    },

    // Buffers around facilities (zoned rings, merged or one per facility) and what lies inside them
    async buffer(db, cat, p) {
      const layer = layerOf(cat, p.layer); const area = await areaInfo(db, p.area); const q = new Q(); const notes = [];
      const ds = [...new Set((Array.isArray(p.distances_km) ? p.distances_km : String(p.distances_km || '').split(/[ ,;]+/)).map(Number).filter((d) => d > 0 && d <= 100))].sort((a, b) => a - b).slice(0, 4);
      if (!ds.length) fail(400, 'Enter a buffer distance in km (for example 2, or 1,2,5 for zones).');
      const aSql = layerSql(q, layer, p.where, area);
      const { rows: [{ n: nA }] } = await db.query(`WITH a AS MATERIALIZED (${aSql}) SELECT COUNT(*)::int n FROM a`, q.v);
      if (!nA) fail(400, `No ${describe(layer, p.where, area)} found.`);
      const dissolve = p.dissolve !== false;
      if (!dissolve && nA * ds.length > 3000) fail(400, `That is ${fmt(nA * ds.length)} separate buffers. Tick "Merge (dissolve) buffers" or filter by district.`);
      const dsP = q.p(ds);
      const bufRows = dissolve
        ? (await db.query(`WITH a AS MATERIALIZED (${aSql}), ${BUF(dsP)}
            SELECT km, ST_Area(g::geography) / 1e6 AS area, ${geo('COALESCE(ST_Difference(g, LAG(g) OVER (ORDER BY km)), g)', 'polygon')} AS geometry FROM buf ORDER BY km`, q.v)).rows
        : (await db.query(`WITH a AS MATERIALIZED (${aSql}), x AS (SELECT a.label, d.km, ST_Transform(ST_Buffer(ST_Transform(a.geom, 32736), d.km * 1000), 4326) g FROM a, unnest(${dsP}::float[]) d(km))
             SELECT label, km, ST_Area(g::geography) / 1e6 AS area, ${geo('g', 'polygon')} AS geometry FROM x ORDER BY km DESC`, q.v)).rows;
      const rings = bufRows.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { name: r.label ? `${r.label} · ${r.km} km` : `Within ${r.km} km`, distance_km: r.km, area_km2: r2(r.area) } }));
      const layers = [{ name: `${ds.join(', ')} km buffers`, role: 'rings', kind: 'polygon', features: rings }];
      const summary = [[`${layer.name}`, fmt(nA)], ...(dissolve ? bufRows.map((r) => [`Area within ${r.km} km`, `${fmt(r.area, 1)} km²`]) : [])];
      let headline = `${ds.join(', ')} km buffer${ds.length > 1 ? 's' : ''} around ${fmt(nA)} ${describe(layer, p.where, area, true)}${dissolve ? `: ${fmt(bufRows[bufRows.length - 1].area, 0)} km² covered` : ''}.`;
      let tbl = table(rings);
      if (p.target) {
        const target = layerOf(cat, p.target, 'Layer to count'); const max = ds[ds.length - 1];
        const tSql = layerSql(q, target, p.target_where, area);
        const sf = p.sum_field ? (target.fields.find((f) => f.name === p.sum_field && f.numeric) || fail(400, `Choose a numeric field of ${target.name} to add up.`)).name : sumFields(target)[0];
        const sfP = sf ? q.p(sf) : null;
        const valX = sf ? NUM(`(t.props->>${sfP})`) : 'NULL::float';
        let tr;
        if (target.kind === 'polygon') {
          // Area-weighted: a polygon's value counts in proportion to the share of its area inside the buffer
          tr = (await db.query(`WITH a AS MATERIALIZED (${aSql}), t AS MATERIALIZED (${tSql}),
              ${BUF(dsP)},
              x AS (SELECT t.id, t.label, t.props, ${valX} AS val, b.km,
                           ST_Area(ST_Intersection(t.geom, b.g)::geography) / NULLIF(ST_Area(t.geom::geography), 0) AS share
                      FROM t JOIN buf b ON ST_Intersects(t.geom, b.g))
            SELECT x.*, CASE WHEN x.km = ${q.p(max)}::float THEN ${geo('t.geom', 'polygon')} END AS geometry FROM x JOIN t ON t.id = x.id`, q.v)).rows;
          const { rows: [{ n: nT, total }] } = await db.query(`WITH t AS (${tSql}) SELECT COUNT(*)::int n, SUM(${valX}) total FROM t`, q.v);
          ds.forEach((d) => {
            const inD = tr.filter((r) => r.km === d);
            const s = inD.reduce((acc, r) => acc + (r.val || 0) * (r.share || 0), 0);
            summary.push([`${target.name} touching ${d} km`, fmt(inD.length)]);
            if (sf) summary.push([`${sf.replaceAll('_', ' ')} within ${d} km (area-weighted)`, `≈ ${fmt(s)}${total ? ` (${fmt((100 * s) / total, 1)}%)` : ''}`]);
          });
          const last = tr.filter((r) => r.km === max);
          const s = last.reduce((acc, r) => acc + (r.val || 0) * (r.share || 0), 0);
          headline += sf ? ` About ${fmt(s)} ${sf.replaceAll('_', ' ')} live within ${max} km (estimated from ${target.name}, area-weighted, ${fmt(total ? (100 * s) / total : 0, 1)}% of ${fmt(total)}).`
            : ` ${fmt(last.length)} of ${fmt(nT)} ${target.name.toLowerCase()} lie partly within ${max} km.`;
          const tf = last.map((r) => feat(r, { share_inside_pct: r2(100 * (r.share || 0)), ...(sf ? { [`${sf}_inside`]: Math.round((r.val || 0) * (r.share || 0)) } : {}) }));
          layers.push({ name: `${target.name} within ${max} km`, role: 'targets', kind: 'polygon', features: capped(tf, notes) });
          tbl = table(tf.sort((a, b) => (b.properties.share_inside_pct || 0) - (a.properties.share_inside_pct || 0)));
        } else {
          tr = (await db.query(`WITH a AS MATERIALIZED (${aSql}), t AS MATERIALIZED (${tSql}),
              x AS (SELECT t.id, t.label, t.props, t.geom, ${valX} AS val,
                           (SELECT MIN(ST_Distance(t.geom::geography, n.geom::geography)) / 1000 FROM (SELECT a.geom FROM a ORDER BY a.geom <-> t.geom LIMIT 5) n) AS km
                      FROM t)
            SELECT id, label, props, val, km, CASE WHEN km <= ${q.p(max)}::float THEN ${geo('geom', target.kind)} END AS geometry FROM x`, q.v)).rows;
          const total = tr.reduce((s, r) => s + (r.val || 0), 0);
          ds.forEach((d) => {
            const inD = tr.filter((r) => r.km !== null && r.km <= d);
            summary.push([`${target.name} within ${d} km`, `${fmt(inD.length)} (${fmt(tr.length ? (100 * inD.length) / tr.length : 0, 1)}%)`]);
            if (sf) summary.push([`${sf.replaceAll('_', ' ')} within ${d} km`, fmt(inD.reduce((s, r) => s + (r.val || 0), 0))]);
          });
          const inside = tr.filter((r) => r.km !== null && r.km <= max);
          summary.push([`${target.name} outside ${max} km`, fmt(tr.length - inside.length)]);
          headline = `${fmt(inside.length)} of ${fmt(tr.length)} ${describe(target, p.target_where, area, true)} (${fmt(tr.length ? (100 * inside.length) / tr.length : 0, 1)}%) are within ${max} km of ${describe(layer, p.where, null, true)}${sf ? `, ${/pop/i.test(sf) ? 'home to' : 'with'} ${fmt(inside.reduce((s, r) => s + (r.val || 0), 0))} ${/pop/i.test(sf) ? 'people' : sf.replaceAll('_', ' ')} (of ${fmt(total)})` : ''}.`;
          const tf = inside.sort((a, b) => a.km - b.km).map((r) => feat(r, { distance_km: r2(r.km), zone_km: ds.find((d) => r.km <= d) }));
          layers.push({ name: `${target.name} within ${max} km`, role: 'targets', kind: target.kind, features: capped(tf, notes) });
          tbl = table(tf, ['name', 'distance_km', 'zone_km', ...(sf ? [sf] : []), ...(target.fields.some((f) => f.name === 'district') ? ['district'] : [])]);
        }
      }
      layers.push(...await ctxLayer(db, layer, p.where, area, describe(layer, p.where, area), 'sites'));
      return { headline, summary, layers, table: tbl, notes };
    },

    // Thiessen (Voronoi) polygons: the area closest to each facility, clipped to the boundary
    async thiessen(db, cat, p) {
      const layer = layerOf(cat, p.layer); const area = await areaInfo(db, p.area); const q = new Q(); const notes = [];
      if (layer.kind !== 'point') fail(400, 'Thiessen polygons need a point layer (for example health facilities or schools).');
      const aSql = layerSql(q, layer, p.where, null); // all facilities count, even across the border of the study area
      const { rows: [b] } = await db.query(`SELECT COUNT(*)::int n FROM admin_areas WHERE level = 'district'`);
      if (area && !area.level) fail(400, `No boundary called "${area.name}". Upload district boundaries under Data import → Boundaries.`);
      if (!b.n) notes.push('No district boundaries loaded: polygons are clipped to the area around the facilities instead.');
      const bnd = area ? `SELECT ST_Transform(ST_Union(geom), 32736) g FROM admin_areas WHERE lower(name) = lower(${q.p(area.name)}) AND level = ${q.p(area.level)}`
        : `SELECT ST_Transform(ST_Union(geom), 32736) g FROM admin_areas WHERE level = 'district'`;
      const base = `WITH a AS MATERIALIZED (${aSql}),
          pts AS (SELECT DISTINCT ON (ST_SnapToGrid(geom, 0.00001)) id, label, props, ST_Transform(geom, 32736) g FROM a),
          bnd0 AS (${bnd}),
          env AS (SELECT COALESCE((SELECT g FROM bnd0), (SELECT ST_Buffer(ST_ConvexHull(ST_Collect(g)), 5000) FROM pts)) g),
          vor AS (SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(g), 0, (SELECT ST_Buffer(ST_Envelope(g), 100000) FROM env)))).geom AS v FROM pts),
          cells AS (SELECT p.id, p.label, p.props, ST_CollectionExtract(ST_Intersection(vor.v, env.g), 3) AS g
                      FROM vor JOIN pts p ON ST_Intersects(vor.v, p.g) CROSS JOIN env WHERE ST_Intersects(vor.v, env.g))`;
      const { rows: [np] } = await db.query(`WITH a AS MATERIALIZED (${aSql}) SELECT COUNT(*)::int n FROM a`, q.v);
      if (np.n < 2) fail(400, `Thiessen polygons need at least 2 ${layer.name.toLowerCase()}; found ${np.n}.`);
      let target = null; let sf = null; let sql;
      if (p.target) {
        target = layerOf(cat, p.target, 'Layer to count');
        const tSql = layerSql(q, target, p.target_where, null);
        sf = p.sum_field ? (target.fields.find((f) => f.name === p.sum_field && f.numeric) || fail(400, `Choose a numeric field of ${target.name} to add up.`)).name : sumFields(target)[0];
        const valX = sf ? NUM(`(t.props->>${q.p(sf)})`) : 'NULL::float';
        // Points are counted in the cell they fall in; polygons (e.g. TA population) are shared by area
        const share = target.kind === 'polygon' ? ' * ST_Area(ST_Intersection(t.g, c.g)) / NULLIF(ST_Area(t.g), 0)' : '';
        sql = `${base}, tt AS (SELECT t.id, t.props, ST_Transform(t.geom, 32736) g FROM (${tSql}) t)
          SELECT c.id, c.label, c.props, ST_Area(c.g) / 1e6 AS area,
                 (SELECT COUNT(*) FROM tt t WHERE ST_Intersects(t.g, c.g))::int AS t_n,
                 (SELECT SUM(${valX}${share}) FROM tt t WHERE ST_Intersects(t.g, c.g)) AS t_sum,
                 ${geo('ST_Transform(c.g, 4326)', 'polygon')} AS geometry FROM cells c WHERE NOT ST_IsEmpty(c.g)`;
      } else {
        sql = `${base} SELECT c.id, c.label, c.props, ST_Area(c.g) / 1e6 AS area, ${geo('ST_Transform(c.g, 4326)', 'polygon')} AS geometry FROM cells c WHERE NOT ST_IsEmpty(c.g)`;
      }
      const { rows } = await db.query(sql, q.v);
      if (!rows.length) fail(400, 'No Thiessen polygons fall inside the study area.');
      const features = rows.map((r) => feat(r, {
        facility: r.label, area_km2: r2(r.area),
        ...(target ? { [`${target.name.toLowerCase()}_count`]: r.t_n, ...(sf ? { [`${sf}_served`]: Math.round(r.t_sum || 0) } : {}) } : {}),
      }));
      const areas = rows.map((r) => r.area).sort((x, y) => x - y);
      const big = rows.reduce((m, r) => (r.area > m.area ? r : m), rows[0]);
      const busiest = target && sf ? rows.reduce((m, r) => ((r.t_sum || 0) > (m.t_sum || 0) ? r : m), rows[0]) : null;
      const cols = ['facility', 'area_km2', ...(target ? [`${target.name.toLowerCase()}_count`, ...(sf ? [`${sf}_served`] : [])] : []), ...(layer.fields.some((f) => f.name === 'district') ? ['district'] : [])];
      return {
        headline: `${fmt(rows.length)} Thiessen polygons for ${describe(layer, p.where, null, true)}${area ? ` in ${area.name}` : ''}: on average each serves ${fmt(areas.reduce((s, a) => s + a, 0) / areas.length, 0)} km²; the largest is ${big.label} (${fmt(big.area, 0)} km²)${busiest ? `; ${busiest.label} serves the most ${sf.replaceAll('_', ' ')} (≈ ${fmt(busiest.t_sum)})` : ''}.`,
        summary: [['Polygons', fmt(rows.length)], ['Mean area', `${fmt(areas.reduce((s, a) => s + a, 0) / areas.length, 1)} km²`], ['Median area', `${fmt(areas[Math.floor(areas.length / 2)], 1)} km²`], ['Largest', `${fmt(big.area, 0)} km² · ${big.label}`],
          ...(target && target.kind !== 'polygon' ? [[`${target.name} counted`, fmt(rows.reduce((s, r) => s + (r.t_n || 0), 0))]] : []),
          ...(busiest ? [[`Most ${sf.replaceAll('_', ' ')} served`, `≈ ${fmt(busiest.t_sum)} · ${busiest.label}`]] : [])],
        layers: [{ name: 'Thiessen polygons', role: 'cells', kind: 'polygon', features: capped(features, notes), valueKey: busiest ? `${sf}_served` : 'area_km2' },
          ...await ctxLayer(db, layer, p.where, null, layer.name, 'sites')],
        table: table([...features].sort((x, y) => (y.properties[busiest ? `${sf}_served` : 'area_km2'] || 0) - (x.properties[busiest ? `${sf}_served` : 'area_km2'] || 0)), cols),
        notes: [...notes, 'Built from a Delaunay triangulation of the facilities (ST_VoronoiPolygons) in UTM zone 36S, so areas are in true km².'],
      };
    },

    // Distance from each feature to the nearest feature of another layer (minimal distance)
    async nearest(db, cat, p) {
      const layer = layerOf(cat, p.layer); const to = layerOf(cat, p.to, 'Nearest of'); const area = await areaInfo(db, p.area); const q = new Q(); const notes = [];
      const aSql = layerSql(q, layer, p.where, area); const bSql = layerSql(q, to, p.to_where, null);
      const same = layer.base(new Q()).split('FROM')[1] === to.base(new Q()).split('FROM')[1] ? 'b.id <> a.id' : 'TRUE';
      const { rows } = await db.query(`WITH a AS MATERIALIZED (${aSql}), b AS ${mat(to)} (${bSql})
        SELECT a.id, a.label, a.props, n.label AS n_label, n.km, ${geo('a.geom', layer.kind)} AS geometry,
               ST_AsGeoJSON(ST_MakeLine(ST_ClosestPoint(a.geom, n.geom), ST_ClosestPoint(n.geom, a.geom)), 6)::json AS line
          FROM a CROSS JOIN LATERAL (
            SELECT c.label, c.geom, ST_Distance(a.geom::geography, c.geom::geography) / 1000 AS km
              FROM (SELECT b.label, b.geom FROM b WHERE ${same} ORDER BY b.geom <-> a.geom LIMIT 5) c ORDER BY km LIMIT 1) n`, q.v);
      if (!rows.length) fail(400, `No ${describe(layer, p.where, area)} found.`);
      const th = Number(p.threshold_km) > 0 ? Number(p.threshold_km) : null;
      const ks = rows.map((r) => r.km).sort((x, y) => x - y);
      const mean = ks.reduce((s, k) => s + k, 0) / ks.length;
      const far = th ? rows.filter((r) => r.km > th).length : null;
      const features = rows.sort((x, y) => y.km - x.km).map((r) => feat(r, { nearest: r.n_label, distance_km: r2(r.km), ...(th ? { farther_than_threshold: r.km > th ? 'yes' : 'no' } : {}) }));
      const lines = rows.slice(0, 3000).map((r) => ({ type: 'Feature', geometry: r.line, properties: { name: `${r.label} → ${r.n_label}`, distance_km: r2(r.km) } }));
      const toName = describe(to, p.to_where, null, true);
      return {
        headline: `Distance from ${describe(layer, p.where, area, true)} to the nearest ${toName}: average ${fmt(mean, 2)} km, farthest ${fmt(ks[ks.length - 1], 1)} km (${rows[0].label})${th ? `; ${fmt(far)} (${fmt((100 * far) / rows.length, 1)}%) are more than ${th} km away` : ''}.`,
        summary: [['Features', fmt(rows.length)], ['Average', `${fmt(mean, 2)} km`], ['Median', `${fmt(ks[Math.floor(ks.length / 2)], 2)} km`], ['Farthest', `${fmt(ks[ks.length - 1], 2)} km`], ...(th ? [[`More than ${th} km`, fmt(far)]] : [])],
        layers: [...(to.kind === 'point' ? await ctxLayer(db, to, p.to_where, null, describe(to, p.to_where, null), 'sites') : []),
          { name: 'Links to nearest', role: 'links', kind: 'line', features: lines },
          { name: layer.name, role: 'distance', kind: layer.kind, features: capped(features, notes), threshold: th }],
        table: table(features, ['name', 'nearest', 'distance_km', ...(layer.fields.some((f) => f.name === 'district') ? ['district'] : [])]), notes,
      };
    },
  };

  async function run(tool, params) {
    const fn = tools[tool] || fail(400, 'Unknown tool.');
    const conn = await pool.connect();
    const db = { query: (sql, vals) => (vals ? conn.query(...compact(sql, vals)) : conn.query(sql)) };
    try {
      await db.query('BEGIN READ ONLY');
      await db.query("SET LOCAL statement_timeout = '90s'");
      const cat = await catalogue(db);
      const out = await fn(db, cat, params || {});
      await db.query('COMMIT');
      return { tool, params, ...out };
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      if (e.code === '57014') fail(400, 'This analysis took too long. Filter by district or choose fewer features, then try again.');
      if (e.code && /^(XX|22|42)/.test(e.code) && !e.status) { console.error('gis', tool, e.message); fail(400, `The analysis could not be completed: ${e.message.slice(0, 160)}`); }
      throw e;
    } finally {
      conn.release();
    }
  }

  // Simple per-IP limiter (analysis can be heavy)
  const hits = new Map();
  const limit = (req, max, windowMs) => {
    const now = Date.now(); const key = `${req.ip}:${max}`;
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) fail(429, 'Too many analyses in a short time. Please wait a minute.');
    list.push(now); hits.set(key, list);
  };

  app.get('/api/gis/layers', handle(async (_req, res) => {
    const cat = await catalogue(pool);
    const { rows } = await pool.query(`SELECT name, level FROM admin_areas ORDER BY level, name`);
    res.json({
      layers: cat.layers.map(({ base, missing, ...l }) => ({ ...l, missing: l.count ? null : missing })),
      missingCategories: cat.missingCategories.map((k) => ({ key: k, name: CATEGORIES[k] })),
      customReady: cat.customReady,
      areas: rows,
      ai: !!process.env.ANTHROPIC_API_KEY,
    });
  }));

  app.post('/api/gis/run', handle(async (req, res) => {
    limit(req, 40, 60 * 1000);
    const { tool, params } = req.body || {};
    res.json(await run(String(tool || ''), params));
  }));

  // "Ask": turn a question into one of the tools, then run it
  app.post('/api/gis/ask', handle(async (req, res) => {
    limit(req, 20, 60 * 1000);
    const question = String(req.body?.question || '').trim().slice(0, 400);
    if (question.length < 3) fail(400, 'Type a question, for example "schools within 5 km of health facilities".');
    const cat = await catalogue(pool);
    const { rows: areas } = await pool.query(`SELECT DISTINCT name FROM admin_areas WHERE level = 'district' UNION SELECT DISTINCT district FROM facilities`);
    const ctx = { cat, areas: areas.map((r) => r.name).filter(Boolean) };
    let plan = null; let by = 'rules';
    if (process.env.ANTHROPIC_API_KEY) {
      try { plan = await askClaude(question, ctx); by = 'ai'; } catch (e) { console.warn('AI ask failed, using rules:', e.message); }
    }
    if (!plan) plan = parseQuestion(question, ctx);
    if (plan.message) return res.json({ question, by, message: plan.message });
    try {
      const result = await run(plan.tool, plan.params);
      res.json({ question, by, explanation: plan.explanation, ...result, notes: [...(plan.notes || []), ...(result.notes || [])] });
    } catch (e) {
      if (e.status && e.status < 500) return res.json({ question, by, tool: plan.tool, params: plan.params, explanation: plan.explanation, message: e.message });
      throw e;
    }
  }));

  // ---------- uploaded layers (admin) ----------
  app.post('/api/import/layers', ...adminOnly, handle(async (req, res) => {
    const b = req.body || {};
    const name = clip(b.name, 80) || fail(400, 'Give the layer a name.');
    const category = Object.keys(CATEGORIES).includes(b.category) ? b.category : 'other';
    const kind = ['point', 'line', 'polygon'].includes(b.geom_type) ? b.geom_type : fail(400, 'Unknown geometry type.');
    const { rows } = await pool.query(
      `INSERT INTO gis_layers (name, category, geom_type, source) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, geom_type = EXCLUDED.geom_type, source = EXCLUDED.source, fields = '[]'
       RETURNING id`, [name, category, kind, clip(b.source, 200)]);
    await pool.query('DELETE FROM gis_features WHERE layer_id = $1', [rows[0].id]);
    res.status(201).json({ id: rows[0].id });
  }));

  app.post('/api/import/layers/:id/features', ...adminOnly, handle(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: [layer] } = await pool.query('SELECT id, geom_type FROM gis_layers WHERE id = $1', [id]);
    if (!layer) fail(404, 'Layer not found');
    const items = Array.isArray(req.body?.features) ? req.body.features : fail(400, 'Nothing to import');
    const want = { point: ['Point', 'MultiPoint'], line: ['LineString', 'MultiLineString'], polygon: ['Polygon', 'MultiPolygon'] }[layer.geom_type];
    let imported = 0; let skipped = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const f of items) {
        if (!want.includes(f?.geometry?.type)) { skipped += 1; continue; }
        const props = Object.fromEntries(Object.entries(f.properties || {}).slice(0, 40)
          .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
          .map(([k, v]) => [String(k).slice(0, 64), typeof v === 'string' ? v.slice(0, 200) : v]));
        await client.query(
          `INSERT INTO gis_features (layer_id, props, geom)
           SELECT $1, $2, g FROM (SELECT ST_MakeValid(ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($3)), 4326)) g) x
            WHERE NOT ST_IsEmpty(g)`, [id, props, JSON.stringify(f.geometry)]);
        imported += 1;
      }
      // Field list with "numeric" flags, from a sample of the features
      await client.query(`
        UPDATE gis_layers SET fields = COALESCE((
          SELECT json_agg(json_build_object('name', key, 'numeric', num) ORDER BY key) FROM (
            SELECT key, bool_and(value ~ '^ *-?[0-9]+([.][0-9]+)? *$') AS num
              FROM (SELECT props FROM gis_features WHERE layer_id = $1 LIMIT 3000) s, jsonb_each_text(s.props)
             WHERE value <> '' GROUP BY key) k), '[]') WHERE id = $1`, [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.status(201).json({ imported, skipped });
  }));

  app.delete('/api/import/layers/:id', ...adminOnly, handle(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM gis_layers WHERE id = $1', [Number(req.params.id)]);
    res.json({ deleted: rowCount });
  }));
}

// ---------- classification breaks ----------
const LABELS = {
  2: ['Low', 'High'], 3: ['Low', 'Medium', 'High'], 4: ['Low', 'Moderate', 'High', 'Very high'], 5: ['Very low', 'Low', 'Moderate', 'High', 'Very high'],
};

/** Upper class limits (k-1 values). */
export function breaks(values, method, k) {
  const v = [...values].sort((a, b) => a - b);
  const lo = v[0]; const hi = v[v.length - 1];
  if (method === 'equal') return Array.from({ length: k - 1 }, (_, i) => lo + ((i + 1) * (hi - lo)) / k);
  if (method === 'quantile') return Array.from({ length: k - 1 }, (_, i) => v[Math.min(v.length - 1, Math.floor(((i + 1) * v.length) / k) - 1)]);
  // Natural breaks (Jenks) on at most 1500 sampled values
  const s = v.length > 1500 ? Array.from({ length: 1500 }, (_, i) => v[Math.floor((i * v.length) / 1500)]) : v;
  return jenks(s, k);
}

function jenks(data, k) {
  const n = data.length;
  if (n <= k) return data.slice(0, k - 1);
  const lower = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) { lower[1][j] = 1; vari[1][j] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0; let s2 = 0; let w = 0; let va = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1; const val = data[i3 - 1];
      s2 += val * val; s1 += val; w += 1; va = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (vari[l][j] >= va + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = va + vari[i4][j - 1]; }
        }
      }
    }
    lower[l][1] = 1; vari[l][1] = va;
  }
  const out = new Array(k - 1);
  let kk = n;
  for (let j = k; j >= 2; j--) { const id = lower[kk][j] - 2; out[j - 2] = data[Math.max(0, id)]; kk = lower[kk][j] - 1; }
  return out;
}

// ---------- "Ask": rule-based question parser ----------
const FAC_WORDS = [
  [/\bschools?\b/, 'fac:school'],
  [/\b(hospitals?|clinics?|health( facilit(y|ies)| cent(re|er)s?| posts?)?|dispensar(y|ies))\b/, 'fac:health_facility'],
  [/\bmarkets?\b/, 'fac:market'],
  [/\b(evacuation( cent(re|er)s?| sites?)?|shelters?|camps?)\b/, 'fac:evacuation_centre'],
  [/\b(churche?s|church|mosques?|places? of worship)\b/, 'fac:place_of_worship'],
  [/\b(community halls?|halls?)\b/, 'fac:community_hall'],
  [/\b(water ?points?|boreholes?|wells?)\b/, 'fac:water_point'],
  [/\bfacilit(y|ies)\b/, 'facilities'],
  [/\broads?\b/, 'roads'],
  [/\b(flood(ed)?[ -]?(hazard )?(zones?|areas?|prone( areas?)?|plains?)|hazard (zones?|areas?|map))\b/, 'flood_zones'],
  [/\b(past floods?|flood (history|records?|events?)|floods? recorded)\b/, 'flood_history'],
  [/\bdistricts?\b/, 'districts'],
  [/\b(tas?|traditional authorit(y|ies))\b/, 'tas'],
];
const CAT_WORDS = {
  river: /\b(rivers?|streams?|water ?ways?|water ?bodies)\b/,
  settlement: /\b(settlements?|villages?|communit(y|ies)|households?|towns?|trading cent(re|er)s?)\b/,
  land_use: /\b(land ?use|land ?cover|farm ?land|crop ?land|agricultur\w*|forests?)\b/,
  population: /\b(population|people|residents|inhabitants)\b/,
};
const FIELD_WORDS = [
  [/\b(spi|preparedness( score| index)?)\b/, 'spi'],
  [/\b(people served|learners|pupils|enrol\w*|patients|catchment)\b/, 'people_served'],
  [/\b(population|people)\b/, 'population'],
  [/\bstaff\b/, 'staff'],
  [/\b(shelter capacity|capacity)\b/, 'shelter_capacity'],
  [/\b(flood level|hazard level)\b/, 'flood_level'],
  [/\b(risk priority|rps|priority score)\b/, 'rps'],
  [/\b(road distance|distance to (a |the )?road)\b/, 'dist_to_road_m'],
];
const CMP = [
  [/\b(at least|not less than|minimum of)\b|>=/, '>='], [/\b(at most|no more than|not more than|maximum of)\b|<=/, '<='],
  [/\b(below|less than|under|lower than|fewer than|smaller than)\b|</, '<'], [/\b(above|more than|over|greater than|higher than|bigger than|exceed\w*)\b|>/, '>'],
  [/\b(equal to|equals|is exactly)\b|=/, '='],
];

export function parseQuestion(question, { cat, areas }) {
  const s = ` ${question.toLowerCase().replace(/[?!]/g, ' ').replace(/\s+/g, ' ')} `;
  const notes = [];
  const has = (k) => { const l = cat.byKey.get(k); return l && l.count > 0; };
  // Layers mentioned, in the order they appear
  const found = [];
  const add = (key, idx, len, word) => { if (!found.some((f) => f.key === key || (idx >= f.idx && idx < f.idx + f.len))) found.push({ key, idx, len, word }); };
  cat.layers.filter((l) => l.group === 'Uploaded layers').forEach((l) => {
    const i = s.indexOf(` ${l.name.toLowerCase()}`); if (i >= 0 && l.name.length > 2) add(l.key, i, l.name.length + 1, l.name);
  });
  for (const [cKey, re] of Object.entries(CAT_WORDS)) {
    const m = s.match(re); if (!m) continue;
    const layer = cat.layers.find((l) => l.category === cKey && l.count > 0);
    if (layer) { add(layer.key, m.index, m[0].length, m[0]); continue; }
    if (cKey === 'settlement') { if (has('tas')) { add('tas', m.index, m[0].length, m[0]); notes.push('No settlements layer yet, so Traditional Authorities are used as communities.'); continue; } }
    if (cKey === 'population') continue; // handled below as a field to add up
    return { message: `There is no ${CATEGORIES[cKey].toLowerCase()} layer in the system yet. An administrator can upload one under Data import → Other layers (category "${CATEGORIES[cKey]}").` };
  }
  FAC_WORDS.forEach(([re, key]) => { const m = s.match(re); if (m) add(key, m.index, m[0].length, m[0]); });
  found.sort((a, b) => a.idx - b.idx);
  // "flood zones" inside "high flood zones" etc. Keep the order of appearance.
  const keys = found.map((f) => f.key);
  const missingLayer = keys.map((k) => cat.byKey.get(k)).find((l) => l && !l.count);
  if (missingLayer) return { message: missingLayer.missing };

  // Study area (district)
  const area = areas.find((a) => new RegExp(`\\b${a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s));
  // Distances
  const dm = s.match(/((?:\d+(?:\.\d+)?\s*(?:,|and|or|&)?\s*)+)\s*(km|kms|kilomet\w*|m|metres?|meters?)\b/);
  let dists = dm ? dm[1].split(/[^0-9.]+/).filter(Boolean).map(Number) : [];
  if (dm && /^m|^met/.test(dm[2])) dists = dists.map((d) => d / 1000);
  // Attribute conditions
  const conds = [];
  const layerFields = (key) => cat.byKey.get(key)?.fields || [];
  const condFor = (key) => {
    FIELD_WORDS.forEach(([re, field]) => {
      const m = s.match(new RegExp(`${re.source}\\s*(?:is|are|of|score|value|scores)?\\s*(?:${CMP.map(([c]) => c.source).join('|')})\\s*(\\d+(?:\\.\\d+)?)`));
      if (!m) return;
      const op = CMP.find(([c]) => c.test(m[0]))[1];
      let f = field;
      const fields = layerFields(key);
      if (f === 'population' && !fields.some((x) => x.name === 'population')) f = fields.some((x) => x.name === 'people_served') ? 'people_served' : (fields.find((x) => x.numeric && /pop/i.test(x.name))?.name || null);
      if (f && fields.some((x) => x.name === f)) conds.push({ field: f, op, value: m[m.length - 1] });
    });
    if (layerFields(key).some((x) => x.name === 'spi_class')) {
      if (/\b(low preparedness|poorly prepared|low spi)\b/.test(s)) conds.push({ field: 'spi_class', op: '=', value: 'low' });
      else if (/\b(not assessed|unassessed)\b/.test(s)) conds.push({ field: 'spi_class', op: '=', value: 'unassessed' });
      else if (/\b(well prepared|high preparedness)\b/.test(s)) conds.push({ field: 'spi_class', op: '=', value: 'high' });
    }
    return conds.length ? { conditions: conds, join: /\bor\b/.test(s.replace(/\d+\s*(or|and)\s*\d+/g, '')) && conds.length > 1 ? 'or' : 'and' } : undefined;
  };
  const zoneWhere = () => {
    const m = s.match(/\b(high|medium|moderate|low)(?:[- ]risk)?\s+flood/);
    if (!m) return undefined;
    return { conditions: [{ field: 'level', op: m[1] === 'high' ? '=' : m[1] === 'low' ? '=' : '=', value: { high: 3, medium: 2, moderate: 2, low: 1 }[m[1]] }] };
  };
  const pointKeys = keys.filter((k) => cat.byKey.get(k)?.kind === 'point');
  const first = keys[0]; const second = keys.find((k) => k !== first);
  const name = (k) => cat.byKey.get(k)?.name || k;
  const popTarget = () => {
    const c = cat.layers.find((l) => l.category === 'population' && l.count) || cat.layers.find((l) => l.category === 'settlement' && l.count && l.fields.some((f) => f.numeric && /pop/i.test(f.name)));
    if (c) return c.key;
    if (has('tas') && cat.byKey.get('tas').fields) return 'tas';
    if (has('districts')) return 'districts';
    return null;
  };
  const wantsPeople = /\b(people|population|residents|inhabitants|how many live)\b/.test(s);
  const plan = (tool, params, explanation) => ({ tool, params: { ...params, ...(area && !params.area && tool !== 'thiessen' ? { area } : {}) }, explanation, notes });

  // 1. Thiessen polygons / service areas
  if (/\b(thiessen|voronoi|service areas?|catchments?|served by|serves?|nearest[- ]facility areas?|area each)\b/.test(s)) {
    const src = pointKeys.find((k) => k.startsWith('fac:')) || pointKeys[0] || (has('fac:health_facility') ? 'fac:health_facility' : null);
    if (!src) return { message: 'Thiessen polygons need a point layer such as health facilities or schools. Say which, e.g. "Thiessen polygons for health facilities in Zomba".' };
    const tgt = wantsPeople ? popTarget() : keys.find((k) => k !== src);
    return plan('thiessen', { layer: src, area, ...(tgt ? { target: tgt } : {}) }, `Thiessen polygons for ${name(src)}${area ? ` in ${area}` : ''}${tgt ? `, counting ${name(tgt)}` : ''}.`);
  }
  // 2. Overlay
  const ov = s.match(/\b(dissolve|merge|clip|erase|intersect(ion)?|overlay)\b/);
  if (ov) {
    const op = /dissolve|merge/.test(ov[1]) ? 'dissolve' : /clip/.test(ov[1]) ? 'clip' : /erase/.test(ov[1]) ? 'erase' : 'intersect';
    if (!first) return { message: 'Say which layer to use, e.g. "clip roads to high flood zones" or "dissolve TAs by district".' };
    if (op === 'dissolve') {
      const fm = s.match(/\bby ([a-z_ ]+?)(?: in | for |$| )/);
      const f = fm ? cat.byKey.get(first).fields.find((x) => x.name.toLowerCase() === fm[1].trim().replace(/ /g, '_')) : null;
      return plan('overlay', { op, layer: first, ...(f ? { field: f.name } : {}) }, `Dissolve ${name(first)}${f ? ` by ${f.name}` : ''}.`);
    }
    const over = second || (has('flood_zones') ? 'flood_zones' : null);
    if (!over) return { message: `Say which polygon layer to ${op} with, e.g. "${op} roads with flood zones".` };
    return plan('overlay', { op, layer: first, overlay: over, ...(over === 'flood_zones' ? { overlay_where: zoneWhere() } : {}) }, `${op[0].toUpperCase() + op.slice(1)} ${name(first)} with ${name(over)}.`);
  }
  // 3. Classification
  if (/\b(classif\w*|reclassif\w*|risk levels?|risk class\w*|rank\w*|categori[sz]e|vulnerab\w*|at risk communit\w*|risk)\b/.test(s) && !/\bwithin\b/.test(s)) {
    const lay = first || (has('tas') ? 'tas' : null);
    if (!lay) return { message: 'Say what to classify, e.g. "classify TAs by flood risk" or "classify schools by SPI".' };
    const fields = layerFields(lay);
    const fw = FIELD_WORDS.find(([re, f]) => re.test(s) && fields.some((x) => x.name === f && x.numeric));
    let field = /\b(risk|vulnerab)/.test(s) ? 'derived:risk' : fw ? fw[1] : null;
    if (!field && /\barea|size\b/.test(s) && cat.byKey.get(lay).kind === 'polygon') field = 'derived:area_km2';
    if (!field && /distance to (a |the )?(health|hospital|clinic)/.test(s)) field = 'derived:dist_health_km';
    if (!field && /population|people/.test(s)) field = fields.find((x) => x.numeric && /pop|people/i.test(x.name))?.name || null;
    field = field || 'derived:risk';
    const k = Number((s.match(/\b(\d) (classes|levels|groups|categories)\b/) || [])[1]) || 3;
    const method = /quantile/.test(s) ? 'quantile' : /equal/.test(s) ? 'equal' : 'natural';
    return plan('classify', { layer: lay, field, classes: Math.min(5, Math.max(2, k)), method, where: condFor(lay) }, `Classify ${name(lay)} by ${field === 'derived:risk' ? 'community flood risk' : field.replace('derived:', '')} into ${k} classes.`);
  }
  // 4. Nearest / distance
  if (/\b(nearest|closest|how far|distance (from|to|between))\b/.test(s) && first) {
    const to = second || (first !== 'fac:health_facility' && has('fac:health_facility') ? 'fac:health_facility' : null);
    if (!to) return { message: 'Say what to measure the distance to, e.g. "distance from schools to the nearest health facility".' };
    const th = s.match(/(?:more than|over|beyond|farther than|further than)\s*(\d+(?:\.\d+)?)\s*km/);
    return plan('nearest', { layer: first, to, where: condFor(first), ...(th ? { threshold_km: Number(th[1]) } : {}) }, `Distance from each of ${name(first)} to the nearest ${name(to)}.`);
  }
  // 5. Buffers / within a distance
  if (dists.length && first && /\b(within|around|buffer|near|close to|radius|from|of|beyond|farther|further|outside|more than)\b/.test(s)) {
    const farther = /\b(beyond|farther than|further than|more than|over|outside)\s*\d/.test(s);
    if (farther) {
      const ref = second || (has('fac:health_facility') && first !== 'fac:health_facility' ? 'fac:health_facility' : null);
      if (!ref) return { message: 'Say what to measure from, e.g. "schools more than 5 km from a health facility".' };
      return plan('select', { layer: first, where: condFor(first), location: { relation: 'farther_than', layer: ref, distance_km: dists[0] } }, `Select ${name(first)} farther than ${dists[0]} km from ${name(ref)}.`);
    }
    // The layer to buffer is the one named after "around / of / from / near" (e.g. "2 km around clinics"); the other one is counted
    const after = found.filter((f) => /\b(around|of|from|near|to|close to|surrounding)\s+(an?\s+|the\s+|all\s+|each\s+|every\s+)?$/.test(s.slice(Math.max(0, f.idx - 25), f.idx + 1)));
    const around = (after[0] || found[found.length > 1 && !/\bbuffer\b/.test(s) ? 1 : 0]).key;
    const tgt = wantsPeople ? popTarget() : keys.find((k) => k !== around);
    const w = condFor(first); // conditions describe the first layer named ("schools with SPI below 40 within 5 km of clinics")
    return plan('buffer', { layer: around, distances_km: dists, dissolve: true, ...(around === first ? { where: w } : {}), ...(tgt ? { target: tgt, ...(tgt === first ? { target_where: w } : {}) } : {}) },
      `${dists.join(', ')} km buffer around ${name(around)}${tgt ? `; counting ${name(tgt)}${wantsPeople ? ' (people)' : ''} inside` : ''}.`);
  }
  // Neighbours of a named district / TA: "which districts are next to Zomba"
  if (area && (first === 'districts' || first === 'tas') && /\b(touch\w*|adjacent|next to|neighbou?r\w*|border\w*|share a border)\b/.test(s)) {
    return { tool: 'select', params: { layer: first, location: { relation: 'touches', layer: first, where: { conditions: [{ field: 'name', op: '=', value: area }] } } }, explanation: `Select ${name(first)} adjacent to ${area}.`, notes };
  }
  // 6. Measurement
  if (/\b(length|how long|area|how big|size|total km|kilomet\w* of|perimeter|extent|bounding box)\b/.test(s) && first) {
    return plan('measure', { layer: first, where: first === 'flood_zones' ? zoneWhere() : condFor(first) }, `Measure ${name(first)}.`);
  }
  // 7. Selection by location: in / inside / outside a polygon layer
  if (first && second && /\b(in|inside|within|located in|intersect\w*|cross\w*|outside|not in|touch\w*|adjacent|next to|border\w*)\b/.test(s)) {
    const ref = cat.byKey.get(second);
    const relation = /\b(outside|not in)\b/.test(s) ? 'outside' : /\b(touch\w*|adjacent|next to|border\w*)\b/.test(s) ? 'touches' : ref.kind === 'polygon' && cat.byKey.get(first).kind === 'point' ? 'within' : 'intersects';
    return plan('select', { layer: first, where: condFor(first), location: { relation, layer: second, ...(second === 'flood_zones' ? { where: zoneWhere() } : {}) } },
      `Select ${name(first)} ${relation === 'within' ? 'inside' : relation} ${name(second)}.`);
  }
  // 8. Selection by attribute
  if (first) {
    const w = first === 'flood_zones' ? zoneWhere() : condFor(first);
    return plan('select', { layer: first, where: w }, `Select ${name(first)}${w ? ' matching the conditions' : ''}${area ? ` in ${area}` : ''}.`);
  }
  return { message: 'I could not tell which layer you mean. Mention one, e.g. schools, health facilities, roads, flood zones, districts, TAs or an uploaded layer. Examples: "schools within 5 km of health facilities", "classify TAs by flood risk", "Thiessen polygons for health facilities in Zomba".' };
}

// ---------- "Ask" with Claude (optional: set ANTHROPIC_API_KEY on the server) ----------
async function askClaude(question, { cat, areas }) {
  const layers = cat.layers.map((l) => ({ key: l.key, name: l.name, kind: l.kind, count: l.count, fields: l.fields.map((f) => `${f.name}${f.numeric ? ' (number)' : ''}`) }));
  const system = `You turn a planner's question about Malawi community facilities into ONE spatial analysis call. Reply with JSON only.
Layers: ${JSON.stringify(layers)}
District / area names: ${JSON.stringify(areas.slice(0, 80))}
Missing layer categories (not uploaded): ${JSON.stringify(cat.missingCategories)}
where = {"conditions":[{"field","op":"= <> < <= > >= contains","value"}],"join":"and|or","not":false}
Tools and params:
- measure {layer, where?, area?}
- select {layer, where?, area?, location?: {relation: intersects|within|touches|outside|within_distance|farther_than, layer, where?, distance_km?}}
- classify {layer, where?, area?, field: a numeric field or derived:risk|derived:flood_level|derived:dist_health_km|derived:dist_road_km|derived:area_km2|derived:length_km, method: natural|quantile|equal, classes: 2-5, dissolve?}
- overlay {op: intersect|clip|erase|dissolve, layer, where?, area?, overlay?: polygon layer key, overlay_where?, field? (dissolve)}
- buffer {layer (features to buffer), distances_km: [numbers], dissolve: true, where?, area?, target?: layer to count inside, target_where?, sum_field?}
- thiessen {layer (points), where?, area?, target?, sum_field?}
- nearest {layer, to, where?, to_where?, area?, threshold_km?}
Use only layer keys and field names listed. For "how many people", use a layer with a population field as target. Flood zone level: 1 low, 2 medium, 3 high.
Answer {"tool":..., "params":{...}, "explanation":"one short sentence"} or, if the data needed is not in the system, {"message":"what is missing and where to upload it (Data import page)"}.`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 600, system, messages: [{ role: 'user', content: question }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const txt = j.content?.map((c) => c.text || '').join('') || '';
    const plan = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    if (plan.message) return { message: String(plan.message).slice(0, 400) };
    if (!['measure', 'select', 'classify', 'overlay', 'buffer', 'thiessen', 'nearest'].includes(plan.tool) || typeof plan.params !== 'object') throw new Error('bad plan');
    return { tool: plan.tool, params: plan.params, explanation: String(plan.explanation || '').slice(0, 300) };
  } finally {
    clearTimeout(t);
  }
}
