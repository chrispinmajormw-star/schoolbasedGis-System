import { ClipboardCheck, MapPin, TriangleAlert } from 'lucide-react';
import { CLASS_STYLE, FLOOD_STYLE, fmtDate } from '../lib/api.js';
import FacilityEditor from './FacilityEditor.jsx';
import { typeOf } from '../lib/facilityTypes.js';
import { needsAssessment } from '../lib/api.js';

export default function MyFacility({ feature, onAssess, onShow, onSaved }) {
  if (!feature) return <div className="p-6 text-gray-400">Loading your facility…</div>;
  const p = feature.properties;
  const cls = CLASS_STYLE[p.spi_class];
  const stale = needsAssessment(p);
  const T = typeOf(p.facility_type);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{p.name}</h1>
          <p className="text-xs text-gray-500">{T.label} · {p.district} · {p.code || `#${p.id}`} · Changes appear on the public map as soon as you save.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl p-4 sm:col-span-2" style={{ background: cls.bg, color: cls.text }}>
            <div className="text-xs font-medium">Safety Preparedness Index</div>
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
            <p>{p.assessed_on ? 'Your last assessment is more than 6 months old.' : 'This facility has not been assessed yet.'} Please complete the preparedness assessment so it shows correctly on the map.</p>
          </div>
        )}

        <FacilityEditor key={p.id} feature={feature} inline onSaved={onSaved} />
      </div>
    </div>
  );
}
