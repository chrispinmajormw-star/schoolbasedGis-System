import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, KeyRound, Trash2, RefreshCw, Copy, Check, UserCheck, UserX, Ban, MapPin, Phone, Mail, Clock } from 'lucide-react';
import { api, fmtDate, timeAgo } from '../../lib/api.js';
import { typeOf } from '../../lib/facilityTypes.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFeedback } from '../../lib/feedback.jsx';
import { Modal, Field, ErrorNote, Avatar } from '../ui.jsx';

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

function FacilitySelect({ facilities, value, onChange, required, placeholder = 'Choose a facility…' }) {
  const list = useMemo(() => (facilities?.features || []).map((x) => x.properties).sort((a, b) => a.name.localeCompare(b.name)), [facilities]);
  return (
    <select required={required} value={value} onChange={onChange} className="input">
      <option value="">{placeholder}</option>
      {list.map((s) => <option key={s.id} value={s.id}>{s.name} · {typeOf(s.facility_type).label} ({s.district})</option>)}
    </select>
  );
}

function CreatedNotice({ email, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Sign in to SafeCom at ${window.location.origin}\nEmail: ${email}\nPassword: ${password}\nPlease change it after first sign-in (Forgot password).`;
  return (
    <Modal title="Account ready" subtitle="Share these details with the person. The password is not shown again." onClose={onClose}
      footer={<button type="button" onClick={onClose} className="btn-dark">Done</button>}>
      <pre className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 font-mono text-xs">{text}</pre>
      <button type="button" className="btn-ghost mt-3" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>
        {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy details'}
      </button>
    </Modal>
  );
}

function NewUser({ facilities, onClose, onCreated }) {
  const [f, setF] = useState({ full_name: '', email: '', phone: '', password: genPassword(), role: 'manager', facility_id: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal title="Add user" subtitle="Create an active account for a facility manager or another administrator" onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" form="user-form" disabled={busy} className="btn-dark"><Plus size={15} />{busy ? 'Creating…' : 'Create account'}</button>
        </>
      )}>
      <form id="user-form" className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try {
          await api.createUser({ ...f, facility_id: f.role === 'manager' ? Number(f.facility_id) : null });
          onCreated({ email: f.email.trim().toLowerCase(), password: f.password });
        } catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>
        <div className="seg">
          {[['manager', 'Facility manager'], ['admin', 'Administrator']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setF((x) => ({ ...x, role: k }))} className={`seg-btn ${f.role === k ? 'seg-btn-on' : ''}`}>{label}</button>
          ))}
        </div>
        {f.role === 'manager' && (
          <Field label="Facility" hint="This person can update only this facility.">
            <FacilitySelect facilities={facilities} value={f.facility_id} onChange={set('facility_id')} required />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input value={f.full_name} onChange={set('full_name')} className="input" /></Field>
          <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} className="input" /></Field>
        </div>
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

function RequestCard({ u, facilities, onDone }) {
  const { toast, confirm } = useFeedback();
  const [reassign, setReassign] = useState('');
  const [busy, setBusy] = useState(false);
  const T = typeOf(u.facility_type);
  const proposed = u.facility_status === 'pending';

  const approve = async () => {
    setBusy(true);
    try {
      await api.approveUser(u.id, reassign ? Number(reassign) : undefined);
      toast(`${u.full_name || u.email} activated${proposed && !reassign ? ' and the facility published' : ''}`);
      onDone();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const reject = async () => {
    const ok = await confirm({ title: 'Reject this request?', message: `${u.email}'s account${proposed ? ' and the proposed facility' : ''} will be deleted.`, confirmLabel: 'Reject', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await api.deleteUser(u.id); toast('Request rejected'); onDone(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <Avatar name={u.full_name || u.email} className="h-10 w-10 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{u.full_name || '—'}</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><Clock size={11} />Waiting {timeAgo(u.created_at)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Mail size={12} />{u.email}</span>
            {u.phone && <a href={`tel:${u.phone}`} className="inline-flex items-center gap-1 text-sky-700"><Phone size={12} />{u.phone}</a>}
            {u.organisation && <span>{u.organisation}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-xl bg-gray-50 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-white"><T.icon size={15} /></span>
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-medium text-gray-900">{u.facility_name}</div>
          <div className="text-gray-500">{T.label} · {u.facility_district}
            {proposed && <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">NEW FACILITY</span>}</div>
        </div>
        {proposed && u.facility_lat && (
          <a className="btn-ghost px-2.5 py-1 text-xs" target="_blank" rel="noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${u.facility_lat}&mlon=${u.facility_lon}#map=16/${u.facility_lat}/${u.facility_lon}`}>
            <MapPin size={13} />Check location
          </a>
        )}
      </div>
      {u.request_note && <p className="mt-2 rounded-xl border border-gray-100 px-3 py-2 text-xs text-gray-600">“{u.request_note}”</p>}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1">
          <span className="label">{proposed ? 'Or link to an existing facility instead' : 'Change facility (optional)'}</span>
          <FacilitySelect facilities={facilities} value={reassign} onChange={(e) => setReassign(e.target.value)} placeholder={proposed ? 'Keep the proposed facility' : 'Keep requested facility'} />
        </label>
        <button type="button" disabled={busy} onClick={reject} className="btn-danger"><UserX size={15} />Reject</button>
        <button type="button" disabled={busy} onClick={approve} className="btn-dark"><UserCheck size={15} />Activate</button>
      </div>
    </div>
  );
}

const STATUS = {
  active: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-800',
  disabled: 'bg-gray-100 text-gray-500',
};

export default function AdminUsers({ facilities, onChanged }) {
  const { profile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);

  const load = useCallback(async () => {
    try { setUsers(await api.users()); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); onChanged?.(); };

  const pending = (users || []).filter((u) => u.status === 'pending');
  const others = (users || []).filter((u) => u.status !== 'pending');

  const reset = async (u) => {
    const pw = genPassword();
    if (!await confirm({ title: 'Reset password?', message: `${u.email} will need the new temporary password to sign in.`, confirmLabel: 'Reset password' })) return;
    try { await api.setPassword(u.id, pw); setCreated({ email: u.email, password: pw }); } catch (e) { toast(e.message, 'error'); }
  };
  const toggle = async (u) => {
    const disable = u.status === 'active';
    if (disable && !await confirm({ title: 'Disable this account?', message: `${u.email} will not be able to make changes until you enable it again.`, confirmLabel: 'Disable', danger: true })) return;
    try { await api.updateUser(u.id, { status: disable ? 'disabled' : 'active' }); toast(disable ? 'Account disabled' : 'Account enabled'); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (u) => {
    if (!await confirm({ title: 'Delete this account?', message: `${u.email} will no longer be able to sign in. This cannot be undone.`, confirmLabel: 'Delete account', danger: true })) return;
    try { await api.deleteUser(u.id); toast('Account deleted'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">User accounts</h1>
          <p className="text-xs text-gray-500">Anyone can request an account. Facility managers can edit only after you activate them.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="btn-dark"><Plus size={16} />Add user</button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">Requests waiting for activation
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{pending.length}</span></h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {pending.map((u) => <RequestCard key={u.id} u={u} facilities={facilities} onDone={refresh} />)}
          </div>
        </section>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="border-b border-gray-100 text-xs text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Facility</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!users && !error && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
            {others.map((u) => {
              const T = u.facility_type ? typeOf(u.facility_type) : null;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name || u.email} className="h-8 w-8 text-[11px]" />
                      <div className="min-w-0"><div className="truncate font-medium">{u.full_name || '—'}</div><div className="truncate text-[11px] text-gray-400">{u.email}</div></div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${u.role === 'admin' ? 'bg-ink text-white' : 'bg-accent-soft text-ink'}`}>
                      {u.role === 'admin' ? 'Administrator' : 'Manager'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{T ? <span className="inline-flex items-center gap-1.5"><T.icon size={13} className="text-gray-400" />{u.facility_name}</span> : '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS[u.status]}`}>{u.status}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => reset(u)} className="btn-ghost px-2.5 py-1.5" title="Reset password"><KeyRound size={14} /></button>
                      {u.id !== profile?.id && (
                        <>
                          <button type="button" onClick={() => toggle(u)} className="btn-ghost px-2.5 py-1.5" title={u.status === 'active' ? 'Disable' : 'Enable'}>
                            {u.status === 'active' ? <Ban size={14} /> : <UserCheck size={14} />}
                          </button>
                          <button type="button" onClick={() => remove(u)} className="btn-danger px-2.5 py-1.5" title="Delete"><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && <NewUser facilities={facilities} onClose={() => setAdding(false)} onCreated={(c) => { setAdding(false); setCreated(c); toast('Account created'); load(); }} />}
      {created && <CreatedNotice {...created} onClose={() => setCreated(null)} />}
    </div>
  );
}
