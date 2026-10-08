import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';
import { CLASS_STYLE, classify } from '../lib/api.js';

// Soft, clearly different colours for neighbouring districts
export const DISTRICT_PALETTE = ['#93c5fd', '#fca5a5', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74', '#a5b4fc', '#bef264'];

const keyOf = (name) => String(name || '').trim().toLowerCase();

function bboxOf(geometry) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); return; }
    c.forEach(walk);
  };
  walk(geometry.coordinates);
  return b;
}

/**
 * Give every district a colour different from its neighbours (greedy graph colouring; districts whose
 * bounding boxes touch count as neighbours, which is strict enough for 10 colours).
 */
export function districtColours(features) {
  const boxes = features.map((f) => bboxOf(f.geometry));
  const eps = 0.01;
  const near = (a, b) => a[0] <= b[2] + eps && b[0] <= a[2] + eps && a[1] <= b[3] + eps && b[1] <= a[3] + eps;
  const adj = features.map((_, i) => features.map((__, j) => (i !== j && near(boxes[i], boxes[j]) ? j : -1)).filter((j) => j >= 0));
  const order = features.map((_, i) => i).sort((a, b) => adj[b].length - adj[a].length);
  const colour = new Array(features.length).fill(-1);
  order.forEach((i) => {
    const used = new Set(adj[i].map((j) => colour[j]));
    let c = 0;
    while (used.has(c) && c < DISTRICT_PALETTE.length - 1) c += 1;
    colour[i] = c;
  });
  return Object.fromEntries(features.map((f, i) => [keyOf(f.properties.name), DISTRICT_PALETTE[colour[i]]]));
}

// Hide district name labels when zoomed far out (they would overlap)
function LabelZoom() {
  const map = useMap();
  const apply = () => map.getContainer().classList.toggle('hide-district-labels', map.getZoom() < 7);
  useMapEvents({ zoomend: apply });
  useEffect(() => { apply(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FitTo({ feature }) {
  const map = useMap();
  useEffect(() => {
    if (!feature) return;
    const b = L.geoJSON(feature).getBounds();
    if (b.isValid()) map.flyToBounds(b, { padding: [40, 40], duration: 0.8, maxZoom: 11 });
  }, [feature, map]);
  return null;
}

// Everything outside the focused district is faded with a white mask (a world polygon with the district as a hole)
function maskFor(feature) {
  const world = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
  const g = feature.geometry;
  const outers = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...outers] } };
}

/**
 * District boundaries on the main map.
 * mode: 'distinct' (each district its own colour) | 'spi' (mean SPI class colour) | 'outline'
 * focus: name of the district being viewed on its own, or null. Click a district to focus on it.
 */
export default function DistrictLayer({ districtAreas, mode = 'distinct', districtSpi, focus, onFocus }) {
  const features = districtAreas?.features || [];
  const colours = useMemo(() => districtColours(features), [features]);
  const focused = useMemo(() => (focus ? features.find((f) => keyOf(f.properties.name) === keyOf(focus)) || null : null), [features, focus]);
  const shown = useMemo(() => ({ type: 'FeatureCollection', features: focused ? [focused] : features }), [features, focused]);
  if (!features.length) return null;

  const fillFor = (name) => {
    if (mode === 'spi') { const v = districtSpi?.[keyOf(name)]; return v === undefined ? '#e5e7eb' : CLASS_STYLE[classify(v)].color; }
    return colours[keyOf(name)] || '#e5e7eb';
  };

  return (
    <>
      <LabelZoom />
      <FitTo feature={focused} />
      {focused && (
        <Pane name="district-mask" style={{ zIndex: 450 }}>
          <GeoJSON key={`mask-${focus}`} data={maskFor(focused)} interactive={false}
            style={{ stroke: false, fillColor: '#f8fafc', fillOpacity: 0.82 }} />
        </Pane>
      )}
      <GeoJSON key={`districts-${mode}-${focus || 'all'}-${features.length}-${Object.keys(districtSpi || {}).length}`} data={shown}
        style={(f) => ({
          color: focused ? '#0f0f10' : '#334155',
          weight: focused ? 3 : 1.2,
          opacity: 0.85,
          fillColor: fillFor(f.properties.name),
          fillOpacity: mode === 'outline' ? 0 : focused ? 0.12 : 0.3,
        })}
        onEachFeature={(f, layer) => {
          const name = f.properties.name;
          const v = districtSpi?.[keyOf(name)];
          const spi = v === undefined ? '' : ` · mean SPI ${Math.round(v)}%`;
          layer.bindTooltip(`<b>${name}</b>${spi}${focused ? '' : '<br><span style="color:#6b7280">Click to view this district only</span>'}`, { sticky: true });
          if (focused) return;
          layer.on('click', (e) => { L.DomEvent.stopPropagation(e); onFocus?.(name); });
          layer.on('mouseover', () => layer.setStyle({ weight: 2.5, fillOpacity: mode === 'outline' ? 0.05 : 0.45 }));
          layer.on('mouseout', () => layer.setStyle({ weight: 1.2, fillOpacity: mode === 'outline' ? 0 : 0.3 }));
        }} />
      {!focused && (
        // District names as labels in the middle of each district
        <GeoJSON key={`labels-${features.length}`} data={districtAreas} interactive={false}
          style={{ stroke: false, fill: false }}
          onEachFeature={(f, layer) => layer.bindTooltip(f.properties.name, { permanent: true, direction: 'center', className: 'district-label', interactive: false })} />
      )}
    </>
  );
}
