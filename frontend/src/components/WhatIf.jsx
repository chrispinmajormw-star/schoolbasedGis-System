import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, Sparkles, ListPlus, Wand2 } from 'lucide-react';
import { api, CLASS_STYLE } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { gapsFor, simulate, fmtMwk } from '../lib/decision.js';
import { Modal, ClassPill, Field, ErrorNote } from './ui.jsx';

const in90days = () => new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);

/** What-if simulator: tick improvements, see SPI / class / risk change and cost, then save them as actions. */
export default function WhatIf({ facility: p, checklist, answers: given, maxPeople, onClose, onPlanned }) {
  const { canEdit } = useAuth();
  const { toast } = useFeedback();
  const [answers, setAnswers] = useState(given);
  const [fixes, setFixes] = useState({});
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState(in90days);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (given !== undefined) return;
    api.lastAssessment(p.id).then((a) => setAnswers(a?.answers || null)).catch(() => setAnswers(null));
  }, [p.id, given]);

  const gaps = useMemo(() => gapsFor(checklist, answers), [checklist, answers]);
  const now = useMemo(() => simulate(p, checklist, answers, {}, maxPeople), [p, checklist, answers, maxPeople]);
  const next = useMemo(() => simulate(p, checklist, answers, fixes, maxPeople), [p, checklist, answers, fixes, maxPeople]);
  const chosen = gaps.filter((g) => g.indicator in fixes);

  const toggle = (g) => setFixes((f) => {
    const n = { ...f };
    if (g.indicator in n) delete n[g.indicator]; else n[g.indicator] = g.kind === 'percent' ? 100 : true;
    return n;
  });
  const pick = (list) => setFixes(Object.fromEntries(list.map((g) => [g.indicator, g.kind === 'percent' ? 100 : true])));

  async function plan() {
    setSaving(true); setError('');
    try {
      await api.createActions(chosen.map((g) => ({
        facility_id: p.id, indicator: g.indicator, owner: owner || null, due_date: due || null,
        title: g.kind === 'percent' ? `${g.action} (to ${fixes[g.indicator]}%)` : g.action,
        cost_mwk: g.kind === 'percent' && g.cost !== null
          ? Math.round((g.cost * (fixes[g.indicator] - (Number(g.current) || 0))) / Math.max(1, 100 - (Number(g.current) || 0)))
          : g.cost,
      })));
      toast(`${chosen.length} action${chosen.length === 1 ? '' : 's'} added to the tracker`);
      onPlanned?.();
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  const delta = next.spi - now.spi;
  const editable = canEdit(p.id);

  return (
    <Modal wide title={`What if… ${p.name}`} subtitle="Tick the improvements you are considering to see how preparedness and risk would change." onClose={onClose}
      footer={(
        <>
          {!editable && <span className="mr-auto self-center text-[11px] text-gray-400">Sign in as this facility&apos;s manager or an administrator to save these as actions.</span>}
          <button type="button" onClick={onClose} className="btn-ghost">Close</button>
          {editable && (
            <button type="button" disabled={!chosen.length || saving} onClick={plan} className="btn-dark">
              <ListPlus size={15} />{saving ? 'Saving…' : `Add ${chosen.length || ''} to action tracker`}
            </button>
          )}
        </>
      )}>
      {answers === undefined && <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />}
      {answers === null && <p className="py-8 text-center text-gray-500">This facility has not been assessed yet. Record an assessment first.</p>}
      {answers && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 p-3.5">
              <div className="text-[11px] font-medium text-gray-500">Preparedness (SPI)</div>
              <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
                <span>{now.spi}%</span><ArrowRight size={16} className="text-gray-300" />
                <span style={{ color: CLASS_STYLE[next.cls].text }}>{next.spi}%</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5"><ClassPill cls={now.cls} />{next.cls !== now.cls && <><ArrowRight size={12} className="text-gray-300" /><ClassPill cls={next.cls} /></>}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 p-3.5">
              <div className="text-[11px] font-medium text-gray-500">Risk priority score</div>
              <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
                <span>{now.rps ?? '—'}</span><ArrowRight size={16} className="text-gray-300" /><span className={next.rps < now.rps ? 'text-green-700' : ''}>{next.rps ?? '—'}</span>
              </div>
              <div className="mt-1.5 text-[11px] text-gray-400">{p.flood_level ? 'Lower is better' : 'Outside mapped flood zones (score 0)'}</div>
            </div>
            <div className="rounded-2xl bg-ink p-3.5 text-white">
              <div className="text-[11px] font-medium text-gray-400">Indicative cost</div>
              <div className="mt-1 text-xl font-semibold text-accent">{fmtMwk(next.cost)}</div>
              <div className="mt-1.5 text-[11px] text-gray-400">{chosen.length} improvement{chosen.length === 1 ? '' : 's'} · +{Math.round(delta * 10) / 10} SPI points</div>
            </div>
          </div>

          {gaps.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-green-800"><CircleCheck size={18} />Every checklist item is in place. Nothing to improve.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Quick picks:</span>
                <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => pick(gaps.slice(0, 3))}><Sparkles size={13} />Top 3 by impact</button>
                <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => pick(gaps.filter((g) => g.cost !== null && g.cost <= 100000))}><Wand2 size={13} />Low-cost wins (≤ MK 100k)</button>
                <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => pick(gaps)}>Everything</button>
                {chosen.length > 0 && <button type="button" className="text-xs text-gray-500 underline" onClick={() => setFixes({})}>Clear</button>}
              </div>
              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
                {gaps.map((g) => {
                  const on = g.indicator in fixes;
                  return (
                    <li key={g.indicator} className={`flex items-start gap-3 p-3 ${on ? 'bg-accent-soft/50' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(g)} className="mt-1 h-4 w-4 accent-[#0f0f10]" aria-label={g.label} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <button type="button" onClick={() => toggle(g)} className="text-left font-medium">{g.label}</button>
                          <span className="text-[11px] text-gray-500"><b className="text-green-700">+{g.gain} pts</b> · {fmtMwk(g.cost)}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">{g.action}{g.kind === 'percent' && ` · now ${Number(g.current) || 0}%`}</p>
                        {on && g.kind === 'percent' && (
                          <label className="mt-2 flex items-center gap-3 text-[11px] text-gray-600">
                            Target
                            <input type="range" min={Number(g.current) || 0} max="100" step="5" value={fixes[g.indicator]}
                              onChange={(e) => setFixes((f) => ({ ...f, [g.indicator]: Number(e.target.value) }))} className="flex-1 accent-[#0f0f10]" />
                            <b className="w-9 text-right">{fixes[g.indicator]}%</b>
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {editable && chosen.length > 0 && (
            <div className="grid gap-3 rounded-2xl bg-gray-50 p-3.5 sm:grid-cols-2">
              <Field label="Responsible (optional)"><input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Head teacher, ACPC" /></Field>
              <Field label="Due date"><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
          <p className="text-[11px] text-gray-400">Costs are indicative planning figures (Priorities → Unit costs). SPI and risk use the same formulas as the map.</p>
        </div>
      )}
    </Modal>
  );
}
