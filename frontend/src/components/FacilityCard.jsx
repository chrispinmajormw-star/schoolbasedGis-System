import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, Copy, Check, X, Pencil, ClipboardCheck, CircleCheck, CircleX, Link2, Printer, FlaskConical } from 'lucide-react';
import SpiTrend from './SpiTrend.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { api, CLASS_STYLE, FLOOD_STYLE, fmtDate, fmtKm } from '../lib/api.js';
import { DEPTH } from '../lib/decision.js';
import { useAuth } from '../lib/auth.jsx';
import { ClassPill } from './ui.jsx';
import { typeOf } from '../lib/facilityTypes.js';

export default function FacilityCard({ facility: p, checklist, onClose, onEdit, onAssess, refreshKey, history, onWhatIf }) {
  const T = typeOf(p.facility_type);
  const { canEdit } = useAuth();
  const { toast } = useFeedback();
  const [tab, setTab] = useState('info');
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  const [copied, setCopied] = useState(false);
  const [assessment, setAssessment] = useState(undefined);

  useEffect(() => {
    let alive = true;
    setAssessment(undefined);
    api.lastAssessment(p.id).then((a) => alive && setAssessment(a)).catch(() => alive && setAssessment(null));
    return () => { alive = false; };
  }, [p.id, refreshKey]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(p.code || String(p.id)); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ }
  };
  const editable = canEdit(p.id);
  const cls = CLASS_STYLE[p.spi_class];

  return (
    <div className="pointer-events-auto w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card sm:w-[330px]">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-ink text-white" title={T.label}><T.icon size={13} /></span>
        <span className="min-w-0 truncate text-xs"><span className="text-gray-400">{T.label} · </span><span className="font-semibold">{p.code || `#${p.id}`}</span></span>
        <button type="button" onClick={copy} className="text-gray-400 hover:text-gray-700" aria-label="Copy EMIS code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title="Copy link to this facility" aria-label="Copy link to this facility"
            onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/#facility=${p.id}`); toast('Link copied'); } catch { /* ignore */ } }}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"><Link2 size={16} /></button>
          <button type="button" title="Print facility profile" aria-label="Print facility profile" onClick={() => window.print()}
            className="hidden rounded-lg p-1 text-gray-500 hover:bg-gray-100 sm:block"><Printer size={16} /></button>
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={16} /></button>
        </div>
      </div>

      <div className="px-4 pb-3 pt-1">
        <div className="text-[15px] font-semibold leading-snug">{p.name}</div>
        <div className="mt-1.5"><ClassPill cls={p.spi_class} spi={p.spi} /></div>
      </div>

      {open && (
        <>
          <div className="px-4">
            <div className="seg">
              {[['info', 'Facility info'], ['prep', 'Preparedness']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`seg-btn ${tab === k ? 'seg-btn-on' : ''}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="scroll-thin max-h-[30vh] overflow-y-auto px-4 pb-2 pt-2 sm:max-h-[42vh]">
            {tab === 'info' ? (
              <>
                {p.photo_url && <img src={p.photo_url} alt={`${p.name}`} className="mb-2 h-32 w-full rounded-xl object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <dl className="divide-y divide-gray-100">
                  <div className="kv"><dt>District</dt><dd>{p.district}</dd></div>
                  {p.ta && <div className="kv"><dt>Traditional Authority</dt><dd>{p.ta}</dd></div>}
                  <div className="kv"><dt>Category</dt><dd>{p.subtype || '—'}</dd></div>
                  <div className="kv"><dt>{T.people}</dt><dd>{p.people_served.toLocaleString()}</dd></div>
                  <div className="kv"><dt>{T.staff}</dt><dd>{p.staff}</dd></div>
                  {p.shelter_capacity > 0 && <div className="kv"><dt>Can shelter</dt><dd>{p.shelter_capacity.toLocaleString()} people</dd></div>}
                  <div className="kv"><dt>Contact</dt><dd>{p.contact_name || '—'}</dd></div>
                  <div className="kv"><dt>Phone</dt><dd>{p.contact_phone ? <a className="text-sky-600" href={`tel:${p.contact_phone}`}>{p.contact_phone}</a> : '—'}</dd></div>
                  <div className="kv"><dt>Flood hazard</dt><dd>{p.flood_level ? FLOOD_STYLE[p.flood_level].label : 'Outside mapped zones'}</dd></div>
                  <div className="kv"><dt>Flood history</dt><dd className={history ? 'text-orange-700' : ''}>{history
                    ? `${history.count} flood${history.count === 1 ? '' : 's'} recorded · last ${fmtDate(history.last)}${history.maxDepth ? ` · up to ${DEPTH[history.maxDepth].short.toLowerCase()}` : ''}`
                    : 'None recorded'}</dd></div>
                  <div className="kv"><dt>To nearest road</dt><dd>{fmtKm(p.dist_to_road_m)}</dd></div>
                  <div className="kv"><dt>To health facility</dt><dd>{fmtKm(p.dist_to_health_m)}</dd></div>
                  <div className="kv"><dt>Risk priority</dt><dd>{p.rps ?? '—'}</dd></div>
                  <div className="kv"><dt>Info updated</dt><dd>{fmtDate(p.updated_at)}</dd></div>
                </dl>
                {p.notes && <p className="mt-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">{p.notes}</p>}
              </>
            ) : (
              <>
                <div className="mb-2 flex items-end justify-between rounded-xl p-3" style={{ background: cls.bg }}>
                  <div>
                    <div className="text-[11px] font-medium" style={{ color: cls.text }}>Safety Preparedness Index</div>
                    <div className="text-2xl font-bold" style={{ color: cls.text }}>{p.spi === null ? '—' : `${p.spi}%`}</div>
                  </div>
                  <div className="text-right text-[11px]" style={{ color: cls.text }}>Assessed<br /><b>{fmtDate(p.assessed_on)}</b></div>
                </div>
                <div className="mb-3"><SpiTrend facilityId={p.id} refreshKey={refreshKey} /></div>
                {p.spi !== null && p.spi < 100 && onWhatIf && (
                  <button type="button" onClick={onWhatIf} className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-left text-xs hover:border-gray-400 hover:bg-gray-50">
                    <FlaskConical size={15} className="shrink-0" />
                    <span className="flex-1"><b>What if…</b> <span className="text-gray-500">See how fixing gaps changes SPI, risk and cost</span></span>
                  </button>
                )}
                {assessment === undefined && <p className="py-4 text-center text-gray-400">Loading…</p>}
                {assessment === null && <p className="py-4 text-center text-gray-400">No assessment recorded yet.</p>}
                {assessment && (
                  <ul className="divide-y divide-gray-100">
                    {checklist.map((w) => {
                      const v = assessment.answers?.[w.indicator];
                      return (
                        <li key={w.indicator} className="flex items-center justify-between py-1.5">
                          <span className="text-gray-600">{w.label}</span>
                          {w.kind === 'percent'
                            ? <span className="font-semibold">{Number(v)}%</span>
                            : v ? <CircleCheck size={16} className="text-green-600" aria-label="Yes" /> : <CircleX size={16} className="text-red-500" aria-label="No" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {assessment?.assessor && <p className="mt-2 text-[11px] text-gray-400">Assessor: {assessment.assessor}</p>}
              </>
            )}
          </div>

          {editable && (
            <div className="flex gap-2 border-t border-gray-100 p-3">
              <button type="button" onClick={onEdit} className="btn-ghost flex-1"><Pencil size={14} />Edit info</button>
              <button type="button" onClick={onAssess} className="btn-accent flex-1"><ClipboardCheck size={14} />Assessment</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
