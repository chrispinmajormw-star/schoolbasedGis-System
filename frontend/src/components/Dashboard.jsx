import { CLASS_STYLE } from '../lib/api.js';

const Card = ({ label, value }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-3">
    <div className="text-xs text-gray-500">{label}</div>
    <div className="text-xl font-semibold text-gray-900">{value}</div>
  </div>
);

export default function Dashboard({ summary, onPick }) {
  if (!summary) return <p className="text-sm text-gray-500">Loading summary...</p>;
  const { totals, byClass, lowPrepInFloodZones, topPriority, byDistrict } = summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Card label="Schools" value={totals.schools} />
        <Card label="Assessed" value={`${totals.assessed}/${totals.schools}`} />
        <Card label="Mean SPI" value={totals.mean_spi === null ? 'n/a' : `${totals.mean_spi}%`} />
        <Card label="Learners" value={totals.learners.toLocaleString()} />
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <b>{lowPrepInFloodZones.learners.toLocaleString()}</b> learners in{' '}
        <b>{lowPrepInFloodZones.schools}</b> lower-preparedness schools sit in medium/high flood zones.
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Preparedness classes</h3>
        {['high', 'moderate', 'low', 'unassessed'].map((k) => {
          const row = byClass.find((r) => r.spi_class === k);
          return (
            <div key={k} className="flex items-center justify-between py-0.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: CLASS_STYLE[k].color }} />
                {CLASS_STYLE[k].label}
              </span>
              <span className="text-gray-600">{row ? `${row.schools} schools` : '0'}</span>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Top priority (risk score)</h3>
        <ol className="space-y-1 text-sm">
          {topPriority.length === 0 && <li className="text-gray-500">No scored schools yet.</li>}
          {topPriority.map((s) => (
            <li key={s.id}>
              <button className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-left hover:bg-gray-50"
                onClick={() => onPick(s.id)}>
                <span className="font-medium">{s.name}</span>
                <span className="block text-xs text-gray-500">
                  RPS {s.rps} - SPI {s.spi}% - {s.learners} learners
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Mean SPI by district</h3>
        <div className="space-y-1">
          {byDistrict.map((d) => (
            <div key={d.district} className="text-sm">
              <div className="flex justify-between"><span>{d.district}</span>
                <span className="text-gray-600">{d.mean_spi === null ? 'n/a' : `${d.mean_spi}%`}</span></div>
              <div className="h-1.5 rounded bg-gray-200">
                <div className="h-1.5 rounded" style={{
                  width: `${d.mean_spi || 0}%`,
                  background: CLASS_STYLE[d.mean_spi === null ? 'unassessed' : d.mean_spi >= 80 ? 'high' : d.mean_spi >= 60 ? 'moderate' : 'low'].color,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
