import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, needsAssessment } from './lib/api.js';
import { useFeedback } from './lib/feedback.jsx';
import { useAuth } from './lib/auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import FacilityList from './components/FacilityList.jsx';
import MapView from './components/MapView.jsx';
import FacilityCard from './components/FacilityCard.jsx';
import Dashboard from './components/Dashboard.jsx';
import AssessmentForm from './components/AssessmentForm.jsx';
import FacilityEditor from './components/FacilityEditor.jsx';
import MyFacility from './components/MyFacility.jsx';
import About from './components/About.jsx';
import { SetNewPassword } from './components/Login.jsx';
import AuthPage from './components/AuthPage.jsx';
import AdminFacilities from './components/admin/AdminFacilities.jsx';
import AdminUsers from './components/admin/AdminUsers.jsx';

const REFRESH_MS = 30000;

export default function App() {
  const { profile, isAdmin, recovering, ready, session } = useAuth();
  const { toast } = useFeedback();
  const [view, setView] = useState('map');
  const [facilities, setFacilities] = useState(null);
  const [hazards, setHazards] = useState(null);
  const [checklists, setChecklists] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(() => {
    const m = /facility=(\d+)/.exec(window.location.hash);
    return m ? Number(m[1]) : null;
  });
  const [typeFilter, setTypeFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [editing, setEditing] = useState(null); // facility id | 'new' | null
  const [assessing, setAssessing] = useState(null); // facility id | null
  const [authOpen, setAuthOpen] = useState(null); // 'signin' | 'register' | null
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [layers, setLayers] = useState({ flood: true, facilities: true, learnersSize: true, mode: 'spi' });

  const load = useCallback(async () => {
    try {
      const [f, h, c, sum] = await Promise.all([api.facilities(), api.hazards(), api.checklists(), api.summary()]);
      setFacilities(f); setHazards(h); setChecklists(c); setSummary(sum); setError('');
      setLastUpdated(new Date());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Initial load + keep the map current while managers update their facilities.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // On entry, show the sign-in / join page unless already signed in, opening a shared
  // facility link, or the visitor chose to browse as a guest in this browser session.
  const [entryChecked, setEntryChecked] = useState(false);
  useEffect(() => {
    if (!ready || entryChecked) return;
    setEntryChecked(true);
    let guest = false;
    try { guest = sessionStorage.getItem('safecom.guest') === '1'; } catch { /* storage blocked */ }
    if (!session && !guest && !/facility=/.test(window.location.hash)) setAuthOpen('signin');
  }, [ready, entryChecked, session]);
  const closeAuth = () => {
    try { sessionStorage.setItem('safecom.guest', '1'); } catch { /* storage blocked */ }
    setAuthOpen(null);
  };

  // Admins: count sign-up requests waiting for activation
  useEffect(() => {
    if (!isAdmin) { setPendingCount(0); return; }
    api.users().then((u) => setPendingCount(u.filter((x) => x.status === 'pending').length)).catch(() => {});
  }, [isAdmin, refreshKey]);

  // Shareable link: #facility=<id>
  useEffect(() => {
    const hash = selected ? `#facility=${selected}` : '';
    if (window.location.hash !== hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }, [selected]);

  // Pages that need a role are not reachable after sign-out
  const isActiveManager = profile?.role === 'manager' && profile.status === 'active';
  useEffect(() => {
    if (!isAdmin && view.startsWith('admin')) setView('map');
    if (!isActiveManager && view === 'my-facility') setView('map');
  }, [isAdmin, isActiveManager, view]);

  const byId = useMemo(() => new Map((facilities?.features || []).map((f) => [f.properties.id, f])), [facilities]);
  const visible = useMemo(() => (typeFilter === 'all' || !facilities ? facilities
    : { ...facilities, features: facilities.features.filter((f) => f.properties.facility_type === typeFilter) }), [facilities, typeFilter]);
  const selectedProps = selected ? byId.get(selected)?.properties : null;
  const mine = isActiveManager && profile.facility_id ? byId.get(profile.facility_id) : null;
  const mineStale = mine && needsAssessment(mine.properties);
  const staleCount = useMemo(() => (facilities?.features || []).filter((f) => needsAssessment(f.properties)).length, [facilities]);
  const checklistFor = (p) => checklists?.[p.facility_type] || [];

  const showOnMap = (id) => { setSelected(id); setTypeFilter('all'); setView('map'); };

  return (
    <div className="flex h-full flex-col md:flex-row md:gap-3 md:p-3">
      <Sidebar view={view} setView={setView} onSignIn={() => setAuthOpen('signin')} onJoin={() => setAuthOpen('register')}
        needsAttention={mineStale} staleCount={isAdmin ? staleCount : 0} pendingCount={pendingCount} />

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
              <FacilityList facilities={facilities} typeFilter={typeFilter} setTypeFilter={setTypeFilter} selectedId={selected} onSelect={setSelected}
                onAdd={() => setEditing('new')} onEditMine={() => setView('my-facility')} onJoin={() => setAuthOpen('register')}
                lastUpdated={lastUpdated} onRefresh={load} />
            </div>
            <div className="relative order-1 h-[58vh] shrink-0 md:order-2 md:h-auto md:flex-1 md:shrink">
              <MapView facilities={visible} hazards={hazards} selected={selected} onSelect={setSelected} layers={layers} setLayers={setLayers} />
              {selectedProps && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] sm:bottom-auto sm:right-auto sm:top-3">
                  <FacilityCard facility={selectedProps} checklist={checklistFor(selectedProps)} refreshKey={refreshKey} onClose={() => setSelected(null)}
                    onEdit={() => setEditing(selectedProps.id)} onAssess={() => setAssessing(selectedProps.id)} />
                </div>
              )}
            </div>
          </div>
        )}
        {view === 'dashboard' && <Dashboard summary={summary} facilities={facilities} refreshKey={refreshKey} onPick={showOnMap} />}
        {view === 'about' && <About checklists={checklists} />}
        {view === 'my-facility' && (
          <MyFacility feature={mine} onAssess={() => setAssessing(profile.facility_id)} onShow={() => showOnMap(profile.facility_id)} onSaved={load} />
        )}
        {view === 'admin-facilities' && isAdmin && (
          <AdminFacilities facilities={facilities} onAdd={() => setEditing('new')} onEdit={setEditing} onAssess={setAssessing} onShow={showOnMap} onChanged={load} />
        )}
        {view === 'admin-users' && isAdmin && <AdminUsers facilities={facilities} onChanged={load} />}
      </main>

      {editing && (editing === 'new' || byId.get(editing)) && (
        <FacilityEditor feature={editing === 'new' ? null : byId.get(editing)} onClose={() => setEditing(null)}
          onSaved={(opts) => { load(); if (!opts?.keepOpen) setEditing(null); }} />
      )}
      {assessing && byId.get(assessing) && (
        <AssessmentForm facility={byId.get(assessing).properties} checklist={checklistFor(byId.get(assessing).properties)} onClose={() => setAssessing(null)}
          onSaved={(r) => { setAssessing(null); load(); toast(r?.spi !== undefined ? `Assessment saved · SPI is now ${r.spi}%` : 'Assessment saved'); }} />
      )}
      {authOpen && <AuthPage key={authOpen} initial={authOpen} facilities={facilities} onClose={closeAuth} />}
      {recovering && <SetNewPassword />}
    </div>
  );
}
