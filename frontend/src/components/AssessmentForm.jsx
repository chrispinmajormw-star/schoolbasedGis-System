import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { api, classify, computeSpi, CLASS_STYLE } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { typeOf } from '../lib/facilityTypes.js';
import { Modal, ErrorNote } from './ui.jsx';

export default function AssessmentForm({ facility, checklist: weights, onSaved, onClose }) {
  const { profile } = useAuth();
  const [values, setValues] = useState(null);
  const [assessor, setAssessor] = useState(profile?.full_name || '');
  const [assessedOn, setAssessedOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill with the latest assessment so updates are quick
  useEffect(() => {
    let alive = true;
    const blank = (a) => Object.fromEntries(weights.map((w) => [w.indicator,
      a ? (w.kind === 'percent' ? Number(a.answers?.[w.indicator] ?? 0) : !!a.answers?.[w.indicator]) : (w.kind === 'percent' ? 0 : false)]));
    api.lastAssessment(facility.id).then((a) => alive && setValues(blank(a))).catch(() => alive && setValues(blank(null)));
    return () => { alive = false; };
  }, [facility.id, weights]);

  const spi = useMemo(() => (values ? computeSpi(weights, values) : 0), [weights, values]);
  const cls = CLASS_STYLE[classify(spi)];
  const domains = [...new Set(weights.map((w) => w.domain))];

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const r = await api.saveAssessment(facility.id, { answers: values, assessor, notes, assessed_on: assessedOn });
      onSaved(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={facility.name} subtitle={`${typeOf(facility.facility_type).label} · ${facility.district} · Preparedness assessment`} onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="assess-form" disabled={saving || !values} className="btn-dark"><Save size={15} />{saving ? 'Saving…' : 'Save assessment'}</button>
        </>
      )}>
      <form id="assess-form" onSubmit={submit} className="space-y-4">
        <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between rounded-xl p-3.5" style={{ background: cls.bg, color: cls.text }}>
          <div>
            <div className="text-[11px] font-medium">Safety Preparedness Index (live)</div>
            <div className="text-2xl font-bold">{spi}%</div>
          </div>
          <div className="text-right text-xs font-semibold">{cls.label}<div className="font-normal opacity-75">{cls.range}</div></div>
        </div>

        {!values && <p className="py-6 text-center text-gray-400">Loading last assessment…</p>}
        {values && domains.map((d) => (
          <fieldset key={d}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{d}</legend>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {weights.filter((w) => w.domain === d).map((w) => (
                <label key={w.indicator} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
                  <span>{w.label} <span className="text-[11px] text-gray-400">· weight {w.weight}</span></span>
                  {w.kind === 'percent' ? (
                    <span className="flex items-center gap-1">
                      <input type="number" inputMode="numeric" min="0" max="100" value={values[w.indicator]}
                        onChange={(e) => setValues({ ...values, [w.indicator]: Math.min(100, Math.max(0, Number(e.target.value))) })}
                        className="input w-20 py-1 text-right" />%
                    </span>
                  ) : (
                    <input type="checkbox" checked={!!values[w.indicator]}
                      onChange={(e) => setValues({ ...values, [w.indicator]: e.target.checked })}
                      className="h-5 w-5 accent-[#0f0f10]" />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Assessor</span><input value={assessor} onChange={(e) => setAssessor(e.target.value)} className="input" placeholder="Name" /></label>
          <label><span className="label">Date</span><input type="date" value={assessedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setAssessedOn(e.target.value)} className="input" /></label>
        </div>
        <label className="block"><span className="label">Notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" /></label>
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Modal>
  );
}
