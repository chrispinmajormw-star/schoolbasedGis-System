import { School, ClipboardCheck, Gauge, Users, TriangleAlert, ChevronRight } from 'lucide-react';
import { CLASS_STYLE, classify } from '../lib/api.js';
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

export default function Dashboard({ summary, onPick }) {
  if (!summary) {
    return <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}</div>;
  }
  const { totals, byClass, lowPrepInFloodZones, topPriority, byDistrict } = summary;
  const order = ['high', 'moderate', 'low', 'unassessed'];
  const classRows = order.map((k) => ({ k, ...(byClass.find((r) => r.spi_class === k) || { schools: 0, learners: 0 }) }));

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <p className="mb-5 text-xs text-gray-500">Preparedness × flood hazard × exposure, updated as schools submit changes.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={School} label="Schools" value={totals.schools} sub={`${totals.learners.toLocaleString()} learners`} />
        <Stat icon={ClipboardCheck} label="Assessed" value={`${totals.assessed}/${totals.schools}`}
          sub={`${totals.schools ? Math.round((100 * totals.assessed) / totals.schools) : 0}% coverage`} />
        <Stat icon={Gauge} label="Mean SPI" value={totals.mean_spi === null ? '—' : `${totals.mean_spi}%`}
          sub={totals.mean_spi === null ? '' : `${CLASS_STYLE[classify(totals.mean_spi)].label} preparedness`} />
        <Stat icon={Users} label="Learners at risk" value={lowPrepInFloodZones.learners.toLocaleString()}
          sub={`${lowPrepInFloodZones.schools} low-SPI schools in flood zones`} />
      </div>

      {lowPrepInFloodZones.schools > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p><b>{lowPrepInFloodZones.learners.toLocaleString()}</b> learners in <b>{lowPrepInFloodZones.schools}</b> low-preparedness
            {lowPrepInFloodZones.schools === 1 ? ' school sits' : ' schools sit'} in medium or high flood hazard zones.</p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Preparedness classes</h2>
          <p className="mb-4 text-xs text-gray-400">Share of schools by latest SPI</p>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {classRows.filter((r) => r.schools).map((r) => (
              <div key={r.k} title={`${CLASS_STYLE[r.k].label}: ${r.schools} schools`} style={{ flex: r.schools, background: CLASS_STYLE[r.k].color }} />
            ))}
          </div>
          <ul className="mt-4 divide-y divide-gray-100">
            {classRows.map((r) => (
              <li key={r.k} className="flex items-center justify-between py-2">
                <ClassPill cls={r.k} />
                <span className="text-gray-500"><b className="text-gray-900">{r.schools}</b> schools · {r.learners.toLocaleString()} learners</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Top risk priority</h2>
          <p className="mb-3 text-xs text-gray-400">Hazard × preparedness gap × learners × remoteness</p>
          {topPriority.length === 0 && <p className="py-6 text-center text-gray-400">No scored schools yet.</p>}
          <ol className="space-y-2">
            {topPriority.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPick(s.id)} className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-gray-300">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-xs font-semibold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-[11px] text-gray-400">{s.district} · SPI {s.spi}% · {s.learners.toLocaleString()} learners</span>
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
        <h2 className="font-semibold">Mean SPI by district</h2>
        <p className="mb-4 text-xs text-gray-400">Lowest first. Bars show the average School Preparedness Index (0–100%).</p>
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {byDistrict.map((d) => {
            const cls = d.mean_spi === null ? 'unassessed' : classify(d.mean_spi);
            return (
              <div key={d.district} title={`${d.district}: ${d.mean_spi === null ? 'not assessed' : `${d.mean_spi}%`} (${d.schools} schools)`}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{d.district} <span className="font-normal text-gray-400">· {d.schools}</span></span>
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
