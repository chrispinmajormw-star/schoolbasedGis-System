import { FACILITY_TYPES, TYPE_KEYS, DISTRICTS, typeOf } from '../lib/facilityTypes.js';

/** Grid of facility types with icons. */
export function TypePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {TYPE_KEYS.map((k) => {
        const T = FACILITY_TYPES[k];
        const on = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={on}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
              on ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
            <T.icon size={16} className={on ? 'text-accent' : 'text-gray-500'} />{T.label}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text category with suggestions for the chosen type. */
export function SubtypeInput({ type, value, onChange, id = 'subtypes' }) {
  return (
    <>
      <input list={`${id}-${type}`} value={value} onChange={onChange} className="input" placeholder={typeOf(type).subtypes[0]} />
      <datalist id={`${id}-${type}`}>{typeOf(type).subtypes.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

export function DistrictInput({ value, onChange, required = true }) {
  return (
    <>
      <input required={required} list="districts" value={value} onChange={onChange} className="input" placeholder="District" />
      <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
    </>
  );
}
