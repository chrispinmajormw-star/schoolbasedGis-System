import { useEffect, useMemo, useState } from 'react';
import { api, classify, computeSpi, CLASS_STYLE } from '../lib/api.js';

export default function AssessmentForm({ school, weights, onSaved, onClose }) {
  const [values, setValues] = useState({});
  const [assessor, setAssessor] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill with the latest assessment so updates are quick
  useEffect(() => {
    let alive = true;
    api.lastAssessment(school.id).then((a) => {
      if (!alive) return;
      const init = {};
      weights.forEach((w) => { init[w.indicator] = a ? (w.kind === 'percent' ? Number(a[w.indicator]) : !!a[w.indicator]) : (w.kind === 'percent' ? 0 : false); });
      setValues(init);
    }).catch(() => {});
    return () => { alive = false; };
  }, [school.id, weights]);

  const spi = useMemo(() => computeSpi(weights, values), [weights, values]);
  const cls = classify(spi);
  const domains = [...new Set(weights.map((w) => w.domain))];

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.saveAssessment(school.id, { ...values, assessor, notes });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{school.name}</h2>
            <p className="text-sm text-gray-500">{school.district} - new assessment</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">x</button>
        </div>

        <div className="mt-3 rounded-lg p-3 text-white" style={{ background: CLASS_STYLE[cls].color }}>
          <div className="text-xs opacity-90">School Preparedness Index</div>
          <div className="text-2xl font-bold">{spi}%</div>
          <div className="text-sm">{CLASS_STYLE[cls].label}</div>
        </div>

        {domains.map((d) => (
          <fieldset key={d} className="mt-4">
            <legend className="text-sm font-semibold text-gray-700">{d}</legend>
            {weights.filter((w) => w.domain === d).map((w) => (
              <label key={w.indicator} className="mt-1 flex items-center justify-between gap-3 text-sm">
                <span>{w.label} <span className="text-xs text-gray-400">(weight {w.weight})</span></span>
                {w.kind === 'percent' ? (
                  <input type="number" min="0" max="100" value={values[w.indicator] ?? 0}
                    onChange={(e) => setValues({ ...values, [w.indicator]: Math.min(100, Math.max(0, Number(e.target.value))) })}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right" />
                ) : (
                  <input type="checkbox" checked={!!values[w.indicator]}
                    onChange={(e) => setValues({ ...values, [w.indicator]: e.target.checked })}
                    className="h-5 w-5" />
                )}
              </label>
            ))}
          </fieldset>
        ))}

        <input value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder="Assessor name"
          className="mt-4 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
          className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm" />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={saving} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Save assessment'}
          </button>
        </div>
      </form>
    </div>
  );
}
