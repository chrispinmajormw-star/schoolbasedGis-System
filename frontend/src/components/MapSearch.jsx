import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { typeOf } from '../lib/facilityTypes.js';
import { ClassPill } from './ui.jsx';

const MAX = 8;

// Quick "find a facility" box for the map. Opens from a search icon (or the "/" key),
// filters as you type, and flies the map to the chosen facility.
export default function MapSearch({ facilities, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const all = useMemo(() => facilities?.features.map((f) => f.properties) || [], [facilities]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const scored = [];
    for (const p of all) {
      const name = p.name.toLowerCase();
      const hay = `${name} ${p.district || ''} ${p.code || ''} ${typeOf(p.facility_type).label} ${p.subtype || ''}`.toLowerCase();
      if (!needle.split(/\s+/).every((w) => hay.includes(w))) continue;
      // Names that start with the query come first, then names containing it, then other matches
      scored.push([name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2, p]);
    }
    return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, p]) => p);
  }, [all, q]);
  const shown = results.slice(0, MAX);

  useEffect(() => setActive(0), [q]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // "/" opens the search; clicking elsewhere closes it
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !open && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) { e.preventDefault(); setOpen(true); }
    };
    const onDown = (e) => { if (open && boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const close = () => { setOpen(false); setQ(''); };
  const pick = (p) => { onPick(p.id); close(); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
  };

  return (
    <div ref={boxRef}>
      <button type="button" onClick={() => (open ? close() : setOpen(true))} title="Search facilities (press /)" aria-label="Search facilities"
        className={`flex h-[38px] w-[38px] items-center justify-center rounded-xl border bg-white text-gray-700 shadow-card transition hover:bg-gray-50 ${open ? 'border-gray-900' : 'border-gray-200'}`}>
        {open ? <X size={17} /> : <Search size={17} />}
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-10 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="relative border-b border-gray-100">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Find a facility on the map…" aria-label="Find a facility"
              className="w-full bg-transparent py-3 pl-10 pr-3 text-[13px] outline-none placeholder:text-gray-400" />
          </div>

          {q.trim() === '' ? (
            <p className="px-4 py-3 text-[11px] text-gray-400">Type a name, district, code or type — e.g. “Zomba”, “hospital”.</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-4 text-center text-[12px] text-gray-400">No facility matches “{q.trim()}”.</p>
          ) : (
            <ul className="scroll-thin max-h-[min(20rem,40vh)] overflow-y-auto py-1" role="listbox">
              {shown.map((p, i) => {
                const T = typeOf(p.facility_type);
                return (
                  <li key={p.id} role="option" aria-selected={i === active}>
                    <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(p)}
                      className={`flex w-full items-center gap-3 px-3.5 py-2 text-left ${i === active ? 'bg-gray-50' : ''}`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700"><T.icon size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{p.name}</span>
                        <span className="flex items-center gap-1 truncate text-[11px] text-gray-400"><MapPin size={10} />{p.district} · {T.label}</span>
                      </span>
                      <ClassPill cls={p.spi_class} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {results.length > MAX && (
            <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">Showing {MAX} of {results.length} — keep typing to narrow down.</p>
          )}
        </div>
      )}
    </div>
  );
}
