import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { Modal, ErrorNote } from './ui.jsx';

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
