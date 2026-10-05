import { useState } from 'react';
import { CLASS_STYLE } from '../lib/api.js';
import { FACILITY_TYPES, TYPE_KEYS } from '../lib/facilityTypes.js';

export default function About({ checklists }) {
  const [type, setType] = useState('school');
  const list = checklists?.[type] || [];
  const total = list.reduce((s, w) => s + w.weight, 0);
  const domains = [...new Set(list.map((w) => w.domain))];

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">About SafeCom</h1>
          <p className="text-xs text-gray-500">Safe Community: Mapping Community Safety &amp; Resilience</p>
        </div>

        <section className="card p-5 text-gray-600">
          <p>SafeCom maps the community facilities people depend on during floods and other hazards (schools, evacuation centres,
            health facilities, markets, places of worship, community halls and water points) and shows how prepared each one is.
            Facility managers keep their own information up to date; administrators verify accounts and data.</p>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Safety Preparedness Index (SPI)</h2>
          <p className="text-gray-600">SPI = 100 × Σ(weight × score) ÷ Σ(weight). Yes/no items score 1 or 0; percentage items score their percentage.
            Every facility type shares a core checklist and adds a few items of its own, so scores stay comparable across types.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['high', 'moderate', 'low'].map((k) => (
              <span key={k} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: CLASS_STYLE[k].bg, color: CLASS_STYLE[k].text }}>
                {CLASS_STYLE[k].label}: {CLASS_STYLE[k].range}
              </span>
            ))}
          </div>

          <div className="scroll-thin -mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {TYPE_KEYS.map((k) => {
              const T = FACILITY_TYPES[k];
              return (
                <button key={k} type="button" onClick={() => setType(k)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium ${type === k ? 'border-ink bg-ink text-white' : 'border-gray-200 text-gray-600'}`}>
                  <T.icon size={13} />{T.plural}
                </button>
              );
            })}
          </div>

          {domains.map((d) => (
            <div key={d} className="mt-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{d}</div>
              <table className="w-full text-left">
                <tbody className="divide-y divide-gray-100">
                  {list.filter((w) => w.domain === d).map((w) => (
                    <tr key={w.indicator}>
                      <td className="py-2">{w.label}</td>
                      <td className="w-28 py-2 text-right">{w.weight} <span className="text-gray-400">({total ? Math.round((100 * w.weight) / total) : 0}%)</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Risk Priority Score (RPS)</h2>
          <p className="text-gray-600">RPS combines flood hazard level (0–3), the preparedness gap (100 − SPI), the number of people the facility serves
            and its distance to the nearest road. Higher means the facility should be supported first.</p>
        </section>
      </div>
    </div>
  );
}
