import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, ClipboardCheck, MapPin } from 'lucide-react';
import { ClassPill, FloodPill } from '../ui.jsx';
import { DeleteFacilityButton } from '../FacilityEditor.jsx';
import { typeOf } from '../../lib/facilityTypes.js';
import { fmtDate } from '../../lib/api.js';

export default function AdminFacilities({ facilities, onAdd, onEdit, onAssess, onShow, onChanged }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (facilities?.features || []).filter((f) => !n || `${f.properties.name} ${f.properties.district} ${f.properties.code || ''}`.toLowerCase().includes(n));
  }, [facilities, q]);
  const [limit, setLimit] = useState(200);
  useEffect(() => setLimit(200), [q]);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Manage facilities</h1>
          <p className="text-xs text-gray-500">{facilities?.features.length ?? '…'} facilities on the map</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="input pl-9" />
        </div>
        <button type="button" onClick={onAdd} className="btn-dark"><Plus size={16} />Add facility</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-gray-100 text-xs text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">Facility</th>
              <th className="px-4 py-3 font-medium">District</th>
              <th className="px-4 py-3 font-medium">People served</th>
              <th className="px-4 py-3 font-medium">Preparedness</th>
              <th className="px-4 py-3 font-medium">Last assessed</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Info updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.slice(0, limit).map((f) => {
              const p = f.properties;
              return (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[11px] text-gray-400">{typeOf(p.facility_type).label}{p.subtype ? ` · ${p.subtype}` : ''} · {p.code || `#${p.id}`}</div>
                  </td>
                  <td className="px-4 py-3">{p.district}</td>
                  <td className="px-4 py-3">{p.people_served.toLocaleString()}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><ClassPill cls={p.spi_class} spi={p.spi} /><FloodPill level={p.flood_level} /></div></td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{fmtDate(p.assessed_on)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{fmtDate(p.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => onShow(p.id)} className="btn-ghost px-2.5 py-1.5" title="Show on map"><MapPin size={14} /></button>
                      <button type="button" onClick={() => onAssess(p.id)} className="btn-ghost px-2.5 py-1.5" title="Assessment"><ClipboardCheck size={14} /></button>
                      <button type="button" onClick={() => onEdit(p.id)} className="btn-ghost px-2.5 py-1.5" title="Edit"><Pencil size={14} /></button>
                      <DeleteFacilityButton feature={f} onDeleted={onChanged} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {facilities && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No facilities found.</td></tr>}
          </tbody>
        </table>
        {rows.length > limit && (
          <div className="border-t border-gray-100 p-3 text-center">
            <button type="button" className="btn-ghost" onClick={() => setLimit((l) => l + 500)}>Show more ({(rows.length - limit).toLocaleString()} left)</button>
          </div>
        )}
      </div>
    </div>
  );
}
