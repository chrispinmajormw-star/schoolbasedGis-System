import { useEffect, useMemo, useState } from 'react';
import { Printer, ShieldCheck } from 'lucide-react';
import { api, CLASS_STYLE, classify, fmtDate } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { FACILITY_TYPES, TYPE_KEYS, typeOf } from '../lib/facilityTypes.js';
import { worklist, gapMatrix, planBudget, hazardCheck, fmtMwk, fmtNum } from '../lib/decision.js';
import { isOverdue } from './Actions.jsx';
import { ClassPill, FloodPill } from './ui.jsx';

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 break-inside-avoid">
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

function H({ children }) {
  return <h2 className="mb-2 mt-6 border-b-2 border-ink pb-1 text-sm font-semibold uppercase tracking-wide">{children}</h2>;
}

function Trend({ rows }) {
  if (!rows?.length) return <p className="text-xs text-gray-400">No assessments in the last three years.</p>;
  const w = 56;
  return (
    <svg viewBox={`0 0 ${Math.max(rows.length * w, 200)} 140`} className="h-36 w-full max-w-xl" role="img" aria-label="Mean SPI per quarter">
      {[0, 60, 80, 100].map((v) => <g key={v}><line x1="0" x2={rows.length * w} y1={120 - v} y2={120 - v} stroke="#e5e7eb" strokeDasharray={v ? '3 3' : ''} /></g>)}
      {rows.map((r, i) => {
        const h = r.mean_spi || 0;
        return (
          <g key={r.quarter}>
            <rect x={i * w + 12} y={120 - h} width={w - 24} height={h} rx="4" fill={CLASS_STYLE[classify(r.mean_spi)].color} />
            <text x={i * w + w / 2} y={115 - h} textAnchor="middle" fontSize="10" fontWeight="600">{Math.round(h)}%</text>
            <text x={i * w + w / 2} y="134" textAnchor="middle" fontSize="9" fill="#6b7280">{r.quarter}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DistrictBrief({ facilities, checklists, answers, actions, history, hazards, records }) {
  const { session, profile } = useAuth();
  const districts = useMemo(() => [...new Set((facilities?.features || []).map((f) => f.properties.district))].sort(), [facilities]);
  const [district, setDistrict] = useState('all');
  const [trend, setTrend] = useState(null);
  useEffect(() => { setTrend(null); api.trend(district).then(setTrend).catch(() => setTrend([])); }, [district]);

  const d = useMemo(() => {
    const feats = (facilities?.features || []).filter((f) => district === 'all' || f.properties.district === district);
    const ps = feats.map((f) => f.properties);
    const assessed = ps.filter((p) => p.spi !== null);
    const mean = assessed.length ? Math.round((10 * assessed.reduce((s, p) => s + p.spi, 0)) / assessed.length) / 10 : null;
    const atRisk = ps.filter((p) => p.flood_level >= 2 && p.spi_class === 'low');
    const inZone = ps.filter((p) => p.flood_level >= 2);
    const shelters = ps.filter((p) => p.shelter_capacity > 0);
    const capFlooded = shelters.filter((p) => p.flood_level >= 2).reduce((s, p) => s + p.shelter_capacity, 0);
    const capSafe = shelters.filter((p) => p.flood_level < 2).reduce((s, p) => s + p.shelter_capacity, 0);
    const wl = worklist(feats, checklists, answers).filter((r) => r.p.spi !== null).slice(0, 10);
    const gm = gapMatrix(feats, checklists, answers);
    const topGaps = gm.cols.map((c) => ({ ...c, pct: gm.colPct[c.indicator] })).filter((c) => c.pct !== null).sort((a, b) => b.pct - a.pct).slice(0, 5);
    const plan = planBudget(feats, checklists, answers, 5e6);
    const byType = TYPE_KEYS.map((t) => {
      const list = ps.filter((p) => p.facility_type === t); const a = list.filter((p) => p.spi !== null);
      return { t, n: list.length, assessed: a.length, mean: a.length ? Math.round((10 * a.reduce((s, p) => s + p.spi, 0)) / a.length) / 10 : null };
    }).filter((r) => r.n);
    const acts = (actions || []).filter((a) => district === 'all' || a.district === district);
    const floodedBefore = ps.filter((p) => history?.has(p.id));
    const floodedUnmapped = floodedBefore.filter((p) => !p.flood_level);
    const check = hazardCheck(feats, records, hazards, history);
    return { ps, assessed, mean, atRisk, inZone, shelters, capFlooded, capSafe, wl, topGaps, plan, byType, acts, floodedBefore, floodedUnmapped, check };
  }, [facilities, checklists, answers, actions, history, hazards, records, district]);

  const place = district === 'all' ? 'Malawi (all districts)' : `${district} District`;
  const openActs = d.acts.filter((a) => a.status !== 'done');
  const overdue = d.acts.filter(isOverdue);
  const messages = [
    `${d.assessed.length} of ${d.ps.length} facilities (${d.ps.length ? Math.round((100 * d.assessed.length) / d.ps.length) : 0}%) have a preparedness assessment.${d.ps.length - d.assessed.length ? ` ${d.ps.length - d.assessed.length} still need one.` : ''}`,
    d.mean !== null && `Mean preparedness is ${d.mean}% (${CLASS_STYLE[classify(d.mean)].label.toLowerCase()}).`,
    d.atRisk.length > 0 && `${fmtNum(d.atRisk.reduce((s, p) => s + p.people_served, 0))} people depend on ${d.atRisk.length} low-preparedness ${d.atRisk.length === 1 ? 'facility' : 'facilities'} in medium or high flood zones.`,
    d.topGaps[0] && `The most widespread gap is “${d.topGaps[0].label}”: ${Math.round(100 * d.topGaps[0].pct)}% of assessed facilities lack it, which suits a district-wide programme.`,
    d.wl[0] && `Highest risk priority: ${d.wl[0].p.name} (score ${d.wl[0].p.rps}, SPI ${d.wl[0].p.spi}%).`,
    d.plan.chosen.length > 0 && `A budget of MK 5M, spent on the best-value actions, would improve ${d.plan.facilities.length} facilities${d.plan.leavingLow ? ` and lift ${d.plan.leavingLow} out of the Low class` : ''}.`,
    d.capFlooded > 0 && `${fmtNum(d.capFlooded)} shelter places are inside medium/high flood zones; ${fmtNum(d.capSafe)} are outside them.`,
    d.floodedBefore.length > 0 && `${d.floodedBefore.length} ${d.floodedBefore.length === 1 ? 'facility has' : 'facilities have'} a recorded flood history.`,
    d.floodedUnmapped.length > 0 && `${d.floodedUnmapped.length} of them ${d.floodedUnmapped.length === 1 ? 'is' : 'are'} outside the mapped flood zones, so the flood hazard map should be reviewed there.`,
    session && overdue.length > 0 && `${overdue.length} planned ${overdue.length === 1 ? 'action is' : 'actions are'} overdue.`,
  ].filter(Boolean);

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-white p-4 sm:p-6 print:overflow-visible print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
          <option value="all">All districts</option>{districts.map((x) => <option key={x}>{x}</option>)}
        </select>
        <button type="button" className="btn-dark" onClick={() => window.print()}><Printer size={15} />Print / save as PDF</button>
        <span className="text-[11px] text-gray-400">Choose “Save as PDF” in the print dialog.</span>
      </div>

      <article className="mx-auto max-w-4xl text-[12px] leading-relaxed">
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-ink p-5 text-white">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">District preparedness brief</div>
            <h1 className="mt-1 text-2xl font-semibold">{place}</h1>
            <p className="text-xs text-gray-300">For the District Civil Protection Committee · {fmtDate(new Date())}{profile?.full_name ? ` · prepared by ${profile.full_name}` : ''}</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-ink"><ShieldCheck size={22} /></span>
        </div>

        {!facilities || !answers ? <div className="mt-4 h-64 animate-pulse rounded-2xl bg-gray-100" /> : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
              <Kpi label="Facilities" value={d.ps.length} sub={`${d.assessed.length} assessed`} />
              <Kpi label="Mean SPI" value={d.mean === null ? '—' : `${d.mean}%`} sub={d.mean === null ? '' : CLASS_STYLE[classify(d.mean)].label} />
              <Kpi label="People at risk" value={fmtNum(d.atRisk.reduce((s, p) => s + p.people_served, 0))} sub="low SPI in flood zones" tone={d.atRisk.length ? 'red' : undefined} />
              <Kpi label="Safe shelter places" value={fmtNum(d.capSafe)} sub={`${fmtNum(d.capFlooded)} more in flood zones`} tone="green" />
            </div>

            <H>Key messages</H>
            <ul className="list-disc space-y-1 pl-5">{messages.map((m) => <li key={m}>{m}</li>)}</ul>

            <H>Priority facilities</H>
            {d.wl.length === 0 ? <p className="text-gray-400">No assessed facilities.</p> : (
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase text-gray-500"><tr><th className="py-1">#</th><th>Facility</th><th>SPI</th><th>Flood</th><th>RPS</th><th>Top gaps</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {d.wl.map(({ p, gaps }, i) => (
                    <tr key={p.id} className="break-inside-avoid align-top">
                      <td className="py-1.5 pr-2 font-semibold">{i + 1}</td>
                      <td className="pr-2"><b>{p.name}</b><div className="text-[10px] text-gray-500">{typeOf(p.facility_type).label}{district === 'all' ? ` · ${p.district}` : ''} · {fmtNum(p.people_served)} people</div></td>
                      <td className="pr-2"><ClassPill cls={p.spi_class} spi={p.spi} /></td>
                      <td className="pr-2">{p.flood_level ? <FloodPill level={p.flood_level} /> : '—'}</td>
                      <td className="pr-2 font-semibold">{p.rps}</td>
                      <td className="text-[11px]">{gaps.slice(0, 2).map((g) => g.label).join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="grid gap-x-8 sm:grid-cols-2 print:grid-cols-2">
              <section className="break-inside-avoid">
                <H>Most common gaps</H>
                {d.topGaps.length === 0 ? <p className="text-gray-400">No assessments yet.</p> : d.topGaps.map((g) => (
                  <div key={g.indicator} className="mb-1.5">
                    <div className="flex justify-between"><span>{g.label}</span><b>{Math.round(100 * g.pct)}%</b></div>
                    <div className="h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-red-500" style={{ width: `${100 * g.pct}%` }} /></div>
                  </div>
                ))}
              </section>
              <section className="break-inside-avoid">
                <H>Preparedness by facility type</H>
                <table className="w-full text-left">
                  <tbody className="divide-y divide-gray-100">
                    {d.byType.map((r) => (
                      <tr key={r.t}><td className="py-1">{FACILITY_TYPES[r.t].plural}</td><td className="text-gray-500">{r.assessed}/{r.n}</td><td className="text-right font-semibold">{r.mean === null ? '—' : `${r.mean}%`}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>

            <div className="grid gap-x-8 sm:grid-cols-2 print:grid-cols-2">
              <section className="break-inside-avoid">
                <H>Flood exposure (mapped medium/high zones)</H>
                <dl className="divide-y divide-gray-100">
                  <div className="kv"><dt>Facilities in zones</dt><dd>{d.inZone.length}</dd></div>
                  <div className="kv"><dt>People served by them</dt><dd>{fmtNum(d.inZone.reduce((s, p) => s + p.people_served, 0))}</dd></div>
                  <div className="kv"><dt>Shelters / places in zones</dt><dd>{d.shelters.filter((p) => p.flood_level >= 2).length} / {fmtNum(d.capFlooded)}</dd></div>
                  <div className="kv"><dt>Shelters / places outside</dt><dd>{d.shelters.filter((p) => p.flood_level < 2).length} / {fmtNum(d.capSafe)}</dd></div>
                  <div className="kv"><dt>Facilities flooded before</dt><dd>{d.floodedBefore.length}{d.floodedUnmapped.length ? ` (${d.floodedUnmapped.length} outside mapped zones)` : ''}</dd></div>
                </dl>
              </section>
              <section className="break-inside-avoid">
                <H>Preparedness trend</H>
                {trend === null ? <div className="h-36 animate-pulse rounded-xl bg-gray-50" /> : <Trend rows={trend} />}
                <p className="text-[10px] text-gray-400">Mean SPI of assessments made in each quarter.</p>
              </section>
            </div>

            {session && profile?.status === 'active' && (
              <section className="break-inside-avoid">
                <H>Action plan status</H>
                <p className="mb-2">{openActs.length} open · {overdue.length} overdue · {d.acts.filter((a) => a.status === 'done').length} done · {fmtMwk(openActs.reduce((s, a) => s + (a.cost_mwk || 0), 0))} committed</p>
                {openActs.length > 0 && (
                  <table className="w-full text-left">
                    <thead className="text-[10px] uppercase text-gray-500"><tr><th className="py-1">Action</th><th>Facility</th><th>Responsible</th><th>Due</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...overdue, ...openActs.filter((a) => !isOverdue(a))].slice(0, 12).map((a) => (
                        <tr key={a.id} className="align-top"><td className="py-1 pr-2">{a.title}</td><td className="pr-2">{a.facility_name}</td><td className="pr-2">{a.owner || '—'}</td><td className={isOverdue(a) ? 'font-semibold text-red-700' : ''}>{fmtDate(a.due_date)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            <footer className="mt-8 border-t border-gray-200 pt-3 text-[10px] text-gray-400">
              SafeCom — Safe Community: Mapping Community Safety &amp; Resilience. SPI = weighted share of checklist items in place (0–100%). RPS = flood hazard × preparedness gap × people served × remoteness.
              Costs are indicative. Flood zones and sample data should be replaced with official DoDMA / district data. Generated {new Date().toLocaleString()}.
            </footer>
          </>
        )}
      </article>
    </div>
  );
}
