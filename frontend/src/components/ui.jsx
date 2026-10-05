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
