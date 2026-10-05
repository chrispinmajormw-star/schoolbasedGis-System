import { useMemo, useState } from 'react';
import { Eye, EyeOff, LogIn, UserPlus, CircleCheck, Search } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { typeOf } from '../lib/facilityTypes.js';
import { Modal, ErrorNote, Field } from './ui.jsx';
import LocationPicker from './LocationPicker.jsx';
import { TypePicker, SubtypeInput, DistrictInput } from './TypePicker.jsx';

function PasswordInput({ value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 8 : undefined}
        value={value} onChange={onChange} className="input pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}

function SignIn({ onDone, goRegister }) {
  const { signIn, sendReset, enabled } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try { await signIn(email.trim(), password); onDone(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function forgot() {
    if (!email.trim()) { setError('Type your email first, then tap "Forgot password".'); return; }
    setBusy(true); setError('');
    try { await sendReset(email.trim()); setInfo('If that account exists, a reset link has been sent to the email.'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!enabled && <ErrorNote>Sign-in is not configured for this site yet.</ErrorNote>}
      <Field label="Email"><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></Field>
      <Field label="Password"><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      <ErrorNote>{error}</ErrorNote>
      {info && <p className="rounded-xl bg-green-50 px-3 py-2 text-green-700">{info}</p>}
      <button type="submit" disabled={busy || !enabled} className="btn-dark w-full py-2.5"><LogIn size={16} />{busy ? 'Signing in…' : 'Sign in'}</button>
      <div className="flex justify-between text-xs">
        <button type="button" onClick={forgot} disabled={busy || !enabled} className="text-gray-500 hover:text-gray-900">Forgot password?</button>
        <button type="button" onClick={goRegister} className="font-medium text-gray-900 hover:underline">New here? Create an account</button>
      </div>
    </form>
  );
}

function Register({ facilities, onDone }) {
  const { signIn } = useAuth();
  const [f, setF] = useState({ full_name: '', email: '', phone: '', organisation: '', password: '', note: '', website: '' });
  const [mode, setMode] = useState('existing');
  const [q, setQ] = useState('');
  const [facilityId, setFacilityId] = useState(null);
  const [nf, setNf] = useState({ facility_type: 'school', name: '', district: '', subtype: '', lat: NaN, lon: NaN });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setN = (k) => (e) => setNf((x) => ({ ...x, [k]: e.target.value }));

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    const all = (facilities?.features || []).map((x) => x.properties);
    return (n ? all.filter((p) => `${p.name} ${p.district} ${p.code || ''}`.toLowerCase().includes(n)) : all).slice(0, 8);
  }, [facilities, q]);
  const chosen = (facilities?.features || []).find((x) => x.properties.id === facilityId)?.properties;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mode === 'existing' && !facilityId) { setError('Choose your facility from the list, or propose a new one.'); return; }
    if (mode === 'new' && (!Number.isFinite(nf.lat) || !Number.isFinite(nf.lon))) { setError('Set the facility location on the map.'); return; }
    setBusy(true);
    try {
      await api.register({ ...f, facility_id: mode === 'existing' ? facilityId : undefined, new_facility: mode === 'new' ? nf : undefined });
      setDone(true);
      await signIn(f.email.trim(), f.password).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 py-4 text-center">
        <CircleCheck size={40} className="mx-auto text-green-600" />
        <h3 className="text-base font-semibold">Request sent</h3>
        <p className="text-gray-500">An administrator will review your request{mode === 'new' ? ' and the new facility' : ''}. Once your account is activated you can update your facility&apos;s information and preparedness assessment.</p>
        <button type="button" onClick={onDone} className="btn-dark">Continue</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><input required value={f.full_name} onChange={set('full_name')} autoComplete="name" className="input" /></Field>
        <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" className="input" placeholder="+265 …" /></Field>
        <Field label="Email"><input type="email" required value={f.email} onChange={set('email')} autoComplete="email" className="input" /></Field>
        <Field label="Password" hint="At least 8 characters"><PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Organisation / role" className="sm:col-span-2"><input value={f.organisation} onChange={set('organisation')} className="input" placeholder="e.g. Head teacher, Nsanje DEM office, Market committee" /></Field>
        {/* Honeypot: hidden from people, bots fill it in */}
        <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="hidden" aria-hidden="true" />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Which facility will you manage?</h3>
        <div className="seg mb-3">
          {[['existing', 'It is on the map'], ['new', 'Propose a new facility']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`seg-btn ${mode === k ? 'seg-btn-on' : ''}`}>{label}</button>
          ))}
        </div>

        {mode === 'existing' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, district or code" className="input pl-9" />
            </div>
            <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
              {matches.length === 0 && <li className="px-3 py-3 text-gray-400">Not found? Choose “Propose a new facility”.</li>}
              {matches.map((p) => {
                const T = typeOf(p.facility_type);
                const on = p.id === facilityId;
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setFacilityId(p.id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left ${on ? 'bg-accent-soft' : 'hover:bg-gray-50'}`}>
                      <T.icon size={15} className="shrink-0 text-gray-500" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="text-[11px] text-gray-400">{T.label} · {p.district}</span></span>
                      {on && <CircleCheck size={16} className="text-green-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {chosen && <p className="text-xs text-gray-500">Selected: <b>{chosen.name}</b></p>}
          </div>
        ) : (
          <div className="space-y-3">
            <TypePicker value={nf.facility_type} onChange={(v) => setNf((x) => ({ ...x, facility_type: v }))} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Facility name" className="sm:col-span-3"><input required value={nf.name} onChange={setN('name')} className="input" /></Field>
              <Field label="District"><DistrictInput value={nf.district} onChange={setN('district')} /></Field>
              <Field label="Category" className="sm:col-span-2"><SubtypeInput id="reg-subtypes" type={nf.facility_type} value={nf.subtype} onChange={setN('subtype')} /></Field>
            </div>
            <LocationPicker lat={nf.lat} lon={nf.lon} onChange={(lat, lon) => setNf((x) => ({ ...x, lat, lon }))} />
          </div>
        )}
      </section>

      <Field label="Message to the administrator (optional)">
        <textarea rows={2} value={f.note} onChange={set('note')} className="input" placeholder="e.g. I am the head teacher; you can call me to confirm" />
      </Field>

      <ErrorNote>{error}</ErrorNote>
      <button type="submit" disabled={busy} className="btn-dark w-full py-2.5"><UserPlus size={16} />{busy ? 'Sending…' : 'Request access'}</button>
      <p className="text-center text-[11px] text-gray-400">An administrator checks every request before the account can edit anything.</p>
    </form>
  );
}

export default function AuthDialog({ initial = 'signin', facilities, onClose }) {
  const [tab, setTab] = useState(initial);
  return (
    <Modal wide={tab === 'register'} title={tab === 'signin' ? 'Sign in to SafeCom' : 'Create an account'}
      subtitle={tab === 'signin' ? 'Facility managers and administrators' : 'Manage your community facility on the SafeCom map'} onClose={onClose}>
      <div className="seg mb-5">
        {[['signin', 'Sign in'], ['register', 'Create account']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`seg-btn ${tab === k ? 'seg-btn-on' : ''}`}>{label}</button>
        ))}
      </div>
      {tab === 'signin'
        ? <SignIn onDone={onClose} goRegister={() => setTab('register')} />
        : <Register facilities={facilities} onDone={onClose} />}
    </Modal>
  );
}

export function SetNewPassword() {
  const { setNewPassword } = useAuth();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Choose a new password" onClose={() => {}}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try { await setNewPassword(pw); } catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>
        <input type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="input" placeholder="At least 8 characters" />
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" disabled={busy} className="btn-dark w-full">Save password</button>
      </form>
    </Modal>
  );
}
