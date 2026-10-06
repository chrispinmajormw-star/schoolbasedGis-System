import { useEffect } from 'react';
import { X } from 'lucide-react';
import { CLASS_STYLE, FLOOD_STYLE } from '../lib/api.js';

export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn h-8 w-8 shrink-0" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ClassPill({ cls, spi }) {
  const s = CLASS_STYLE[cls] || CLASS_STYLE.unassessed;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.text }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}{spi !== null && spi !== undefined ? ` · ${Math.round(spi)}%` : ''}
    </span>
  );
}

export function FloodPill({ level }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: FLOOD_STYLE[level].color }} />
      Flood {FLOOD_STYLE[level].label.toLowerCase()}
    </span>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{children}</p>;
}

export function Avatar({ name, className = '' }) {
  const initials = (name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-ink ${className}`}>{initials}</span>
  );
}

export function Stat({ icon: Icon, label, value, sub, tone }) {
  const tones = { red: 'bg-red-50 text-red-700', green: 'bg-green-50 text-green-700', default: 'bg-accent-soft text-ink' };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {Icon && <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tones[tone] || tones.default}`}><Icon size={14} /></span>}
        {label}
      </div>
      <div className={`mt-3 text-2xl font-semibold tracking-tight ${tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="max-w-2xl text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Seg({ value, onChange, options, className = '' }) {
  return (
    <div className={`seg ${className}`}>
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`seg-btn whitespace-nowrap ${value === k ? 'seg-btn-on' : ''}`}>{label}</button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400"><Icon size={22} /></span>}
      <p className="font-medium text-gray-700">{title}</p>
      {children && <div className="mt-1 max-w-sm text-xs text-gray-500">{children}</div>}
    </div>
  );
}
