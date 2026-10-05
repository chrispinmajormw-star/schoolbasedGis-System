import { ClipboardCheck, MapPin, TriangleAlert } from 'lucide-react';
import { CLASS_STYLE, FLOOD_STYLE, fmtDate } from '../lib/api.js';
import SchoolEditor from './SchoolEditor.jsx';

export default function MySchool({ feature, onAssess, onShow, onSaved }) {
  if (!feature) return <div className="p-6 text-gray-400">Loading your school…</div>;
  const p = feature.properties;
  const cls = CLASS_STYLE[p.spi_class];
  const stale = !p.assessed_on || (Date.now() - new Date(p.assessed_on)) / 864e5 > 180;

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{p.name}</h1>
          <p className="text-xs text-gray-500">{p.district} · {p.emis_code || `#${p.id}`} · Changes appear on the public map as soon as you save.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl p-4 sm:col-span-2" style={{ background: cls.bg, color: cls.text }}>
            <div className="text-xs font-medium">School Preparedness Index</div>
            <div className="mt-1 flex items-end gap-3">
              <span className="text-3xl font-bold">{p.spi === null ? '—' : `${p.spi}%`}</span>
              <span className="pb-1 text-sm font-semibold">{cls.label}</span>
            </div>
            <div className="mt-1 text-xs">Last assessed {fmtDate(p.assessed_on)}{p.flood_level ? ` · ${FLOOD_STYLE[p.flood_level].label} flood hazard zone` : ''}</div>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onAssess} className="btn-accent flex-1 py-3"><ClipboardCheck size={16} />Update assessment</button>
            <button type="button" onClick={onShow} className="btn-ghost flex-1 py-3"><MapPin size={16} />View on map</button>
          </div>
        </div>

        {stale && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            <p>{p.assessed_on ? 'Your last assessment is more than 6 months old.' : 'Your school has not been assessed yet.'} Please complete the preparedness assessment so your school shows correctly on the map.</p>
          </div>
        )}

        <SchoolEditor key={p.id} feature={feature} inline onSaved={onSaved} />
      </div>
    </div>
  );
}
