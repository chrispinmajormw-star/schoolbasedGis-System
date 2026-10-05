import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, SlidersHorizontal, School, Plus, Pencil, LogIn, Users } from 'lucide-react';
import { api, CLASS_STYLE, timeAgo } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ClassPill, FloodPill } from './ui.jsx';

const TABS = [
  ['all', 'All'],
  ['low', 'Low'],
  ['moderate', 'Moderate'],
  ['high', 'High'],
];

function SpiTrack({ p }) {
  const spi = p.spi;
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

export default function SchoolList({ schools, selectedId, onSelect, onAddSchool, onEditMine, onSignIn, lastUpdated, onRefresh }) {
  const { profile, isAdmin, session } = useAuth();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [floodOnly, setFloodOnly] = useState(false);
  const [sort, setSort] = useState('name');
  const listRef = useRef(null);
  const [, tick] = useState(0);

  // Keep the "updated x ago" label fresh
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15000); return () => clearInterval(t); }, []);

  // When a school is picked on the map, bring its card into view
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-school="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const filtered = tab !== 'all' || floodOnly || q.trim();
  const clear = () => { setTab('all'); setFloodOnly(false); setQ(''); };

  const list = useMemo(() => {
    const all = schools?.features.map((f) => f.properties) || [];
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => tab === 'all' || p.spi_class === tab)
      .filter((p) => !floodOnly || p.flood_level > 0)
      .filter((p) => !needle || `${p.name} ${p.district} ${p.emis_code || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => (sort === 'risk' ? (b.rps ?? -1) - (a.rps ?? -1) : a.name.localeCompare(b.name)));
  }, [schools, q, tab, floodOnly, sort]);

  return (
    <section className="flex min-h-0 w-full flex-col border-gray-200 md:w-[340px] md:shrink-0 md:border-r">
      <div className="space-y-3 p-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Schools</h1>
            <button type="button" onClick={onRefresh} title="Refresh now" className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-700">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-green-500" />Live · updated {timeAgo(lastUpdated)}
            </button>
          </div>
          <a href={api.exportUrl} className="icon-btn" title="Download CSV" aria-label="Download CSV"><Download size={16} /></a>
        </div>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search school, district, EMIS" className="input pl-9" />
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
          {tab === 'all' ? 'All schools' : `${CLASS_STYLE[tab].label} preparedness`}
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{list.length}</span>
        </div>
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
        {!schools && Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-gray-100" />)}
        {schools && list.length === 0 && (
          <div className="py-10 text-center text-gray-400">
            <p>No schools match.</p>
            {filtered && <button type="button" onClick={clear} className="btn-ghost mt-3">Clear filters</button>}
          </div>
        )}
        {list.map((p) => {
          const on = p.id === selectedId;
          const mine = profile?.school_id === p.id;
          return (
            <button key={p.id} data-school={p.id} type="button" onClick={() => onSelect(p.id)}
              className={`w-full rounded-2xl border bg-white p-3.5 text-left transition hover:border-gray-300 ${on ? 'border-sky-400 ring-4 ring-sky-50' : 'border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-accent text-ink' : 'bg-gray-100 text-gray-700'}`}>
                  <School size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{p.name}</div>
                  <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-[11px] text-gray-400">
                    <span className="inline-flex items-center gap-1"><Users size={11} />{p.learners.toLocaleString()}</span>
                    <FloodPill level={p.flood_level} />
                  </div>
                </div>
                <ClassPill cls={p.spi_class} />
              </div>
              <SpiTrack p={p} />
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-100 p-4">
        {isAdmin ? (
          <button type="button" onClick={onAddSchool} className="btn-dark w-full"><Plus size={16} />Add school</button>
        ) : profile?.role === 'school' ? (
          <button type="button" onClick={onEditMine} className="btn-dark w-full"><Pencil size={16} />Update my school</button>
        ) : !session ? (
          <button type="button" onClick={onSignIn} className="btn-dark w-full"><LogIn size={16} />Sign in to update your school</button>
        ) : null}
      </div>
    </section>
  );
}
