import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, ZoomControl } from 'react-leaflet';
import { Megaphone, Check, X, CircleCheckBig, Trash2, Phone, BellRing, MapPin } from 'lucide-react';
import { api, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { BASEMAPS } from '../lib/tiles.js';
import { typeOf } from '../lib/facilityTypes.js';
import { DEPTH, AFFECTED, ALERT_KM, ALERT_HOURS, latLon } from '../lib/decision.js';
import { PageHeader, Seg, Empty } from './ui.jsx';

const STATUS = {
  pending: { label: 'Waiting for review', cls: 'bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', cls: 'bg-blue-50 text-blue-800' },
  resolved: { label: 'Water receded', cls: 'bg-green-50 text-green-800' },
  rejected: { label: 'Rejected', cls: 'bg-gray-100 text-gray-500' },
};

export default function FloodReports({ reports, facilities, alerts, onReport, onPick, onChanged, refreshKey }) {
  const { isAdmin } = useAuth();
  const { toast, confirm } = useFeedback();
  const [all, setAll] = useState(null);
  const [filter, setFilter] = useState(isAdmin ? 'pending' : 'verified');
  const [focus, setFocus] = useState(null);

  const loadAll = useCallback(() => { if (isAdmin) api.allFloodReports().then(setAll).catch(() => setAll(null)); }, [isAdmin]);
  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);
  useEffect(() => { setFilter(isAdmin ? 'pending' : 'verified'); }, [isAdmin]);

  const list = useMemo(() => {
    const src = (isAdmin && all ? all : reports)?.features || [];
    return src.filter((r) => filter === 'all' || r.properties.status === filter);
  }, [isAdmin, all, reports, filter]);
  const pendingCount = (all?.features || []).filter((r) => r.properties.status === 'pending').length;
  const onAlert = useMemo(() => (facilities?.features || []).filter((f) => alerts?.has(f.properties.id))
    .map((f) => ({ f, a: alerts.get(f.properties.id) })).sort((x, y) => x.a.km - y.a.km), [facilities, alerts]);

  async function review(id, status) {
    try { await api.reviewReport(id, status); toast(status === 'verified' ? 'Report verified and shown on the map' : 'Report updated'); loadAll(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  }
  async function remove(id) {
    if (!await confirm({ title: 'Delete this report?', message: 'It is removed permanently.', confirmLabel: 'Delete', danger: true })) return;
    try { await api.deleteReport(id); toast('Report deleted'); loadAll(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  }

  const statusOptions = isAdmin
    ? [['pending', `To review${pendingCount ? ` (${pendingCount})` : ''}`], ['verified', 'Verified'], ['resolved', 'Receded'], ['all', 'All']]
    : [['verified', 'Active'], ['resolved', 'Receded'], ['all', 'All']];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="scroll-thin order-2 min-h-0 overflow-y-auto p-4 sm:p-6 lg:order-1 lg:w-[440px] lg:shrink-0 lg:border-r lg:border-gray-200">
        <PageHeader title="Flood reports" subtitle="Community reports of flooding. Verified reports put facilities within 5 km on alert for 72 hours.">
          <button type="button" className="btn-accent" onClick={onReport}><Megaphone size={15} />Report flooding</button>
        </PageHeader>

        {onAlert.length > 0 && (
          <section className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <h2 className="flex items-center gap-2 font-semibold text-blue-900"><BellRing size={16} />{onAlert.length} facilit{onAlert.length === 1 ? 'y' : 'ies'} on flood alert</h2>
            <p className="mb-2 text-[11px] text-blue-800">Within {ALERT_KM} km of a verified report from the last {ALERT_HOURS} hours. Contact them to check on people and activate evacuation plans.</p>
            <ul className="divide-y divide-blue-100">
              {onAlert.slice(0, 8).map(({ f, a }) => {
                const p = f.properties; const T = typeOf(p.facility_type);
                return (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <T.icon size={14} className="shrink-0 text-blue-700" />
                    <button type="button" onClick={() => onPick(p.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">{p.name}</button>
                    <span className="text-[11px] text-blue-800">{a.km.toFixed(1)} km</span>
                    {p.contact_phone && <a href={`tel:${p.contact_phone}`} className="rounded-lg bg-white p-1 text-blue-700" title={`Call ${p.contact_name || p.contact_phone}`}><Phone size={13} /></a>}
                  </li>
                );
              })}
            </ul>
            {onAlert.length > 8 && <p className="text-[11px] text-blue-800">+ {onAlert.length - 8} more</p>}
          </section>
        )}

        <Seg value={filter} onChange={setFilter} options={statusOptions} className="mb-3" />
        {list.length === 0 && <Empty icon={Megaphone} title={filter === 'pending' ? 'No reports waiting for review' : 'No flood reports'}>Reports from the last 14 days{isAdmin ? ' (90 for administrators)' : ''} appear here.</Empty>}
        <ul className="space-y-2.5">
          {list.map((r) => {
            const p = r.properties; const d = DEPTH[p.depth];
            return (
              <li key={p.id} className={`rounded-2xl border bg-white p-3.5 ${focus === p.id ? 'border-sky-400 ring-4 ring-sky-50' : 'border-gray-200'}`}>
                <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setFocus(p.id)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white" style={{ background: d.color }}>{d.short.split(' ')[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><b>{d.label}</b><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span></span>
                    <span className="block text-[11px] text-gray-400">Seen {timeAgo(p.observed_at)}{p.reporter_name ? ` · by ${p.reporter_name}` : ''}</span>
                    {p.affected?.length > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{p.affected.map((a) => <span key={a} className={`rounded-md px-1.5 py-0.5 text-[10px] ${a === 'people_trapped' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{AFFECTED[a] || a}</span>)}</span>}
                    {p.description && <span className="mt-1.5 block text-xs text-gray-600">{p.description}</span>}
                  </span>
                  {p.photo_url && <img src={p.photo_url} alt="Flood" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
                </button>
                {isAdmin && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
                    {p.reporter_phone && <a href={`tel:${p.reporter_phone}`} className="btn-ghost mr-auto px-2 py-1 text-xs"><Phone size={12} />{p.reporter_phone}</a>}
                    {p.status !== 'verified' && <button type="button" className="btn-dark px-2 py-1 text-xs" onClick={() => review(p.id, 'verified')}><Check size={12} />Verify</button>}
                    {p.status === 'verified' && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => review(p.id, 'resolved')}><CircleCheckBig size={12} />Water receded</button>}
                    {p.status === 'pending' && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => review(p.id, 'rejected')}><X size={12} />Reject</button>}
                    <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={() => remove(p.id)} aria-label="Delete report"><Trash2 size={12} /></button>
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
          {(facilities?.features || []).map((f) => {
            const on = alerts?.has(f.properties.id);
            return (
              <CircleMarker key={f.properties.id} center={latLon(f)} radius={on ? 6 : 3.5}
                pathOptions={{ color: '#fff', weight: 1, fillColor: on ? '#f59e0b' : '#6b7280', fillOpacity: on ? 1 : 0.5 }}
                eventHandlers={{ click: () => onPick(f.properties.id) }}>
                <Tooltip>{f.properties.name}{on ? ' · on flood alert' : ''}</Tooltip>
              </CircleMarker>
            );
          })}
          {list.map((r) => {
            const p = r.properties; const d = DEPTH[p.depth]; const pos = latLon(r);
            return (
              <Fragment key={p.id}>
                {p.status === 'verified' && <Circle center={pos} radius={ALERT_KM * 1000} pathOptions={{ color: d.color, weight: 1, dashArray: '4 4', fillOpacity: 0.06 }} />}
                <CircleMarker center={pos} radius={focus === p.id ? 11 : 8}
                  pathOptions={{ color: p.status === 'pending' ? '#f59e0b' : '#fff', weight: 2.5, fillColor: d.color, fillOpacity: p.status === 'rejected' ? 0.3 : 0.95 }}
                  eventHandlers={{ click: () => setFocus(p.id) }}>
                  <Tooltip><b>{d.label}</b> · {STATUS[p.status].label}<br />{timeAgo(p.observed_at)}</Tooltip>
                </CircleMarker>
              </Fragment>
            );
          })}
        </MapContainer>
        <div className="absolute bottom-3 left-3 z-[1000] hidden rounded-2xl border border-gray-200 bg-white/95 px-3 py-2.5 text-[11px] shadow-card sm:block">
          {Object.values(DEPTH).map((d) => <div key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.label}</div>)}
          <div className="mt-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Facility on alert</div>
          <div className="flex items-center gap-2"><MapPin size={10} className="text-gray-400" />Dashed ring: {ALERT_KM} km alert radius</div>
        </div>
      </div>
    </div>
  );
}
