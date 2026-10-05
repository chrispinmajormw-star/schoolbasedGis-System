import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from './lib/api.js';
import { useAuth } from './lib/auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import SchoolList from './components/SchoolList.jsx';
import MapView from './components/MapView.jsx';
import SchoolCard from './components/SchoolCard.jsx';
import Dashboard from './components/Dashboard.jsx';
import AssessmentForm from './components/AssessmentForm.jsx';
import SchoolEditor from './components/SchoolEditor.jsx';
import MySchool from './components/MySchool.jsx';
import About from './components/About.jsx';
import Login, { SetNewPassword } from './components/Login.jsx';
import AdminSchools from './components/admin/AdminSchools.jsx';
import AdminUsers from './components/admin/AdminUsers.jsx';

const REFRESH_MS = 30000;

export default function App() {
  const { profile, isAdmin, recovering } = useAuth();
  const [view, setView] = useState('map');
  const [schools, setSchools] = useState(null);
  const [hazards, setHazards] = useState(null);
  const [weights, setWeights] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // school id | 'new' | null
  const [assessing, setAssessing] = useState(null); // school id | null
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [layers, setLayers] = useState({ flood: true, schools: true, learnersSize: true, mode: 'spi' });

  const load = useCallback(async () => {
    try {
      const [s, h, w, sum] = await Promise.all([api.schools(), api.hazards(), api.weights(), api.summary()]);
      setSchools(s); setHazards(h); setWeights(w); setSummary(sum); setError('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Initial load + keep the map current while others update their schools.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Admin-only pages are not reachable after sign-out
  useEffect(() => {
    if (!isAdmin && view.startsWith('admin')) setView('map');
    if (profile?.role !== 'school' && view === 'my-school') setView('map');
  }, [isAdmin, profile, view]);

  const byId = useMemo(() => new Map((schools?.features || []).map((f) => [f.properties.id, f])), [schools]);
  const selectedProps = selected ? byId.get(selected)?.properties : null;
  const mine = profile?.school_id ? byId.get(profile.school_id) : null;
  const mineStale = mine && (!mine.properties.assessed_on || (Date.now() - new Date(mine.properties.assessed_on)) / 864e5 > 180);

  const showOnMap = (id) => { setSelected(id); setView('map'); };

  return (
    <div className="flex h-full flex-col md:flex-row md:gap-3 md:p-3">
      <Sidebar view={view} setView={setView} onSignIn={() => setLoginOpen(true)} needsAttention={mineStale} />

      <main className="relative min-h-0 flex-1 overflow-y-auto bg-white md:overflow-hidden md:rounded-2xl md:shadow-card">
        {error && (
          <div className="absolute inset-x-3 top-3 z-[1500] flex items-center gap-3 rounded-xl bg-red-50 px-4 py-2.5 text-red-700 shadow-card">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={load} className="btn-ghost px-2.5 py-1"><RefreshCw size={14} />Retry</button>
          </div>
        )}

        {view === 'map' && (
          <div className="flex flex-col md:h-full md:flex-row">
            <div className="order-2 flex min-h-0 md:order-1">
              <SchoolList schools={schools} selectedId={selected} onSelect={setSelected}
                onAddSchool={() => setEditing('new')} onEditMine={() => setView('my-school')} onSignIn={() => setLoginOpen(true)} />
            </div>
            <div className="relative order-1 h-[58vh] shrink-0 md:order-2 md:h-auto md:flex-1 md:shrink">
              <MapView schools={schools} hazards={hazards} selected={selected} onSelect={setSelected} layers={layers} setLayers={setLayers} />
              {selectedProps && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] sm:bottom-auto sm:right-auto sm:top-3">
                  <SchoolCard school={selectedProps} weights={weights} refreshKey={refreshKey} onClose={() => setSelected(null)}
                    onEdit={() => setEditing(selectedProps.id)} onAssess={() => setAssessing(selectedProps.id)} />
                </div>
              )}
            </div>
          </div>
        )}
        {view === 'dashboard' && <Dashboard summary={summary} onPick={showOnMap} />}
        {view === 'about' && <About weights={weights} />}
        {view === 'my-school' && (
          <MySchool feature={mine} onAssess={() => setAssessing(profile.school_id)} onShow={() => showOnMap(profile.school_id)} onSaved={load} />
        )}
        {view === 'admin-schools' && isAdmin && (
          <AdminSchools schools={schools} onAdd={() => setEditing('new')} onEdit={setEditing} onAssess={setAssessing} onShow={showOnMap} onChanged={load} />
        )}
        {view === 'admin-users' && isAdmin && <AdminUsers schools={schools} />}
      </main>

      {editing && (editing === 'new' || byId.get(editing)) && (
        <SchoolEditor feature={editing === 'new' ? null : byId.get(editing)} onClose={() => setEditing(null)}
          onSaved={(opts) => { load(); if (!opts?.keepOpen) setEditing(null); }} />
      )}
      {assessing && byId.get(assessing) && (
        <AssessmentForm school={byId.get(assessing).properties} weights={weights} onClose={() => setAssessing(null)}
          onSaved={() => { setAssessing(null); load(); }} />
      )}
      {loginOpen && <Login onClose={() => setLoginOpen(false)} />}
      {recovering && <SetNewPassword />}
    </div>
  );
}
