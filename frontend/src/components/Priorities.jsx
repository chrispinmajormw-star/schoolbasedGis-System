import { useEffect, useMemo, useState } from 'react';
import {
  Target, Wallet, Coins, MapPin, FlaskConical, ClipboardCheck, Download, ListPlus, Save, Info, ChevronDown, Users, TrendingUp, ShieldCheck,
} from 'lucide-react';
import { api, CLASS_STYLE } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { FACILITY_TYPES, TYPE_KEYS, typeOf } from '../lib/facilityTypes.js';
import { worklist, planBudget, fmtMwk, fmtNum, downloadCsv } from '../lib/decision.js';
import { ClassPill, FloodPill, PageHeader, Seg, Stat, Empty, Field } from './ui.jsx';

export function Filters({ facilities, value, onChange, flood = true }) {
  const districts = useMemo(() => [...new Set((facilities?.features || []).map((f) => f.properties.district))].sort(), [facilities]);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <select className="input w-auto py-1.5" value={value.district} onChange={set('district')} aria-label="District">
        <option value="all">All districts</option>
        {districts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select className="input w-auto py-1.5" value={value.type} onChange={set('type')} aria-label="Facility type">
        <option value="all">All facility types</option>
        {TYPE_KEYS.map((k) => <option key={k} value={k}>{FACILITY_TYPES[k].plural}</option>)}
      </select>
      {flood && (
        <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs">
          <input type="checkbox" checked={value.floodOnly} onChange={set('floodOnly')} /> Flood zones only
        </label>
      )}
    </div>
  );
}

function GapChip({ g }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700" title={g.action}>
      {g.label}<b className="text-green-700">+{g.gain}</b>
    </span>
  );
}

function Worklist({ rows, onPick, onWhatIf, onAssess }) {
  const { canEdit } = useAuth();
  const [limit, setLimit] = useState(20);
  const act = rows.filter((r) => r.p.spi !== null);
  const assess = rows.filter((r) => r.p.spi === null && r.p.flood_level > 0);
  const maxRps = Math.max(1, ...act.map((r) => r.p.rps || 0));

  return (
    <div className="space-y-4">
      {assess.length > 0 && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={16} className="text-amber-500" />Assess first <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{assess.length}</span></h2>
          <p className="mb-3 text-xs text-gray-400">In a flood zone but never assessed, so their risk is unknown. Highest hazard first.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {assess.slice(0, 8).map(({ p }) => {
              const T = typeOf(p.facility_type);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600"><T.icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-[11px] text-gray-400">{T.label} · {p.district} · {fmtNum(p.people_served)} people</span>
                  </span>
                  <span className="hidden sm:block"><FloodPill level={p.flood_level} /></span>
                  {canEdit(p.id)
                    ? <button type="button" className="btn-accent px-2.5 py-1 text-xs" onClick={() => onAssess(p.id)}>Assess</button>
                    : <button type="button" className="icon-btn h-8 w-8" title="Show on map" onClick={() => onPick(p.id)}><MapPin size={14} /></button>}
                </div>
              );
            })}
          </div>
          {assess.length > 8 && <p className="pt-2 text-[11px] text-gray-400">+ {assess.length - 8} more</p>}
        </section>
      )}

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Target size={16} />Act now</h2>
        <p className="mb-3 text-xs text-gray-400">Ranked by risk priority score (flood hazard × preparedness gap × people served × remoteness). Chips show the missing items worth the most SPI points.</p>
        {act.length === 0 && <Empty icon={Target} title="No assessed facilities match these filters" />}
        <ol className="space-y-2">
          {act.slice(0, limit).map(({ p, gaps, gapCost }, i) => {
            const T = typeOf(p.facility_type);
            return (
              <li key={p.id} className="rounded-2xl border border-gray-200 p-3.5 transition hover:border-gray-300">
                <div className="flex items-start gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${i < 3 && p.rps ? 'bg-red-600 text-white' : 'bg-ink text-white'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <T.icon size={14} className="text-gray-500" />
                      <span className="font-semibold">{p.name}</span>
                      <ClassPill cls={p.spi_class} spi={p.spi} />
                      <FloodPill level={p.flood_level} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">{T.label} · {p.district}{p.ta ? ` · ${p.ta}` : ''} · {fmtNum(p.people_served)} {T.people.toLowerCase()}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {gaps.slice(0, 3).map((g) => <GapChip key={g.indicator} g={g} />)}
                      {gaps.length > 3 && <span className="text-[11px] text-gray-400">+{gaps.length - 3} more</span>}
                      {!gaps.length && <span className="text-[11px] text-green-700">All checklist items in place</span>}
                    </div>
                  </div>
                  <div className="hidden w-28 shrink-0 text-right sm:block">
                    <div className="text-[10px] text-gray-400">Risk priority</div>
                    <div className="text-lg font-semibold">{p.rps ?? '—'}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-red-500" style={{ width: `${(100 * (p.rps || 0)) / maxRps}%` }} /></div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
                  <span className="mr-auto text-[11px] text-gray-500">Closing every gap: <b>{fmtMwk(gapCost)}</b> → SPI 100%</span>
                  <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onPick(p.id)}><MapPin size={13} />Map</button>
                  {gaps.length > 0 && <button type="button" className="btn-dark px-2.5 py-1 text-xs" onClick={() => onWhatIf(p.id)}><FlaskConical size={13} />What if…</button>}
                </div>
              </li>
            );
          })}
        </ol>
        {act.length > limit && (
          <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setLimit((l) => l + 30)}><ChevronDown size={15} />Show more ({act.length - limit})</button>
        )}
      </section>
    </div>
  );
}

const PRESETS = [1e6, 5e6, 20e6, 50e6];

function BudgetPlanner({ facilities, checklists, answers, filters, onPick, onChanged }) {
  const { isAdmin } = useAuth();
  const { toast } = useFeedback();
  const [budget, setBudget] = useState(5e6);
  const [owner, setOwner] = useState('District Council');
  const [saving, setSaving] = useState(false);
  const plan = useMemo(() => planBudget(facilities?.features, checklists, answers, budget, filters), [facilities, checklists, answers, budget, filters]);

  const exportPlan = () => downloadCsv('safecom_budget_plan.csv', plan.chosen.map((c, i) => ({
    rank: i + 1, facility: c.facility.name, type: typeOf(c.facility.facility_type).label, district: c.facility.district,
    item: c.label, action: c.action, spi_gain_points: c.gain, cost_mwk: c.cost, flood_level: c.facility.flood_level,
  })));

  async function toTracker() {
    setSaving(true);
    try {
      const due = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
      await api.createActions(plan.chosen.map((c) => ({
        facility_id: c.facility.id, indicator: c.indicator, title: c.kind === 'percent' ? `${c.action} (to 100%)` : c.action,
        owner, due_date: due, cost_mwk: c.cost, notes: `From budget plan of ${fmtMwk(budget)}`,
      })));
      toast(`${plan.chosen.length} actions added to the tracker`);
      onChanged?.();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Available budget (MWK)" className="w-48">
            <input type="number" min="0" step="100000" className="input text-base font-semibold" value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {PRESETS.map((v) => (
              <button key={v} type="button" onClick={() => setBudget(v)} className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${budget === v ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}>{fmtMwk(v)}</button>
            ))}
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-[11px] text-gray-500"><Info size={13} className="mt-px shrink-0" />
          Actions are chosen for the most preparedness per kwacha: SPI points gained × flood exposure × people served, divided by cost. Only assessed facilities with costed gaps are considered ({plan.candidates} possible actions).</p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Wallet} label="Allocated" value={fmtMwk(plan.spent)} sub={`of ${fmtMwk(budget)} · ${plan.chosen.length} actions`} />
        <Stat icon={ShieldCheck} label="Facilities improved" value={plan.facilities.length} sub={`${plan.leavingLow} leave the Low class`} tone={plan.leavingLow ? 'green' : undefined} />
        <Stat icon={Users} label="People benefiting" value={fmtNum(plan.people)} sub="served by improved facilities" />
        <Stat icon={TrendingUp} label="Mean SPI gain" value={`+${plan.meanGain.toFixed(1)}`} sub="points per improved facility" />
      </div>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recommended plan</h2>
          <div className="no-print flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={!plan.chosen.length} onClick={exportPlan}><Download size={14} />CSV</button>
            {isAdmin && (
              <>
                <input className="input w-40 py-1.5 text-xs" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Responsible" aria-label="Responsible" />
                <button type="button" className="btn-dark px-2.5 py-1.5 text-xs" disabled={!plan.chosen.length || saving} onClick={toTracker}><ListPlus size={14} />{saving ? 'Adding…' : 'Add to action tracker'}</button>
              </>
            )}
          </div>
        </div>
        {plan.facilities.length === 0 && <Empty icon={Wallet} title="Nothing to fund yet">Increase the budget, widen the filters, or record more assessments.</Empty>}
        <ul className="divide-y divide-gray-100">
          {plan.facilities.map((f) => {
            const T = typeOf(f.p.facility_type);
            return (
              <li key={f.p.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <T.icon size={14} className="text-gray-500" />
                  <button type="button" onClick={() => onPick(f.p.id)} className="font-semibold hover:underline">{f.p.name}</button>
                  <span className="text-[11px] text-gray-400">{f.p.district}</span>
                  <FloodPill level={f.p.flood_level} />
                  <span className="ml-auto text-xs font-semibold">{fmtMwk(f.cost)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="w-10 text-right font-semibold" style={{ color: CLASS_STYLE[f.clsBefore].text }}>{Math.round(f.before)}%</span>
                  <div className="relative h-2 flex-1 rounded-full bg-gray-100">
                    <div className="absolute inset-y-0 left-0 rounded-full opacity-40" style={{ width: `${f.after}%`, background: CLASS_STYLE[f.clsAfter].color }} />
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${f.before}%`, background: CLASS_STYLE[f.clsBefore].color }} />
                  </div>
                  <span className="w-10 font-semibold" style={{ color: CLASS_STYLE[f.clsAfter].text }}>{Math.round(f.after)}%</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.items.map((c) => (
                    <span key={c.indicator} className="rounded-lg bg-accent-soft px-2 py-0.5 text-[11px]" title={c.action}>{c.label} · {fmtMwk(c.cost)}</span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function UnitCosts({ checklists, onSaved }) {
  const { isAdmin } = useAuth();
  const { toast } = useFeedback();
  const items = useMemo(() => {
    const m = new Map();
    Object.entries(checklists || {}).forEach(([type, list]) => list.forEach((w) => {
      const e = m.get(w.indicator) || { ...w, types: [] };
      e.types.push(type);
      m.set(w.indicator, e);
    }));
    return [...m.values()].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  }, [checklists]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setEdits({}), [checklists]);
  const dirty = Object.keys(edits).length;

  async function save() {
    setSaving(true);
    try {
      await api.updateCosts(Object.entries(edits).map(([indicator, e]) => ({ indicator, ...e })));
      toast('Unit costs saved');
      onSaved?.();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  }

  const n = Object.keys(checklists || {}).length;
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Unit costs and recommended actions</h2>
          <p className="text-xs text-gray-400">Indicative cost for one facility to close each gap. For percentage items, the cost of reaching 100%. Used by What-if and the budget planner.</p>
        </div>
        {isAdmin && <button type="button" className="btn-dark" disabled={!dirty || saving} onClick={save}><Save size={15} />{saving ? 'Saving…' : `Save${dirty ? ` (${dirty})` : ''}`}</button>}
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-gray-400">
            <tr><th className="py-2 pr-3 font-medium">Checklist item</th><th className="py-2 pr-3 font-medium">Applies to</th><th className="w-40 py-2 pr-3 font-medium">Cost (MWK)</th><th className="py-2 font-medium">Recommended action</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((w) => {
              const e = edits[w.indicator] || {};
              const set = (k) => (ev) => setEdits((x) => ({ ...x, [w.indicator]: { ...x[w.indicator], [k]: ev.target.value } }));
              return (
                <tr key={w.indicator} className="align-top">
                  <td className="py-2.5 pr-3 font-medium">{w.label}<div className="text-[11px] font-normal text-gray-400">{w.domain}</div></td>
                  <td className="py-2.5 pr-3 text-[11px] text-gray-500">{w.types.length >= n - 1 ? 'All types' : w.types.map((t) => typeOf(t).plural).join(', ')}</td>
                  <td className="py-2 pr-3">
                    {isAdmin
                      ? <input type="number" min="0" step="5000" className="input py-1.5" value={e.cost_mwk ?? w.cost_mwk ?? ''} onChange={set('cost_mwk')} />
                      : <span className="font-semibold">{fmtMwk(w.cost_mwk)}</span>}
                  </td>
                  <td className="py-2">
                    {isAdmin
                      ? <input className="input py-1.5" value={e.action ?? w.action ?? ''} onChange={set('action')} />
                      : <span className="text-gray-600">{w.action}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Priorities({ facilities, checklists, answers, onPick, onWhatIf, onAssess, onChanged }) {
  const [tab, setTab] = useState('worklist');
  const [filters, setFilters] = useState({ district: 'all', type: 'all', floodOnly: false });
  const filtered = useMemo(() => (facilities ? {
    ...facilities,
    features: facilities.features.filter(({ properties: p }) => (filters.district === 'all' || p.district === filters.district)
      && (filters.type === 'all' || p.facility_type === filters.type) && (!filters.floodOnly || p.flood_level > 0)),
  } : null), [facilities, filters]);
  const rows = useMemo(() => worklist(filtered?.features, checklists, answers), [filtered, checklists, answers]);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <PageHeader title="Priorities" subtitle="Where to act first, what each improvement is worth, and how far a budget goes." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Seg value={tab} onChange={setTab} options={[['worklist', 'Worklist'], ['budget', 'Budget planner'], ['costs', 'Unit costs']]} />
        {tab !== 'costs' && <Filters facilities={facilities} value={filters} onChange={setFilters} />}
      </div>
      {!facilities || !answers || !checklists
        ? <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        : tab === 'worklist' ? <Worklist rows={rows} onPick={onPick} onWhatIf={onWhatIf} onAssess={onAssess} />
          : tab === 'budget' ? <BudgetPlanner facilities={facilities} checklists={checklists} answers={answers} filters={filters} onPick={onPick} onChanged={onChanged} />
            : <UnitCosts checklists={checklists} onSaved={onChanged} />}
      {tab === 'costs' && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400"><Coins size={12} />Replace these with district procurement prices when available.</p>}
    </div>
  );
}
