import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2, FileUp, Map as MapIcon, Info } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFeedback } from '../../lib/feedback.jsx';
import { DISTRICTS } from '../../lib/facilityTypes.js';
import { PageHeader, Seg, Field, ErrorNote } from '../ui.jsx';
import { readLayers } from '../../lib/importFiles.js';
import LayerPicker from './LayerPicker.jsx';

const LEVELS = { district: 'Districts', ta: 'Traditional Authorities' };

// Guess which attribute holds the name / district / population
const guess = (keys, patterns) => keys.find((k) => patterns.some((p) => p.test(k))) || '';

export default function AdminBoundaries({ onChanged, embedded = false }) {
  const { toast, confirm } = useFeedback();
  const [summary, setSummary] = useState(null);
  const [level, setLevel] = useState('district');
  const [fc, setFc] = useState(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState({ name: '', district: '', population: '' });
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.adminAreasSummary().then(setSummary).catch(() => setSummary([]));
  useEffect(() => { load(); }, []);

  const keys = useMemo(() => Object.keys(fc?.features?.[0]?.properties || {}), [fc]);
  const polygons = (fc?.features || []).filter((f) => ['Polygon', 'MultiPolygon'].includes(f?.geometry?.type));
  const sample = polygons.slice(0, 5).map((f) => f.properties?.[map.name]);
  const matched = level === 'district' && map.name
    ? polygons.filter((f) => DISTRICTS.some((d) => d.toLowerCase() === String(f.properties?.[map.name] || '').toLowerCase())).length : null;

  const [layers, setLayers] = useState(null);
  const [layerIdx, setLayerIdx] = useState(0);
  function applyLayer(features) {
    if (!features?.length) throw new Error('No features found in that file.');
    const ks = [...new Set(features.slice(0, 50).flatMap((f) => Object.keys(f?.properties || {})))];
    setFc({ type: 'FeatureCollection', features });
    setMap({
      name: level === 'ta' ? guess(ks, [/^ta/i, /^ta_?nam/i, /name_?3/i, /adm3/i, /^name$/i, /nam/i]) : guess(ks, [/^dist/i, /district/i, /name_?2/i, /adm2/i, /^name$/i, /nam/i]),
      district: guess(ks, [/^dist/i, /district/i, /name_?2/i, /adm2/i]),
      population: guess(ks, [/pop/i, /total/i]),
    });
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setFc(null); setLayers(null); setBusy(true);
    try {
      const { layers: ls, table } = await readLayers(file);
      if (table) throw new Error('Boundaries need polygons: upload a zipped shapefile or GeoJSON, not a CSV.');
      const idx = Math.max(0, ls.findIndex((l) => l.kind === 'polygon'));
      setLayers(ls); setLayerIdx(idx); setFileName(file.name); setSource(file.name.replace(/\.(zip|geojson|json)$/i, ''));
      applyLayer(ls[idx].features);
    } catch (err) { setError(err.message || 'Could not read that file'); } finally { setBusy(false); }
  }

  async function upload() {
    if (!map.name) { setError('Choose the field that holds the area name.'); return; }
    setBusy(true); setError('');
    try {
      const features = polygons.map((f) => ({
        name: String(f.properties?.[map.name] ?? '').trim(),
        district: map.district ? String(f.properties?.[map.district] ?? '').trim() || null : null,
        population: map.population ? Number(f.properties?.[map.population]) : null,
        geometry: f.geometry,
      }));
      const r = await api.uploadAdminAreas({ level, source: source || null, features });
      toast(`${r.imported} ${LEVELS[level].toLowerCase()} imported`);
      setFc(null); setLayers(null); setFileName(''); load(); onChanged?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function remove(lv) {
    if (!await confirm({ title: `Remove all ${LEVELS[lv].toLowerCase()}?`, message: 'Facilities keep their district names. The map shading and TA names disappear until you upload again.', confirmLabel: 'Remove', danger: true })) return;
    await api.deleteAdminAreas(lv); toast('Boundaries removed'); load(); onChanged?.();
  }

  return (
    <div className={embedded ? '' : 'scroll-thin h-full overflow-y-auto p-4 sm:p-6'}>
      {!embedded && <PageHeader title="Boundaries" subtitle="Upload district and Traditional Authority boundaries. Districts shade the analysis maps; TAs are attached to every facility automatically." />}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Upload a layer</h2>
          <Seg value={level} onChange={(v) => { setLevel(v); setFc(null); setLayers(null); }} options={Object.entries(LEVELS)} className="mb-4 max-w-sm" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center hover:border-gray-400">
            <FileUp size={26} className="text-gray-400" />
            <span className="font-medium">{busy && !fc ? 'Reading…' : fileName || `Choose a ${LEVELS[level].toLowerCase()} file`}</span>
            <span className="text-[11px] text-gray-500">Zipped shapefile (.zip containing .shp, .dbf and .prj) or GeoJSON</span>
          </button>
          <input ref={fileRef} type="file" accept=".zip,.geojson,.json" className="hidden" onChange={onFile} />

          <div className="mt-3"><LayerPicker layers={layers} value={layerIdx} onChange={(i) => { setLayerIdx(i); setError(''); try { applyLayer(layers[i].features); } catch (err) { setError(err.message); } }} /></div>
          {fc && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-gray-600"><b>{polygons.length}</b> polygons found{fc.features.length !== polygons.length ? ` (${fc.features.length - polygons.length} non-polygon features skipped)` : ''}.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[['name', `${level === 'ta' ? 'TA' : 'District'} name field`, true], ['district', 'Parent district field', level === 'ta'], ['population', 'Population field (optional)', true]].filter((x) => x[2]).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <select className="input" value={map[k]} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value }))}>
                      <option value="">—</option>{keys.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              <Field label="Source (for citation)"><input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. NSO 2018 census boundaries" /></Field>
              {map.name && <p className="text-[11px] text-gray-500">Examples: {sample.filter(Boolean).join(', ') || '(empty)'}</p>}
              {matched !== null && <p className={`text-[11px] ${matched < polygons.length ? 'text-amber-700' : 'text-green-700'}`}>{matched} of {polygons.length} names match SafeCom&apos;s district list{matched < polygons.length ? '. Unmatched names will not be shaded (city districts like "Lilongwe City" are fine to keep).' : '.'}</p>}
              <button type="button" className="btn-dark" disabled={busy} onClick={upload}><Upload size={15} />{busy ? 'Uploading…' : `Replace ${LEVELS[level].toLowerCase()}`}</button>
            </div>
          )}
          <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
        </section>

        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><MapIcon size={16} />Loaded</h2>
            {Object.keys(LEVELS).map((lv) => {
              const s = summary?.find((x) => x.level === lv);
              return (
                <div key={lv} className="flex items-center justify-between border-b border-gray-100 py-2.5 last:border-0">
                  <div><div className="font-medium">{LEVELS[lv]}</div><div className="text-[11px] text-gray-400">{s ? `${s.areas} ${s.areas === 1 ? 'area' : 'areas'}${s.population ? ` · pop. ${Number(s.population).toLocaleString()}` : ''}${s.source ? ` · ${s.source}` : ''}` : 'None'}</div></div>
                  {s && <button type="button" className="btn-danger px-2 py-1" onClick={() => remove(lv)} aria-label={`Remove ${LEVELS[lv]}`}><Trash2 size={13} /></button>}
                </div>
              );
            })}
          </section>
          <section className="rounded-2xl bg-accent-soft p-4 text-xs text-gray-700">
            <p className="mb-1 flex items-center gap-1.5 font-semibold"><Info size={13} />Tips</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Zip the .shp, .shx, .dbf and .prj together. Any projection with a .prj file works.</li>
              <li>Large layers: simplify first in QGIS (Vector → Geometry → Simplify, ~50 m) to keep uploads under 40 MB.</li>
              <li>Uploading again replaces that level.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
