import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import { api } from '../lib/api.js';

// Road style by class (OSM "highway" values or Roads Authority classes)
export function roadStyle(cls) {
  const c = String(cls || '').toLowerCase();
  if (/motorway|trunk|^m\d|main|national/.test(c)) return { color: '#b45309', weight: 3 };
  if (/primary|^s\d|district/.test(c)) return { color: '#d97706', weight: 2.4 };
  if (/secondary|^t\d/.test(c)) return { color: '#f59e0b', weight: 1.8 };
  if (/track|path|foot/.test(c)) return { color: '#9ca3af', weight: 1, dashArray: '3 3' };
  return { color: '#6b7280', weight: 1.3 };
}

const ROADS_MIN_ZOOM = 8;

/** Roads for the visible area only; reloads (debounced) when the map moves. */
function Roads({ renderer, onState }) {
  const map = useMap();
  const [data, setData] = useState(null);
  const timer = useRef(null);
  const seq = useRef(0);
  const load = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const z = map.getZoom();
      if (z < ROADS_MIN_ZOOM) { setData(null); onState?.({ zoomIn: true }); return; }
      const b = map.getBounds().pad(0.2);
      const my = ++seq.current;
      try {
        const fc = await api.roads([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], z);
        if (my !== seq.current) return; // a newer request is on its way
        setData(fc); onState?.({ zoomIn: false, count: fc.features.length, truncated: fc.truncated });
      } catch { onState?.({ error: true }); }
    }, 250);
  };
  useMapEvents({ moveend: load });
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data?.features?.length) return null;
  return (
    <GeoJSON key={`roads-${seq.current}`} data={data} renderer={renderer} interactive
      style={(f) => roadStyle(f.properties.road_class)}
      onEachFeature={(f, layer) => {
        const p = f.properties;
        if (p.name || p.road_class) layer.bindTooltip(`${p.name || 'Road'}${p.road_class ? ` · ${p.road_class}` : ''}`, { sticky: true });
      }} />
  );
}

/**
 * Uploaded reference layers on the main map: district boundaries, Traditional Authority boundaries and roads.
 * Drawn on a canvas so large layers stay fast.
 */
export default function ReferenceLayers({ districtAreas, showDistricts, showTAs, showRoads, onRoadsState }) {
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const [tas, setTas] = useState(null);
  useEffect(() => {
    if (!showTAs || tas) return;
    api.adminAreas('ta').then(setTas).catch(() => setTas({ type: 'FeatureCollection', features: [] }));
  }, [showTAs, tas]);

  return (
    <>
      {showTAs && tas?.features?.length > 0 && (
        <GeoJSON key={`ta-${tas.features.length}`} data={tas} renderer={renderer}
          style={{ color: '#64748b', weight: 0.8, dashArray: '4 3', fill: true, fillOpacity: 0, opacity: 0.9 }}
          onEachFeature={(f, layer) => layer.bindTooltip(`${f.properties.name}${f.properties.district ? ` · ${f.properties.district}` : ''}`, { sticky: true })} />
      )}
      {showDistricts && districtAreas?.features?.length > 0 && (
        <GeoJSON key={`dl-${districtAreas.features.length}`} data={districtAreas} renderer={renderer}
          style={{ color: '#1f2937', weight: 1.6, fill: true, fillOpacity: 0, opacity: 0.75 }}
          onEachFeature={(f, layer) => layer.bindTooltip(`${f.properties.name} District`, { sticky: true })} />
      )}
      {showRoads && <Roads renderer={renderer} onState={onRoadsState} />}
    </>
  );
}
