import { useEffect, useState } from 'react';
import { Save, KeyRound, LogOut, UserRound, Map as MapIcon, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { supabase } from '../lib/supabase.js';
import { typeOf } from '../lib/facilityTypes.js';
import { BASEMAPS } from '../lib/tiles.js';
import { Field, ErrorNote, Avatar } from './ui.jsx';

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-ink"><Icon size={17} /></span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-ink' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`seg-btn ${value === k ? 'seg-btn-on' : ''}`}>{label}</button>
      ))}
    </div>
  );
}

function ProfileSection() {
  const { profile, session, reloadProfile } = useAuth();
  const { toast } = useFeedback();
  const [f, setF] = useState({ full_name: '', phone: '', organisation: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) setF({ full_name: profile.full_name || '', phone: profile.phone || '', organisation: profile.organisation || '' });
  }, [profile]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const T = profile?.facility_type ? typeOf(profile.facility_type) : null;

  return (
    <Section icon={UserRound} title="Profile" subtitle="How you appear to administrators and in the activity log">
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <Avatar name={profile?.full_name || session?.user.email} className="h-11 w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{profile?.full_name || '—'}</div>
          <div className="truncate text-xs text-gray-500">{session?.user.email}</div>
        </div>
        <div className="text-right text-[11px]">
          <span className={`rounded-lg px-2 py-0.5 font-semibold ${profile?.role === 'admin' ? 'bg-ink text-white' : 'bg-accent-soft text-ink'}`}>
            {profile?.role === 'admin' ? 'Administrator' : 'Facility manager'}
          </span>
          <div className="mt-1 capitalize text-gray-400">{profile?.status}</div>
        </div>
      </div>
      {T && (
        <p className="mb-4 flex items-center gap-2 text-xs text-gray-500">
          <T.icon size={14} />Manages <b className="text-gray-800">{profile.facility_name}</b> ({T.label}). Ask an administrator to change this.
        </p>
      )}
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try { await api.updateMe(f); await reloadProfile(); toast('Profile saved'); } catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input required value={f.full_name} onChange={set('full_name')} className="input" /></Field>
          <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} className="input" placeholder="+265 …" /></Field>
        </div>
        <Field label="Organisation / role"><input value={f.organisation} onChange={set('organisation')} className="input" /></Field>
        <Field label="Email" hint="Your sign-in email cannot be changed here. Ask an administrator."><input value={session?.user.email || ''} disabled className="input bg-gray-50 text-gray-500" /></Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end"><button type="submit" disabled={busy} className="btn-dark"><Save size={15} />{busy ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const { session } = useAuth();
  const { toast } = useFeedback();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <Section icon={KeyRound} title="Password" subtitle="Use at least 8 characters. Mixing letters, numbers and symbols makes it stronger.">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setError('');
        if (pw.length < 8) { setError('The new password must be at least 8 characters.'); return; }
        if (pw !== pw2) { setError('The new passwords do not match.'); return; }
        setBusy(true);
        try {
          // Confirm the current password before changing it
          const check = await supabase.auth.signInWithPassword({ email: session.user.email, password: cur });
          if (check.error) throw new Error('Your current password is not correct.');
          const { error: err } = await supabase.auth.updateUser({ password: pw });
          if (err) throw new Error(err.message);
          setCur(''); setPw(''); setPw2('');
          toast('Password changed');
        } catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>
        <Field label="Current password"><input type={show ? 'text' : 'password'} required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="input" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password"><input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="input" /></Field>
          <Field label="Confirm new password"><input type={show ? 'text' : 'password'} required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="input" /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? 'Hide' : 'Show'} passwords
          </button>
          <button type="submit" disabled={busy} className="btn-dark"><KeyRound size={15} />{busy ? 'Changing…' : 'Change password'}</button>
        </div>
      </form>
    </Section>
  );
}

export default function Settings({ prefs, setPrefs }) {
  const { session, signOut } = useAuth();
  const set = (k) => (v) => setPrefs({ [k]: v });

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-gray-500">{session ? 'Your account and how SafeCom looks on this device' : 'How SafeCom looks on this device'}</p>
        </div>

        {session && <ProfileSection />}
        {session && <PasswordSection />}

        <Section icon={MapIcon} title="Map and display" subtitle="Saved in this browser only">
          <div className="space-y-4">
            <div>
              <span className="label">Default background map</span>
              <Seg value={prefs.basemap} onChange={set('basemap')} options={Object.entries(BASEMAPS).map(([k, b]) => [k, b.label])} />
            </div>
            <div>
              <span className="label">Colour facilities by</span>
              <Seg value={prefs.colourBy} onChange={set('colourBy')} options={[['spi', 'Preparedness (SPI)'], ['risk', 'Risk priority']]} />
            </div>
          </div>
          <div className="mt-3 divide-y divide-gray-100">
            <Toggle label="Show flood hazard zones" checked={prefs.showFlood} onChange={set('showFlood')} />
            <Toggle label="Size markers by people served" checked={prefs.sizeByPeople} onChange={set('sizeByPeople')} />
            <Toggle label="Open the facilities list" hint="Show the list panel next to the map when SafeCom opens" checked={prefs.showList} onChange={set('showList')} />
            <Toggle label="Collapse the side menu" hint="Show icons only" checked={prefs.sidebarCollapsed} onChange={set('sidebarCollapsed')} />
            <Toggle label="Live updates" hint="Refresh the map every 30 seconds" checked={prefs.autoRefresh} onChange={set('autoRefresh')} />
          </div>
        </Section>

        {session && (
          <div className="flex justify-end">
            <button type="button" onClick={signOut} className="btn-danger"><LogOut size={15} />Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}
