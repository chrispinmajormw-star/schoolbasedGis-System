import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileUp, Upload, Trash2, Building2, Waves, Route, MapPinned, Eraser, Ruler, Info, CircleCheck, TriangleAlert, Download,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useFeedback } from '../../lib/feedback.jsx';
import { FACILITY_TYPES, TYPE_KEYS } from '../../lib/facilityTypes.js';
import { readFile, fieldsOf, guessField, pointOf, inBatches, distinctValues } from '../../lib/importFiles.js';
import { downloadCsv } from '../../lib/decision.js';
import { PageHeader, Seg, Field, ErrorNote } from '../ui.jsx';
import AdminBoundaries from './AdminBoundaries.jsx';

// ---------- shared pieces ----------
function FilePick({ label, hint, busy, fileName, onFile, accept = '.zip,.geojson,.json,.csv' }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center hover:border-gray-400">
        <FileUp size={26} className="text-gray-400" />
        <span className="font-medium">{busy ? 'Reading…' : fileName || label}</span>
        <span className="text-[11px] text-gray-500">{hint}</span>
      </button>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}

function FieldSelect({ label, keys, value, onChange, hint, required }) {
  return (
    <Field label={`${label}${required ? ' *' : ''}`} hint={hint}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{required ? 'Choose a field…' : '— none —'}</option>
        {keys.map((k) => <option key={k}>{k}</option>)}
      </select>
    </Field>
  );
}

function Preview({ features, keys }) {
  const rows = features.slice(0, 4);
  if (!rows.length) return null;
  const cols = keys.slice(0, 8);
  return (
    <div className="scroll-thin overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-gray-50 text-gray-500"><tr>{cols.map((k) => <th key={k} className="whitespace-nowrap px-2 py-1.5 font-medium">{k}</th>)}{keys.length > 8 && <th className="px-2">+{keys.length - 8} more</th>}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((f, i) => <tr key={i}>{cols.map((k) => <td key={k} className="max-w-[160px] truncate whitespace-nowrap px-2 py-1.5">{String(f.properties?.[k] ?? '')}</td>)}{keys.length > 8 && <td />}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ done, total, label }) {
  if (!total) return null;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-gray-500"><span>{label}</span><span>{done.toLocaleString()} / {total.toLocaleString()}</span></div>
      <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-ink transition-all" style={{ width: `${(100 * done) / total}%` }} /></div>
    </div>
  );
}

function useFile() {
  const [state, setState] = useState({ features: null, table: false, fileName: '', busy: false, error: '' });
  const load = async (file) => {
    setState({ features: null, table: false, fileName: file.name, busy: true, error: '' });
    try {
      const { features, table } = await readFile(file);
      if (!features?.length) throw new Error('No records found in that file.');
      setState({ features, table, fileName: file.name, busy: false, error: '' });
    } catch (e) { setState({ features: null, table: false, fileName: file.name, busy: false, error: e.message || 'Could not read that file' }); }
  };
  return [state, load, () => setState({ features: null, table: false, fileName: '', busy: false, error: '' })];
}

// ---------- facilities (points) ----------
const ALIAS = {
  school: 'school', primary: 'school', secondary: 'school', 'primary school': 'school', 'secondary school': 'school', cdss: 'school', ecd: 'school',
  hospital: 'health_facility', 'health centre': 'health_facility', 'health center': 'health_facility', clinic: 'health_facility', dispensary: 'health_facility', 'health post': 'health_facility', health_facility: 'health_facility',
  market: 'market', church: 'place_of_worship', mosque: 'place_of_worship', place_of_worship: 'place_of_worship',
  'community hall': 'community_hall', community_hall: 'community_hall', 'evacuation centre': 'evacuation_centre', 'evacuation center': 'evacuation_centre', camp: 'evacuation_centre', evacuation_centre: 'evacuation_centre',
  borehole: 'water_point', well: 'water_point', 'water point': 'water_point', water_point: 'water_point', kiosk: 'water_point', tap: 'water_point',
};
const guessType = (v) => ALIAS[String(v).trim().toLowerCase()] || TYPE_KEYS.find((k) => FACILITY_TYPES[k].label.toLowerCase() === String(v).trim().toLowerCase()) || '';

function ImportFacilities({ status, areas, onDone }) {
  const { toast } = useFeedback();
  const [file, load, reset] = useFile();
  const keys = useMemo(() => fieldsOf(file.features), [file.features]);
  const [typeMode, setTypeMode] = useState('fixed');
  const [fixedType, setFixedType] = useState('school');
  const [typeField, setTypeField] = useState('');
  const [typeMap, setTypeMap] = useState({});
  const [m, setM] = useState({});
  const [autoDistrict, setAutoDistrict] = useState(false);
  const [distances, setDistances] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setM((x) => ({ ...x, [k]: v }));
  const hasDistricts = areas?.some((a) => a.level === 'district');

  useEffect(() => {
    if (!file.features) return;
    const g = (...p) => guessField(keys, p);
    setM({
      // Shapefile field names are cut to 10 characters (SCHOOL_NAM, FACILITY_N…), so match the start of words
      name: g(/^name$/i, /^(school|facility|fac|sch|hf|site|market|church)_?nam/i, /nam/i, /^facility_?n/i, /^school_?n/i),
      code: g(/emis/i, /mhfr/i, /^code$/i, /_?code/i, /^(fac|site|sch)_?id$/i, /^id$/i),
      district: g(/^district$/i, /^distr/i, /^dist_?n/i, /^dist/i, /district/i),
      subtype: g(/^level$/i, /category|class|^type_?2|ownership/i),
      people: g(/enrol|learn|pupil|student|popul|catchm|served|beneficiar/i),
      staff: g(/teach|staff|worker|nurse/i),
      shelter: g(/shelter|capac/i),
      contact: g(/head|contact|in_?charge/i),
      phone: g(/phone|tel|mobile/i),
      lat: g(/^lat(itude)?$/i, /^y$/i, /point_?y/i, /lat/i),
      lon: g(/^lon(g|gitude)?$/i, /^x$/i, /point_?x/i, /lon|lng/i),
    });
    const tf = guessField(keys, [/facility_?type|^type$|^ftype$/i]);
    setTypeField(tf); setTypeMode(tf ? 'field' : 'fixed');
    setAutoDistrict(!guessField(keys, [/district/i, /^dist/i]) && hasDistricts);
    setResult(null); setError('');
  }, [file.features, keys, hasDistricts]);

  const typeValues = useMemo(() => (typeMode === 'field' && typeField ? distinctValues(file.features, typeField) : []), [file.features, typeMode, typeField]);
  useEffect(() => { setTypeMap(Object.fromEntries(typeValues.map(([v]) => [v, guessType(v)]))); }, [typeValues]);

  const items = useMemo(() => (file.features || []).map((f, i) => {
    const p = f.properties || {};
    const pt = file.table ? [Number(String(p[m.lon] ?? '').replace(',', '.')), Number(String(p[m.lat] ?? '').replace(',', '.'))] : pointOf(f.geometry);
    const type = typeMode === 'fixed' ? fixedType : typeMap[String(p[typeField] ?? '').trim()] || '';
    return {
      row: i + 1, facility_type: type, name: m.name ? p[m.name] : '', code: m.code ? p[m.code] : null,
      district: !autoDistrict && m.district ? p[m.district] : null, subtype: m.subtype ? p[m.subtype] : null,
      people_served: m.people ? p[m.people] : null, staff: m.staff ? p[m.staff] : null, shelter_capacity: m.shelter ? p[m.shelter] : null,
      contact_name: m.contact ? p[m.contact] : null, contact_phone: m.phone ? p[m.phone] : null,
      lon: pt?.[0] ?? null, lat: pt?.[1] ?? null,
    };
  }), [file, m, typeMode, fixedType, typeField, typeMap, autoDistrict]);
  const notPoints = !file.table && file.features && !file.features.some((f) => pointOf(f.geometry));

  async function run() {
    setError(''); setResult(null);
    if (!m.name) { setError('Choose the field with the facility name.'); return; }
    if (file.table && (!m.lat || !m.lon)) { setError('Choose the latitude and longitude columns.'); return; }
    if (!autoDistrict && !m.district) { setError('Choose the district field, or tick "Find the district from district boundaries".'); return; }
    const total = { inserted: 0, updated: 0, skipped: [] };
    setProgress({ done: 0, total: items.length });
    setBusy(true);
    try {
      await inBatches(items, { maxCount: 1000 }, async (batch) => {
        const r = await api.importFacilities(batch, autoDistrict);
        total.inserted += r.inserted; total.updated += r.updated; total.skipped.push(...r.skipped);
      }, (done) => setProgress({ done, total: items.length }));
      if (distances) await api.recalcDistances();
      setResult(total);
      toast(`${total.inserted.toLocaleString()} added, ${total.updated.toLocaleString()} updated${total.skipped.length ? `, ${total.skipped.length} skipped` : ''}`);
      onDone();
    } catch (e) { setError(`${e.message} (after ${total.inserted + total.updated} facilities were saved)`); } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Facilities (points)</h2>
        <p className="text-xs text-gray-500">Schools from EMIS, health facilities from MHFR, markets, water points… One file can hold one type or several. Facilities with a code that already exists are <b>updated</b>, not duplicated.</p>
      </div>
      <FilePick label="Choose a points file" hint="Zipped shapefile (.zip) · GeoJSON · CSV with latitude and longitude columns" busy={file.busy} fileName={file.fileName} onFile={load} />
      <ErrorNote>{file.error}</ErrorNote>
      {notPoints && <ErrorNote>This file has no point geometry. Use the Flood zones, Roads or Boundaries tab for polygons and lines.</ErrorNote>}

      {file.features && !notPoints && (
        <>
          <p className="text-xs text-gray-600"><b>{file.features.length.toLocaleString()}</b> records · {keys.length} fields <button type="button" className="ml-2 text-gray-400 underline" onClick={reset}>Choose another file</button></p>
          <Preview features={file.features} keys={keys} />

          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="label">Facility type</div>
            <Seg value={typeMode} onChange={setTypeMode} options={[['fixed', 'Same type for every record'], ['field', 'From a field in the file']]} className="mb-3 max-w-md" />
            {typeMode === 'fixed' ? (
              <select className="input max-w-xs bg-white" value={fixedType} onChange={(e) => setFixedType(e.target.value)}>
                {TYPE_KEYS.map((k) => <option key={k} value={k}>{FACILITY_TYPES[k].label}</option>)}
              </select>
            ) : (
              <div className="space-y-3">
                <FieldSelect label="Type field" keys={keys} value={typeField} onChange={setTypeField} />
                {typeValues.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {typeValues.map(([v, n]) => (
                      <label key={v} className="flex items-center gap-2 text-xs">
                        <span className="w-36 truncate font-medium" title={v}>{v || '(empty)'} <span className="text-gray-400">· {n}</span></span>
                        <select className={`input flex-1 bg-white py-1.5 ${typeMap[v] ? '' : 'border-amber-400'}`} value={typeMap[v] || ''} onChange={(e) => setTypeMap((t) => ({ ...t, [v]: e.target.value }))}>
                          <option value="">Skip these</option>
                          {TYPE_KEYS.map((k) => <option key={k} value={k}>{FACILITY_TYPES[k].label}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FieldSelect label="Name" required keys={keys} value={m.name || ''} onChange={set('name')} />
            <FieldSelect label="Code (EMIS / MHFR / ID)" keys={keys} value={m.code || ''} onChange={set('code')} hint="Strongly recommended: lets you re-import safely" />
            <div>
              {!autoDistrict && <FieldSelect label="District" required keys={keys} value={m.district || ''} onChange={set('district')} />}
              <label className={`flex items-start gap-2 text-[11px] ${autoDistrict ? 'mt-0' : 'mt-1.5'}`}>
                <input type="checkbox" checked={autoDistrict} disabled={!hasDistricts} onChange={(e) => setAutoDistrict(e.target.checked)} className="mt-0.5" />
                <span>Find the district from district boundaries{!hasDistricts && <span className="block text-gray-400">Upload district boundaries first (Boundaries tab)</span>}</span>
              </label>
            </div>
            {file.table && <FieldSelect label="Latitude" required keys={keys} value={m.lat || ''} onChange={set('lat')} hint="Decimal degrees, e.g. -15.79" />}
            {file.table && <FieldSelect label="Longitude" required keys={keys} value={m.lon || ''} onChange={set('lon')} hint="Decimal degrees, e.g. 35.01" />}
            <FieldSelect label="Category" keys={keys} value={m.subtype || ''} onChange={set('subtype')} hint="e.g. Primary, Hospital" />
            <FieldSelect label="People served" keys={keys} value={m.people || ''} onChange={set('people')} hint="Learners, catchment population…" />
            <FieldSelect label="Staff" keys={keys} value={m.staff || ''} onChange={set('staff')} />
            <FieldSelect label="Can shelter (people)" keys={keys} value={m.shelter || ''} onChange={set('shelter')} />
            <FieldSelect label="Contact person" keys={keys} value={m.contact || ''} onChange={set('contact')} />
            <FieldSelect label="Phone" keys={keys} value={m.phone || ''} onChange={set('phone')} />
          </div>
          {!m.code && <p className="flex items-start gap-1.5 text-[11px] text-amber-700"><TriangleAlert size={13} className="mt-px shrink-0" />Without a code, importing the same file twice creates duplicates.</p>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={distances} onChange={(e) => setDistances(e.target.checked)} />Recalculate distance to the nearest road and health facility afterwards</label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-dark" disabled={busy} onClick={run}>
              <Upload size={15} />Import {items.length.toLocaleString()} facilities
            </button>
            <div className="min-w-[200px] flex-1"><Progress done={progress.done} total={progress.total} label="Uploading" /></div>
          </div>
          <ErrorNote>{error}</ErrorNote>
          {result && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <p className="flex items-center gap-2 font-semibold"><CircleCheck size={16} />{result.inserted.toLocaleString()} added · {result.updated.toLocaleString()} updated · {result.skipped.length.toLocaleString()} skipped</p>
              {result.skipped.length > 0 && (
                <div className="mt-2 text-xs text-gray-700">
                  <ul className="list-disc pl-5">{result.skipped.slice(0, 6).map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>
                  <button type="button" className="btn-ghost mt-2 px-2.5 py-1 text-xs" onClick={() => downloadCsv('skipped_rows.csv', result.skipped.map((s) => ({ row: s.row, reason: s.reason, ...(file.features[s.row - 1]?.properties || {}) })))}>
                    <Download size={13} />Download skipped rows
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------- polygons / lines ----------
const LEVEL_GUESS = (v) => {
  const s = String(v).trim().toLowerCase();
  if (['1', 'low', 'l'].includes(s)) return '1';
  if (['2', 'medium', 'moderate', 'm'].includes(s)) return '2';
  if (['3', 'high', 'very high', 'h', '4', '5'].includes(s)) return '3';
  return '';
};

function ImportShapes({ kind, status, onDone }) {
  const { toast, confirm } = useFeedback();
  const zones = kind === 'zones';
  const [file, load, reset] = useFile();
  const keys = useMemo(() => fieldsOf(file.features), [file.features]);
  const [levelMode, setLevelMode] = useState('field');
  const [levelField, setLevelField] = useState('');
  const [fixedLevel, setFixedLevel] = useState('3');
  const [levelMap, setLevelMap] = useState({});
  const [nameField, setNameField] = useState('');
  const [classField, setClassField] = useState('');
  const [keepClasses, setKeepClasses] = useState(null);
  const [replace, setReplace] = useState(true);
  const [source, setSource] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const wanted = zones ? ['Polygon', 'MultiPolygon'] : ['LineString', 'MultiLineString'];
  const shapes = useMemo(() => (file.features || []).filter((f) => wanted.includes(f.geometry?.type)), [file.features]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!file.features) return;
    // Level field: the field whose values best read as low / medium / high (or 1–3)
    let lf = ''; let best = 0;
    keys.forEach((k) => {
      const vals = distinctValues(file.features, k, 30);
      const n = vals.reduce((s, [v, c]) => s + (LEVEL_GUESS(v) ? c : 0), 0);
      if (n > best) { best = n; lf = k; }
    });
    if (best < file.features.length / 2) lf = guessField(keys, [/hazard/i, /level/i, /risk/i, /depth/i, /class/i]) || lf;
    setLevelField(lf); setLevelMode(lf ? 'field' : 'fixed');
    setNameField(guessField(keys, [/^name$/i, /nam/i, /^zone$/i, /area|label|title/i]));
    setClassField(guessField(keys, [/^highway$/i, /^fclass$/i, /class|type|category|surface/i]));
    setSource(file.fileName.replace(/\.(zip|geojson|json)$/i, ''));
    setError(''); setProgress({ done: 0, total: 0 });
  }, [file.features, file.fileName, keys]);

  const levelValues = useMemo(() => (zones && levelMode === 'field' && levelField ? distinctValues(shapes, levelField, 30) : []), [zones, levelMode, levelField, shapes]);
  useEffect(() => { setLevelMap(Object.fromEntries(levelValues.map(([v]) => [v, LEVEL_GUESS(v)]))); }, [levelValues]);
  const classValues = useMemo(() => (!zones && classField ? distinctValues(shapes, classField, 40) : []), [zones, classField, shapes]);
  useEffect(() => { setKeepClasses(null); }, [classField]);
  const keep = keepClasses || new Set(classValues.map(([v]) => v));

  const items = useMemo(() => shapes.filter((f) => zones || !classField || keep.has(String(f.properties?.[classField] ?? '').trim())).map((f) => {
    const p = f.properties || {};
    return zones
      ? { level: levelMode === 'fixed' ? fixedLevel : levelMap[String(p[levelField] ?? '').trim()] || '', name: nameField ? p[nameField] : null, geometry: f.geometry }
      : { name: nameField ? p[nameField] : null, road_class: classField ? p[classField] : null, geometry: f.geometry };
  }), [shapes, zones, levelMode, fixedLevel, levelMap, levelField, nameField, classField, keep]);
  const unmapped = zones ? items.filter((it) => !it.level).length : 0;

  async function run() {
    setError('');
    if (zones && replace && status?.flood_zones && !await confirm({ title: 'Replace all flood zones?', message: `The ${status.flood_zones} existing flood zones are removed and replaced by this file. Risk scores are recalculated automatically.`, confirmLabel: 'Replace' })) return;
    setBusy(true);
    let imported = 0; let skipped = shapes.length - items.length;
    setProgress({ done: 0, total: items.length });
    try {
      await inBatches(items, { maxCount: 2000, maxBytes: 5e6 }, async (batch, first) => {
        const body = { first, replace: zones ? replace : true, source, features: batch };
        const r = zones ? await api.importFloodZones(body) : await api.importRoads(body);
        imported += r.imported; skipped += r.skipped;
      }, (done) => setProgress({ done, total: items.length }));
      if (!zones) await api.recalcDistances();
      toast(`${imported.toLocaleString()} ${zones ? 'flood zones' : 'road segments'} imported${skipped ? `, ${skipped} skipped` : ''}`);
      reset(); onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{zones ? 'Flood hazard zones (polygons)' : 'Roads (lines)'}</h2>
        <p className="text-xs text-gray-500">{zones
          ? 'Flood extent or hazard polygons, e.g. from DoDMA, a flood model or MASDAP, with a hazard level of low / medium / high (1–3). They set each facility\'s flood level and risk score.'
          : 'Road network, e.g. Roads Authority or OpenStreetMap. Used to calculate each facility\'s distance to the nearest road. Uploading replaces the current roads.'}</p>
      </div>
      <FilePick label={`Choose a ${zones ? 'polygon' : 'line'} file`} hint="Zipped shapefile (.zip with .shp, .shx, .dbf, .prj) or GeoJSON" busy={file.busy} fileName={file.fileName} onFile={load} accept=".zip,.geojson,.json" />
      <ErrorNote>{file.error}</ErrorNote>
      {file.features && !shapes.length && <ErrorNote>{`No ${zones ? 'polygons' : 'lines'} in this file.`}</ErrorNote>}

      {shapes.length > 0 && (
        <>
          <p className="text-xs text-gray-600"><b>{shapes.length.toLocaleString()}</b> {zones ? 'polygons' : 'lines'}{file.features.length !== shapes.length ? ` (${file.features.length - shapes.length} other features ignored)` : ''} <button type="button" className="ml-2 text-gray-400 underline" onClick={reset}>Choose another file</button></p>
          <Preview features={shapes} keys={keys} />
          {zones && (
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="label">Hazard level</div>
              <Seg value={levelMode} onChange={setLevelMode} options={[['field', 'From a field'], ['fixed', 'Same level for all']]} className="mb-3 max-w-sm" />
              {levelMode === 'fixed' ? (
                <select className="input max-w-xs bg-white" value={fixedLevel} onChange={(e) => setFixedLevel(e.target.value)}>
                  <option value="1">Low (1)</option><option value="2">Medium (2)</option><option value="3">High (3)</option>
                </select>
              ) : (
                <div className="space-y-3">
                  <FieldSelect label="Level field" keys={keys} value={levelField} onChange={setLevelField} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {levelValues.map(([v, n]) => (
                      <label key={v} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate font-medium">{v || '(empty)'} <span className="text-gray-400">· {n}</span></span>
                        <select className={`input flex-1 bg-white py-1.5 ${levelMap[v] ? '' : 'border-amber-400'}`} value={levelMap[v] || ''} onChange={(e) => setLevelMap((t) => ({ ...t, [v]: e.target.value }))}>
                          <option value="">Skip</option><option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <FieldSelect label="Name" keys={keys} value={nameField} onChange={setNameField} />
            {!zones && <FieldSelect label="Road class" keys={keys} value={classField} onChange={setClassField} hint="e.g. highway (OSM), fclass" />}
            <Field label="Source (for citation)"><input className="input" value={source} onChange={(e) => setSource(e.target.value)} /></Field>
          </div>
          {!zones && classValues.length > 1 && (
            <div className="rounded-2xl bg-gray-50 p-4">
              <div className="label">Road classes to keep</div>
              <p className="mb-2 text-[11px] text-gray-500">Untick footpaths and tracks if distance should mean a road vehicles can use.</p>
              <div className="flex flex-wrap gap-1.5">
                {classValues.map(([v, n]) => {
                  const on = keep.has(v);
                  return (
                    <button key={v} type="button" onClick={() => { const s = new Set(keep); if (on) s.delete(v); else s.add(v); setKeepClasses(s); }}
                      className={`rounded-xl border px-2.5 py-1 text-[11px] font-medium ${on ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-400 line-through'}`}>{v || '(empty)'} · {n}</button>
                  );
                })}
              </div>
            </div>
          )}
          {zones && unmapped > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700"><TriangleAlert size={13} className="mt-px shrink-0" />
              {unmapped === items.length ? 'No polygon has a hazard level yet: choose the right level field or set the levels above.' : `${unmapped} polygon${unmapped === 1 ? ' has' : 's have'} no level and will be skipped.`}</p>
          )}
          {zones && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace the existing flood zones ({status?.flood_zones ?? 0}). Untick to add to them.</label>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-dark" disabled={busy || !items.length || (zones && unmapped === items.length)} onClick={run}><Upload size={15} />Import {(items.length - unmapped).toLocaleString()} {zones ? 'zones' : 'road lines'}</button>
            <div className="min-w-[200px] flex-1"><Progress done={progress.done} total={progress.total} label="Uploading" /></div>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </>
      )}
    </section>
  );
}

// ---------- sample data ----------
function SampleData({ status, onDone }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const n = (status?.sample_facilities || 0) + (status?.sample_flood_zones || 0) + (status?.sample_flood_records || 0);
  async function remove() {
    if (!await confirm({ title: 'Remove all sample data?', message: 'Deletes the fictional SAMPLE- facilities with their assessments and actions, the placeholder flood zones and the sample flood records. Your own data is kept. This cannot be undone.', confirmLabel: 'Remove sample data', danger: true })) return;
    setBusy(true); setError('');
    try {
      const r = await api.removeSample();
      toast(`Removed ${r.facilities} sample facilities, ${r.flood_zones} flood zones and ${r.flood_records} flood records`);
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Sample data</h2>
        <p className="text-xs text-gray-500">The fictional test data from seed.sql. Remove it before loading real data so it does not mix with your statistics.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[['Sample facilities', status?.sample_facilities], ['Placeholder flood zones', status?.sample_flood_zones], ['Sample flood records', status?.sample_flood_records]].map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-gray-50 p-3"><div className="text-2xl font-semibold">{v ?? '—'}</div><div className="text-[11px] text-gray-500">{l}</div></div>
        ))}
      </div>
      {status?.linked_accounts && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><TriangleAlert size={14} className="mt-px shrink-0" />
          <span>These accounts are linked to sample facilities: <b>{status.linked_accounts}</b>. Delete them (or reassign their facility) under User accounts first.</span></p>
      )}
      {n === 0 ? <p className="flex items-center gap-2 text-sm text-green-700"><CircleCheck size={16} />No sample data left.</p>
        : <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy || !!status?.linked_accounts} onClick={remove}><Eraser size={15} />{busy ? 'Removing…' : 'Remove sample data'}</button>}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}

// ---------- page ----------
export default function AdminData({ onChanged }) {
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState('sample');
  const [status, setStatus] = useState(null);
  const [areas, setAreas] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.importStatus().then(setStatus).catch(() => setStatus(null));
    api.adminAreasSummary().then(setAreas).catch(() => setAreas([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = () => { load(); onChanged?.(); };

  async function distances() {
    setBusy(true);
    try { const r = await api.recalcDistances(); toast(`Distances updated for ${Math.max(r.road, r.health).toLocaleString()} facilities`); done(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function dropRoads() {
    if (!await confirm({ title: 'Remove all roads?', message: 'Facilities keep their current distances until you recalculate.', confirmLabel: 'Remove', danger: true })) return;
    await api.deleteRoads(); toast('Roads removed'); done();
  }
  const ta = areas?.find((a) => a.level === 'ta'); const dist = areas?.find((a) => a.level === 'district');
  const byType = status?.by_type || {};

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <PageHeader title="Data import" subtitle="Load your own facilities, flood zones, roads and boundaries from shapefiles, GeoJSON or CSV. Work through the tabs from left to right." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Building2 size={14} />Facilities</div><div className="mt-1 text-xl font-semibold">{status?.facilities?.toLocaleString() ?? '—'}</div>
          <div className="truncate text-[11px] text-gray-400">{Object.entries(byType).map(([t, n]) => `${n.toLocaleString()} ${(n === 1 ? FACILITY_TYPES[t]?.label : FACILITY_TYPES[t]?.plural)?.toLowerCase() || t}`).join(' · ') || 'none'}</div></div>
        <div className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Waves size={14} />Flood zones</div><div className="mt-1 text-xl font-semibold">{status?.flood_zones ?? '—'}</div><div className="text-[11px] text-gray-400">{status?.sample_flood_zones ? `${status.sample_flood_zones} placeholders` : 'polygons'}</div></div>
        <div className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><Route size={14} />Roads</div><div className="mt-1 text-xl font-semibold">{status?.roads?.toLocaleString() ?? '—'}</div><div className="text-[11px] text-gray-400">{status?.missing_road_distance ? `${status.missing_road_distance} facilities without road distance` : 'line segments'}</div></div>
        <div className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><MapPinned size={14} />Boundaries</div><div className="mt-1 text-xl font-semibold">{dist?.areas ?? 0} <span className="text-sm font-normal text-gray-400">districts</span></div><div className="text-[11px] text-gray-400">{ta?.areas ?? 0} Traditional Authorities</div></div>
      </div>

      <div className="scroll-thin mb-4 overflow-x-auto">
        <Seg value={tab} onChange={setTab} className="w-max" options={[['sample', '1. Remove sample data'], ['bounds', '2. Boundaries'], ['zones', '3. Flood zones'], ['facilities', '4. Facilities'], ['roads', '5. Roads']]} />
      </div>

      {tab === 'sample' && <SampleData status={status} onDone={done} />}
      {tab === 'bounds' && <section className="card p-5"><AdminBoundaries embedded onChanged={done} /></section>}
      {tab === 'zones' && <ImportShapes key="zones" kind="zones" status={status} onDone={done} />}
      {tab === 'facilities' && <ImportFacilities status={status} areas={areas} onDone={done} />}
      {tab === 'roads' && (
        <div className="space-y-4">
          <ImportShapes key="roads" kind="roads" status={status} onDone={done} />
          <section className="card flex flex-wrap items-center gap-3 p-5">
            <Ruler size={18} className="text-gray-500" />
            <div className="min-w-0 flex-1"><b>Distances</b><p className="text-xs text-gray-500">Distance from every facility to the nearest road and the nearest health facility, measured on the ground (metres). Runs automatically after importing facilities or roads.</p></div>
            {status?.roads > 0 && <button type="button" className="btn-danger" onClick={dropRoads}><Trash2 size={14} />Remove roads</button>}
            <button type="button" className="btn-dark" disabled={busy} onClick={distances}><Ruler size={15} />{busy ? 'Calculating…' : 'Recalculate now'}</button>
          </section>
        </div>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-gray-400"><Info size={12} className="mt-px shrink-0" />Shapefiles in any projection work if the .prj file is inside the zip. Large layers: simplify in QGIS first to keep each file under about 40 MB.</p>
    </div>
  );
}
