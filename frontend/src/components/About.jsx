import { CLASS_STYLE } from '../lib/api.js';

export default function About({ weights }) {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold">How the scores work</h1>
          <p className="text-xs text-gray-500">School Preparedness Index (SPI) and Risk Priority Score (RPS)</p>
        </div>
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">School Preparedness Index</h2>
          <p className="text-gray-600">SPI = 100 × Σ(weight × score) ÷ Σ(weight). Yes/no indicators score 1 or 0; “teachers trained” scores its percentage.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['high', 'moderate', 'low'].map((k) => (
              <span key={k} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: CLASS_STYLE[k].bg, color: CLASS_STYLE[k].text }}>
                {CLASS_STYLE[k].label}: {CLASS_STYLE[k].range}
              </span>
            ))}
          </div>
          <table className="mt-4 w-full text-left">
            <thead className="text-xs text-gray-400"><tr><th className="py-2 font-medium">Indicator</th><th className="py-2 font-medium">Domain</th><th className="py-2 text-right font-medium">Weight</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {weights.map((w) => (
                <tr key={w.indicator}><td className="py-2">{w.label}</td><td className="py-2 text-gray-500">{w.domain}</td>
                  <td className="py-2 text-right">{w.weight} <span className="text-gray-400">({total ? Math.round((100 * w.weight) / total) : 0}%)</span></td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Risk Priority Score</h2>
          <p className="text-gray-600">RPS combines flood hazard level (0–3), the preparedness gap (100 − SPI), number of learners and distance to the nearest road. Higher means the school should be supported first.</p>
        </section>
      </div>
    </div>
  );
}
