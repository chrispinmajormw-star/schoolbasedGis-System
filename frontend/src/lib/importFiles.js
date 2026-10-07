// Reading GIS / table files in the browser for the admin Data import page.
// Zipped shapefiles are reprojected to WGS84 using their .prj file (shpjs + proj4, loaded only when needed).

function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') > -1 ? clean.indexOf('\n') : undefined);
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (!head) throw new Error('The CSV file is empty.');
  const keys = head.map((h, i) => h.trim() || `column_${i + 1}`);
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Returns { features, table } where table=true means rows without geometry (CSV). */
export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.zip')) {
    const { default: shp } = await import('shpjs');
    const out = await shp(await file.arrayBuffer());
    const features = Array.isArray(out) ? out.flatMap((x) => x.features) : out.features;
    return { features, table: false };
  }
  if (name.endsWith('.geojson') || name.endsWith('.json')) {
    const data = JSON.parse(await file.text());
    const features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];
    const sample = features.find((f) => f.geometry)?.geometry;
    const first = sample && JSON.stringify(sample.coordinates).match(/-?\d+(\.\d+)?/g)?.slice(0, 2).map(Number);
    if (first && (Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90)) {
      throw new Error('This GeoJSON is not in WGS 84 (latitude/longitude). Export it again in QGIS with CRS EPSG:4326, or upload the zipped shapefile instead.');
    }
    return { features, table: false };
  }
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return { features: parseCsv(await file.text()).map((properties) => ({ type: 'Feature', geometry: null, properties })), table: true };
  }
  if (name.endsWith('.shp')) throw new Error('Zip the .shp together with its .shx, .dbf and .prj files, then upload the .zip.');
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) throw new Error('Save the spreadsheet as CSV (File → Save As → CSV) and upload the .csv file.');
  throw new Error('Upload a zipped shapefile (.zip), a GeoJSON file or a CSV file.');
}

export const fieldsOf = (features) => {
  const keys = new Set();
  (features || []).slice(0, 50).forEach((f) => Object.keys(f.properties || {}).forEach((k) => keys.add(k)));
  return [...keys];
};

/** Pick the first field whose name matches one of the patterns. */
export const guessField = (keys, patterns) => {
  for (const p of patterns) { const k = keys.find((x) => p.test(x)); if (k) return k; }
  return '';
};

/** Point coordinates [lon, lat] from a Point / MultiPoint geometry. */
export function pointOf(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'MultiPoint') return g.coordinates[0];
  return null;
}

/** Send items in batches limited by count and approximate JSON size; reports progress. */
export async function inBatches(items, { maxCount = 1000, maxBytes = 6e6 }, send, onProgress) {
  let i = 0; let batchNo = 0;
  while (i < items.length) {
    const batch = []; let bytes = 0;
    while (i < items.length && batch.length < maxCount) {
      const size = JSON.stringify(items[i]).length;
      if (batch.length && bytes + size > maxBytes) break;
      batch.push(items[i]); bytes += size; i += 1;
    }
    await send(batch, batchNo === 0);
    batchNo += 1;
    onProgress?.(i, items.length);
  }
}

export const distinctValues = (features, field, max = 60) => {
  const m = new Map();
  (features || []).forEach((f) => {
    const v = String(f.properties?.[field] ?? '').trim();
    m.set(v, (m.get(v) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
};
