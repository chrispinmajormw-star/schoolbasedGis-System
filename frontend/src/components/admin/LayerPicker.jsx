// Shown when a zip contains several shapefiles: choose which layer to import.
const KIND = { point: ['point', 'points'], line: ['line', 'lines'], polygon: ['polygon', 'polygons'] };

export default function LayerPicker({ layers, value, onChange }) {
  if (!layers || layers.length < 2) return null;
  return (
    <label className="block rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <span className="mb-1 block text-xs font-medium text-amber-900">This zip contains {layers.length} layers. Choose the one to import:</span>
      <select className="input bg-white" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {layers.map((l, i) => <option key={`${l.name}-${i}`} value={i}>{l.name} · {l.features.length.toLocaleString()} {(KIND[l.kind] || ['record', 'records'])[l.features.length === 1 ? 0 : 1]}</option>)}
      </select>
    </label>
  );
}
