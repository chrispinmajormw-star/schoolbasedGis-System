import { useRef, useState } from 'react';
import { Send, ImagePlus, X } from 'lucide-react';
import { api, resizeImage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { DEPTH, AFFECTED } from '../lib/decision.js';
import { Modal, Field, ErrorNote } from './ui.jsx';
import LocationPicker from './LocationPicker.jsx';

// Simple figure showing water height on a person
function DepthIcon({ level }) {
  const y = [0, 48, 38, 26, 12][level];
  return (
    <svg viewBox="0 0 40 56" className="h-12 w-9" aria-hidden="true">
      <circle cx="20" cy="8" r="5" fill="#374151" />
      <path d="M20 14v20M20 34l-7 16M20 34l7 16M20 19l-9 8M20 19l9 8" stroke="#374151" strokeWidth="3" strokeLinecap="round" fill="none" />
      <rect x="0" y={y} width="40" height={56 - y} fill="#3b82f6" opacity=".55" rx="2" />
    </svg>
  );
}

/** Anyone can report flooding; administrators review reports before they appear on the map. */
export default function ReportFlood({ onClose, onSent }) {
  const { profile, isAdmin, session } = useAuth();
  const { toast } = useFeedback();
  const [f, setF] = useState({
    lat: NaN, lon: NaN, depth: '', affected: [], description: '', when: 'now', observed_at: '',
    reporter_name: profile?.full_name || '', reporter_phone: profile?.phone || '', website: '',
  });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (a) => set('affected', f.affected.includes(a) ? f.affected.filter((x) => x !== a) : [...f.affected, a]);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setPhoto(await resizeImage(file, 1024, 0.78)); } catch (err) { setError(err.message); }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) { setError('Set the flooded location on the map (or use GPS).'); return; }
    if (!f.depth) { setError('Choose how deep the water is.'); return; }
    setSending(true);
    try {
      const r = await api.reportFlood({
        lat: f.lat, lon: f.lon, depth: f.depth, affected: f.affected, description: f.description,
        observed_at: f.when === 'earlier' && f.observed_at ? new Date(f.observed_at).toISOString() : undefined,
        reporter_name: f.reporter_name, reporter_phone: f.reporter_phone, website: f.website, photo: photo || undefined,
      });
      toast(r.status === 'verified' ? 'Flood report published on the map' : 'Thank you. Your report will appear on the map once it is checked.');
      onSent?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }

  return (
    <Modal wide title="Report flooding" subtitle="Seen flooding? Tell us where and how deep. Reports help warn nearby schools, clinics and shelters." onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="report-form" disabled={sending} className="btn-dark"><Send size={15} />{sending ? 'Sending…' : 'Send report'}</button>
        </>
      )}>
      <form id="report-form" onSubmit={submit} className="space-y-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold">1. Where is the flooding?</h3>
          <LocationPicker lat={f.lat} lon={f.lon} onChange={(lat, lon) => setF((x) => ({ ...x, lat, lon }))} />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">2. How deep is the water?</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(DEPTH).map(([k, d]) => (
              <button key={k} type="button" onClick={() => set('depth', k)}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs font-medium transition ${f.depth === k ? 'border-ink bg-accent-soft' : 'border-gray-200 hover:border-gray-300'}`}>
                <DepthIcon level={d.level} />{d.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">3. What is affected?</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(AFFECTED).map(([k, label]) => (
              <button key={k} type="button" onClick={() => toggle(k)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${f.affected.includes(k) ? (k === 'people_trapped' ? 'border-red-600 bg-red-600 text-white' : 'border-ink bg-ink text-white') : 'border-gray-200 bg-white hover:border-gray-300'}`}>{label}</button>
            ))}
          </div>
          {f.affected.includes('people_trapped') && (
            <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-[11px] text-red-800">If people are in danger now, also call the police or your Area Civil Protection Committee straight away.</p>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="When did you see it?">
            <select className="input" value={f.when} onChange={(e) => set('when', e.target.value)}>
              <option value="now">Now</option><option value="earlier">Earlier</option>
            </select>
          </Field>
          {f.when === 'earlier' && (
            <Field label="Date and time"><input type="datetime-local" className="input" value={f.observed_at} max={new Date().toISOString().slice(0, 16)} onChange={(e) => set('observed_at', e.target.value)} /></Field>
          )}
          <Field label="What did you see? (optional)" className="sm:col-span-2">
            <textarea className="input" rows={3} maxLength={1000} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. River burst near the bridge, road cut, water entering houses" />
          </Field>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Photo (optional)</h3>
          <div className="flex items-center gap-3">
            {photo ? (
              <div className="relative h-20 w-28 overflow-hidden rounded-xl"><img src={photo} alt="Flood" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setPhoto(null)} className="absolute right-1 top-1 rounded-md bg-black/60 p-0.5 text-white" aria-label="Remove photo"><X size={12} /></button></div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost"><ImagePlus size={15} />Add photo</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
          </div>
        </section>

        {!session && (
          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name (optional)"><input className="input" value={f.reporter_name} onChange={(e) => set('reporter_name', e.target.value)} /></Field>
            <Field label="Phone (optional)" hint="Only reviewers see it, to confirm the report"><input type="tel" className="input" value={f.reporter_phone} onChange={(e) => set('reporter_phone', e.target.value)} placeholder="+265 …" /></Field>
          </section>
        )}
        {/* Honeypot: hidden from people, bots fill it */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} className="hidden" aria-hidden="true" />
        {isAdmin && <p className="text-[11px] text-gray-500">You are an administrator: this report is published straight away.</p>}
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Modal>
  );
}
