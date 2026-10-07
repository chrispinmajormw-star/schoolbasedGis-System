// Decision-support calculations, all done in the browser from data the API already serves.
import { classify } from './api.js';

// ---------- formatting ----------
export const fmtMwk = (n) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1e9) return `MK ${(n / 1e9).toFixed(1)}bn`;
  if (n >= 1e6) return `MK ${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `MK ${Math.round(n / 1e3)}k`;
  return `MK ${Math.round(n)}`;
};
export const fmtNum = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString());

// ---------- checklist gaps ----------
const score = (w, v) => (w.kind === 'percent' ? Math.min(Math.max(Number(v) || 0, 0), 100) / 100 : v ? 1 : 0);

/**
 * What is missing at one facility, largest SPI gain first.
 * gain = SPI points the facility gains if this item is fully in place.
 */
export function gapsFor(checklist, answers) {
  if (!checklist?.length || !answers) return [];
  const total = checklist.reduce((s, w) => s + w.weight, 0);
  return checklist
    .map((w) => {
      const have = score(w, answers[w.indicator]);
      const missing = 1 - have;
      return {
        indicator: w.indicator, label: w.label, domain: w.domain, kind: w.kind, action: w.action || w.label,
        current: answers[w.indicator], missing,
        gain: Math.round((1000 * w.weight * missing) / total) / 10,
        cost: w.cost_mwk === null || w.cost_mwk === undefined ? null : Math.round(w.cost_mwk * missing),
      };
    })
    .filter((g) => g.missing > 0.001)
    .sort((a, b) => b.gain - a.gain);
}

// Same Risk Priority Score formula as the database view
export function rpsFor(p, spi, maxPeople) {
  if (spi === null || spi === undefined) return null;
  const people = maxPeople ? p.people_served / maxPeople : 0;
  const road = 1 + (0.5 * Math.min(p.dist_to_road_m || 0, 10000)) / 10000;
  return Math.round(10 * (100 * (p.flood_level / 3) * (1 - spi / 100) * people * road) / 1.5) / 10;
}

export function maxPeopleByType(features) {
  const m = {};
  (features || []).forEach(({ properties: p }) => { m[p.facility_type] = Math.max(m[p.facility_type] || 0, p.people_served); });
  return m;
}

/** What-if: SPI, class and RPS after applying fixes ({ indicator: newValue }). */
export function simulate(p, checklist, answers, fixes, maxPeople) {
  const next = { ...(answers || {}), ...fixes };
  const total = checklist.reduce((s, w) => s + w.weight, 0);
  const spi = total ? Math.round((1000 * checklist.reduce((s, w) => s + w.weight * score(w, next[w.indicator]), 0)) / total) / 10 : 0;
  const cost = checklist.reduce((s, w) => {
    if (!(w.indicator in fixes) || w.cost_mwk == null) return s;
    const added = Math.max(0, score(w, fixes[w.indicator]) - score(w, answers?.[w.indicator]));
    return s + w.cost_mwk * added;
  }, 0);
  return { spi, cls: classify(spi), rps: rpsFor(p, spi, maxPeople), cost: Math.round(cost) };
}

// ---------- priority worklist ----------
export const EXPOSURE = [0.25, 0.5, 0.75, 1]; // weight by flood level 0..3

/**
 * Ranked worklist. Assessed facilities by RPS (then by low SPI in flood zones);
 * unassessed flood-zone facilities are flagged "assess first".
 */
export function worklist(features, checklists, answersById) {
  return (features || []).map(({ properties: p }) => {
    const gaps = gapsFor(checklists?.[p.facility_type], answersById?.[p.id]);
    const urgency = p.spi === null
      ? (p.flood_level ? 1000 + p.flood_level : -1)        // assess-first goes to its own group
      : (p.rps ?? 0) * 10 + (p.flood_level ? (100 - p.spi) / 100 : 0);
    return { p, gaps, urgency, gapCost: gaps.reduce((s, g) => s + (g.cost || 0), 0) };
  }).sort((a, b) => b.urgency - a.urgency);
}

/**
 * Budget planner: choose the actions that give the most preparedness benefit per kwacha.
 * benefit = SPI gain x flood exposure x people served (relative within the facility type).
 * Greedy by benefit / cost until the budget runs out (a standard knapsack heuristic).
 */
export function planBudget(features, checklists, answersById, budget, { district = 'all', type = 'all', floodOnly = false } = {}) {
  const maxP = maxPeopleByType(features);
  const pool = [];
  (features || []).forEach(({ properties: p }) => {
    if (p.spi === null) return;
    if (district !== 'all' && p.district !== district) return;
    if (type !== 'all' && p.facility_type !== type) return;
    if (floodOnly && !p.flood_level) return;
    const peopleRel = maxP[p.facility_type] ? p.people_served / maxP[p.facility_type] : 0;
    gapsFor(checklists?.[p.facility_type], answersById?.[p.id]).forEach((g) => {
      if (!g.cost) return;
      const benefit = g.gain * EXPOSURE[p.flood_level || 0] * (0.5 + 0.5 * peopleRel);
      pool.push({ ...g, facility: p, benefit, ratio: benefit / g.cost });
    });
  });
  pool.sort((a, b) => b.ratio - a.ratio);

  const chosen = []; let spent = 0;
  for (const item of pool) {
    if (spent + item.cost > budget) continue;
    chosen.push(item); spent += item.cost;
  }

  // Effect per facility
  const byFacility = new Map();
  chosen.forEach((c) => {
    const e = byFacility.get(c.facility.id) || { p: c.facility, gain: 0, cost: 0, items: [] };
    e.gain += c.gain; e.cost += c.cost; e.items.push(c);
    byFacility.set(c.facility.id, e);
  });
  const facilities = [...byFacility.values()].map((e) => {
    const after = Math.min(100, Math.round((e.p.spi + e.gain) * 10) / 10);
    return { ...e, before: e.p.spi, after, clsBefore: classify(e.p.spi), clsAfter: classify(after) };
  }).sort((a, b) => b.gain - a.gain);

  return {
    chosen, spent, candidates: pool.length,
    facilities,
    people: facilities.reduce((s, f) => s + f.p.people_served, 0),
    leavingLow: facilities.filter((f) => f.clsBefore === 'low' && f.clsAfter !== 'low').length,
    meanGain: facilities.length ? facilities.reduce((s, f) => s + (f.after - f.before), 0) / facilities.length : 0,
  };
}

// ---------- gap heatmap ----------
/** rows: district -> { n, lacking: { indicator: count } } over assessed facilities. */
export function gapMatrix(features, checklists, answersById, { type = 'all' } = {}) {
  const items = new Map(); // indicator -> label (core items first by sort order)
  const rows = new Map();
  (features || []).forEach(({ properties: p }) => {
    if (type !== 'all' && p.facility_type !== type) return;
    const a = answersById?.[p.id];
    if (!a) return;
    const list = checklists?.[p.facility_type] || [];
    const r = rows.get(p.district) || { district: p.district, n: 0, counts: {}, lacking: {} };
    r.n += 1;
    list.forEach((w) => {
      if (!items.has(w.indicator) || (type === 'all' && w.indicator === 'staff_trained_pct')) {
        items.set(w.indicator, { indicator: w.indicator, label: type === 'all' && w.indicator === 'staff_trained_pct' ? 'Staff trained (≥50%)' : w.label, sort: w.sort_order, n: 0 });
      }
      r.counts[w.indicator] = (r.counts[w.indicator] || 0) + 1;
      if (score(w, a[w.indicator]) < 0.5) r.lacking[w.indicator] = (r.lacking[w.indicator] || 0) + 1;
    });
    rows.set(p.district, r);
  });
  // All types together: only the shared (core) items, so the columns compare like with like
  const typeCount = {};
  Object.values(checklists || {}).forEach((list) => list.forEach((w) => { typeCount[w.indicator] = (typeCount[w.indicator] || 0) + 1; }));
  const minTypes = type === 'all' ? Math.max(1, Object.keys(checklists || {}).length - 2) : 0;
  const cols = [...items.values()].filter((c) => (typeCount[c.indicator] || 0) >= minTypes)
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  const out = [...rows.values()].map((r) => {
    const pct = Object.fromEntries(cols.map((c) => [c.indicator, r.counts[c.indicator] ? (r.lacking[c.indicator] || 0) / r.counts[c.indicator] : null]));
    const vals = Object.values(pct).filter((v) => v !== null);
    return { ...r, pct, mean: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
  }).sort((a, b) => b.mean - a.mean);
  const colPct = Object.fromEntries(cols.map((c) => {
    const n = out.reduce((s, r) => s + (r.counts[c.indicator] || 0), 0);
    const l = out.reduce((s, r) => s + (r.lacking[c.indicator] || 0), 0);
    return [c.indicator, n ? l / n : null];
  }));
  return { cols, rows: out, colPct };
}

// ---------- geometry ----------
const R = 6371; // km
export function distKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad; const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const latLon = (f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]];

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Point [lon, lat] in a GeoJSON Polygon / MultiPolygon geometry (holes respected). */
export function pointInGeometry(lon, lat, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)));
}

/** A circle as a GeoJSON polygon (for "around a point" scenarios). */
export function circlePolygon(lat, lon, km, steps = 64) {
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    const dLat = (km / R) * Math.cos(t) * (180 / Math.PI);
    const dLon = ((km / R) * Math.sin(t) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
    ring.push([lon + dLon, lat + dLat]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

// ---------- hotspots (Getis-Ord Gi*) ----------
/**
 * Gi* z-scores for a value over points within a fixed distance band (binary weights, self included).
 * Negative z = cluster of LOW values (cold spot); positive = cluster of HIGH values (hot spot).
 */
export function giStar(points, bandKm) {
  const n = points.length;
  if (n < 3) return points.map(() => ({ z: 0, neighbours: 0 }));
  const xs = points.map((p) => p.value);
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const s = Math.sqrt(xs.reduce((acc, v) => acc + v * v, 0) / n - mean * mean);
  return points.map((pi) => {
    let wSum = 0; let wx = 0;
    for (const pj of points) {
      // quick reject on latitude before the exact distance
      if (Math.abs(pi.lat - pj.lat) * 111 > bandKm) continue;
      if (distKm(pi.lat, pi.lon, pj.lat, pj.lon) <= bandKm) { wSum += 1; wx += pj.value; }
    }
    const denom = s * Math.sqrt((n * wSum - wSum * wSum) / (n - 1));
    return { z: denom > 0 ? (wx - mean * wSum) / denom : 0, neighbours: wSum - 1 };
  });
}
export function hotspotClass(z) {
  const a = Math.abs(z);
  const conf = a >= 2.576 ? 99 : a >= 1.96 ? 95 : a >= 1.645 ? 90 : 0;
  return { conf, kind: conf ? (z < 0 ? 'cold' : 'hot') : 'none' };
}
export const HOTSPOT_STYLE = {
  'cold-99': { color: '#991b1b', label: 'Low-preparedness cluster (99%)' },
  'cold-95': { color: '#dc2626', label: 'Low-preparedness cluster (95%)' },
  'cold-90': { color: '#f87171', label: 'Low-preparedness cluster (90%)' },
  none: { color: '#d1d5db', label: 'No significant cluster' },
  'hot-90': { color: '#86efac', label: 'High-preparedness cluster (90%)' },
  'hot-95': { color: '#22c55e', label: 'High-preparedness cluster (95%)' },
  'hot-99': { color: '#15803d', label: 'High-preparedness cluster (99%)' },
};

// ---------- flood history (confirmed records of past floods) ----------
// SafeCom is not an early warning system: records describe floods that HAVE happened,
// and are used to check the hazard map and to plan, never to warn.
export const HISTORY_KM = 0.5; // a record this close to a facility counts as flooding at it

const confirmed = (records) => (records?.features || []).filter((r) => ['verified', 'resolved'].includes(r.properties.status));

/** Map facility id -> { count, last, maxDepth, events } from confirmed records linked to it or within HISTORY_KM. */
export function facilityFloodHistory(features, records) {
  const out = new Map();
  const recs = confirmed(records);
  if (!recs.length) return out;
  (features || []).forEach((f) => {
    const id = f.properties.id;
    const [lat, lon] = latLon(f);
    const hits = recs.filter((r) => {
      if (r.properties.facility_id === id) return true;
      const [rl, ro] = latLon(r);
      return Math.abs(rl - lat) < 0.01 && distKm(lat, lon, rl, ro) <= HISTORY_KM;
    });
    if (!hits.length) return;
    const dates = hits.map((r) => r.properties.observed_at).sort();
    out.set(id, {
      count: hits.length,
      last: dates[dates.length - 1],
      maxDepth: hits.reduce((m, r) => ((DEPTH[r.properties.depth]?.level || 0) > (DEPTH[m]?.level || 0) ? r.properties.depth : m), null),
      events: [...new Set(hits.map((r) => r.properties.event_name).filter(Boolean))],
    });
  });
  return out;
}

/**
 * Hazard map check: where recorded floods disagree with the mapped flood zones.
 *  - outside: confirmed records that fall outside every mapped zone (the map may be missing these areas)
 *  - unmappedFacilities: facilities with a flood history but mapped as outside flood zones
 */
export function hazardCheck(features, records, hazards, history) {
  const zones = (hazards?.features || []).map((z) => z.geometry);
  const recs = confirmed(records);
  const outside = recs.filter((r) => {
    const [lon, lat] = r.geometry.coordinates;
    return !zones.some((g) => pointInGeometry(lon, lat, g));
  });
  const unmappedFacilities = (features || []).filter((f) => history?.has(f.properties.id) && !f.properties.flood_level);
  return { total: recs.length, outside, inside: recs.length - outside.length, unmappedFacilities };
}

export const DEPTH = {
  ankle: { label: 'Ankle deep', short: 'Ankle', level: 1, color: '#60a5fa' },
  knee: { label: 'Knee deep', short: 'Knee', level: 2, color: '#3b82f6' },
  waist: { label: 'Waist deep', short: 'Waist', level: 3, color: '#1d4ed8' },
  above_waist: { label: 'Above the waist', short: 'Above waist', level: 4, color: '#1e3a8a' },
};
export const AFFECTED = {
  homes: 'Homes', road: 'Road', bridge: 'Bridge', crops: 'Crops', facility: 'School, clinic or other facility',
  livestock: 'Livestock', water_point: 'Water point',
};

// ---------- CSV download ----------
export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
