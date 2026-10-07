import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { useMap } from 'react-leaflet';
import { CLASS_STYLE, rpsColor, fmtDate } from '../lib/api.js';
import { typeOf } from '../lib/facilityTypes.js';

const CLUSTER_ABOVE = 400; // cluster markers when there are more facilities than this
const CLASS_ORDER = ['high', 'moderate', 'low', 'unassessed'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cluster bubble: count in the middle, ring split by preparedness class of the facilities inside
function clusterIcon(cluster) {
  const kids = cluster.getAllChildMarkers();
  const n = kids.length;
  const counts = Object.fromEntries(CLASS_ORDER.map((k) => [k, 0]));
  kids.forEach((m) => { counts[m.options.cls] = (counts[m.options.cls] || 0) + 1; });
  let at = 0;
  const stops = CLASS_ORDER.filter((k) => counts[k]).map((k) => {
    const from = at; at += (360 * counts[k]) / n;
    return `${CLASS_STYLE[k].color} ${from}deg ${at}deg`;
  }).join(', ');
  const size = n < 50 ? 38 : n < 500 ? 46 : 54;
  return L.divIcon({
    className: 'fac-cluster',
    html: `<div style="background:conic-gradient(${stops})"><span>${n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n}</span></div>`,
    iconSize: [size, size],
  });
}

/**
 * Facility markers drawn imperatively (fast with thousands of points): clustered when there are many,
 * markers rebuilt only when data or styling changes, and only two icons swapped when the selection changes.
 */
export default function FacilityMarkers({ features, selected, onSelect, mode, sizeBy, pinIcon, size, floodHistory }) {
  const map = useMap();
  const groupRef = useRef(null);
  const markersRef = useRef(new Map());
  const selectedRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const wantRef = useRef(selected);
  wantRef.current = selected;

  // Build markers
  useEffect(() => {
    const many = (features?.length || 0) > CLUSTER_ABOVE;
    const group = many
      ? L.markerClusterGroup({
        chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 55, disableClusteringAtZoom: 12,
        spiderfyOnMaxZoom: true, iconCreateFunction: clusterIcon,
      })
      : L.layerGroup();
    const markers = new Map();
    const iconCache = new Map();
    const icon = (type, color, px, on) => {
      const k = `${type}|${color}|${px}|${on}`;
      if (!iconCache.has(k)) iconCache.set(k, pinIcon(type, color, px, on));
      return iconCache.get(k);
    };
    const list = (features || []).map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const color = mode === 'risk' ? rpsColor(p.rps) : CLASS_STYLE[p.spi_class].color;
      const px = size(p.people_served, sizeBy);
      const m = L.marker([lat, lon], { icon: icon(p.facility_type, color, px, false), cls: p.spi_class });
      m.styleArgs = [p.facility_type, color, px];
      m.iconFor = (on) => icon(m.styleArgs[0], m.styleArgs[1], m.styleArgs[2], on);
      const flooded = floodHistory?.get(p.id);
      m.bindTooltip(`<b>${esc(p.name)}</b><br>${esc(typeOf(p.facility_type).label)} · ${p.spi === null ? 'Not assessed' : `SPI ${Math.round(p.spi)}%`}${flooded ? `<br><span style="color:#c2410c">Flooded before · last ${esc(fmtDate(flooded.last))}</span>` : ''}`,
        { direction: 'top', offset: [0, -12] });
      m.on('click', () => onSelectRef.current(p.id));
      markers.set(p.id, m);
      return m;
    });
    if (many) group.addLayers(list); else list.forEach((m) => group.addLayer(m));
    group.addTo(map);
    groupRef.current = group; markersRef.current = markers; selectedRef.current = null;
    // Keep the current selection highlighted after a data refresh, without moving the map
    const cur = markers.get(wantRef.current);
    if (cur) { cur.setIcon(cur.iconFor(true)); cur.setZIndexOffset(1000); selectedRef.current = wantRef.current; }
    return () => { map.removeLayer(group); };
  }, [features, mode, sizeBy, floodHistory, map, pinIcon, size]);

  // Selection: swap two icons and bring the selected facility into view
  useEffect(() => {
    if (selectedRef.current === selected) return;
    const prev = markersRef.current.get(selectedRef.current);
    if (prev) { prev.setIcon(prev.iconFor(false)); prev.setZIndexOffset(0); }
    const m = markersRef.current.get(selected);
    selectedRef.current = selected;
    if (!m) return;
    m.setIcon(m.iconFor(true)); m.setZIndexOffset(1000);
    const group = groupRef.current;
    if (group?.getVisibleParent && group.getVisibleParent(m) !== m) {
      group.zoomToShowLayer(m);
    } else {
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 9), { duration: 0.8 });
    }
  }, [selected, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
