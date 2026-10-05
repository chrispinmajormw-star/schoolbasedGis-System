import { useRef, useState } from 'react';
import { Save, ImagePlus, Trash2 } from 'lucide-react';
import { api, resizeImage } from '../lib/api.js';
import { typeOf } from '../lib/facilityTypes.js';
import { useAuth } from '../lib/auth.jsx';
import { useFeedback } from '../lib/feedback.jsx';
import { Modal, Field, ErrorNote } from './ui.jsx';
import LocationPicker from './LocationPicker.jsx';
import { TypePicker, SubtypeInput, DistrictInput } from './TypePicker.jsx';

function initial(s) {
  const [lon, lat] = s?.geometry?.coordinates || [NaN, NaN];
  const p = s?.properties || {};
  return {
    facility_type: p.facility_type || 'school', name: p.name || '', code: p.code || '', district: p.district || '',
    subtype: p.subtype || '', people_served: p.people_served ?? '', staff: p.staff ?? '',
    contact_name: p.contact_name || '', contact_phone: p.contact_phone || '', notes: p.notes || '',
    dist_to_road_m: p.dist_to_road_m ?? '', dist_to_health_m: p.dist_to_health_m ?? '', lat, lon,
  };
}

/** Edit an existing facility (feature) or create one (feature = null, admin only). */
export default function FacilityEditor({ feature, onSaved, onClose, inline = false }) {
  const { isAdmin } = useAuth();
  const { toast } = useFeedback();
  const creating = !feature;
  const id = feature?.properties.id;
  const [f, setF] = useState(() => initial(feature));
  const [photo, setPhoto] = useState(feature?.properties.photo_url || null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);
  const T = typeOf(f.facility_type);
  const setVal = (k, v) => { setF((x) => ({ ...x, [k]: v })); setSaved(false); };
  const set = (k) => (e) => setVal(k, e.target.value);

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    const body = {
      subtype: f.subtype, people_served: f.people_served, staff: f.staff, contact_name: f.contact_name,
      contact_phone: f.contact_phone, notes: f.notes, lat: f.lat, lon: f.lon,
    };
    if (isAdmin) Object.assign(body, {
      facility_type: f.facility_type, name: f.name, code: f.code, district: f.district,
      dist_to_road_m: f.dist_to_road_m, dist_to_health_m: f.dist_to_health_m,
    });
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) {
      delete body.lat; delete body.lon;
      if (creating) { setError('Set the facility location on the map'); setSaving(false); return; }
    }
    try {
      if (creating) await api.createFacility(body); else await api.updateFacility(id, body);
      setSaved(true);
      toast(creating ? `${f.name} added to the map` : 'Facility information saved');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    try {
      const dataUrl = await resizeImage(file);
      const { photo_url: url } = await api.uploadPhoto(id, dataUrl);
      setPhoto(url);
      toast('Photo uploaded');
      onSaved?.({ keepOpen: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const form = (
    <form id="facility-form" onSubmit={submit} className="space-y-6">
      {isAdmin && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Facility type</h3>
          <TypePicker value={f.facility_type} onChange={(v) => setVal('facility_type', v)} />
          {!creating && f.facility_type !== feature.properties.facility_type && (
            <p className="mt-2 text-[11px] text-amber-700">Changing the type changes the preparedness checklist used for its score.</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={`${T.label} name`} className="sm:col-span-2"><input required value={f.name} onChange={set('name')} className="input" /></Field>
            <Field label={T.codeLabel}><input value={f.code} onChange={set('code')} className="input" /></Field>
            <Field label="District"><DistrictInput value={f.district} onChange={set('district')} /></Field>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold">Basic information</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Category"><SubtypeInput type={f.facility_type} value={f.subtype} onChange={set('subtype')} /></Field>
          <Field label={T.people}><input required type="number" inputMode="numeric" min="0" value={f.people_served} onChange={set('people_served')} className="input" /></Field>
          <Field label={T.staff}><input required type="number" inputMode="numeric" min="0" value={f.staff} onChange={set('staff')} className="input" /></Field>
          <Field label="Contact person" className="col-span-2 sm:col-span-1"><input value={f.contact_name} onChange={set('contact_name')} className="input" placeholder="Focal person" /></Field>
          <Field label="Phone" className="col-span-2 sm:col-span-2"><input type="tel" value={f.contact_phone} onChange={set('contact_phone')} className="input" placeholder="+265 …" /></Field>
          {isAdmin && (
            <>
              <Field label="Distance to road (m)" hint="From QGIS analysis"><input type="number" min="0" value={f.dist_to_road_m} onChange={set('dist_to_road_m')} className="input" /></Field>
              <Field label="Distance to health facility (m)" className="col-span-2 sm:col-span-2"><input type="number" min="0" value={f.dist_to_health_m} onChange={set('dist_to_health_m')} className="input" /></Field>
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Location</h3>
        <LocationPicker lat={f.lat} lon={f.lon} onChange={(lat, lon) => { setF((x) => ({ ...x, lat, lon })); setSaved(false); }} />
      </section>

      {!creating && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Photo</h3>
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
              {photo ? <img src={photo} alt={f.name} className="h-full w-full object-cover" /> : <ImagePlus size={22} className="text-gray-300" />}
            </div>
            <div className="space-y-1.5">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="btn-ghost">
                <ImagePlus size={15} />{uploading ? 'Uploading…' : photo ? 'Replace photo' : 'Add photo'}
              </button>
              <p className="text-[11px] text-gray-400">The building, evacuation route or assembly point. Uploads right away.</p>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold">Notes</h3>
        <textarea value={f.notes} onChange={set('notes')} rows={3} maxLength={2000} className="input"
          placeholder="e.g. Roof damaged in last floods; access road cut off when the river rises" />
      </section>

      <ErrorNote>{error}</ErrorNote>
    </form>
  );

  const actions = (
    <>
      {saved && <span className="mr-auto self-center text-xs font-medium text-green-600">Saved. The map is updated.</span>}
      {!inline && <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>}
      <button type="submit" form="facility-form" disabled={saving} className="btn-dark"><Save size={15} />{saving ? 'Saving…' : creating ? 'Create facility' : 'Save changes'}</button>
    </>
  );

  if (inline) {
    return (
      <div className="card p-5">
        {form}
        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">{actions}</div>
      </div>
    );
  }
  return (
    <Modal wide title={creating ? 'Add facility' : feature.properties.name} subtitle={creating ? 'Create a new community facility' : `Update ${T.label.toLowerCase()} information`} onClose={onClose} footer={actions}>
      {form}
    </Modal>
  );
}

export function DeleteFacilityButton({ feature, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const { toast, confirm } = useFeedback();
  return (
    <button type="button" className="btn-danger px-2.5 py-1.5" disabled={busy} title="Delete"
      onClick={async () => {
        const ok = await confirm({ title: `Delete ${feature.properties.name}?`, message: 'The facility and all its assessments are removed from the map. This cannot be undone.', confirmLabel: 'Delete facility', danger: true });
        if (!ok) return;
        setBusy(true);
        try { await api.deleteFacility(feature.properties.id); toast('Facility deleted'); onDeleted(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
      }}>
      <Trash2 size={14} />
    </button>
  );
}
