import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup } from 'react-leaflet';
import { CLASS_STYLE, FLOOD_STYLE } from '../lib/api.js';

const radius = (learners) => Math.min(18, Math.max(6, 4 + Math.sqrt(learners) / 3.5));

function rpsColor(rps) {
  if (rps === null || rps === undefined) return '#9ca3af';
  if (rps >= 15) return '#7f1d1d';
  if (rps >= 5) return '#dc2626';
  if (rps > 0) return '#f59e0b';
  return '#16a34a';
}

export default function MapView({ schools, hazards, layers, onSelect }) {
  return (
    <MapContainer center={[-13.3, 34.3]} zoom={6} minZoom={5} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {layers.flood && hazards && (
        <GeoJSON
          key={`h-${hazards.features.length}`}
          data={hazards}
          style={(f) => ({
            color: FLOOD_STYLE[f.properties.level].color,
            weight: 1,
            fillOpacity: 0.25 + f.properties.level * 0.1,
          })}
          onEachFeature={(f, layer) =>
            layer.bindTooltip(`${f.properties.name || 'Flood zone'} (level ${f.properties.level})`)}
        />
      )}

      {layers.schools && schools?.features.map((f) => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        const color = layers.mode === 'risk' ? rpsColor(p.rps) : CLASS_STYLE[p.spi_class].color;
        return (
          <CircleMarker
            key={p.id}
            center={[lat, lon]}
            radius={layers.learnersSize ? radius(p.learners) : 8}
            pathOptions={{ color: '#111827', weight: 1, fillColor: color, fillOpacity: 0.9 }}
            eventHandlers={{ click: () => onSelect(p) }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.name}</div>
                <div className="text-gray-600">{p.district} - {p.level}</div>
                <div className="mt-1">
                  SPI: <b>{p.spi === null ? 'not assessed' : `${p.spi}%`}</b>
                  {' '}({CLASS_STYLE[p.spi_class].label})
                </div>
                <div>Learners: {p.learners.toLocaleString()}</div>
                <div>Flood level: {p.flood_level ? FLOOD_STYLE[p.flood_level].label : 'none'}</div>
                <div>Distance to road: {p.dist_to_road_m === null ? 'n/a' : `${(p.dist_to_road_m / 1000).toFixed(1)} km`}</div>
                <div>Risk priority score: {p.rps === null ? 'n/a' : p.rps}</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
