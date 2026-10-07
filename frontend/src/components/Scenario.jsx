import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Polyline, Polygon, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import {
  Waves, PenLine, CircleDot, History, Undo2, Trash2, Check, Download, Printer, Tent, TriangleAlert, Building2, Users, House, Info,
} from 'lucide-react';
import { FLOOD_STYLE } from '../lib/api.js';
import { BASEMAPS } from '../lib/tiles.js';
import { typeOf, FACILITY_TYPES } from '../lib/facilityTypes.js';
import { pointInGeometry, circlePolygon, distKm, latLon, fmtNum, downloadCsv } from '../lib/decision.js';
import { PageHeader, Seg, Stat, FloodPill } from './ui.jsx';

const MALAWI_CENTER = [-13.3, 34.3];

function Clicks({ onClick, drawing }) {
  const map = useMap();
  useEffect(() => {
    if (drawing) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
    map.getContainer().style.cursor = drawing ? 'crosshair' : '';
  }, [drawing, map]);
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

function FitTo({ geoms }) {
  const map = useMap();
  const key = JSON.stringify(geoms.map((g) => g.coordinates?.[0]?.[0]));
  useEffect(() => {
    const pts = [];
    geoms.forEach((g) => {
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      polys.forEach((rings) => rings[0].forEach(([lon, lat]) => pts.push([lat, lon])));
    });
    if (pts.length > 2) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Flood scenario: choose a flood extent and see which facilities are hit, which shelters are lost,
 * where people can go, and whether there is enough shelter capacity.
 */
export default function Scenario({ facilities, hazards, reports, onPick }) {
  const [source, setSource] = useState('zones');
  const [minLevel, setMinLevel] = useState(2);
  const [drawPts, setDrawPts] = useState([]);
  const [drawDone, setDrawDone] = useState(false);
  const [centre, setCentre] = useState(null);
  const [radius, setRadius] = useState(10);
  const [pastEvent, setPastEvent] = useState('all');
  const [reportKm, setReportKm] = useState(3);
  const [reachKm, setReachKm] = useState(10);
  const [displacedInput, setDisplacedInput] = useState('');

  // ---- flood extent as GeoJSON geometries
  const extent = useMemo(() => {
    if (source === 'zones') {
      return (hazards?.features || []).filter((f) => f.properties.level >= minLevel).map((f) => f.geometry);
    }
    if (source === 'draw') return drawDone && drawPts.length >= 3 ? [{ type: 'Polygon', coordinates: [[...drawPts.map(([la, lo]) => [lo, la]), [drawPts[0][1], drawPts[0][0]]]] }] : [];
    if (source === 'point') return centre ? [circlePolygon(centre[0], centre[1], radius)] : [];
    return (reports?.features || []).filter((r) => ['verified', 'resolved'].includes(r.properties.status) && (pastEvent === 'all' || r.properties.event_name === pastEvent))
      .map((r) => { const [la, lo] = latLon(r); return circlePolygon(la, lo, reportKm, 40); });
  }, [source, hazards, minLevel, drawDone, drawPts, centre, radius, reports, pastEvent, reportKm]);
  const pastEvents = useMemo(() => [...new Set((reports?.features || []).map((r) => r.properties.event_name).filter(Boolean))].sort(), [reports]);

  // ---- impact analysis
  const result = useMemo(() => {
    const all = facilities?.features || [];
    const inside = new Set();
    if (extent.length) {
      all.forEach((f) => {
        const [lon, lat] = f.geometry.coordinates;
        if (extent.some((g) => pointInGeometry(lon, lat, g))) inside.add(f.properties.id);
      });
    }
    const affected = all.filter((f) => inside.has(f.properties.id));
    const shelters = all.filter((f) => f.properties.shelter_capacity > 0);
    const flooded = shelters.filter((f) => inside.has(f.properties.id));
    const safe = shelters.filter((f) => !inside.has(f.properties.id));

    const reachable = new Set();
    const routes = affected.map((f) => {
      const [la, lo] = latLon(f);
      let best = null;
      safe.forEach((s) => {
        const [sla, slo] = latLon(s);
        const d = distKm(la, lo, sla, slo);
        if (d <= reachKm) reachable.add(s.properties.id);
        if (!best || d < best.km) best = { shelter: s, km: d };
      });
      return { f, best, inReach: !!best && best.km <= reachKm };
    });
    const safeInReach = safe.filter((s) => reachable.has(s.properties.id));
    const sum = (arr, k) => arr.reduce((t, f) => t + (f.properties[k] || 0), 0);
    const byType = {};
    affected.forEach((f) => { byType[f.properties.facility_type] = (byType[f.properties.facility_type] || 0) + 1; });
    const waterPoints = affected.filter((f) => f.properties.facility_type === 'water_point');

    // District roll-up
    const districts = new Map();
    const row = (d) => districts.get(d) || { district: d, affected: 0, people: 0, lostCap: 0, safeCap: 0, displaced: 0 };
    affected.forEach(({ properties: p }) => {
      const r = row(p.district); r.affected += 1; r.people += p.people_served;
      if (p.facility_type === 'water_point') r.displaced += p.people_served;
      if (p.shelter_capacity) r.lostCap += p.shelter_capacity;
      districts.set(p.district, r);
    });
    safeInReach.forEach(({ properties: p }) => { const r = row(p.district); r.safeCap += p.shelter_capacity; districts.set(p.district, r); });

    return {
      inside, affected, flooded, safe, safeInReach, reachable, routes, byType,
      people: sum(affected, 'people_served'),
      lostCap: sum(flooded, 'shelter_capacity'),
      safeCap: sum(safeInReach, 'shelter_capacity'),
      waterPoints: waterPoints.length,
      displacedEstimate: sum(waterPoints, 'people_served'),
      noReach: routes.filter((r) => !r.inReach).length,
      districts: [...districts.values()].sort((a, b) => b.affected - a.affected),
    };
  }, [facilities, extent, reachKm]);

  const displaced = displacedInput === '' ? result.displacedEstimate : Number(displacedInput) || 0;
  const balance = result.safeCap - displaced;

  const mapClick = (ll) => {
    if (source === 'draw' && !drawDone) setDrawPts((p) => [...p, [ll.lat, ll.lng]]);
    if (source === 'point') setCentre([ll.lat, ll.lng]);
  };

  const exportCsv = () => downloadCsv('safecom_flood_scenario.csv', result.routes.map(({ f, best, inReach }) => ({
    facility: f.properties.name, type: typeOf(f.properties.facility_type).label, district: f.properties.district,
    people_served: f.properties.people_served, spi: f.properties.spi ?? '', mapped_flood_level: f.properties.flood_level,
    nearest_safe_shelter: best?.shelter.properties.name || '', shelter_capacity: best?.shelter.properties.shelter_capacity || '',
    distance_km: best ? best.km.toFixed(1) : '', within_reach: inReach ? 'yes' : 'no',
  })));

  const extentLabel = source === 'zones' ? `Mapped flood zones (${minLevel === 3 ? 'high' : minLevel === 2 ? 'medium and high' : 'all levels'})`
    : source === 'draw' ? 'Drawn flood area' : source === 'point' ? `${radius} km around a point` : `Past floods: ${pastEvent === 'all' ? 'all records' : pastEvent} (${reportKm} km)`;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Controls and results */}
      <div className="scroll-thin order-2 min-h-0 overflow-y-auto p-4 sm:p-6 lg:order-1 lg:w-[440px] lg:shrink-0 lg:border-r lg:border-gray-200">
        <PageHeader title="Flood scenario" subtitle="If this area floods: who is affected, which shelters are lost, and is there enough safe shelter within reach?">
          <button type="button" className="icon-btn" title="Print scenario" onClick={() => window.print()}><Printer size={16} /></button>
          <button type="button" className="icon-btn" title="Download affected facilities (CSV)" disabled={!result.affected.length} onClick={exportCsv}><Download size={16} /></button>
        </PageHeader>

        <section className="card no-print p-4">
          <div className="label">Flood extent</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
            {[['zones', 'Flood zones', Waves], ['draw', 'Draw area', PenLine], ['point', 'Around a point', CircleDot], ['reports', 'Past floods', History]].map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => setSource(k)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${source === k ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2 text-xs">
            {source === 'zones' && (
              <>
                <Seg value={minLevel} onChange={setMinLevel} options={[[3, 'High only'], [2, 'Medium + high'], [1, 'All levels']]} />
                <p className="text-gray-400">{(hazards?.features || []).length} mapped flood zones. Load DoDMA or modelled flood extents as hazard zones for real scenarios.</p>
              </>
            )}
            {source === 'draw' && (
              <>
                <p className="text-gray-500">{drawDone ? 'Area drawn. Clear it to draw another.' : `Click the map to add corners (${drawPts.length} so far), then press Finish.`}</p>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={drawDone || !drawPts.length} onClick={() => setDrawPts((p) => p.slice(0, -1))}><Undo2 size={13} />Undo</button>
                  <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={!drawPts.length} onClick={() => { setDrawPts([]); setDrawDone(false); }}><Trash2 size={13} />Clear</button>
                  <button type="button" className="btn-dark px-2.5 py-1 text-xs" disabled={drawDone || drawPts.length < 3} onClick={() => setDrawDone(true)}><Check size={13} />Finish</button>
                </div>
              </>
            )}
            {source === 'point' && (
              <>
                <p className="text-gray-500">{centre ? 'Click elsewhere to move the centre.' : 'Click the map where the river burst or rain is heaviest.'}</p>
                <label className="flex items-center gap-3">Radius<input type="range" min="1" max="50" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="flex-1 accent-[#0f0f10]" /><b className="w-12 text-right">{radius} km</b></label>
              </>
            )}
            {source === 'reports' && (
              <>
                <select className="input py-1.5" value={pastEvent} onChange={(e) => setPastEvent(e.target.value)} aria-label="Past flood event">
                  <option value="all">All recorded floods</option>{pastEvents.map((x) => <option key={x}>{x}</option>)}
                </select>
                <label className="flex items-center gap-3">Buffer<input type="range" min="1" max="10" value={reportKm} onChange={(e) => setReportKm(Number(e.target.value))} className="flex-1 accent-[#0f0f10]" /><b className="w-12 text-right">{reportKm} km</b></label>
                <p className="text-gray-400">Re-runs a past flood from confirmed flood history records, to test today&apos;s facilities and shelters against it.</p>
              </>
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3 text-xs">
            <label className="flex items-center gap-3">Max distance to a shelter<input type="range" min="2" max="30" value={reachKm} onChange={(e) => setReachKm(Number(e.target.value))} className="flex-1 accent-[#0f0f10]" /><b className="w-12 text-right">{reachKm} km</b></label>
          </div>
        </section>

        {extent.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-gray-50 p-4 text-center text-gray-500">Choose a flood extent to run the scenario.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="hidden text-xs text-gray-500 print:block">Scenario: {extentLabel}. Max distance to shelter {reachKm} km.</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={Building2} label="Facilities affected" value={result.affected.length} sub={Object.entries(result.byType).map(([t, n]) => `${n} ${n === 1 ? typeOf(t).label.toLowerCase() : FACILITY_TYPES[t].plural.toLowerCase()}`).join(', ') || 'none'} />
              <Stat icon={Users} label="People served" value={fmtNum(result.people)} sub="by affected facilities" />
              <Stat icon={TriangleAlert} label="Shelter capacity lost" value={fmtNum(result.lostCap)} sub={`${result.flooded.length} shelters inside the flood`} tone={result.lostCap ? 'red' : undefined} />
              <Stat icon={Tent} label="Safe capacity in reach" value={fmtNum(result.safeCap)} sub={`${result.safeInReach.length} shelters within ${reachKm} km`} tone="green" />
            </div>

            <section className={`rounded-2xl border p-4 ${displaced && balance < 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-center gap-2 font-semibold"><House size={16} />Shelter balance</div>
              <label className="no-print mt-3 block text-xs">
                <span className="label">People needing shelter</span>
                <input type="number" min="0" className="input bg-white" value={displacedInput === '' ? result.displacedEstimate : displacedInput}
                  onChange={(e) => setDisplacedInput(e.target.value)} />
                <span className="mt-1 block text-[11px] text-gray-500">
                  {displacedInput === '' ? `Estimated from people served by ${result.waterPoints} affected water point${result.waterPoints === 1 ? '' : 's'}. Replace with DoDMA / IRA figures when known.` : <button type="button" className="underline" onClick={() => setDisplacedInput('')}>Use the water point estimate</button>}
                </span>
              </label>
              <div className={`mt-3 text-2xl font-semibold ${displaced && balance < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {!displaced ? 'Enter people needing shelter' : balance < 0 ? `Shortfall of ${fmtNum(-balance)} places` : `${fmtNum(balance)} spare places`}
              </div>
              {displaced > 0 && <p className="text-[11px] text-gray-600">{fmtNum(displaced)} people vs {fmtNum(result.safeCap)} safe places within {reachKm} km.</p>}
              {result.noReach > 0 && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-700"><TriangleAlert size={12} className="mt-px shrink-0" />{result.noReach} affected facilit{result.noReach === 1 ? 'y has' : 'ies have'} no safe shelter within {reachKm} km.</p>}
            </section>

            {result.districts.length > 0 && (
              <section className="card p-4">
                <h2 className="mb-2 font-semibold">By district</h2>
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-gray-400"><tr><th className="py-1.5 font-medium">District</th><th className="font-medium">Affected</th><th className="font-medium">Cap. lost</th><th className="font-medium">Safe cap.</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.districts.map((d) => (
                      <tr key={d.district}><td className="py-1.5 font-medium">{d.district}</td><td>{d.affected}</td><td className={d.lostCap ? 'text-red-700' : ''}>{fmtNum(d.lostCap)}</td><td className="text-green-700">{fmtNum(d.safeCap)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="card p-4">
              <h2 className="mb-1 font-semibold">Affected facilities → nearest safe shelter</h2>
              <p className="mb-2 text-[11px] text-gray-400">Straight-line distance. Road access and cut bridges are not yet modelled.</p>
              {result.routes.length === 0 && <p className="py-4 text-center text-gray-400">No facilities inside this extent.</p>}
              <ul className="divide-y divide-gray-100">
                {result.routes.slice(0, 60).map(({ f, best, inReach }) => {
                  const p = f.properties; const T = typeOf(p.facility_type);
                  return (
                    <li key={p.id} className="py-2">
                      <button type="button" onClick={() => onPick(p.id)} className="flex w-full items-start gap-2 text-left">
                        <T.icon size={14} className="mt-0.5 shrink-0 text-red-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className={`block text-[11px] ${inReach ? 'text-gray-500' : 'text-red-700'}`}>
                            {best ? `${inReach ? '→' : 'Nearest:'} ${best.shelter.properties.name} · ${best.km.toFixed(1)} km · ${fmtNum(best.shelter.properties.shelter_capacity)} places` : 'No safe shelter mapped'}
                          </span>
                        </span>
                        <FloodPill level={p.flood_level} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {result.routes.length > 60 && <p className="pt-2 text-[11px] text-gray-400">+ {result.routes.length - 60} more in the CSV</p>}
            </section>
            <p className="flex items-start gap-1.5 text-[11px] text-gray-400"><Info size={12} className="mt-px shrink-0" />Shelter capacity comes from each facility&apos;s &ldquo;can shelter&rdquo; figure. Keep it updated in facility info.</p>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative order-1 h-[50vh] shrink-0 lg:order-2 lg:h-auto lg:flex-1">
        <MapContainer center={MALAWI_CENTER} zoom={6} minZoom={5} zoomControl={false} className="h-full w-full">
          <TileLayer url={BASEMAPS.standard.url} attribution={BASEMAPS.standard.attribution} maxZoom={BASEMAPS.standard.maxZoom} />
          <ZoomControl position="bottomright" />
          <Clicks onClick={mapClick} drawing={(source === 'draw' && !drawDone) || source === 'point'} />
          {extent.length > 0 && source !== 'draw' && <FitTo geoms={extent} />}

          {extent.map((g, i) => (
            <GeoJSON key={`${source}-${minLevel}-${radius}-${reportKm}-${i}-${JSON.stringify(g.coordinates[0]?.[0])}`} data={g}
              style={{ color: '#1d4ed8', weight: 1.5, dashArray: '4 4', fillColor: '#3b82f6', fillOpacity: 0.25 }} />
          ))}
          {source === 'draw' && drawPts.length > 0 && (drawDone
            ? null
            : drawPts.length >= 3 ? <Polygon positions={drawPts} pathOptions={{ color: '#1d4ed8', dashArray: '4 4', fillOpacity: 0.1 }} />
              : <Polyline positions={drawPts} pathOptions={{ color: '#1d4ed8', dashArray: '4 4' }} />)}
          {source === 'draw' && !drawDone && drawPts.map((pt, i) => <CircleMarker key={i} center={pt} radius={4} pathOptions={{ color: '#1d4ed8', fillColor: '#fff', fillOpacity: 1, weight: 2 }} />)}

          {result.routes.filter((r) => r.inReach).map(({ f, best }) => (
            <Polyline key={`r-${f.properties.id}`} positions={[latLon(f), latLon(best.shelter)]} pathOptions={{ color: '#16a34a', weight: 1.5, dashArray: '3 5' }} />
          ))}

          {(facilities?.features || []).map((f) => {
            const p = f.properties;
            const hit = result.inside.has(p.id);
            const shelter = p.shelter_capacity > 0;
            const reach = shelter && !hit && result.reachable.has(p.id);
            const color = hit ? (shelter ? '#7f1d1d' : '#dc2626') : reach ? '#16a34a' : '#9ca3af';
            return (
              <CircleMarker key={p.id} center={latLon(f)} radius={hit || reach ? (shelter ? 8 : 6) : 4}
                pathOptions={{ color: '#fff', weight: 1.5, fillColor: color, fillOpacity: hit || reach ? 1 : 0.6 }}
                eventHandlers={{ click: () => onPick(p.id) }}>
                <Tooltip direction="top"><b>{p.name}</b><br />{typeOf(p.facility_type).label}{shelter ? ` · shelters ${fmtNum(p.shelter_capacity)}` : ''}{hit ? ' · in flood' : ''}</Tooltip>
              </CircleMarker>
            );
          })}
          {source === 'point' && centre && <CircleMarker center={centre} radius={5} pathOptions={{ color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 1 }} />}
        </MapContainer>

        <div className="absolute bottom-3 left-3 z-[1000] hidden rounded-2xl border border-gray-200 bg-white/95 px-3.5 py-3 text-[11px] shadow-card sm:block">
          <div className="mb-1.5 font-semibold text-gray-700">{extentLabel}</div>
          {[['#dc2626', 'Affected facility'], ['#7f1d1d', 'Shelter inside the flood'], ['#16a34a', `Safe shelter within ${reachKm} km`], ['#9ca3af', 'Other facility']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</div>
          ))}
          <div className="mt-1 flex items-center gap-2"><span className="h-2.5 w-4 rounded-sm border border-dashed border-blue-700 bg-blue-200" />Flood extent</div>
          {source === 'zones' && <div className="mt-1 text-gray-400">{[3, 2, 1].filter((l) => l >= minLevel).map((l) => FLOOD_STYLE[l].label).join(', ')} hazard</div>}
        </div>
      </div>
    </div>
  );
}
