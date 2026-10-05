import { useMemo, useState } from 'react';
import { Plus, Search, Pencil, ClipboardCheck, MapPin } from 'lucide-react';
import { ClassPill, FloodPill } from '../ui.jsx';
import { DeleteSchoolButton } from '../SchoolEditor.jsx';
import { fmtDate } from '../../lib/api.js';

export default function AdminSchools({ schools, onAdd, onEdit, onAssess, onShow, onChanged }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (schools?.features || []).filter((f) => !n || `${f.properties.name} ${f.properties.district} ${f.properties.emis_code || ''}`.toLowerCase().includes(n));
  }, [schools, q]);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Manage schools</h1>
          <p className="text-xs text-gray-500">{schools?.features.length ?? '…'} schools on the map</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="input pl-9" />
        </div>
        <button type="button" onClick={onAdd} className="btn-dark"><Plus size={16} />Add school</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-gray-100 text-xs text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">District</th>
              <th className="px-4 py-3 font-medium">Learners</th>
              <th className="px-4 py-3 font-medium">Preparedness</th>
              <th className="px-4 py-3 font-medium">Last assessed</th>
              <th className="px-4 py-3 font-medium">Info updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((f) => {
              const p = f.properties;
              return (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[11px] text-gray-400">{p.emis_code || `#${p.id}`} · <span className="capitalize">{p.level}</span></div>
                  </td>
                  <td className="px-4 py-3">{p.district}</td>
                  <td className="px-4 py-3">{p.learners.toLocaleString()}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><ClassPill cls={p.spi_class} spi={p.spi} /><FloodPill level={p.flood_level} /></div></td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(p.assessed_on)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(p.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => onShow(p.id)} className="btn-ghost px-2.5 py-1.5" title="Show on map"><MapPin size={14} /></button>
                      <button type="button" onClick={() => onAssess(p.id)} className="btn-ghost px-2.5 py-1.5" title="Assessment"><ClipboardCheck size={14} /></button>
                      <button type="button" onClick={() => onEdit(p.id)} className="btn-ghost px-2.5 py-1.5" title="Edit"><Pencil size={14} /></button>
                      <DeleteSchoolButton feature={f} onDeleted={onChanged} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {schools && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No schools found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
