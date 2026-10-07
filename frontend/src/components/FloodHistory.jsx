import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, ZoomControl } from 'react-leaflet';
import { History, Plus, Check, X, Trash2, Phone, MapPinOff, Waves, Building2, CalendarRange, Download } from 'lucide-react';
import { api, fmtDate } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { BASEMAPS } from '../lib/tiles.js';
import { typeOf } from '../lib/facilityTypes.js';
import { DEPTH, AFFECTED, hazardCheck, latLon, pointInGeometry, downloadCsv } from '../lib/decision.js';
import { PageHeader, Seg, Stat, Empty } from './ui.jsx';

const STATUS = {
  pending: { label: 'Waiting for review', cls: 'bg-amber-50 text-amber-800' },
  verified: { label: 'Confirmed', cls: 'bg-green-50 text-green-800' },
  resolved: { label: 'Confirmed', cls: 'bg-green-50 text-green-800' },
  rejected: { label: 'Rejected', cls: 'bg-gray-100 text-gray-500' },
};
const isConfirmed = (r) => ['verified', 'resolved'].includes(r.properties.status);

/**
 * Flood history: confirmed records of past floods, used to see where floods reach facilities
 * and to check where the flood hazard map may be incomplete. Not a warning system.
 */
export default function FloodHistory({ records, facilities, hazards, history, onRecord, onPick, onChanged, refreshKey }) {
  const { isAdmin } = useAuth();
  const { toast, confirm } = useFeedback();
  const [all, setAll] = useState(null);
  const [filter, setFilter] = useState(isAdmin ? 'pending' : 'confirmed');
  const [event, setEvent] = useState('all');
  const [focus, setFocus] = useState(null);

  const loadAll = useCallback(() => { if (isAdmin) api.allFloodReports().then(setAll).catch(() => setAll(null)); }, [isAdmin]);
  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);
  useEffect(() => { setFilter(isAdmin ? 'pending' : 'confirmed'); }, [isAdmin]);

  const source = (isAdmin && all ? all : records)?.features || [];
  const pendingCount = source.filter((r) => r.properties.status === 'pending').length;
  const events = useMemo(() => [...new Set(source.map((r) => r.properties.event_name).filter(Boolean))].sort(), [source]);
  const list = useMemo(() => source.filter((r) => (filter === 'all'
    || (filter === 'confirmed' ? isConfirmed(r) : r.properties.status === filter))
    && (event === 'all' || r.properties.event_name === event)), [source, filter, event]);

  const check = useMemo(() => hazardCheck(facilities?.features, records, hazards, history), [facilities, records, hazards, history]);
  const outsideIds = useMemo(() => new Set(check.outside.map((r) => r.properties.id)), [check]);
  const zones = useMemo(() => (hazards?.features || []).map((z) => z.geometry), [hazards]);
  const inZone = (r) => { const [lon, lat] = r.geometry.coordinates; return zones.some((g) => pointInGeometry(lon, lat, g)); };

  async function review(id, status) {
    try { await api.reviewReport(id, status); toast(status === 'verified' ? 'Record confirmed' : 'Record updated'); loadAll(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  }
  async function remove(id) {
    if (!await confirm({ title: 'Delete this record?', message: 'It is removed permanently.', confirmLabel: 'Delete', danger: true })) return;
    try { await api.deleteReport(id); toast('Record deleted'); loadAll(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  }
  const exportCsv = () => downloadCsv('safecom_flood_history.csv', list.map((r) => {
    const p = r.properties; const [lon, lat] = r.geometry.coordinates;
    return {
      date: p.observed_at.slice(0, 10), event: p.event_name || '', depth: DEPTH[p.depth]?.label, affected: (p.affected || []).join('; '),
      facility: p.facility_name || '', lat, lon, inside_mapped_flood_zone: inZone(r) ? 'yes' : 'no', status: STATUS[p.status].label, description: p.description || '',
    };
  }));

  const statusOptions = isAdmin
    ? [['pending', `To review${pendingCount ? ` (${pendingCount})` : ''}`], ['confirmed', 'Confirmed'], ['rejected', 'Rejected'], ['all', 'All']]
    : [['confirmed', 'Confirmed']];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="scroll-thin order-2 min-h-0 overflow-y-auto p-4 sm:p-6 lg:order-1 lg:w-[460px] lg:shrink-0 lg:border-r lg:border-gray-200">
        <PageHeader title="Flood history" subtitle="Confirmed records of past floods: where water reached, how deep, and which facilities were flooded. Used to plan and to check the flood hazard map.">
          <button type="button" className="icon-btn" title="Download CSV" onClick={exportCsv} disabled={!list.length}><Download size={15} /></button>
          <button type="button" className="btn-dark" onClick={() => onRecord()}><Plus size={15} />Record a past flood</button>
        </PageHeader>

        <div className="grid grid-cols-2 gap-3">
          <Stat icon={History} label="Confirmed records" value={check.total} sub={`${events.length} named event${events.length === 1 ? '' : 's'}`} />
          <Stat icon={Building2} label="Facilities flooded before" value={history?.size || 0} sub="linked or within 500 m" />
        </div>

        <section className="mt-4 rounded-2xl border border-gray-200 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><MapPinOff size={16} className="text-red-600" />Hazard map check</h2>
          <p className="mt-1 text-[11px] text-gray-500">Compares recorded floods with the mapped flood hazard zones. Disagreements show where the hazard map should be reviewed.</p>
          {check.total === 0 ? <p className="mt-3 text-xs text-gray-400">No confirmed records yet.</p> : (
            <>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
                <div className="bg-blue-600" style={{ width: `${(100 * check.inside) / check.total}%` }} title="Inside mapped zones" />
                <div className="bg-red-500" style={{ width: `${(100 * check.outside.length) / check.total}%` }} title="Outside mapped zones" />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px]">
                <span className="text-blue-700"><b>{check.inside}</b> inside mapped zones</span>
                <span className="text-red-700"><b>{check.outside.length}</b> outside any mapped zone</span>
              </div>
              {check.unmappedFacilities.length > 0 && (
                <div className="mt-3 rounded-xl bg-red-50 p-3">
                  <p className="text-[11px] font-semibold text-red-800">{check.unmappedFacilities.length} facilit{check.unmappedFacilities.length === 1 ? 'y has' : 'ies have'} flooded before but {check.unmappedFacilities.length === 1 ? 'is' : 'are'} mapped outside flood zones:</p>
                  <ul className="mt-1.5 space-y-1">
                    {check.unmappedFacilities.slice(0, 8).map((x) => {
                      const T = typeOf(x.properties.facility_type);
                      return (
                        <li key={x.properties.id}>
                          <button type="button" onClick={() => onPick(x.properties.id)} className="flex items-center gap-1.5 text-left text-xs hover:underline">
                            <T.icon size={12} className="shrink-0 text-red-700" />{x.properties.name} <span className="text-gray-500">· {x.properties.district}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[10px] text-red-800">Their risk priority score is 0 because the map shows no hazard. Update the flood hazard layer for these areas.</p>
                </div>
              )}
            </>
          )}
        </section>

        <div className="mb-3 mt-4 flex flex-wrap items-center gap-2">
          {statusOptions.length > 1 && <Seg value={filter} onChange={setFilter} options={statusOptions} />}
          {events.length > 0 && (
            <select className="input w-auto py-1.5" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Flood event">
              <option value="all">All events</option>{events.map((x) => <option key={x}>{x}</option>)}
            </select>
          )}
        </div>
        {list.length === 0 && <Empty icon={Waves} title={filter === 'pending' ? 'No records waiting for review' : 'No flood records yet'}>Record past floods (for example from Cyclone Freddy or Cyclone Ana) to build the flood history.</Empty>}
        <ul className="space-y-2.5">
          {list.map((r) => {
            const p = r.properties; const d = DEPTH[p.depth];
            return (
              <li key={p.id} className={`rounded-2xl border bg-white p-3.5 ${focus === p.id ? 'border-sky-400 ring-4 ring-sky-50' : 'border-gray-200'}`}>
                <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setFocus(p.id)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white" style={{ background: d.color }}>{d.short.split(' ')[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><b>{fmtDate(p.observed_at)}</b><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                      {isConfirmed(r) && outsideIds.has(p.id) && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Outside mapped zones</span>}</span>
                    <span className="block text-[11px] text-gray-500">{d.label}{p.event_name ? ` · ${p.event_name}` : ''}{p.reporter_name && isAdmin ? ` · by ${p.reporter_name}` : ''}</span>
                    {p.facility_name && <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-gray-700"><Building2 size={11} />{p.facility_name} was flooded</span>}
                    {p.affected?.length > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{p.affected.map((a) => <span key={a} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">{AFFECTED[a] || a}</span>)}</span>}
                    {p.description && <span className="mt-1.5 block text-xs text-gray-600">{p.description}</span>}
                  </span>
                  {p.photo_url && <img src={p.photo_url} alt="Flood" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
                </button>
                {isAdmin && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
                    {p.reporter_phone && <a href={`tel:${p.reporter_phone}`} className="btn-ghost mr-auto px-2 py-1 text-xs"><Phone size={12} />{p.reporter_phone}</a>}
                    {!isConfirmed(r) && <button type="button" className="btn-dark px-2 py-1 text-xs" onClick={() => review(p.id, 'verified')}><Check size={12} />Confirm</button>}
                    {p.status === 'pending' && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => review(p.id, 'rejected')}><X size={12} />Reject</button>}
                    <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={() => remove(p.id)} aria-label="Delete record"><Trash2 size={12} /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative order-1 h-[45vh] shrink-0 lg:order-2 lg:h-auto lg:flex-1">
        <MapContainer center={[-15.2, 34.9]} zoom={7} minZoom={5} zoomControl={false} className="h-full w-full">
          <TileLayer url={BASEMAPS.standard.url} attribution={BASEMAPS.standard.attribution} maxZoom={BASEMAPS.standard.maxZoom} />
          <ZoomControl position="bottomright" />
          {hazards && <GeoJSON key={`hz-${hazards.features.length}`} data={hazards} style={{ color: '#1d4ed8', weight: 1, dashArray: '4 4', fillColor: '#3b82f6', fillOpacity: 0.12 }} />}
          {(facilities?.features || []).map((f) => {
            const h = history?.get(f.properties.id);
            return (
              <CircleMarker key={f.properties.id} center={latLon(f)} radius={h ? 6 : 3.5}
                pathOptions={{ color: '#fff', weight: 1, fillColor: h ? '#ea580c' : '#6b7280', fillOpacity: h ? 1 : 0.5 }}
                eventHandlers={{ click: () => onPick(f.properties.id) }}>
                <Tooltip>{f.properties.name}{h ? ` · flooded before (${h.count} record${h.count === 1 ? '' : 's'}, last ${fmtDate(h.last)})` : ''}</Tooltip>
              </CircleMarker>
            );
          })}
          {list.map((r) => {
            const p = r.properties; const d = DEPTH[p.depth];
            const outside = isConfirmed(r) && outsideIds.has(p.id);
            return (
              <CircleMarker key={p.id} center={latLon(r)} radius={focus === p.id ? 10 : 7}
                pathOptions={{ color: outside ? '#dc2626' : p.status === 'pending' ? '#f59e0b' : '#fff', weight: outside || p.status === 'pending' ? 3 : 2, fillColor: d.color, fillOpacity: p.status === 'rejected' ? 0.3 : 0.95 }}
                eventHandlers={{ click: () => setFocus(p.id) }}>
                <Tooltip><b>{fmtDate(p.observed_at)}</b> · {d.label}{p.event_name ? <><br />{p.event_name}</> : null}{outside ? <><br /><span style={{ color: '#dc2626' }}>Outside mapped flood zones</span></> : null}</Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <div className="absolute bottom-3 left-3 z-[1000] hidden rounded-2xl border border-gray-200 bg-white/95 px-3 py-2.5 text-[11px] shadow-card sm:block">
          {Object.values(DEPTH).map((d) => <div key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.label}</div>)}
          <div className="mt-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border-2 border-red-600 bg-blue-300" />Outside mapped zones</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-orange-600" />Facility flooded before</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-4 rounded-sm border border-dashed border-blue-700 bg-blue-100" />Mapped flood zone</div>
          <div className="mt-1 flex items-center gap-1.5 text-gray-400"><CalendarRange size={11} />All years</div>
        </div>
      </div>
    </div>
  );
}
