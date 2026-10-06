import { useEffect, useMemo, useState } from 'react';
import { Building2, ClipboardCheck, Gauge, Users, TriangleAlert, ChevronRight, Pencil, UserPlus, BellRing } from 'lucide-react';
import { typeOf } from '../lib/facilityTypes.js';
import { api, CLASS_STYLE, classify, needsAssessment, timeAgo, STALE_DAYS } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ClassPill, FloodPill } from './ui.jsx';

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-ink"><Icon size={14} /></span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function NeedsAttention({ facilities, onPick }) {
  const rows = useMemo(() => (facilities?.features || []).map((f) => f.properties).filter(needsAssessment)
    .sort((a, b) => (b.flood_level - a.flood_level) || (b.people_served - a.people_served)), [facilities]);
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Needs assessment</h2>
        <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{rows.length}</span>
      </div>
      <p className="mb-3 text-xs text-gray-400">Never assessed, or last assessed over {STALE_DAYS} days ago. Flood-zone facilities first.</p>
      {rows.length === 0 && <p className="py-6 text-center text-gray-400">All facilities are up to date.</p>}
      <ul className="divide-y divide-gray-100">
        {rows.slice(0, 6).map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:text-gray-900">
              {(() => { const I = typeOf(s.facility_type).icon; return <I size={16} className="shrink-0 text-amber-500" />; })()}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="text-[11px] text-gray-400">{typeOf(s.facility_type).label} · {s.district} · {s.assessed_on ? `last ${timeAgo(s.assessed_on)}` : 'never assessed'}</span>
              </span>
              <FloodPill level={s.flood_level} />
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="pt-2 text-[11px] text-gray-400">+ {rows.length - 6} more</p>}
    </section>
  );
}

function RecentActivity({ refreshKey, onPick }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.activity().then(setRows).catch(() => setRows([])); }, [refreshKey]);
  return (
    <section className="card p-5">
      <h2 className="font-semibold">Recent activity</h2>
      <p className="mb-3 text-xs text-gray-400">Latest updates, assessments and sign-up requests</p>
      {!rows && <div className="h-24 animate-pulse rounded-xl bg-gray-50" />}
      {rows?.length === 0 && <p className="py-6 text-center text-gray-400">No activity yet.</p>}
      <ol className="relative space-y-3 border-l border-gray-100 pl-5">
        {rows?.slice(0, 8).map((r, i) => (
          <li key={`${r.kind}-${r.facility_id}-${r.at}-${i}`} className="relative">
            <span className={`absolute -left-[27px] top-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full ring-4 ring-white ${r.kind === 'assessment' ? 'bg-accent' : 'bg-gray-200'}`} />
            <button type="button" onClick={() => r.kind !== 'signup' && onPick(r.facility_id)} className="text-left">
              <span className="font-medium">{r.facility_name}</span>
              <span className="block text-[11px] text-gray-500">
                {r.kind === 'assessment'
                  ? <><ClipboardCheck size={11} className="mr-1 inline" />Assessment · SPI {r.spi}%{r.actor ? ` · ${r.actor}` : ''}</>
                  : r.kind === 'signup'
                    ? <><UserPlus size={11} className="mr-1 inline" />Sign-up request from {r.actor}</>
                    : <><Pencil size={11} className="mr-1 inline" />{typeOf(r.facility_type).label} info updated</>}
                <span className="text-gray-400"> · {timeAgo(r.at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Dashboard({ summary, facilities, onPick, refreshKey, alertCount = 0, go }) {
  const { isAdmin } = useAuth();
  if (!summary) {
    return <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}</div>;
  }
  const { totals, byClass, lowPrepInFloodZones, topPriority, byDistrict } = summary;
  const order = ['high', 'moderate', 'low', 'unassessed'];
  const classRows = order.map((k) => ({ k, ...(byClass.find((r) => r.spi_class === k) || { facilities: 0, people: 0 }) }));

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <p className="mb-5 text-xs text-gray-500">Preparedness × flood hazard × exposure, updated as facilities submit changes.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Building2} label="Facilities" value={totals.facilities} sub={`${totals.people.toLocaleString()} people served`} />
        <Stat icon={ClipboardCheck} label="Assessed" value={`${totals.assessed}/${totals.facilities}`}
          sub={`${totals.facilities ? Math.round((100 * totals.assessed) / totals.facilities) : 0}% coverage`} />
        <Stat icon={Gauge} label="Mean SPI" value={totals.mean_spi === null ? '—' : `${totals.mean_spi}%`}
          sub={totals.mean_spi === null ? '' : `${CLASS_STYLE[classify(totals.mean_spi)].label} preparedness`} />
        <Stat icon={Users} label="People at risk" value={lowPrepInFloodZones.people.toLocaleString()}
          sub={`${lowPrepInFloodZones.facilities} low-SPI facilities in flood zones`} />
      </div>

      {alertCount > 0 && (
        <button type="button" onClick={() => go?.('reports')} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-blue-600 p-4 text-left text-white">
          <BellRing size={18} className="shrink-0" />
          <span className="flex-1"><b>{alertCount} {alertCount === 1 ? 'facility is' : 'facilities are'} on flood alert</b> from verified community reports in the last 72 hours.</span>
          <ChevronRight size={18} />
        </button>
      )}

      {lowPrepInFloodZones.facilities > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p><b>{lowPrepInFloodZones.people.toLocaleString()}</b> people depend on <b>{lowPrepInFloodZones.facilities}</b> low-preparedness
            {lowPrepInFloodZones.facilities === 1 ? ' facility' : ' facilities'} in medium or high flood hazard zones.</p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Preparedness classes</h2>
          <p className="mb-4 text-xs text-gray-400">Share of facilities by latest SPI</p>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {classRows.filter((r) => r.facilities).map((r) => (
              <div key={r.k} title={`${CLASS_STYLE[r.k].label}: ${r.facilities} facilities`} style={{ flex: r.facilities, background: CLASS_STYLE[r.k].color }} />
            ))}
          </div>
          <ul className="mt-4 divide-y divide-gray-100">
            {classRows.map((r) => (
              <li key={r.k} className="flex items-center justify-between py-2">
                <ClassPill cls={r.k} />
                <span className="text-gray-500"><b className="text-gray-900">{r.facilities}</b> facilities · {r.people.toLocaleString()} people</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Top risk priority</h2>
          <p className="mb-3 text-xs text-gray-400">Hazard × preparedness gap × people served × remoteness</p>
          {topPriority.length === 0 && <p className="py-6 text-center text-gray-400">No scored facilities yet.</p>}
          <ol className="space-y-2">
            {topPriority.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPick(s.id)} className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-gray-300">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-xs font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-[11px] text-gray-400">{typeOf(s.facility_type).label} · {s.district} · SPI {s.spi}% · {s.people_served.toLocaleString()} people</span>
                  </span>
                  <FloodPill level={s.flood_level} />
                  <span className="text-right"><span className="block text-[10px] text-gray-400">RPS</span><b>{s.rps}</b></span>
                  <ChevronRight size={16} className="text-gray-300" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">By facility type</h2>
        <p className="mb-4 text-xs text-gray-400">Average Safety Preparedness Index and assessment coverage per type</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(summary.byType || []).map((r) => {
            const T = typeOf(r.facility_type);
            const cls = r.mean_spi === null ? 'unassessed' : classify(r.mean_spi);
            return (
              <div key={r.facility_type} className="rounded-xl border border-gray-100 p-3" title={`${T.plural}: ${r.assessed} of ${r.facilities} assessed`}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-white"><T.icon size={14} /></span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{T.plural}</span>
                  <span className="text-xs text-gray-400">{r.facilities}</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xl font-semibold">{r.mean_spi === null ? '—' : `${r.mean_spi}%`}</span>
                  <span className="text-[11px] text-gray-400">{r.assessed}/{r.facilities} assessed</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${r.mean_spi || 0}%`, background: CLASS_STYLE[cls].color }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className={`mt-4 grid gap-4 ${isAdmin ? 'lg:grid-cols-2' : ''}`}>
        <NeedsAttention facilities={facilities} onPick={onPick} />
        {isAdmin && <RecentActivity refreshKey={refreshKey} onPick={onPick} />}
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">Mean SPI by district</h2>
        <p className="mb-4 text-xs text-gray-400">Lowest first. Bars show the average Safety Preparedness Index (0–100%).</p>
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {byDistrict.map((d) => {
            const cls = d.mean_spi === null ? 'unassessed' : classify(d.mean_spi);
            return (
              <div key={d.district} title={`${d.district}: ${d.mean_spi === null ? 'not assessed' : `${d.mean_spi}%`} (${d.facilities} facilities)`}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{d.district} <span className="font-normal text-gray-400">· {d.facilities}</span></span>
                  <span className="text-gray-600">{d.mean_spi === null ? 'n/a' : `${d.mean_spi}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full" style={{ width: `${d.mean_spi || 0}%`, background: CLASS_STYLE[cls].color }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
