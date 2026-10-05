import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import { BASEMAPS } from '../lib/tiles.js';

const icon = L.divIcon({
  className: 'pin pin-on',
  html: '<div class="pin-dot"><span></span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function ClickToMove({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lon }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], Math.max(map.getZoom(), 13));
  }, [lat, lon, map]);
  return null;
}

export default function LocationPicker({ lat, lon, onChange }) {
  const [gpsMsg, setGpsMsg] = useState('');
  const [recenterKey, setRecenterKey] = useState(0);
  const has = Number.isFinite(lat) && Number.isFinite(lon);
  const round = (n) => Math.round(n * 1e6) / 1e6;

  const useGps = () => {
    if (!navigator.geolocation) { setGpsMsg('This device has no GPS / location support.'); return; }
    setGpsMsg('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(round(pos.coords.latitude), round(pos.coords.longitude));
        setRecenterKey((k) => k + 1);
        setGpsMsg(`Location set (accuracy about ${Math.round(pos.coords.accuracy)} m). Drag the pin to fine-tune.`);
      },
      (err) => setGpsMsg(err.code === 1 ? 'Location permission was denied. Allow it in your browser, or tap the map instead.' : 'Could not get your location. Tap the map instead.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative h-64 overflow-hidden rounded-xl border border-gray-200">
        <MapContainer center={has ? [lat, lon] : [-13.3, 34.3]} zoom={has ? 13 : 6} className="h-full w-full">
          <TileLayer url={BASEMAPS.standard.url} attribution={BASEMAPS.standard.attribution} maxZoom={BASEMAPS.standard.maxZoom} />
          <ClickToMove onPick={(a, b) => onChange(round(a), round(b))} />
          {has && (
            <Marker position={[lat, lon]} icon={icon} draggable
              eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onChange(round(ll.lat), round(ll.lng)); } }} />
          )}
          <Recenter key={recenterKey} lat={lat} lon={lon} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-32"><span className="label">Latitude</span>
          <input className="input" inputMode="decimal" value={has ? lat : ''} placeholder="-13.98"
            onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value), lon)} /></label>
        <label className="w-32"><span className="label">Longitude</span>
          <input className="input" inputMode="decimal" value={has ? lon : ''} placeholder="33.78"
            onChange={(e) => onChange(lat, e.target.value === '' ? NaN : Number(e.target.value))} /></label>
        <button type="button" onClick={useGps} className="btn-ghost"><Crosshair size={15} />Use my GPS</button>
      </div>
      <p className="text-[11px] text-gray-400">{gpsMsg || 'Tap the map or drag the pin to the school\'s main gate. Standing at the school? Use GPS.'}</p>
    </div>
  );
}
