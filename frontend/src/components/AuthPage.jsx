import { useMemo, useState } from 'react';
import {
  Eye, EyeOff, ShieldCheck, Check, CircleCheck, Search, ArrowLeft, ArrowRight, Map as MapIcon, Clock,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { typeOf } from '../lib/facilityTypes.js';
import { ErrorNote } from './ui.jsx';
import LocationPicker from './LocationPicker.jsx';
import { TypePicker, SubtypeInput, DistrictInput } from './TypePicker.jsx';

const STEPS = [
  'Create your account',
  'Choose or propose your facility',
  'Send for admin verification',
];

/* ---------- small building blocks ---------- */

function Label({ children, hint }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-gray-700">
      {children}{hint && <span className="font-normal text-gray-400">{hint}</span>}
    </span>
  );
}

function PasswordInput({ value, onChange, autoComplete, id }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} required
        minLength={autoComplete === 'new-password' ? 8 : undefined}
        value={value} onChange={onChange} className="input-soft pr-10" placeholder="••••••••••" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}

// Malawi flag (black, red, green with a rising sun) for the phone field
function MalawiFlag() {
  return (
    <svg viewBox="0 0 18 12" className="h-3 w-[18px] shrink-0 overflow-hidden rounded-[2px]" aria-hidden="true">
      <rect width="18" height="4" fill="#000" /><rect y="4" width="18" height="4" fill="#CE1126" /><rect y="8" width="18" height="4" fill="#339E35" />
      <circle cx="9" cy="4.2" r="2" fill="#CE1126" />
    </svg>
  );
}

/* ---------- left brand panel ---------- */

function BrandPanel({ mode, step }) {
  return (
    <div className="auth-hero relative flex flex-col overflow-hidden rounded-[24px] p-5 text-white sm:p-6 lg:h-full lg:p-7">
      {/* decorative map rings and route */}
      <svg className="pointer-events-none absolute -right-20 -top-20 h-[320px] w-[320px] opacity-[0.18]" viewBox="0 0 400 400" aria-hidden="true">
        {[60, 110, 160, 210].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#FFD02B" strokeWidth="1.2" strokeDasharray={r % 100 ? '4 6' : undefined} />)}
        <path d="M40 330 C 120 250, 170 300, 230 220 S 320 140, 360 90" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="6 8" />
        <circle cx="230" cy="220" r="7" fill="#FFD02B" /><circle cx="360" cy="90" r="5" fill="#fff" />
      </svg>

      <div className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-ink"><ShieldCheck size={16} /></span>
        <span className="text-sm font-semibold">SafeCom</span>
      </div>

      <div className="relative mt-8 lg:mt-auto">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-medium backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {mode === 'register' ? 'Join us to build safer communities' : 'Safe Community · Malawi'}
        </span>
        <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-[34px]">
          {mode === 'register' ? 'Start your journey' : 'Welcome back'}
        </h1>
        <p className="mt-2 max-w-md text-[13px] text-gray-300">
          {mode === 'register'
            ? 'Map your facility, keep its preparedness up to date and help your community get ready for floods.'
            : 'Mapping Community Safety & Resilience. Sign in to update your facility or manage SafeCom.'}
        </p>

        <ol className="mt-6 hidden gap-2.5 sm:grid sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const current = mode === 'register' && n === step;
            const done = mode === 'register' && n < step;
            return (
              <li key={s} className={`flex min-h-[92px] flex-col justify-between rounded-xl p-3 transition ${
                current ? 'bg-white text-ink shadow-xl' : 'border border-white/10 bg-white/[0.06] text-gray-300'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  current ? 'bg-accent text-ink' : done ? 'bg-accent/90 text-ink' : 'border border-white/25 text-white'}`}>
                  {done ? <Check size={14} /> : n}
                </span>
                <span className={`text-xs font-medium leading-snug ${current ? 'text-ink' : ''}`}>{s}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ---------- sign in ---------- */

function SignInForm({ onDone, goRegister }) {
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
    <form onSubmit={submit} className="space-y-3.5">
      {!enabled && <ErrorNote>Sign-in is not configured for this site yet.</ErrorNote>}
      <label className="block"><Label>Email</Label>
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-soft" placeholder="you@example.com" /></label>
      <label className="block"><Label hint={<button type="button" onClick={forgot} className="hover:text-gray-700">Forgot password?</button>}>Password</Label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
      <ErrorNote>{error}</ErrorNote>
      {info && <p className="rounded-xl bg-green-50 px-3 py-2 text-green-700">{info}</p>}
      <button type="submit" disabled={busy || !enabled} className="btn-auth">{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-center text-xs text-gray-500">
        Don&apos;t have an account? <button type="button" onClick={goRegister} className="font-semibold text-ink underline-offset-2 hover:underline">Create one</button>
      </p>
    </form>
  );
}

/* ---------- register: 3 steps ---------- */

function RegisterForm({ facilities, step, setStep, onDone, goSignIn }) {
  const { signIn } = useAuth();
  const [f, setF] = useState({ full_name: '', email: '', phone: '', organisation: '', password: '', note: '', website: '' });
  const [mode, setMode] = useState('existing');
  const [q, setQ] = useState('');
  const [facilityId, setFacilityId] = useState(null);
  const [nf, setNf] = useState({ facility_type: 'school', name: '', district: '', subtype: '', lat: NaN, lon: NaN });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setN = (k) => (e) => setNf((x) => ({ ...x, [k]: e.target.value }));

  const all = useMemo(() => (facilities?.features || []).map((x) => x.properties), [facilities]);
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (n ? all.filter((p) => `${p.name} ${p.district} ${p.code || ''}`.toLowerCase().includes(n)) : all).slice(0, 8);
  }, [all, q]);
  const chosen = all.find((p) => p.id === facilityId);
  const pwOk = f.password.length >= 8;

  function next(e) {
    e.preventDefault();
    setError('');
    if (step === 1) {
      if (!pwOk) { setError('Password must be at least 8 characters.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (mode === 'existing' && !facilityId) { setError('Choose your facility from the list, or propose a new one.'); return; }
      if (mode === 'new' && (!nf.name.trim() || !nf.district.trim())) { setError('Give the facility a name and district.'); return; }
      if (mode === 'new' && (!Number.isFinite(nf.lat) || !Number.isFinite(nf.lon))) { setError('Set the facility location on the map.'); return; }
      setStep(3);
    } else {
      submit();
    }
  }

  async function submit() {
    if (!agree) { setError('Please confirm the information is accurate.'); return; }
    setBusy(true); setError('');
    try {
      await api.register({ ...f, facility_id: mode === 'existing' ? facilityId : undefined, new_facility: mode === 'new' ? nf : undefined });
      setStep(4);
      await signIn(f.email.trim(), f.password).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 4) {
    return (
      <div className="space-y-5 py-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-ink"><Clock size={26} /></span>
        <div>
          <h3 className="text-lg font-semibold">Request sent</h3>
          <p className="mx-auto mt-2 max-w-sm text-gray-500">
            An administrator will check your details{mode === 'new' ? ' and the new facility' : ''}. You can browse the map now;
            editing unlocks as soon as your account is activated.
          </p>
        </div>
        <button type="button" onClick={onDone} className="btn-auth">Go to the map</button>
      </div>
    );
  }

  const T = typeOf(mode === 'new' ? nf.facility_type : chosen?.facility_type);

  return (
    <form onSubmit={next} className="space-y-4">
      {/* mobile step indicator */}
      <div className="flex items-center gap-2 sm:hidden">
        {[1, 2, 3].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-ink' : 'bg-gray-200'}`} />)}
      </div>
      <p className="text-xs font-medium text-gray-400">Step {step} of 3 · {STEPS[step - 1]}</p>

      {step === 1 && (
        <>
          <label className="block"><Label>Phone number</Label>
            <span className="input-soft flex items-center gap-2 focus-within:ring-2 focus-within:ring-gray-100">
              <MalawiFlag />
              <input type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="+265 999 000 000"
                className="w-full bg-transparent outline-none placeholder:text-gray-400" />
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><Label>Full name</Label>
              <input required autoComplete="name" value={f.full_name} onChange={set('full_name')} className="input-soft" placeholder="Chikondi Banda" /></label>
            <label className="block"><Label>Organisation / role</Label>
              <input value={f.organisation} onChange={set('organisation')} className="input-soft" placeholder="Head teacher" /></label>
          </div>
          <label className="block"><Label>Email</Label>
            <span className="relative block">
              <input type="email" required autoComplete="email" value={f.email} onChange={set('email')} className="input-soft pr-10" placeholder="you@example.com" />
              {/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) && <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600" />}
            </span>
          </label>
          <label className="block"><Label>Password</Label>
            <PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
          <p className={`-mt-2 text-[11px] ${f.password && !pwOk ? 'text-red-600' : 'text-gray-400'}`}>At least 8 characters. Mix letters, numbers and symbols for a stronger password.</p>
          {/* Honeypot: hidden from people, bots fill it in */}
          <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="hidden" aria-hidden="true" />
        </>
      )}

      {step === 2 && (
        <>
          <div className="seg">
            {[['existing', 'It is on the map'], ['new', 'Propose a new facility']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`seg-btn ${mode === k ? 'seg-btn-on' : ''}`}>{label}</button>
            ))}
          </div>
          {mode === 'existing' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, district or code" className="input-soft pl-10" />
              </div>
              <ul className="scroll-thin max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-100">
                {matches.length === 0 && <li className="px-4 py-4 text-gray-400">Not found? Choose “Propose a new facility”.</li>}
                {matches.map((p) => {
                  const PT = typeOf(p.facility_type);
                  const on = p.id === facilityId;
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => setFacilityId(p.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${on ? 'bg-accent-soft' : 'hover:bg-gray-50'}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white"><PT.icon size={14} /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="text-[11px] text-gray-400">{PT.label} · {p.district}</span></span>
                        {on && <CircleCheck size={18} className="text-green-600" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <TypePicker value={nf.facility_type} onChange={(v) => setNf((x) => ({ ...x, facility_type: v }))} />
              <label className="block"><Label>Facility name</Label>
                <input value={nf.name} onChange={setN('name')} className="input-soft" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><Label>District</Label><DistrictInput value={nf.district} onChange={setN('district')} required={false} /></label>
                <label className="block"><Label>Category</Label><SubtypeInput id="reg-subtypes" type={nf.facility_type} value={nf.subtype} onChange={setN('subtype')} /></label>
              </div>
              <LocationPicker lat={nf.lat} lon={nf.lon} onChange={(lat, lon) => setNf((x) => ({ ...x, lat, lon }))} />
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <dl className="divide-y divide-gray-100 rounded-2xl bg-gray-50 px-4">
            <div className="kv"><dt>Name</dt><dd>{f.full_name}</dd></div>
            <div className="kv"><dt>Email</dt><dd className="break-all">{f.email}</dd></div>
            {f.phone && <div className="kv"><dt>Phone</dt><dd>{f.phone}</dd></div>}
            <div className="kv"><dt>Facility</dt><dd className="flex items-center justify-end gap-1.5"><T.icon size={14} className="text-gray-400" />{mode === 'new' ? nf.name : chosen?.name}</dd></div>
            <div className="kv"><dt>Type</dt><dd>{T.label}{mode === 'new' && <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold">NEW</span>}</dd></div>
          </dl>
          <label className="block"><Label hint="optional">Message to the administrator</Label>
            <textarea rows={3} value={f.note} onChange={set('note')} className="input-soft" placeholder="e.g. I am the head teacher; call me on the number above to confirm" /></label>
          <label className="flex items-start gap-2.5 text-xs text-gray-600">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0f0f10]" />
            I confirm I am responsible for this facility and that the information I give SafeCom is accurate.
          </label>
        </>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div className="flex gap-2">
        {step > 1 && (
          <button type="button" onClick={() => { setError(''); setStep(step - 1); }} className="btn-ghost h-12 rounded-2xl px-4"><ArrowLeft size={16} />Back</button>
        )}
        <button type="submit" disabled={busy} className="btn-auth flex-1">
          {step < 3 ? <>Continue<ArrowRight size={16} /></> : busy ? 'Sending…' : 'Request access'}
        </button>
      </div>
      {step === 1 && (
        <p className="text-center text-xs text-gray-500">
          Already have an account? <button type="button" onClick={goSignIn} className="font-semibold text-ink underline-offset-2 hover:underline">Sign in</button>
        </p>
      )}
    </form>
  );
}

/* ---------- page ---------- */

export default function AuthPage({ initial = 'signin', facilities, onClose }) {
  const [mode, setMode] = useState(initial);
  const [step, setStep] = useState(1);
  const go = (m) => { setMode(m); setStep(1); };

  return (
    <div className="fixed inset-0 z-[3000] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full max-w-[1000px] items-center p-3 sm:p-6">
        <div className="grid w-full gap-3 rounded-[28px] bg-white p-2.5 shadow-card lg:min-h-[520px] lg:grid-cols-[1fr_1fr]">
          <BrandPanel mode={mode} step={step} />

          <div className="flex flex-col px-3 py-4 sm:px-8 lg:py-6">
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                <MapIcon size={14} />Browse the map
              </button>
            </div>
            <div className="mx-auto my-auto w-full max-w-[360px] py-4">
              <h2 className="text-center text-[22px] font-semibold tracking-tight">{mode === 'register' ? 'Join SafeCom' : 'Sign in'}</h2>
              <p className="mb-5 mt-1 text-center text-[13px] text-gray-500">
                {mode === 'register' ? 'For facility managers, focal persons and committees' : 'Facility managers and administrators'}
              </p>
              {mode === 'register'
                ? <RegisterForm facilities={facilities} step={step} setStep={setStep} onDone={onClose} goSignIn={() => go('signin')} />
                : <SignInForm onDone={onClose} goRegister={() => go('register')} />}
              <p className="mt-6 text-center text-[10px] leading-relaxed text-gray-400">
                SafeCom · Safe Community: Mapping Community Safety &amp; Resilience. Facility information you submit is shown on the public map after verification.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
