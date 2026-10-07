import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, SlidersHorizontal, Plus, Pencil, UserPlus, Users, LayoutGrid, PanelLeftClose } from 'lucide-react';
import { api, CLASS_STYLE, timeAgo } from '../lib/api.js';
import { FACILITY_TYPES, TYPE_KEYS, typeOf } from '../lib/facilityTypes.js';
import { useAuth } from '../lib/auth.jsx';
import { ClassPill, FloodPill } from './ui.jsx';

const TABS = [['all', 'All'], ['low', 'Low'], ['moderate', 'Moderate'], ['high', 'High']];

function SpiTrack({ p }) {
  const { spi } = p;
  const s = CLASS_STYLE[p.spi_class];
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
      <span className="w-14 shrink-0 truncate font-medium text-gray-700">{p.district}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-gray-100">
        {spi !== null && (
          <>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${spi}%`, background: s.color }} />
            <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${spi}%`, background: '#0f0f10' }} />
          </>
        )}
      </div>
      <span className="w-10 shrink-0 text-right font-semibold text-gray-700">{spi === null ? '—' : `${Math.round(spi)}%`}</span>
    </div>
  );
}

export default function FacilityList({ facilities, typeFilter, setTypeFilter, selectedId, onSelect, onAdd, onEditMine, onJoin, lastUpdated, onRefresh, onHide }) {
  const { profile, isAdmin, session } = useAuth();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [floodOnly, setFloodOnly] = useState(false);
  const [sort, setSort] = useState('name');
  const listRef = useRef(null);
  const moreRef = useRef(null);
  const [limit, setLimit] = useState(100);
  const [, tick] = useState(0);

  // Keep the "updated x ago" label fresh
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);

  // Large lists render 100 cards at a time; more load as you scroll
  useEffect(() => { setLimit(100); }, [q, tab, floodOnly, sort, typeFilter]);
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setLimit((l) => l + 200); }, { root: listRef.current, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  });

  const all = useMemo(() => facilities?.features.map((f) => f.properties) || [], [facilities]);
  const counts = useMemo(() => all.reduce((c, p) => ({ ...c, [p.facility_type]: (c[p.facility_type] || 0) + 1 }), {}), [all]);
  const filtered = tab !== 'all' || floodOnly || q.trim() || typeFilter !== 'all';
  const clear = () => { setTab('all'); setFloodOnly(false); setQ(''); setTypeFilter('all'); };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => typeFilter === 'all' || p.facility_type === typeFilter)
      .filter((p) => tab === 'all' || p.spi_class === tab)
      .filter((p) => !floodOnly || p.flood_level > 0)
      .filter((p) => !needle || `${p.name} ${p.district} ${p.code || ''} ${typeOf(p.facility_type).label}`.toLowerCase().includes(needle))
      .sort((a, b) => (sort === 'risk' ? (b.rps ?? -1) - (a.rps ?? -1) : a.name.localeCompare(b.name)));
  }, [all, q, tab, floodOnly, sort, typeFilter]);

  // When a facility is picked on the map, make sure its card is rendered, then bring it into view
  useEffect(() => {
    if (!selectedId) return;
    const i = list.findIndex((p) => p.id === selectedId);
    if (i >= limit) { setLimit(i + 50); return; }
    listRef.current?.querySelector(`[data-facility="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, list, limit]);

  const chip = (key, label, Icon, n) => (
    <button key={key} type="button" onClick={() => setTypeFilter(key)} title={label}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition ${
        typeFilter === key ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
      <Icon size={13} />{label}<span className={typeFilter === key ? 'text-accent' : 'text-gray-400'}>{n}</span>
    </button>
  );

  return (
    <section className="flex min-h-0 w-full flex-col border-gray-200 md:w-[360px] md:shrink-0 md:border-r">
      <div className="space-y-3 p-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Community facilities</h1>
            <button type="button" onClick={onRefresh} title="Refresh now" className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-green-500" />Live · updated {timeAgo(lastUpdated)}
            </button>
          </div>
          <div className="flex gap-1.5">
            <a href={api.exportUrl} className="icon-btn" title="Download CSV" aria-label="Download CSV"><Download size={16} /></a>
            {onHide && (
              <button type="button" onClick={onHide} className="icon-btn hidden md:inline-flex" title="Hide list (show map only)" aria-label="Hide facilities list">
                <PanelLeftClose size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, district, code" className="input pl-9" />
        </div>
        <div className="scroll-thin -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {chip('all', 'All', LayoutGrid, all.length)}
          {TYPE_KEYS.filter((k) => counts[k]).map((k) => chip(k, FACILITY_TYPES[k].plural, FACILITY_TYPES[k].icon, counts[k]))}
        </div>
        <div className="flex gap-2">
          <div className="seg flex-1">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`seg-btn ${tab === k ? 'seg-btn-on' : ''}`}>{label}</button>
            ))}
          </div>
          <details className="relative">
            <summary className={`icon-btn cursor-pointer list-none ${floodOnly || sort === 'risk' ? 'border-gray-900 text-gray-900' : ''}`} title="Filters">
              <SlidersHorizontal size={16} />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-52 space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-card">
              <label className="flex items-center gap-2"><input type="checkbox" checked={floodOnly} onChange={(e) => setFloodOnly(e.target.checked)} /> In flood zones only</label>
              <div className="text-xs font-medium text-gray-500">Sort by</div>
              <label className="flex items-center gap-2"><input type="radio" checked={sort === 'name'} onChange={() => setSort('name')} /> Name</label>
              <label className="flex items-center gap-2"><input type="radio" checked={sort === 'risk'} onChange={() => setSort('risk')} /> Risk priority (highest first)</label>
            </div>
          </details>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
          {typeFilter === 'all' ? 'All facilities' : typeOf(typeFilter).plural}
          {tab !== 'all' && ` · ${CLASS_STYLE[tab].label} preparedness`}
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{list.length}</span>
        </div>
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
        {!facilities && Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-gray-100" />)}
        {facilities && list.length === 0 && (
          <div className="py-10 text-center text-gray-400">
            <p>No facilities match.</p>
            {filtered && <button type="button" onClick={clear} className="btn-ghost mt-3">Clear filters</button>}
          </div>
        )}
        {list.slice(0, limit).map((p) => {
          const on = p.id === selectedId;
          const mine = profile?.facility_id === p.id;
          const T = typeOf(p.facility_type);
          return (
            <button key={p.id} data-facility={p.id} type="button" onClick={() => onSelect(p.id)}
              className={`w-full rounded-2xl border bg-white p-3.5 text-left transition hover:border-gray-300 ${on ? 'border-sky-400 ring-4 ring-sky-50' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-accent text-ink' : 'bg-gray-100 text-gray-700'}`} title={T.label}>
                  <T.icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{p.name}</div>
                  <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-[11px] text-gray-400">
                    <span>{T.label}</span>
                    <span className="inline-flex items-center gap-1" title={T.people}><Users size={11} />{p.people_served.toLocaleString()}</span>
                    <FloodPill level={p.flood_level} />
                  </div>
                </div>
                <ClassPill cls={p.spi_class} />
              </div>
              <SpiTrack p={p} />
            </button>
          );
        })}
        {list.length > limit && <div ref={moreRef} className="py-3 text-center text-[11px] text-gray-400">Loading more… ({(list.length - limit).toLocaleString()} left)</div>}
      </div>

      <div className="border-t border-gray-100 p-4">
        {isAdmin ? (
          <button type="button" onClick={onAdd} className="btn-dark w-full"><Plus size={16} />Add facility</button>
        ) : profile?.role === 'manager' && profile.status === 'active' ? (
          <button type="button" onClick={onEditMine} className="btn-dark w-full"><Pencil size={16} />Update my facility</button>
        ) : !session ? (
          <button type="button" onClick={onJoin} className="btn-dark w-full"><UserPlus size={16} />Register your facility</button>
        ) : null}
      </div>
    </section>
  );
}
