import { useMemo, useState } from 'react';
import { ListChecks, Plus, Pencil, Trash2, CalendarClock, CircleDot, CircleCheck, Loader, Wallet, LogIn, Download, MapPin, Search } from 'lucide-react';
import { api, fmtDate } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { typeOf } from '../lib/facilityTypes.js';
import { gapsFor, fmtMwk, downloadCsv } from '../lib/decision.js';
import { Modal, Field, ErrorNote, PageHeader, Seg, Stat, Empty } from './ui.jsx';

export const STATUS = {
  open: { label: 'To do', icon: CircleDot, cls: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In progress', icon: Loader, cls: 'bg-sky-50 text-sky-800' },
  done: { label: 'Done', icon: CircleCheck, cls: 'bg-green-50 text-green-800' },
};
const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (a) => a.status !== 'done' && a.due_date && a.due_date < today();

function ActionEditor({ action, facilities, checklists, answers, onClose, onSaved }) {
  const { profile, isAdmin } = useAuth();
  const { toast } = useFeedback();
  const creating = !action?.id;
  const [f, setF] = useState(() => ({
    facility_id: action?.facility_id || (!isAdmin ? profile?.facility_id : '') || '',
    indicator: action?.indicator || '', title: action?.title || '', owner: action?.owner || '',
    due_date: action?.due_date || '', status: action?.status || 'open', cost_mwk: action?.cost_mwk ?? '', notes: action?.notes || '',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const fac = (facilities?.features || []).find((x) => x.properties.id === Number(f.facility_id))?.properties;
  const gaps = useMemo(() => (fac ? gapsFor(checklists?.[fac.facility_type], answers?.[fac.id]) : []), [fac, checklists, answers]);
  const options = useMemo(() => (facilities?.features || []).map((x) => x.properties).sort((a, b) => a.name.localeCompare(b.name)), [facilities]);

  const pickGap = (ind) => {
    const g = gaps.find((x) => x.indicator === ind);
    setF((x) => ({ ...x, indicator: ind, title: g ? g.action : x.title, cost_mwk: g?.cost ?? x.cost_mwk }));
  };

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    const body = { ...f, facility_id: Number(f.facility_id), indicator: f.indicator || null };
    try {
      if (creating) await api.createActions([body]); else await api.updateAction(action.id, body);
      toast(creating ? 'Action added' : 'Action saved');
      onSaved(); onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={creating ? 'New action' : 'Edit action'} subtitle="Who does what, by when, to close a preparedness gap." onClose={onClose}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="action-form" className="btn-dark" disabled={saving}>{saving ? 'Saving…' : 'Save action'}</button></>}>
      <form id="action-form" onSubmit={submit} className="space-y-3">
        <Field label="Facility">
          {isAdmin && creating ? (
            <select required className="input" value={f.facility_id} onChange={(e) => setF((x) => ({ ...x, facility_id: e.target.value, indicator: '' }))}>
              <option value="">Choose a facility…</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.district}</option>)}
            </select>
          ) : <div className="input bg-gray-50">{fac?.name || action?.facility_name || '—'}</div>}
        </Field>
        {gaps.length > 0 && (
          <Field label="Gap it closes (optional)" hint="Picking a gap fills in the recommended action and cost">
            <select className="input" value={f.indicator} onChange={(e) => pickGap(e.target.value)}>
              <option value="">— Not linked to a checklist item —</option>
              {gaps.map((g) => <option key={g.indicator} value={g.indicator}>{g.label} (+{g.gain} SPI pts)</option>)}
            </select>
          </Field>
        )}
        <Field label="Action"><textarea required rows={2} maxLength={300} className="input" value={f.title} onChange={set('title')} placeholder="e.g. Train 10 teachers in first aid" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsible"><input className="input" value={f.owner} onChange={set('owner')} placeholder="Person or organisation" /></Field>
          <Field label="Due date"><input type="date" className="input" value={f.due_date} onChange={set('due_date')} /></Field>
          <Field label="Status">
            <select className="input" value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
          </Field>
          <Field label="Cost (MWK)"><input type="number" min="0" className="input" value={f.cost_mwk} onChange={set('cost_mwk')} /></Field>
        </div>
        <Field label="Notes"><textarea rows={2} maxLength={2000} className="input" value={f.notes} onChange={set('notes')} /></Field>
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Modal>
  );
}

export default function Actions({ actions, facilities, checklists, answers, onChanged, onPick, onAssess, onSignIn }) {
  const { session, profile, isAdmin, canEdit } = useAuth();
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState('active');
  const [district, setDistrict] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const active = profile?.status === 'active';

  const rows = useMemo(() => (actions || []).filter((a) => {
    if (filter === 'active' && a.status === 'done') return false;
    if (filter === 'overdue' && !isOverdue(a)) return false;
    if (filter === 'done' && a.status !== 'done') return false;
    if (district !== 'all' && a.district !== district) return false;
    return !q.trim() || `${a.title} ${a.facility_name} ${a.owner || ''}`.toLowerCase().includes(q.trim().toLowerCase());
  }), [actions, filter, district, q]);
  const districts = [...new Set((actions || []).map((a) => a.district))].sort();
  const k = useMemo(() => {
    const list = actions || [];
    const quarter = Date.now() - 90 * 864e5;
    return {
      open: list.filter((a) => a.status !== 'done').length,
      progress: list.filter((a) => a.status === 'in_progress').length,
      overdue: list.filter(isOverdue).length,
      done: list.filter((a) => a.status === 'done' && a.completed_at && new Date(a.completed_at) >= quarter).length,
      committed: list.filter((a) => a.status !== 'done').reduce((s, a) => s + (a.cost_mwk || 0), 0),
      spent: list.filter((a) => a.status === 'done').reduce((s, a) => s + (a.cost_mwk || 0), 0),
    };
  }, [actions]);

  async function setStatus(a, status) {
    try {
      await api.updateAction(a.id, { status });
      onChanged();
      if (status === 'done') toast(a.indicator ? 'Done! Update the facility assessment so its SPI reflects this.' : 'Marked as done');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function remove(a) {
    if (!await confirm({ title: 'Delete this action?', message: a.title, confirmLabel: 'Delete', danger: true })) return;
    try { await api.deleteAction(a.id); onChanged(); toast('Action deleted'); } catch (e) { toast(e.message, 'error'); }
  }
  const exportCsv = () => downloadCsv('safecom_actions.csv', rows.map((a) => ({
    facility: a.facility_name, district: a.district, action: a.title, responsible: a.owner || '', due: a.due_date || '',
    status: STATUS[a.status].label, overdue: isOverdue(a) ? 'yes' : '', cost_mwk: a.cost_mwk ?? '', completed: a.completed_at ? a.completed_at.slice(0, 10) : '',
  })));

  if (!session || !active) {
    return (
      <div className="h-full p-6">
        <PageHeader title="Action tracker" subtitle="Turn preparedness gaps into tasks with an owner and a due date, and follow them to completion." />
        <div className="card"><Empty icon={ListChecks} title={session ? 'Your account is not active yet' : 'Sign in to see and plan actions'}>
          {session ? 'An administrator needs to activate your account.' : 'Facility managers track their own facility; administrators see every district.'}
          {!session && <button type="button" className="btn-dark mx-auto mt-4" onClick={onSignIn}><LogIn size={15} />Sign in</button>}
        </Empty></div>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <PageHeader title="Action tracker" subtitle={isAdmin ? 'Every planned improvement across all facilities.' : `Planned improvements for ${profile.facility_name}.`}>
        <button type="button" className="icon-btn" title="Download CSV" onClick={exportCsv} disabled={!rows.length}><Download size={15} /></button>
        <button type="button" className="btn-dark" onClick={() => setEditing({})}><Plus size={15} />New action</button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ListChecks} label="Open" value={k.open} sub={`${k.progress} in progress`} />
        <Stat icon={CalendarClock} label="Overdue" value={k.overdue} sub="past their due date" tone={k.overdue ? 'red' : undefined} />
        <Stat icon={CircleCheck} label="Done (90 days)" value={k.done} sub={`${fmtMwk(k.spent)} completed in total`} tone="green" />
        <Stat icon={Wallet} label="Committed" value={fmtMwk(k.committed)} sub="cost of open actions" />
      </div>

      <div className="my-4 flex flex-wrap items-center gap-2">
        <Seg value={filter} onChange={setFilter} options={[['active', 'Open'], ['overdue', `Overdue${k.overdue ? ` (${k.overdue})` : ''}`], ['done', 'Done'], ['all', 'All']]} />
        {isAdmin && districts.length > 1 && (
          <select className="input w-auto py-1.5" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
            <option value="all">All districts</option>{districts.map((d) => <option key={d}>{d}</option>)}
          </select>
        )}
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input py-1.5 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions" />
        </div>
      </div>

      {!actions && <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />}
      {actions && rows.length === 0 && (
        <div className="card"><Empty icon={ListChecks} title={actions.length ? 'No actions match' : 'No actions yet'}>
          {actions.length ? 'Try another filter.' : 'Use “What if…” on a facility, the budget planner under Priorities, or New action.'}
        </Empty></div>
      )}
      <ul className="space-y-2">
        {rows.map((a) => {
          const T = typeOf(a.facility_type); const S = STATUS[a.status]; const late = isOverdue(a); const mine = canEdit(a.facility_id);
          return (
            <li key={a.id} className={`card p-3.5 ${late ? 'border-red-200' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`font-medium ${a.status === 'done' ? 'text-gray-400 line-through' : ''}`}>{a.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <button type="button" onClick={() => onPick(a.facility_id)} className="inline-flex items-center gap-1 hover:text-gray-900"><T.icon size={12} />{a.facility_name} · {a.district}</button>
                    {a.owner && <span>Responsible: <b className="font-medium text-gray-700">{a.owner}</b></span>}
                    {a.due_date && <span className={late ? 'font-semibold text-red-700' : ''}>{late ? 'Overdue · ' : 'Due '}{fmtDate(a.due_date)}</span>}
                    {a.cost_mwk !== null && <span>{fmtMwk(a.cost_mwk)}</span>}
                    {a.status === 'done' && a.completed_at && <span className="text-green-700">Completed {fmtDate(a.completed_at)}</span>}
                  </div>
                  {a.notes && <p className="mt-1 text-[11px] text-gray-400">{a.notes}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {mine ? (
                    <select value={a.status} onChange={(e) => setStatus(a, e.target.value)} className={`rounded-lg border-0 px-2 py-1 text-[11px] font-semibold ${S.cls}`} aria-label="Status">
                      {Object.entries(STATUS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
                    </select>
                  ) : <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${S.cls}`}>{S.label}</span>}
                  {a.status === 'done' && a.indicator && mine && <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => onAssess(a.facility_id)}>Re-assess</button>}
                  <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Show on map" onClick={() => onPick(a.facility_id)}><MapPin size={14} /></button>
                  {mine && <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Edit" onClick={() => setEditing(a)}><Pencil size={14} /></button>}
                  {mine && <button type="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete" onClick={() => remove(a)}><Trash2 size={14} /></button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <ActionEditor action={editing} facilities={facilities} checklists={checklists} answers={answers} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </div>
  );
}
