import { useState } from 'react';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Modal, ErrorNote } from './ui.jsx';

export default function Login({ onClose }) {
  const { signIn, sendReset, enabled } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try { await signIn(email.trim(), password); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function forgot() {
    if (!email.trim()) { setError('Type your email first, then tap "Forgot password".'); return; }
    setBusy(true); setError('');
    try { await sendReset(email.trim()); setInfo('If that account exists, a reset link has been sent to the email.'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title="Sign in" subtitle="School focal persons and administrators" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-accent-soft p-3 text-xs text-gray-700">
          <ShieldCheck size={18} className="shrink-0 text-accent-dark" />
          Accounts are created by the administrator. Ask them if you need access for your school.
        </div>
        {!enabled && <ErrorNote>Sign-in is not configured for this site yet.</ErrorNote>}
        <label className="block"><span className="label">Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></label>
        <label className="block"><span className="label">Password</span>
          <span className="relative block">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} className="input pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <ErrorNote>{error}</ErrorNote>
        {info && <p className="rounded-xl bg-green-50 px-3 py-2 text-green-700">{info}</p>}
        <button type="submit" disabled={busy || !enabled} className="btn-dark w-full py-2.5"><LogIn size={16} />{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" onClick={forgot} disabled={busy || !enabled} className="w-full text-center text-xs text-gray-500 hover:text-gray-900">Forgot password?</button>
      </form>
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
