import { useMemo, useRef, useState } from 'react';
import { Save, ImagePlus, X, Info } from 'lucide-react';
import { api, resizeImage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { typeOf } from '../lib/facilityTypes.js';
import { DEPTH, AFFECTED, distKm, latLon } from '../lib/decision.js';
import { Modal, Field, ErrorNote } from './ui.jsx';
import LocationPicker from './LocationPicker.jsx';

// Simple figure showing how high the water reached on a person
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

const today = () => new Date().toISOString().slice(0, 10);
const NEAR_KM = 2;

/**
 * Record a flood that has already happened (flood history). Used to check the hazard map and for planning.
 * Not a warning or emergency channel.
 */
export default function RecordFlood({ facilities, records, facility, onClose, onSent }) {
  const { profile, isAdmin, session } = useAuth();
  const { toast } = useFeedback();
  const start = facility ? latLon({ geometry: facility.geometry }) : [NaN, NaN];
  const [f, setF] = useState({
    lat: start[0], lon: start[1], date: '', event_name: '', depth: '', affected: facility ? ['facility'] : [], description: '',
    facility_id: facility?.properties.id ? String(facility.properties.id) : '',
    reporter_name: profile?.full_name || '', reporter_phone: profile?.phone || '', website: '',
  });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (a) => set('affected', f.affected.includes(a) ? f.affected.filter((x) => x !== a) : [...f.affected, a]);
  const has = Number.isFinite(f.lat) && Number.isFinite(f.lon);

  // Facilities near the chosen point, nearest first
  const nearby = useMemo(() => {
    if (!has) return [];
    return (facilities?.features || []).map((x) => {
      const [la, lo] = latLon(x);
      return { p: x.properties, km: distKm(f.lat, f.lon, la, lo) };
    }).filter((x) => x.km <= NEAR_KM || String(x.p.id) === f.facility_id).sort((a, b) => a.km - b.km).slice(0, 15);
  }, [facilities, f.lat, f.lon, f.facility_id, has]);
  const events = useMemo(() => [...new Set((records?.features || []).map((r) => r.properties.event_name).filter(Boolean))].sort(), [records]);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setPhoto(await resizeImage(file, 1024, 0.78)); } catch (err) { setError(err.message); }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!has) { setError('Set where the flooding was on the map.'); return; }
    if (!f.date) { setError('Enter the date of the flood.'); return; }
    if (!f.depth) { setError('Choose how deep the water got.'); return; }
    setSending(true);
    try {
      const r = await api.reportFlood({
        lat: f.lat, lon: f.lon, observed_at: new Date(`${f.date}T12:00:00`).toISOString(), event_name: f.event_name,
        depth: f.depth, affected: f.affected, description: f.description, facility_id: f.facility_id ? Number(f.facility_id) : null,
        reporter_name: f.reporter_name, reporter_phone: f.reporter_phone, website: f.website, photo: photo || undefined,
      });
      toast(r.status === 'verified' ? 'Flood record saved' : 'Thank you. The record will appear once an administrator confirms it.');
      onSent?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }

  return (
    <Modal wide title="Record a past flood" subtitle="Add a flood that has already happened, so planners can see where floods reach and check the flood hazard map." onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="record-form" disabled={sending} className="btn-dark"><Save size={15} />{sending ? 'Saving…' : 'Save record'}</button>
        </>
      )}>
      <form id="record-form" onSubmit={submit} className="space-y-5">
        <p className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-[11px] text-gray-600">
          <Info size={14} className="mt-px shrink-0" />
          SafeCom keeps a history of floods for planning. It does not send warnings. For current flood warnings, follow official DCCMS and DoDMA announcements and your Area Civil Protection Committee.
        </p>

        <section>
          <h3 className="mb-2 text-sm font-semibold">1. Where did it flood?</h3>
          <LocationPicker lat={f.lat} lon={f.lon} onChange={(lat, lon) => setF((x) => ({ ...x, lat, lon }))} />
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="2. Date of the flood">
            <input type="date" required className="input" value={f.date} max={today()} min="1950-01-01" onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Flood event (optional)" hint="Use the same name for all records of one event">
            <input className="input" list="flood-events" maxLength={120} value={f.event_name} onChange={(e) => set('event_name', e.target.value)} placeholder="e.g. Cyclone Freddy, March 2023" />
            <datalist id="flood-events">{events.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">3. How deep did the water get?</h3>
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
          <h3 className="mb-2 text-sm font-semibold">4. What was affected?</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(AFFECTED).map(([k, label]) => (
              <button key={k} type="button" onClick={() => toggle(k)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${f.affected.includes(k) ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white hover:border-gray-300'}`}>{label}</button>
            ))}
          </div>
          {has && (
            <Field label="Was a SafeCom facility flooded? (optional)" className="mt-3" hint={`Facilities within ${NEAR_KM} km of the point you set`}>
              <select className="input" value={f.facility_id} onChange={(e) => set('facility_id', e.target.value)}>
                <option value="">No / not sure</option>
                {nearby.map(({ p, km }) => <option key={p.id} value={p.id}>{p.name} · {typeOf(p.facility_type).label} · {km.toFixed(1)} km</option>)}
              </select>
            </Field>
          )}
        </section>

        <Field label="What happened? (optional)">
          <textarea className="input" rows={3} maxLength={1000} value={f.description} onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. River burst its banks; classrooms flooded for two weeks; road cut for three days" />
        </Field>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Photo (optional)</h3>
          <div className="flex items-center gap-3">
            {photo ? (
              <div className="relative h-20 w-28 overflow-hidden rounded-xl"><img src={photo} alt="Flood" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setPhoto(null)} className="absolute right-1 top-1 rounded-md bg-black/60 p-0.5 text-white" aria-label="Remove photo"><X size={12} /></button></div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost"><ImagePlus size={15} />Add photo</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
          </div>
        </section>

        {!session && (
          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name (optional)"><input className="input" value={f.reporter_name} onChange={(e) => set('reporter_name', e.target.value)} /></Field>
            <Field label="Phone (optional)" hint="Only administrators see it, to confirm the record"><input type="tel" className="input" value={f.reporter_phone} onChange={(e) => set('reporter_phone', e.target.value)} placeholder="+265 …" /></Field>
          </section>
        )}
        {/* Honeypot: hidden from people, bots fill it */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} className="hidden" aria-hidden="true" />
        {isAdmin && <p className="text-[11px] text-gray-500">You are an administrator: this record is confirmed straight away.</p>}
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Modal>
  );
}
