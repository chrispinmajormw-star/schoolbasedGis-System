import { createElement, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, ZoomControl } from 'react-leaflet';
import FacilityMarkers from './FacilityMarkers.jsx';
import ReferenceLayers, { roadStyle } from './ReferenceLayers.jsx';
import { Layers, LocateFixed, PanelLeftOpen } from 'lucide-react';
import { CLASS_STYLE, FLOOD_STYLE, rpsColor, classify, fmtDate } from '../lib/api.js';
import { DEPTH } from '../lib/decision.js';
import { BASEMAPS } from '../lib/tiles.js';
import { typeOf, TYPE_KEYS } from '../lib/facilityTypes.js';
import MapSearch from './MapSearch.jsx';

const MALAWI_CENTER = [-13.3, 34.3];
const DEFAULT_ON = { reports: false, districts: false, districtLines: true, tas: false, roads: true };
const size = (people, bySize) => (bySize ? Math.round(Math.min(34, Math.max(24, 18 + Math.sqrt(people) / 5))) : 26);

// Type icon (white) inside a dark pin, with a ring coloured by preparedness / risk.
// SVG markup is rendered once when this module loads (outside any React render).
const TYPE_SVG = Object.fromEntries(TYPE_KEYS.map((type) => {
  const el = document.createElement('div');
  const root = createRoot(el);
  flushSync(() => root.render(createElement(typeOf(type).icon, { size: 24, color: '#fff', strokeWidth: 2.25 })));
  const html = el.innerHTML;
  root.unmount();
  return [type, html];
}));

function pinIcon(type, color, px, on) {
  const s = on ? px + 8 : px;
  return L.divIcon({
    className: `pin ${on ? 'pin-on' : ''}`,
    html: `<div class="pin-type" style="--c:${color}">${TYPE_SVG[type] || ''}</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function reportIcon(depth) {
  return L.divIcon({
    className: 'report-pin',
    html: `<div style="--c:${DEPTH[depth]?.color || '#3b82f6'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M12 2.7c-.3 0-.6.2-.8.4C9.6 5.3 6 10.2 6 14a6 6 0 0 0 12 0c0-3.8-3.6-8.7-5.2-10.9-.2-.2-.5-.4-.8-.4z"/></svg></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function MapView({
  facilities, hazards, selected, onSelect, layers, setLayers, initialBase = 'standard', onShowList, allFacilities, onPick,
  reports, floodHistory, districtAreas,
}) {
  const [base, setBase] = useState(BASEMAPS[initialBase] ? initialBase : 'standard');
  const [showLayers, setShowLayers] = useState(false);
  const [map, setMap] = useState(null);
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !(l[k] ?? DEFAULT_ON[k]) }));
  const showReports = layers.reports ?? DEFAULT_ON.reports;
  const showDistricts = (layers.districts ?? DEFAULT_ON.districts) && districtAreas?.features?.length > 0;
  const hasDistricts = districtAreas?.features?.length > 0;
  const showDistrictLines = (layers.districtLines ?? DEFAULT_ON.districtLines) && hasDistricts && !showDistricts;
  const showTAs = layers.tas ?? DEFAULT_ON.tas;
  const showRoads = layers.roads ?? DEFAULT_ON.roads;
  const [roadsState, setRoadsState] = useState(null);
  // Mean SPI per district (all facilities, not just the filtered type) for district shading
  const districtSpi = useMemo(() => {
    const m = {};
    (allFacilities || facilities)?.features.forEach(({ properties: p }) => {
      if (p.spi === null) return;
      const k = p.district.toLowerCase();
      m[k] = m[k] || { sum: 0, n: 0 }; m[k].sum += p.spi; m[k].n += 1;
    });
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.sum / v.n]));
  }, [allFacilities, facilities]);
  const pastFloods = (reports?.features || []).filter((r) => ['verified', 'resolved'].includes(r.properties.status));

  return (
    <div className="relative h-full w-full">
      <MapContainer ref={setMap} center={MALAWI_CENTER} zoom={6} minZoom={5} scrollWheelZoom zoomControl={false} className="h-full w-full">
        <TileLayer key={base} url={BASEMAPS[base].url} attribution={BASEMAPS[base].attribution} maxZoom={BASEMAPS[base].maxZoom} />
        <ZoomControl position="bottomright" />

        {showDistricts && (
          <GeoJSON key={`d-${districtAreas.features.length}-${Object.keys(districtSpi).length}`} data={districtAreas}
            style={(f) => {
              const v = districtSpi[f.properties.name.toLowerCase()];
              return { color: '#475569', weight: 1, fillColor: v === undefined ? '#e5e7eb' : CLASS_STYLE[classify(v)].color, fillOpacity: 0.22 };
            }}
            onEachFeature={(f, layer) => {
              const v = districtSpi[f.properties.name.toLowerCase()];
              layer.bindTooltip(`${f.properties.name} · ${v === undefined ? 'no assessments' : `mean SPI ${Math.round(v)}%`}`, { sticky: true });
            }} />
        )}

        <ReferenceLayers districtAreas={districtAreas} showDistricts={showDistrictLines} showTAs={showTAs} showRoads={showRoads} onRoadsState={setRoadsState} />

        {layers.flood && hazards && (
          <GeoJSON
            key={`h-${hazards.features.length}`}
            data={hazards}
            style={(f) => ({
              color: FLOOD_STYLE[f.properties.level].color, weight: 1.5, dashArray: '4 4',
              fillColor: FLOOD_STYLE[f.properties.level].color, fillOpacity: 0.15 + f.properties.level * 0.08,
            })}
            onEachFeature={(f, layer) => layer.bindTooltip(`${f.properties.name || 'Flood zone'} · ${FLOOD_STYLE[f.properties.level].label} hazard`)}
          />
        )}

        {layers.facilities && (
          <FacilityMarkers features={facilities?.features} selected={selected} onSelect={onSelect} mode={layers.mode}
            sizeBy={layers.learnersSize} pinIcon={pinIcon} size={size} floodHistory={floodHistory} />
        )}

        {showReports && pastFloods.map((r) => {
          const p = r.properties;
          const [lon, lat] = r.geometry.coordinates;
          return (
            <Marker key={`r-${p.id}`} position={[lat, lon]} icon={reportIcon(p.depth)} zIndexOffset={500}>
              <Tooltip direction="top" offset={[0, -10]}>
                <b>Past flood · {fmtDate(p.observed_at)}</b><br />{DEPTH[p.depth]?.label}{p.event_name ? ` · ${p.event_name}` : ''}{p.description ? <><br />{p.description.slice(0, 90)}</> : null}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Top-left: show the facilities list again */}
      <div className="absolute left-3 top-3 z-[1000] flex gap-2">
        {onShowList && (
          <button type="button" onClick={onShowList} title="Show facilities list"
            className="btn hidden border border-gray-200 bg-white shadow-card md:inline-flex">
            <PanelLeftOpen size={16} />Facilities
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{facilities?.features.length ?? 0}</span>
          </button>
        )}
      </div>

      {/* Top-right: search + basemap + layers */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1001] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex items-center gap-2">
          <MapSearch facilities={allFacilities || facilities} onPick={onPick || onSelect} />
          <div className="seg shadow-card">
            {Object.entries(BASEMAPS).map(([k, { label }]) => (
              <button key={k} type="button" onClick={() => setBase(k)} className={`seg-btn px-3.5 ${base === k ? 'seg-btn-on' : ''}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setShowLayers((s) => !s)}
            className={`btn border bg-white shadow-card ${showLayers ? 'border-gray-900' : 'border-gray-200'}`}>
            <Layers size={16} />Layers
          </button>
        </div>
        {showLayers && (
          <div className="pointer-events-auto w-60 space-y-2.5 rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
            <label className="flex items-center justify-between">Facilities <input type="checkbox" checked={layers.facilities} onChange={() => toggle('facilities')} /></label>
            <label className="flex items-center justify-between">Flood hazard zones <input type="checkbox" checked={layers.flood} onChange={() => toggle('flood')} /></label>
            <label className="flex items-center justify-between">Past floods (flood history) <input type="checkbox" checked={showReports} onChange={() => toggle('reports')} /></label>
            <div className="border-t border-gray-100 pt-2 text-xs font-medium text-gray-500">Uploaded layers</div>
            <label className={`flex items-center justify-between ${hasDistricts ? '' : 'text-gray-300'}`}>District boundaries <input type="checkbox" disabled={!hasDistricts} checked={hasDistricts && (layers.districtLines ?? DEFAULT_ON.districtLines)} onChange={() => toggle('districtLines')} /></label>
            {hasDistricts && <label className="flex items-center justify-between pl-3 text-gray-600">Shade by mean SPI <input type="checkbox" checked={showDistricts} onChange={() => toggle('districts')} /></label>}
            <label className="flex items-center justify-between">Traditional Authorities <input type="checkbox" checked={showTAs} onChange={() => toggle('tas')} /></label>
            <label className="flex items-center justify-between">Roads <input type="checkbox" checked={showRoads} onChange={() => toggle('roads')} /></label>
            {showRoads && roadsState?.zoomIn && <p className="-mt-1 text-[11px] text-gray-400">Zoom in to district level to see roads.</p>}
            <div className="border-t border-gray-100 pt-2" />
            <label className="flex items-center justify-between">Size by people served <input type="checkbox" checked={layers.learnersSize} onChange={() => toggle('learnersSize')} /></label>
            <div className="pt-1 text-xs font-medium text-gray-500">Colour facilities by</div>
            <div className="seg">
              {[['spi', 'Preparedness'], ['risk', 'Risk priority']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setLayers((l) => ({ ...l, mode: k }))} className={`seg-btn ${layers.mode === k ? 'seg-btn-on' : ''}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button type="button" title="Show all of Malawi" aria-label="Show all of Malawi"
        onClick={() => map?.flyTo(MALAWI_CENTER, 6)}
        className="absolute bottom-[106px] right-[10px] z-[1000] flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-white text-gray-700 shadow-card hover:bg-gray-50">
        <LocateFixed size={16} />
      </button>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] hidden rounded-2xl border border-gray-200 bg-white/95 px-3.5 py-3 text-[11px] shadow-card backdrop-blur sm:block">
        <div className="mb-1.5 font-semibold text-gray-700">{layers.mode === 'risk' ? 'Risk priority score' : 'Preparedness (SPI)'}</div>
        <div className="space-y-1">
          {layers.mode === 'spi'
            ? Object.entries(CLASS_STYLE).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />{v.label}{v.range && <span className="text-gray-400">{v.range}</span>}</div>))
            : [['Very high (≥15)', 15], ['High (5–15)', 5], ['Some (<5)', 1], ['None', 0], ['Not assessed', null]].map(([l, v]) => (
              <div key={l} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: rpsColor(v) }} />{l}</div>))}
          {layers.flood && (
            <div className="flex items-center gap-2 pt-1"><span className="h-2.5 w-4 rounded-sm border border-dashed border-blue-600 bg-blue-200" />Flood zone</div>
          )}
          {(showDistrictLines || showTAs) && (
            <div className="flex items-center gap-2 pt-1"><span className="h-0 w-4 border-t-2 border-gray-700" />District{showTAs && <><span className="ml-1 h-0 w-4 border-t border-dashed border-slate-500" />TA</>}</div>
          )}
          {showRoads && roadsState && !roadsState.zoomIn && roadsState.count > 0 && (
            <div className="flex items-center gap-2"><span className="h-0 w-4 border-t-[3px]" style={{ borderColor: roadStyle('trunk').color }} /><span className="h-0 w-4 border-t-2" style={{ borderColor: roadStyle('secondary').color }} />Roads</div>
          )}
          {(facilities?.features.length || 0) > 400 && (
            <div className="flex items-center gap-2 pt-1"><span className="h-3 w-3 rounded-full border-2 border-red-500 bg-ink" />Group: ring shows the mix</div>
          )}
          {showReports && pastFloods.length > 0 && (
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-700 ring-2 ring-white" />Past flood (recorded)</div>
          )}
        </div>
      </div>
    </div>
  );
}
