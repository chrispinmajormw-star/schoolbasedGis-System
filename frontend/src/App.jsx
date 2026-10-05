import { useCallback, useEffect, useState } from 'react';
import MapView from './components/MapView.jsx';
import Dashboard from './components/Dashboard.jsx';
import AssessmentForm from './components/AssessmentForm.jsx';
import { api, CLASS_STYLE, FLOOD_STYLE } from './lib/api.js';

export default function App() {
  const [schools, setSchools] = useState(null);
  const [hazards, setHazards] = useState(null);
  const [weights, setWeights] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [layers, setLayers] = useState({ flood: true, schools: true, learnersSize: true, mode: 'spi' });

  const load = useCallback(async () => {
    try {
      const [s, h, w, sum] = await Promise.all([api.schools(), api.hazards(), api.weights(), api.summary()]);
      setSchools(s); setHazards(h); setWeights(w); setSummary(sum); setError('');
    } catch (e) {
      setError(`Cannot reach the API: ${e.message}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pick = (id) => {
    const f = schools?.features.find((x) => x.properties.id === id);
    if (f) setSelected(f.properties);
  };

  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="z-[1000] w-full shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-4 md:w-80">
        <h1 className="text-lg font-bold text-gray-900">Malawi School Preparedness</h1>
        <p className="mb-3 text-xs text-gray-500">GIS decision-support tool: preparedness x hazard x exposure</p>
        {error && <p className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        <section className="mb-4 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <h2 className="mb-1 font-semibold text-gray-700">Layers</h2>
          <label className="flex items-center gap-2"><input type="checkbox" checked={layers.flood} onChange={() => toggle('flood')} /> Flood hazard</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={layers.schools} onChange={() => toggle('schools')} /> Schools</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={layers.learnersSize} onChange={() => toggle('learnersSize')} /> Size by learners</label>
          <div className="mt-2 flex gap-1">
            {[['spi', 'Preparedness'], ['risk', 'Risk priority']].map(([k, label]) => (
              <button key={k} onClick={() => setLayers((l) => ({ ...l, mode: k }))}
                className={`flex-1 rounded px-2 py-1 text-xs ${layers.mode === k ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}>{label}</button>
            ))}
          </div>
          <div className="mt-3 space-y-0.5 text-xs">
            {layers.mode === 'spi'
              ? Object.entries(CLASS_STYLE).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: v.color }} />{v.label}</div>))
              : <div className="text-gray-600">Dark red = highest risk priority (hazard x gap x learners x remoteness)</div>}
            {layers.flood && Object.entries(FLOOD_STYLE).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2"><span className="h-3 w-3" style={{ background: v.color }} />Flood: {v.label}</div>))}
          </div>
        </section>

        {selected && (
          <section className="mb-4 rounded-lg border border-gray-300 bg-white p-3 text-sm">
            <div className="font-semibold">{selected.name}</div>
            <div className="text-gray-500">SPI {selected.spi === null ? 'not assessed' : `${selected.spi}%`}</div>
            <button onClick={() => setEditing(true)} className="mt-2 rounded bg-gray-900 px-3 py-1 text-xs text-white">
              {selected.spi === null ? 'Add assessment' : 'Update assessment'}
            </button>
          </section>
        )}

        <Dashboard summary={summary} onPick={pick} />
        <a href={api.exportUrl} className="mt-4 block text-center text-xs text-blue-700 underline">Download CSV for R / Python / QGIS</a>
      </aside>

      <main className="relative min-h-[60vh] flex-1">
        <MapView schools={schools} hazards={hazards} layers={layers} onSelect={setSelected} />
      </main>

      {editing && selected && (
        <AssessmentForm
          school={selected}
          weights={weights}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await load(); setSelected(null); }}
        />
      )}
    </div>
  );
}
