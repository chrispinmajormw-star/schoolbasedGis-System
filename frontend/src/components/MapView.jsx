import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import { Layers, LocateFixed } from 'lucide-react';
import { CLASS_STYLE, FLOOD_STYLE, rpsColor } from '../lib/api.js';
import { BASEMAPS } from '../lib/tiles.js';

const MALAWI_CENTER = [-13.3, 34.3];
const size = (learners, bySize) => (bySize ? Math.round(Math.min(28, Math.max(16, 10 + Math.sqrt(learners) / 3))) : 20);

function pinIcon(color, px, on) {
  const s = on ? px + 8 : px;
  return L.divIcon({
    className: `pin ${on ? 'pin-on' : ''}`,
    html: `<div class="pin-dot" style="--c:${color}"><span></span></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const [lon, lat] = target.geometry.coordinates;
    map.flyTo([lat, lon], Math.max(map.getZoom(), 9), { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function MapView({ schools, hazards, selected, onSelect, layers, setLayers }) {
  const [base, setBase] = useState('standard');
  const [showLayers, setShowLayers] = useState(false);
  const [map, setMap] = useState(null);
  const selectedFeature = useMemo(
    () => schools?.features.find((f) => f.properties.id === selected) || null, [schools, selected]);
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="relative h-full w-full">
      <MapContainer ref={setMap} center={MALAWI_CENTER} zoom={6} minZoom={5} scrollWheelZoom zoomControl={false} className="h-full w-full">
        <TileLayer key={base} url={BASEMAPS[base].url} attribution={BASEMAPS[base].attribution} maxZoom={BASEMAPS[base].maxZoom} />
        <ZoomControl position="bottomright" />

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

        {layers.schools && schools?.features.map((f) => {
          const p = f.properties;
          const [lon, lat] = f.geometry.coordinates;
          const color = layers.mode === 'risk' ? rpsColor(p.rps) : CLASS_STYLE[p.spi_class].color;
          const on = p.id === selected;
          return (
            <Marker key={`${p.id}-${on}-${color}-${layers.learnersSize}`} position={[lat, lon]}
              icon={pinIcon(color, size(p.learners, layers.learnersSize), on)}
              zIndexOffset={on ? 1000 : 0}
              eventHandlers={{ click: () => onSelect(p.id) }}>
              <Tooltip direction="top" offset={[0, -14]}>
                <b>{p.name}</b><br />{p.spi === null ? 'Not assessed' : `SPI ${Math.round(p.spi)}%`}
              </Tooltip>
            </Marker>
          );
        })}
        <FlyTo target={selectedFeature} />
      </MapContainer>

      {/* Top-right: basemap + layers */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex items-center gap-2">
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
            <label className="flex items-center justify-between">Schools <input type="checkbox" checked={layers.schools} onChange={() => toggle('schools')} /></label>
            <label className="flex items-center justify-between">Flood hazard zones <input type="checkbox" checked={layers.flood} onChange={() => toggle('flood')} /></label>
            <label className="flex items-center justify-between">Size by learners <input type="checkbox" checked={layers.learnersSize} onChange={() => toggle('learnersSize')} /></label>
            <div className="pt-1 text-xs font-medium text-gray-500">Colour schools by</div>
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
        </div>
      </div>
    </div>
  );
}
