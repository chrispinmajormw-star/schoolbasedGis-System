import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, ZoomControl, Polyline, Polygon, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import {
  Sparkles, Send, Ruler, Filter, Layers3, Combine, CircleDot, Hexagon, MoveRight, Play, Download, Info, TriangleAlert, Plus, X, Undo2, Trash2, Check, Loader2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { BASEMAPS } from '../lib/tiles.js';
import { downloadCsv } from '../lib/decision.js';
import { Seg } from './ui.jsx';

const MALAWI_CENTER = [-13.3, 34.3];

// ---------- tools (follow Lecture 8: measurement, retrieval, classification, overlay, neighbourhood) ----------
const TOOLS = [
  { key: 'measure', label: 'Measure', icon: Ruler, help: 'Distance, length, area and perimeter on the ground, plus the bounding box. Draw on the map or measure a layer.' },
  { key: 'select', label: 'Select', icon: Filter, help: 'Selection by attribute (= <> < <= > >= with AND / OR / NOT) and by location: inside, intersect, adjacent, within or beyond a distance.' },
  { key: 'classify', label: 'Classify', icon: Layers3, help: 'Put features into classes (natural breaks, quantile or equal interval). Community flood risk = 50% flood hazard + 25% distance to health care + 25% distance to a road.' },
  { key: 'overlay', label: 'Overlay', icon: Combine, help: 'Intersect, clip or erase with a polygon layer (e.g. flood zones), or dissolve features that share a value.' },
  { key: 'buffer', label: 'Buffer', icon: CircleDot, help: 'Zones at set distances around features, then what falls inside them, e.g. how many people live within 2 km of a clinic.' },
  { key: 'thiessen', label: 'Thiessen', icon: Hexagon, help: 'The area closer to each facility than to any other (Voronoi polygons from a Delaunay triangulation): the area each facility serves.' },
  { key: 'nearest', label: 'Nearest', icon: MoveRight, help: 'Minimal distance from each feature to the nearest feature of another layer.' },
];

const EXAMPLES = [
  'How many schools are within 5 km of a health facility?',
  'How many people live within 2 km of health facilities in Zomba?',
  'Thiessen polygons for health facilities in Zomba',
  'Schools in high flood zones',
  'Classify TAs by flood risk',
  'Schools more than 8 km from a health facility',
  'Distance from each school to the nearest health facility',
  'Clip roads to flood zones',
];

const DEFAULTS = {
  measure: { mode: 'draw', shape: 'LineString' },
  select: {},
  classify: { field: 'derived:risk', method: 'natural', classes: 3 },
  overlay: { op: 'intersect', overlay: 'flood_zones' },
  buffer: { layer: 'fac:health_facility', distances_km: '2', dissolve: true },
  thiessen: { layer: 'fac:health_facility' },
  nearest: { to: 'fac:health_facility' },
};

const OPS = [['=', '='], ['<>', '≠'], ['<', '<'], ['<=', '≤'], ['>', '>'], ['>=', '≥'], ['contains', 'contains']];
const RELATIONS = [['', 'No location filter'], ['within', 'Inside (within)'], ['intersects', 'Intersecting'], ['touches', 'Adjacent (touching)'], ['outside', 'Outside (not intersecting)'], ['within_distance', 'Within a distance of'], ['farther_than', 'Farther than a distance from']];
const CLASS_COLOURS = { 2: ['#22c55e', '#dc2626'], 3: ['#22c55e', '#f59e0b', '#dc2626'], 4: ['#22c55e', '#facc15', '#f97316', '#dc2626'], 5: ['#15803d', '#86efac', '#facc15', '#f97316', '#b91c1c'] };
const CATEGORY = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#be123c', '#4d7c0f', '#9333ea', '#0f766e', '#c2410c'];
const RING = ['#1d4ed8', '#3b82f6', '#93c5fd', '#dbeafe'];
const PURPLES = ['#f3e8ff', '#d8b4fe', '#a855f7', '#7e22ce', '#3b0764'];
const ROLE_ORDER = ['reference', 'context', 'cells', 'rings', 'categories', 'classes', 'result', 'targets', 'links', 'distance', 'sites'];

// ---------- small form pieces ----------
function LayerSelect({ layers, value, onChange, kinds, label, optional, hint }) {
  const groups = ['Facilities', 'Base layers', 'Uploaded layers'];
  const ok = (l) => !kinds || kinds.includes(l.kind);
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional ? '— none —' : 'Choose a layer…'}</option>
        {groups.map((g) => {
          const list = layers.filter((l) => l.group === g && ok(l));
          return list.length ? (
            <optgroup key={g} label={g}>
              {list.map((l) => <option key={l.key} value={l.key}>{l.name} {l.count ? `· ${l.count.toLocaleString()}` : '· not loaded'}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

function WhereEditor({ layer, value, onChange, title = 'Attribute conditions' }) {
  const w = value || { conditions: [], join: 'and' };
  const conds = w.conditions || [];
  const fields = layer?.fields || [];
  if (!layer) return null;
  const set = (patch) => onChange({ ...w, ...patch });
  const setCond = (i, patch) => set({ conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="rounded-xl bg-gray-50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500">{title}</span>
        <div className="flex items-center gap-2">
          {conds.length > 1 && <Seg value={w.join || 'and'} onChange={(join) => set({ join })} options={[['and', 'AND'], ['or', 'OR']]} />}
          {conds.length > 0 && <label className="flex items-center gap-1 text-[11px] text-gray-600"><input type="checkbox" checked={!!w.not} onChange={(e) => set({ not: e.target.checked })} />NOT</label>}
        </div>
      </div>
      {conds.map((c, i) => (
        <div key={i} className="mb-1.5 flex gap-1">
          <select className="input min-w-0 flex-[1.3] px-2 py-1.5 text-xs" value={c.field} onChange={(e) => setCond(i, { field: e.target.value })}>
            {fields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <select className="input w-[74px] shrink-0 px-1.5 py-1.5 text-xs" value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
            {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input min-w-0 flex-1 px-2 py-1.5 text-xs" value={c.value ?? ''} placeholder="value" onChange={(e) => setCond(i, { value: e.target.value })} />
          <button type="button" className="px-1 text-gray-400 hover:text-red-600" title="Remove" onClick={() => set({ conditions: conds.filter((_, j) => j !== i) })}><X size={14} /></button>
        </div>
      ))}
      {fields.length > 0 && conds.length < 6 && (
        <button type="button" className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-ink"
          onClick={() => set({ conditions: [...conds, { field: (fields.find((f) => f.numeric) || fields[0]).name, op: fields.find((f) => f.numeric) ? '<' : '=', value: '' }] })}>
          <Plus size={12} />Add condition
        </button>
      )}
    </div>
  );
}

function AreaSelect({ areas, value, onChange, label = 'Study area' }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Whole country</option>
        {['district', 'ta'].map((lvl) => {
          const list = areas.filter((a) => a.level === lvl);
          return list.length ? <optgroup key={lvl} label={lvl === 'district' ? 'Districts' : 'Traditional Authorities'}>{list.map((a) => <option key={`${lvl}-${a.name}`} value={a.name}>{a.name}</option>)}</optgroup> : null;
        })}
      </select>
    </label>
  );
}

const numericFields = (layer) => (layer?.fields || []).filter((f) => f.numeric);

function SumField({ layer, value, onChange }) {
  const nf = numericFields(layer);
  if (!layer || !nf.length) return null;
  return (
    <label className="block">
      <span className="label">Add up (optional)</span>
      <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Automatic (population if there is one)</option>
        {nf.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
      </select>
    </label>
  );
}

// ---------- the form of each tool ----------
function ToolForm({ tool, p, set, layers, areas, draw }) {
  const byKey = (k) => layers.find((l) => l.key === k);
  const layer = byKey(p.layer);
  const common = (kinds, label = 'Layer') => (
    <>
      <LayerSelect layers={layers} kinds={kinds} label={label} value={p.layer} onChange={(v) => set({ layer: v, where: undefined, field: tool === 'classify' ? 'derived:risk' : p.field })} />
      <WhereEditor layer={layer} value={p.where} onChange={(where) => set({ where })} />
      <AreaSelect areas={areas} value={p.area} onChange={(area) => set({ area })} />
    </>
  );

  if (tool === 'measure') {
    return (
      <>
        <Seg value={p.mode || 'draw'} onChange={(mode) => set({ mode })} options={[['draw', 'Draw on the map'], ['layer', 'Measure a layer']]} />
        {p.mode === 'layer' ? common(null) : (
          <div className="space-y-2">
            <Seg value={p.shape || 'LineString'} onChange={(shape) => { set({ shape }); draw.clear(); }} options={[['LineString', 'Distance / length'], ['Polygon', 'Area']]} />
            <p className="text-[11px] text-gray-500">Click on the map to add points{p.shape === 'Polygon' ? ' around the area (at least 3)' : ' along the line (at least 2)'}, then press Measure.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={draw.undo} disabled={!draw.points.length}><Undo2 size={13} />Undo</button>
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={draw.clear} disabled={!draw.points.length}><Trash2 size={13} />Clear</button>
              <span className="self-center text-[11px] text-gray-400">{draw.points.length} point{draw.points.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        )}
      </>
    );
  }
  if (tool === 'select') {
    const loc = p.location || {};
    const setLoc = (patch) => set({ location: { ...loc, ...patch } });
    return (
      <>
        {common(null)}
        <div className="rounded-xl border border-gray-200 p-2.5">
          <span className="label">Selection by location</span>
          <select className="input mb-2" value={loc.relation || ''} onChange={(e) => setLoc({ relation: e.target.value || undefined, layer: loc.layer || (e.target.value.includes('distance') || e.target.value === 'farther_than' ? 'fac:health_facility' : 'flood_zones') })}>
            {RELATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {loc.relation && (
            <div className="space-y-2">
              {['within_distance', 'farther_than'].includes(loc.relation) && (
                <label className="block"><span className="label">Distance (km)</span><input className="input" type="number" min="0" step="0.5" value={loc.distance_km ?? ''} onChange={(e) => setLoc({ distance_km: e.target.value })} /></label>
              )}
              <LayerSelect layers={layers} label="Reference layer" value={loc.layer} onChange={(v) => setLoc({ layer: v, where: undefined })} />
              <WhereEditor layer={byKey(loc.layer)} value={loc.where} onChange={(where) => setLoc({ where })} title="Only reference features where…" />
            </div>
          )}
        </div>
      </>
    );
  }
  if (tool === 'classify') {
    const derived = [['derived:risk', 'Community flood risk (score)'], ['derived:flood_level', 'Flood hazard level'], ['derived:dist_health_km', 'Distance to health facility'], ['derived:dist_road_km', 'Distance to road'],
      ...(layer?.kind === 'polygon' ? [['derived:area_km2', 'Area (km²)']] : []), ...(layer?.kind === 'line' ? [['derived:length_km', 'Length (km)']] : [])];
    return (
      <>
        {common(null)}
        <label className="block"><span className="label">Classify by</span>
          <select className="input" value={p.field || 'derived:risk'} onChange={(e) => set({ field: e.target.value })}>
            <optgroup label="Calculated">{derived.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
            {numericFields(layer).length > 0 && <optgroup label="Fields">{numericFields(layer).map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}</optgroup>}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block"><span className="label">Method</span>
            <select className="input" value={p.method || 'natural'} onChange={(e) => set({ method: e.target.value })}>
              <option value="natural">Natural breaks (Jenks)</option><option value="quantile">Quantile</option><option value="equal">Equal interval</option>
              {p.field === 'derived:risk' && <option value="fixed">Fixed (0–33–66–100)</option>}
            </select>
          </label>
          <label className="block"><span className="label">Classes</span>
            <select className="input" value={p.classes || 3} onChange={(e) => set({ classes: Number(e.target.value) })}>{[2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
        {layer?.kind === 'polygon' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!p.dissolve} onChange={(e) => set({ dissolve: e.target.checked })} />Dissolve (merge) areas of the same class</label>}
      </>
    );
  }
  if (tool === 'overlay') {
    return (
      <>
        <Seg value={p.op || 'intersect'} onChange={(op) => set({ op })} options={[['intersect', 'Intersect'], ['clip', 'Clip'], ['erase', 'Erase'], ['dissolve', 'Dissolve']]} />
        {common(null, 'Input layer')}
        {p.op === 'dissolve' ? (
          <label className="block"><span className="label">Dissolve by field</span>
            <select className="input" value={p.field || ''} onChange={(e) => set({ field: e.target.value || undefined })}>
              <option value="">— merge everything into one —</option>
              {(layer?.fields || []).filter((f) => !f.numeric).map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </label>
        ) : (
          <>
            <LayerSelect layers={layers} kinds={['polygon']} label={p.op === 'erase' ? 'Erase with (polygons)' : p.op === 'clip' ? 'Clip to (polygons)' : 'Intersect with (polygons)'} value={p.overlay} onChange={(v) => set({ overlay: v, overlay_where: undefined })} />
            <WhereEditor layer={byKey(p.overlay)} value={p.overlay_where} onChange={(overlay_where) => set({ overlay_where })} title="Only overlay polygons where…" />
          </>
        )}
      </>
    );
  }
  if (tool === 'buffer') {
    const target = byKey(p.target);
    return (
      <>
        {common(null, 'Buffer around')}
        <label className="block"><span className="label">Distance(s) in km</span>
          <input className="input" value={Array.isArray(p.distances_km) ? p.distances_km.join(', ') : p.distances_km ?? ''} placeholder="2   or   1, 2, 5 for zones" onChange={(e) => set({ distances_km: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.dissolve !== false} onChange={(e) => set({ dissolve: e.target.checked })} />Merge (dissolve) overlapping buffers</label>
        <LayerSelect layers={layers} optional label="Count what is inside (optional)" value={p.target} onChange={(v) => set({ target: v || undefined, target_where: undefined, sum_field: undefined })}
          hint="e.g. schools, villages, or TAs / a population layer to estimate people" />
        <WhereEditor layer={target} value={p.target_where} onChange={(target_where) => set({ target_where })} title="Only count features where…" />
        <SumField layer={target} value={p.sum_field} onChange={(sum_field) => set({ sum_field })} />
      </>
    );
  }
  if (tool === 'thiessen') {
    const target = byKey(p.target);
    return (
      <>
        <LayerSelect layers={layers} kinds={['point']} label="Facilities (points)" value={p.layer} onChange={(v) => set({ layer: v, where: undefined })} />
        <WhereEditor layer={layer} value={p.where} onChange={(where) => set({ where })} />
        <AreaSelect areas={areas} value={p.area} onChange={(area) => set({ area })} label="Clip to (study area)" />
        <LayerSelect layers={layers} optional label="Count in each polygon (optional)" value={p.target} onChange={(v) => set({ target: v || undefined, sum_field: undefined })} hint="e.g. villages or TAs with population: people served by each facility" />
        <SumField layer={target} value={p.sum_field} onChange={(sum_field) => set({ sum_field })} />
      </>
    );
  }
  // nearest
  return (
    <>
      {common(null, 'From each of')}
      <LayerSelect layers={layers} label="To the nearest" value={p.to} onChange={(v) => set({ to: v, to_where: undefined })} />
      <WhereEditor layer={byKey(p.to)} value={p.to_where} onChange={(to_where) => set({ to_where })} title="Only nearest features where…" />
      <label className="block"><span className="label">Flag if farther than (km, optional)</span><input className="input" type="number" min="0" step="0.5" value={p.threshold_km ?? ''} onChange={(e) => set({ threshold_km: e.target.value || undefined })} /></label>
    </>
  );
}

// ---------- map ----------
function DrawLayer({ draw, active, shape }) {
  useMapEvents({ click: (e) => { if (active) draw.add([e.latlng.lat, e.latlng.lng]); } });
  if (!draw.points.length) return null;
  const style = { color: '#dc2626', weight: 2.5, dashArray: '5 4' };
  return (
    <>
      {shape === 'Polygon' && draw.points.length > 2 ? <Polygon positions={draw.points} pathOptions={{ ...style, fillOpacity: 0.12 }} /> : <Polyline positions={draw.points} pathOptions={style} />}
      {draw.points.map((pt, i) => <CircleMarker key={i} center={pt} radius={4} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#dc2626', fillOpacity: 1 }} />)}
    </>
  );
}

function FitResult({ result }) {
  const map = useMap();
  useEffect(() => {
    if (!result?.layers?.length) return;
    // Zoom to the answer (cells, rings, selected features ...), not to context such as all facilities
    const main = result.layers.filter((l) => [...MAIN_ROLES, 'rings'].includes(l.role) && l.features.length);
    const fc = { type: 'FeatureCollection', features: (main.length ? main : result.layers).flatMap((l) => l.features).filter((f) => f.geometry) };
    if (!fc.features.length) return;
    const b = L.geoJSON(fc).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
  }, [result, map]);
  return null;
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function tip(p) {
  const skip = new Set(['name', 'type']);
  const rows = Object.entries(p).filter(([k, v]) => !skip.has(k) && v !== null && v !== '' && typeof v !== 'object').slice(0, 7);
  return `<b>${esc(p.name ?? '')}</b>${rows.map(([k, v]) => `<br><span style="color:#6b7280">${esc(k.replaceAll('_', ' '))}:</span> ${esc(typeof v === 'number' ? v.toLocaleString() : v)}`).join('')}`;
}

function styleFor(layer, f, ctx) {
  const p = f.properties;
  switch (layer.role) {
    case 'reference': return { color: '#64748b', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.12, radius: 3 };
    case 'context': return { color: '#334155', weight: 1.5, dashArray: '6 4', fill: false };
    case 'rings': return { color: '#1d4ed8', weight: 1, fillColor: RING[Math.min(RING.length - 1, ctx.ringIndex.get(p.distance_km) ?? 0)], fillOpacity: 0.35 };
    case 'classes': { const c = (CLASS_COLOURS[layer.classes] || CLASS_COLOURS[3])[(p.class || 1) - 1] || '#9ca3af'; return { color: layer.kind === 'polygon' ? '#fff' : c, weight: layer.kind === 'line' ? 3 : 1, fillColor: c, fillOpacity: layer.kind === 'polygon' ? 0.65 : 0.95, radius: 5 }; }
    case 'categories': { const c = CATEGORY[ctx.index.get(f) % CATEGORY.length]; return { color: layer.kind === 'polygon' ? '#fff' : c, weight: layer.kind === 'line' ? 3 : 1, fillColor: c, fillOpacity: 0.6, radius: 4 }; }
    case 'cells': { const v = p[layer.valueKey]; const i = ctx.cellBreaks.filter((b) => v > b).length; return { color: '#6b21a8', weight: 1, fillColor: PURPLES[i], fillOpacity: 0.55 }; }
    case 'targets': return { color: '#c2410c', weight: layer.kind === 'polygon' ? 1.5 : 2.5, fillColor: '#f97316', fillOpacity: layer.kind === 'polygon' ? 0.25 : 0.95, radius: 4.5 };
    case 'links': return { color: '#64748b', weight: 1, opacity: 0.7 };
    case 'distance': { const far = layer.threshold ? p.distance_km > layer.threshold : p.distance_km > ctx.medianDist * 1.5; const mid = !far && p.distance_km > ctx.medianDist; const c = far ? '#dc2626' : mid ? '#f59e0b' : '#16a34a'; return { color: '#fff', weight: 1, fillColor: c, fillOpacity: 0.95, radius: 4.5 }; }
    case 'sites': return { color: '#fff', weight: 1.2, fillColor: '#111827', fillOpacity: 1, radius: 4 };
    default: return { color: '#1d4ed8', weight: layer.kind === 'line' ? 3 : 1.5, fillColor: '#3b82f6', fillOpacity: layer.kind === 'polygon' ? 0.35 : 0.95, radius: 5 };
  }
}

function ResultLayers({ result }) {
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const ctx = useMemo(() => {
    const ringIndex = new Map(); const index = new Map(); let cellBreaks = []; let medianDist = 1;
    (result?.layers || []).forEach((l) => {
      if (l.role === 'rings') [...new Set(l.features.map((f) => f.properties.distance_km))].sort((a, b) => a - b).forEach((d, i) => ringIndex.set(d, i));
      if (l.role === 'categories') l.features.forEach((f, i) => index.set(f, i));
      if (l.role === 'cells') { const v = l.features.map((f) => f.properties[l.valueKey] || 0).sort((a, b) => a - b); cellBreaks = [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * (v.length - 1))]); }
      if (l.role === 'distance') { const v = l.features.map((f) => f.properties.distance_km).sort((a, b) => a - b); medianDist = v[Math.floor(v.length / 2)] || 1; }
    });
    return { ringIndex, index, cellBreaks, medianDist };
  }, [result]);
  if (!result) return null;
  const layers = [...result.layers].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return layers.map((l, i) => (
    <GeoJSON key={`${result.stamp}-${i}`} data={{ type: 'FeatureCollection', features: l.features.filter((f) => f.geometry) }} renderer={renderer}
      style={(f) => styleFor(l, f, ctx)}
      pointToLayer={(f, latlng) => L.circleMarker(latlng, { ...styleFor(l, f, ctx), renderer })}
      onEachFeature={(f, layer) => { if (l.role !== 'context') layer.bindTooltip(tip(f.properties), { sticky: true }); }} />
  ));
}

function Legend({ result }) {
  if (!result) return null;
  const items = [];
  result.layers.forEach((l) => {
    if (l.role === 'classes' && result.legend) result.legend.forEach((c) => items.push([(CLASS_COLOURS[l.classes] || CLASS_COLOURS[3])[c.class - 1], `${c.label} (${c.count})`]));
    else if (l.role === 'rings') [...new Set(l.features.map((f) => f.properties.distance_km))].sort((a, b) => a - b).forEach((d, i) => items.push([RING[Math.min(3, i)], `Within ${d} km`]));
    else if (l.role === 'cells') items.push(['#a855f7', `Thiessen polygons (darker = more ${l.valueKey.replaceAll('_', ' ')})`]);
    else if (l.role === 'distance') { items.push(['#16a34a', 'Near']); items.push(['#f59e0b', 'Medium']); items.push(['#dc2626', l.threshold ? `Farther than ${l.threshold} km` : 'Far']); } else if (l.role === 'reference') items.push(['#94a3b8', l.name]);
    else if (l.role === 'sites') items.push(['#111827', l.name]);
    else if (l.role === 'targets') items.push(['#f97316', l.name]);
    else if (l.role === 'result') items.push(['#3b82f6', l.name]);
  });
  if (!items.length) return null;
  return (
    <div className="absolute bottom-3 left-3 z-[1000] max-w-[260px] rounded-2xl border border-gray-200 bg-white/95 px-3 py-2.5 text-[11px] shadow-card">
      {items.slice(0, 9).map(([c, t], i) => <div key={i} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} /><span className="truncate">{t}</span></div>)}
    </div>
  );
}

// ---------- downloads ----------
function save(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const MAIN_ROLES = ['result', 'classes', 'categories', 'cells', 'targets', 'distance'];
function mainLayer(result) {
  return result.layers.find((l) => MAIN_ROLES.includes(l.role) && l.features.length) || result.layers.find((l) => l.features.length);
}

// ---------- page ----------
export default function GisTools() {
  const [cat, setCat] = useState(null);
  const [catError, setCatError] = useState('');
  const [tool, setTool] = useState('select');
  const [params, setParams] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null); // { explanation, by, message }
  const [points, setPoints] = useState([]);
  const stamp = useRef(0);

  useEffect(() => { api.gisLayers().then(setCat).catch((e) => setCatError(e.message)); }, []);
  const layers = cat?.layers || [];
  const p = params[tool] || {};
  const set = (patch) => setParams((x) => ({ ...x, [tool]: { ...x[tool], ...patch } }));
  const draw = { points, add: (pt) => setPoints((x) => [...x, pt]), undo: () => setPoints((x) => x.slice(0, -1)), clear: () => setPoints([]) };
  const drawing = tool === 'measure' && (p.mode || 'draw') === 'draw';

  const show = (r) => { stamp.current += 1; setResult({ ...r, stamp: stamp.current }); };

  async function run() {
    setError(''); setAnswer(null);
    let body = { ...p };
    if (drawing) {
      const shape = p.shape || 'LineString';
      const need = shape === 'Polygon' ? 3 : 2;
      if (points.length < need) { setError(`Click at least ${need} points on the map first.`); return; }
      const ring = points.map(([la, lo]) => [lo, la]);
      body = { geometry: shape === 'Polygon' ? { type: 'Polygon', coordinates: [[...ring, ring[0]]] } : { type: 'LineString', coordinates: ring } };
    }
    if (body.mode) delete body.mode;
    setBusy(true);
    try { show(await api.gisRun(tool, body)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function ask(q) {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text); setError(''); setBusy(true); setAnswer(null);
    try {
      const r = await api.gisAsk(text);
      if (r.tool && r.params) {
        setTool(r.tool);
        setParams((x) => ({ ...x, [r.tool]: { ...(r.tool === 'measure' ? { mode: 'layer' } : {}), ...r.params } }));
      }
      setAnswer({ explanation: r.explanation, by: r.by, message: r.message, notes: r.notes });
      if (r.headline) show(r); else setResult(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const main = result ? mainLayer(result) : null;
  const downloadGeojson = () => {
    const fc = { type: 'FeatureCollection', features: result.layers.filter((l) => l.role !== 'context').flatMap((l) => l.features.map((f) => ({ ...f, properties: { ...f.properties, layer: l.name } }))) };
    save(`safecom_${result.tool}.geojson`, JSON.stringify(fc), 'application/geo+json');
  };
  const downloadTable = () => {
    const feats = main?.features || [];
    const cols = [...new Set([...(result.table?.columns || []), ...feats.slice(0, 200).flatMap((f) => Object.keys(f.properties))])].filter((c) => typeof feats[0]?.properties?.[c] !== 'object');
    downloadCsv(`safecom_${result.tool}.csv`, feats.map((f) => Object.fromEntries(cols.map((c) => [c, f.properties[c]]))));
  };
  const toolInfo = TOOLS.find((t) => t.key === tool);
  const emptyLayers = layers.filter((l) => !l.count && l.group !== 'Facilities');

  return (
    <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
      <div className="space-y-4">
        {/* Ask */}
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-violet-600" />Ask the map</h2>
            {cat && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500" title={cat.ai ? 'Questions are read by Claude, then run as a real analysis' : 'Questions are matched to a tool by keywords'}>{cat.ai ? 'AI' : 'Keyword assistant'}</span>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. schools within 5 km of a health facility" aria-label="Question" />
            <button type="submit" className="btn-dark shrink-0 px-3" disabled={busy || !question.trim()} title="Ask">{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.slice(0, 6).map((e) => <button key={e} type="button" disabled={busy} onClick={() => ask(e)} className="rounded-lg bg-gray-100 px-2 py-1 text-left text-[11px] text-gray-600 hover:bg-gray-200">{e}</button>)}
          </div>
          {answer?.message && <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900"><TriangleAlert size={13} className="mt-px shrink-0" />{answer.message}</p>}
          {answer?.explanation && <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-600"><Check size={13} className="mt-px shrink-0 text-green-600" /><span>Ran: {answer.explanation} <span className="text-gray-400">You can adjust it below and run it again.</span></span></p>}
        </section>

        {/* Tools */}
        <section className="card p-4">
          <div className="mb-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7 xl:grid-cols-4">
            {TOOLS.map((t) => (
              <button key={t.key} type="button" onClick={() => { setTool(t.key); setError(''); }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition ${tool === t.key ? 'border-ink bg-ink text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <t.icon size={16} />{t.label}
              </button>
            ))}
          </div>
          <p className="mb-3 text-[11px] text-gray-500">{toolInfo.help}</p>
          {catError && <p className="mb-3 text-xs text-red-600">{catError}</p>}
          {!cat && !catError ? <div className="h-40 animate-pulse rounded-xl bg-gray-100" /> : (
            <div className="space-y-3">
              <ToolForm tool={tool} p={p} set={set} layers={layers} areas={cat?.areas || []} draw={draw} />
              <button type="button" className="btn-dark w-full" disabled={busy} onClick={run}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}{busy ? 'Working…' : drawing ? 'Measure' : 'Run analysis'}</button>
              {error && <p className="flex items-start gap-1.5 rounded-xl bg-red-50 p-2.5 text-xs text-red-700"><TriangleAlert size={13} className="mt-px shrink-0" />{error}</p>}
            </div>
          )}
        </section>

        {cat && (cat.missingCategories?.length > 0 || emptyLayers.length > 0 || !cat.customReady) && (
          <section className="rounded-2xl border border-dashed border-gray-300 p-3 text-[11px] text-gray-500">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-gray-600"><Info size={12} />Layers not in the system yet</p>
            {!cat.customReady && <p className="mb-1 text-amber-700">Run database/migration_008_gis_layers.sql in Supabase to enable uploading extra layers.</p>}
            <p>{[...emptyLayers.map((l) => l.name), ...(cat.missingCategories || []).map((c) => c.name)].join(' · ')}</p>
            <p className="mt-1">An administrator can add them under Data import (Other layers for rivers, settlements, land use and population).</p>
          </section>
        )}
      </div>

      <div className="space-y-4">
        <section className="card overflow-hidden">
          <div className="relative h-[520px]">
            <MapContainer preferCanvas center={MALAWI_CENTER} zoom={6} minZoom={5} zoomControl={false} className={`h-full w-full ${drawing ? 'cursor-crosshair' : ''}`}>
              <TileLayer url={BASEMAPS.standard.url} attribution={BASEMAPS.standard.attribution} maxZoom={BASEMAPS.standard.maxZoom} opacity={0.7} />
              <ZoomControl position="bottomright" />
              <ResultLayers result={result} />
              <FitResult result={result} />
              <DrawLayer draw={draw} active={drawing} shape={p.shape || 'LineString'} />
            </MapContainer>
            <Legend result={result} />
            {drawing && <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-ink/90 px-3 py-1 text-[11px] text-white">Click on the map to {p.shape === 'Polygon' ? 'outline the area' : 'draw the line'}</div>}
          </div>
        </section>

        {result ? (
          <section className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{result.headline}</p>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost py-1.5 text-xs" onClick={downloadGeojson}><Download size={13} />GeoJSON</button>
                <button type="button" className="btn-ghost py-1.5 text-xs" onClick={downloadTable} disabled={!main?.features?.length}><Download size={13} />CSV</button>
              </div>
            </div>
            {result.notes?.length > 0 && <ul className="mt-2 space-y-1">{result.notes.map((n) => <li key={n} className="flex items-start gap-1.5 text-[11px] text-gray-500"><Info size={12} className="mt-px shrink-0" />{n}</li>)}</ul>}
            
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {result.summary.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-2.5"><div className="truncate text-[11px] text-gray-500" title={label}>{label}</div><div className="truncate font-semibold" title={String(value)}>{value}</div></div>
              ))}
            </div>
            {result.table?.rows?.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 text-[11px] text-gray-400">{result.table.total > result.table.rows.length ? `First ${result.table.rows.length} of ${result.table.total.toLocaleString()} rows (download the CSV for all)` : `${result.table.total.toLocaleString()} rows`}</div>
                <div className="scroll-thin max-h-80 overflow-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-gray-50 text-gray-500"><tr>{result.table.columns.map((c) => <th key={c} className="whitespace-nowrap px-2.5 py-2 font-medium">{c.replaceAll('_', ' ')}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.table.rows.slice(0, 200).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="max-w-[220px] truncate whitespace-nowrap px-2.5 py-1.5">{typeof v === 'number' ? v.toLocaleString() : String(v)}</td>)}</tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="card p-5 text-sm text-gray-500">
            <p className="font-medium text-gray-700">Ask a question or pick a tool, then run it.</p>
            <p className="mt-1 text-xs">Every result is calculated in the database from the layers loaded in SafeCom (PostGIS): distances and areas on the ground, real overlays, buffers and Thiessen polygons. Results can be downloaded as GeoJSON (open in QGIS) or CSV.</p>
          </section>
        )}
      </div>
    </div>
  );
}
