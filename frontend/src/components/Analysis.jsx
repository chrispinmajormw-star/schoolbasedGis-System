import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, ZoomControl } from 'react-leaflet';
import { Info, Map as MapIcon, Grid3x3, Flame, Download } from 'lucide-react';
import { CLASS_STYLE, classify } from '../lib/api.js';
import { BASEMAPS } from '../lib/tiles.js';
import { FACILITY_TYPES, TYPE_KEYS, typeOf } from '../lib/facilityTypes.js';
import { gapMatrix, giStar, hotspotClass, HOTSPOT_STYLE, latLon, fmtNum, downloadCsv } from '../lib/decision.js';
import { PageHeader, Seg, ClassPill, Empty } from './ui.jsx';

const MALAWI_CENTER = [-13.3, 34.3];

// Sequential red scale for "worse is higher" metrics
const reds = ['#fef2f2', '#fecaca', '#f87171', '#dc2626', '#7f1d1d'];
const redFor = (v, max) => (v === null || v === undefined || !max ? '#e5e7eb' : reds[Math.min(4, Math.floor((v / max) * 4.999))]);

export function districtStats(facilities, history) {
  const m = new Map();
  (facilities?.features || []).forEach((f) => {
    const p = f.properties;
    const r = m.get(p.district) || { district: p.district, n: 0, assessed: 0, spiSum: 0, atRisk: 0, people: 0, flooded: 0, lat: 0, lon: 0, shelter: 0 };
    const [la, lo] = latLon(f);
    r.n += 1; r.lat += la; r.lon += lo; r.people += p.people_served; r.shelter += p.shelter_capacity || 0;
    if (p.spi !== null) { r.assessed += 1; r.spiSum += p.spi; }
    if (p.flood_level >= 2 && p.spi_class === 'low') r.atRisk += p.people_served;
    if (history?.has(p.id)) r.flooded += 1;
    m.set(p.district, r);
  });
  return [...m.values()].map((r) => ({
    ...r, lat: r.lat / r.n, lon: r.lon / r.n,
    meanSpi: r.assessed ? Math.round((10 * r.spiSum) / r.assessed) / 10 : null,
    notAssessedPct: Math.round((100 * (r.n - r.assessed)) / r.n),
  }));
}

const METRICS = {
  meanSpi: { label: 'Mean SPI', fmt: (v) => (v === null ? 'n/a' : `${v}%`), better: 'high' },
  notAssessedPct: { label: 'Not assessed', fmt: (v) => `${v}%`, better: 'low' },
  atRisk: { label: 'People at risk', fmt: fmtNum, better: 'low', hint: 'People served by low-preparedness facilities in medium/high flood zones' },
};

function Districts({ facilities, districtAreas, history }) {
  const [metric, setMetric] = useState('meanSpi');
  const stats = useMemo(() => districtStats(facilities, history), [facilities, history]);
  const byName = useMemo(() => new Map(stats.map((s) => [s.district.toLowerCase(), s])), [stats]);
  const M = METRICS[metric];
  const max = Math.max(1, ...stats.map((s) => s[metric] || 0));
  const colour = (s) => (!s ? '#e5e7eb' : metric === 'meanSpi' ? (s.meanSpi === null ? CLASS_STYLE.unassessed.color : CLASS_STYLE[classify(s.meanSpi)].color) : redFor(s[metric], max));
  const sorted = [...stats].sort((a, b) => (M.better === 'high' ? (a[metric] ?? 999) - (b[metric] ?? 999) : (b[metric] ?? -1) - (a[metric] ?? -1)));
  const hasPolygons = districtAreas?.features?.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <Seg value={metric} onChange={setMetric} options={Object.entries(METRICS).map(([k, v]) => [k, v.label])} />
          {!hasPolygons && <span className="text-[11px] text-gray-400">Circles: no district boundaries uploaded yet</span>}
        </div>
        <div className="h-[480px]">
          <MapContainer preferCanvas center={MALAWI_CENTER} zoom={6} minZoom={5} zoomControl={false} className="h-full w-full">
            <TileLayer url={BASEMAPS.standard.url} attribution={BASEMAPS.standard.attribution} maxZoom={BASEMAPS.standard.maxZoom} opacity={0.6} />
            <ZoomControl position="bottomright" />
            {hasPolygons ? (
              <GeoJSON key={`${metric}-${stats.length}-${districtAreas.features.length}`} data={districtAreas}
                style={(f) => ({ color: '#fff', weight: 1.2, fillColor: colour(byName.get(f.properties.name.toLowerCase())), fillOpacity: 0.75 })}
                onEachFeature={(f, layer) => {
                  const s = byName.get(f.properties.name.toLowerCase());
                  layer.bindTooltip(`<b>${f.properties.name}</b><br/>${M.label}: ${s ? M.fmt(s[metric]) : 'no facilities'}${s ? `<br/>${s.n} facilities · ${s.assessed} assessed` : ''}`, { sticky: true });
                }} />
            ) : stats.map((s) => (
              <CircleMarker key={s.district} center={[s.lat, s.lon]} radius={8 + Math.sqrt(s.n) * 4}
                pathOptions={{ color: '#fff', weight: 2, fillColor: colour(s), fillOpacity: 0.85 }}>
                <Tooltip><b>{s.district}</b><br />{M.label}: {M.fmt(s[metric])}<br />{s.n} facilities · {s.assessed} assessed</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold">{M.label} by district</h2>
        <p className="mb-3 text-[11px] text-gray-400">{M.hint || (M.better === 'high' ? 'Lowest first' : 'Highest first')}</p>
        <ul className="space-y-2.5">
          {sorted.map((s) => (
            <li key={s.district}>
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{s.district} <span className="font-normal text-gray-400">· {s.n}</span>{s.flooded > 0 && <span className="ml-1.5 rounded bg-orange-100 px-1 text-[10px] font-semibold text-orange-800" title="Facilities with a recorded flood history">{s.flooded} flooded before</span>}</span><span>{M.fmt(s[metric])}</span></div>
              <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full" style={{ width: `${metric === 'meanSpi' ? s.meanSpi || 0 : (100 * (s[metric] || 0)) / max}%`, background: colour(s) }} /></div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const heat = (v) => {
  if (v === null || v === undefined) return { background: '#f9fafb', color: '#d1d5db' };
  const a = Math.min(1, Math.max(0, v));
  // white -> red, text flips to white on dark cells
  const r = 255; const g = Math.round(255 - a * 200); const b = Math.round(255 - a * 210);
  return { background: `rgb(${r - Math.round(a * 70)},${g},${b})`, color: a > 0.55 ? '#fff' : '#111827' };
};

function GapHeatmap({ facilities, checklists, answers }) {
  const [type, setType] = useState('all');
  const m = useMemo(() => gapMatrix(facilities?.features, checklists, answers, { type }), [facilities, checklists, answers, type]);
  const exportCsv = () => downloadCsv('safecom_gap_heatmap.csv', m.rows.map((r) => ({
    district: r.district, assessed_facilities: r.n,
    ...Object.fromEntries(m.cols.map((c) => [c.label, r.pct[c.indicator] === null ? '' : Math.round(100 * r.pct[c.indicator])])),
  })));
  const top = [...m.cols].sort((a, b) => (m.colPct[b.indicator] ?? 0) - (m.colPct[a.indicator] ?? 0)).slice(0, 3);

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Which gaps are most common, and where?</h2>
          <p className="text-[11px] text-gray-400">Share of assessed facilities lacking each item (percentage items: below 50%). Darker = more widespread, so better suited to a district-wide programme.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-1.5" value={type} onChange={(e) => setType(e.target.value)} aria-label="Facility type">
            <option value="all">All types (shared items)</option>
            {TYPE_KEYS.map((k) => <option key={k} value={k}>{FACILITY_TYPES[k].plural}</option>)}
          </select>
          <button type="button" className="icon-btn" title="Download CSV" onClick={exportCsv} disabled={!m.rows.length}><Download size={15} /></button>
        </div>
      </div>
      {top.length > 0 && m.rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="text-gray-500">Most common gaps:</span>
          {top.map((c) => <span key={c.indicator} className="rounded-lg bg-red-50 px-2 py-0.5 font-medium text-red-800">{c.label} · {Math.round(100 * (m.colPct[c.indicator] || 0))}%</span>)}
        </div>
      )}
      {m.rows.length === 0 ? <Empty icon={Grid3x3} title="No assessments for this selection" /> : (
        <div className="scroll-thin overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white" />
                {m.cols.map((c) => (
                  <th key={c.indicator} className="h-36 w-12 min-w-[48px] align-bottom font-medium text-gray-600">
                    <div className="mx-auto w-5 whitespace-nowrap text-left [writing-mode:vertical-rl] rotate-180" title={c.label}>{c.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1 pr-3 font-semibold">All districts</td>
                {m.cols.map((c) => <td key={c.indicator} className="h-9 rounded-md text-center font-semibold" style={heat(m.colPct[c.indicator])}>{m.colPct[c.indicator] === null ? '' : Math.round(100 * m.colPct[c.indicator])}</td>)}
              </tr>
              {m.rows.map((r) => (
                <tr key={r.district}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1 pr-3"><span className="font-medium">{r.district}</span> <span className="text-gray-400">({r.n})</span></td>
                  {m.cols.map((c) => {
                    const v = r.pct[c.indicator];
                    return <td key={c.indicator} className="h-9 rounded-md text-center" style={heat(v)} title={`${r.district} · ${c.label}: ${v === null ? 'n/a' : `${Math.round(100 * v)}% lacking`}`}>{v === null ? '' : Math.round(100 * v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
        0%<div className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(255,255,255), rgb(185,55,45))' }} />100% lacking · (n) = assessed facilities
      </div>
    </section>
  );
}

function Hotspots({ facilities, onPick }) {
  const [band, setBand] = useState(25);
  const pts = useMemo(() => (facilities?.features || []).filter((f) => f.properties.spi !== null)
    .map((f) => { const [lat, lon] = latLon(f); return { lat, lon, value: f.properties.spi, p: f.properties }; }), [facilities]);
  const res = useMemo(() => {
    const z = giStar(pts, band);
    return pts.map((pt, i) => ({ ...pt, ...z[i], ...hotspotClass(z[i].z) }));
  }, [pts, band]);
  const cold = res.filter((r) => r.kind === 'cold').sort((a, b) => a.z - b.z);
  const keyOf = (r) => (r.kind === 'none' ? 'none' : `${r.kind}-${r.conf}`);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
          <div className="flex items-center gap-2 text-xs"><span className="text-gray-500">Neighbourhood</span>
            <Seg value={band} onChange={setBand} options={[[10, '10 km'], [25, '25 km'], [50, '50 km'], [100, '100 km']]} /></div>
          <span className="text-[11px] text-gray-400">{pts.length} assessed facilities</span>
        </div>
        <div className="relative h-[480px]">
          <MapContainer preferCanvas center={MALAWI_CENTER} zoom={6} minZoom={5} zoomControl={false} className="h-full w-full">
            <TileLayer url={BASEMAPS.standard.url} attribution={BASEMAPS.standard.attribution} maxZoom={BASEMAPS.standard.maxZoom} opacity={0.6} />
            <ZoomControl position="bottomright" />
            {res.map((r) => (
              <CircleMarker key={r.p.id} center={[r.lat, r.lon]} radius={r.kind === 'none' ? 5 : 8}
                pathOptions={{ color: '#fff', weight: 1.5, fillColor: HOTSPOT_STYLE[keyOf(r)].color, fillOpacity: 0.95 }}
                eventHandlers={{ click: () => onPick(r.p.id) }}>
                <Tooltip><b>{r.p.name}</b><br />SPI {r.p.spi}% · Gi* z = {r.z.toFixed(2)} · {r.neighbours} neighbours<br />{HOTSPOT_STYLE[keyOf(r)].label}</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
          <div className="absolute bottom-3 left-3 z-[1000] rounded-2xl border border-gray-200 bg-white/95 px-3 py-2.5 text-[11px] shadow-card">
            {Object.entries(HOTSPOT_STYLE).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />{v.label}</div>)}
          </div>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Flame size={16} className="text-red-600" />Low-preparedness clusters</h2>
        <p className="mb-3 text-[11px] text-gray-400">Facilities surrounded by other low-SPI facilities more than chance would explain (Getis-Ord Gi*, fixed {band} km band). Target these areas with area-wide programmes.</p>
        {pts.length < 30 && <p className="mb-3 flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-[11px] text-amber-800"><Info size={12} className="mt-px shrink-0" />With fewer than 30 assessed facilities, clusters are indicative only.</p>}
        {cold.length === 0 && <p className="py-6 text-center text-gray-400">No significant low-preparedness clusters at this distance.</p>}
        <ul className="divide-y divide-gray-100">
          {cold.map((r) => (
            <li key={r.p.id}>
              <button type="button" onClick={() => onPick(r.p.id)} className="flex w-full items-center gap-2 py-2 text-left">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HOTSPOT_STYLE[keyOf(r)].color }} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.p.name}</span><span className="text-[11px] text-gray-400">{typeOf(r.p.facility_type).label} · {r.p.district} · {r.conf}% confidence</span></span>
                <ClassPill cls={r.p.spi_class} spi={r.p.spi} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Analysis({ facilities, checklists, answers, districtAreas, history, onPick }) {
  const [tab, setTab] = useState('districts');
  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <PageHeader title="Analysis" subtitle="Patterns across districts: where preparedness is weakest, which gaps are most common, and where low preparedness clusters." />
      <div className="mb-4 flex">
        <Seg value={tab} onChange={setTab} options={[['districts', 'Districts'], ['gaps', 'Gap heatmap'], ['hotspots', 'Hotspots']]} />
      </div>
      {!facilities ? <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
        : tab === 'districts' ? <Districts facilities={facilities} districtAreas={districtAreas} history={history} />
          : tab === 'gaps' ? (answers && checklists ? <GapHeatmap facilities={facilities} checklists={checklists} answers={answers} /> : <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />)
            : <Hotspots facilities={facilities} onPick={onPick} />}
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-gray-400"><MapIcon size={12} />Upload district and TA boundaries under Admin → Data import → Boundaries to shade real district shapes.</p>
    </div>
  );
}
