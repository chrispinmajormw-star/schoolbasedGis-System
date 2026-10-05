import { useCallback, useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2, RefreshCw, Copy, Check } from 'lucide-react';
import { api, fmtDate } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { Modal, Field, ErrorNote, Avatar } from '../ui.jsx';

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

function CreatedNotice({ email, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Sign in at ${window.location.origin}\nEmail: ${email}\nPassword: ${password}\nPlease change it after first sign-in (Forgot password).`;
  return (
    <Modal title="Account ready" subtitle="Share these details with the school. The password is not shown again." onClose={onClose}
      footer={<button type="button" onClick={onClose} className="btn-dark">Done</button>}>
      <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 font-mono text-xs">{text}</pre>
      <button type="button" className="btn-ghost mt-3" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>
        {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy details'}
      </button>
    </Modal>
  );
}

function NewUser({ schools, onClose, onCreated }) {
  const [f, setF] = useState({ full_name: '', email: '', password: genPassword(), role: 'school', school_id: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const list = (schools?.features || []).map((x) => x.properties).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal title="Add user" subtitle="Create a sign-in for a school focal person or another administrator" onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="user-form" disabled={busy} className="btn-dark"><Plus size={15} />{busy ? 'Creating…' : 'Create account'}</button>
        </>
      )}>
      <form id="user-form" className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try {
          await api.createUser({ ...f, school_id: f.role === 'school' ? Number(f.school_id) : null });
          onCreated({ email: f.email.trim().toLowerCase(), password: f.password });
        } catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>
        <div className="seg">
          {[['school', 'School user'], ['admin', 'Administrator']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setF((x) => ({ ...x, role: k }))} className={`seg-btn ${f.role === k ? 'seg-btn-on' : ''}`}>{label}</button>
          ))}
        </div>
        {f.role === 'school' && (
          <Field label="School" hint="This person can update only this school.">
            <select required value={f.school_id} onChange={set('school_id')} className="input">
              <option value="">Choose a school…</option>
              {list.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
            </select>
          </Field>
        )}
        <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} className="input" placeholder="e.g. Head teacher name" /></Field>
        <Field label="Email"><input type="email" required value={f.email} onChange={set('email')} className="input" /></Field>
        <Field label="Temporary password" hint="At least 8 characters.">
          <div className="flex gap-2">
            <input required minLength={8} value={f.password} onChange={set('password')} className="input font-mono" />
            <button type="button" onClick={() => setF((x) => ({ ...x, password: genPassword() }))} className="icon-btn h-auto w-10 shrink-0" title="Generate"><RefreshCw size={15} /></button>
          </div>
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Modal>
  );
}

export default function AdminUsers({ schools }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);

  const load = useCallback(async () => {
    try { setUsers(await api.users()); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = async (u) => {
    const pw = genPassword();
    if (!window.confirm(`Set a new temporary password for ${u.email}?`)) return;
    try { await api.setPassword(u.id, pw); setCreated({ email: u.email, password: pw }); } catch (e) { window.alert(e.message); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Delete the account ${u.email}? They will no longer be able to sign in.`)) return;
    try { await api.deleteUser(u.id); load(); } catch (e) { window.alert(e.message); }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">User accounts</h1>
          <p className="text-xs text-gray-500">Administrators manage everything. School users update only their own school.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="btn-dark"><Plus size={16} />Add user</button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-gray-100 text-xs text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!users && !error && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name || u.email} className="h-8 w-8 text-[11px]" />
                    <div className="min-w-0"><div className="truncate font-medium">{u.full_name || '—'}</div><div className="truncate text-[11px] text-gray-400">{u.email}</div></div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${u.role === 'admin' ? 'bg-ink text-white' : 'bg-accent-soft text-ink'}`}>
                    {u.role === 'admin' ? 'Administrator' : 'School'}
                  </span>
                </td>
                <td className="px-4 py-3">{u.school_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => reset(u)} className="btn-ghost px-2.5 py-1.5" title="Reset password"><KeyRound size={14} /></button>
                    {u.id !== profile?.id && <button type="button" onClick={() => remove(u)} className="btn-danger px-2.5 py-1.5" title="Delete"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && <NewUser schools={schools} onClose={() => setAdding(false)} onCreated={(c) => { setAdding(false); setCreated(c); load(); }} />}
      {created && <CreatedNotice {...created} onClose={() => setCreated(null)} />}
    </div>
  );
}
