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
import Settings from './components/Settings.jsx';
import HelpCenter from './components/HelpCenter.jsx';
import Priorities from './components/Priorities.jsx';
import WhatIf from './components/WhatIf.jsx';
import Scenario from './components/Scenario.jsx';
import Analysis from './components/Analysis.jsx';
import FloodReports from './components/FloodReports.jsx';
import ReportFlood from './components/ReportFlood.jsx';
import Actions, { isOverdue } from './components/Actions.jsx';
import DistrictBrief from './components/DistrictBrief.jsx';
import AdminBoundaries from './components/admin/AdminBoundaries.jsx';
import { floodAlerts, maxPeopleByType } from './lib/decision.js';
import { loadPrefs, savePrefs } from './lib/prefs.js';

const REFRESH_MS = 30000;

export default function App() {
  const { profile, isAdmin, recovering, ready, session } = useAuth();
  const { toast } = useFeedback();
  const [view, setView] = useState('map');
  const [facilities, setFacilities] = useState(null);
  const [hazards, setHazards] = useState(null);
  const [checklists, setChecklists] = useState(null);
  const [summary, setSummary] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [reports, setReports] = useState(null);
  const [districtAreas, setDistrictAreas] = useState(null);
  const [actions, setActions] = useState(null);
  const [pendingReports, setPendingReports] = useState(0);
  const [whatIf, setWhatIf] = useState(null); // facility id
  const [reporting, setReporting] = useState(false);
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
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [listOpen, setListOpen] = useState(prefs.showList);
  const [layers, setLayers] = useState({ flood: prefs.showFlood, facilities: true, learnersSize: prefs.sizeByPeople, mode: prefs.colourBy });

  // Save a preference and apply it right away where it affects the current screen
  const setPrefs = (patch) => {
    setPrefsState(savePrefs(patch));
    if ('showFlood' in patch) setLayers((l) => ({ ...l, flood: patch.showFlood }));
    if ('sizeByPeople' in patch) setLayers((l) => ({ ...l, learnersSize: patch.sizeByPeople }));
    if ('colourBy' in patch) setLayers((l) => ({ ...l, mode: patch.colourBy }));
    if ('showList' in patch) setListOpen(patch.showList);
  };

  const load = useCallback(async () => {
    try {
      const [f, h, c, sum] = await Promise.all([api.facilities(), api.hazards(), api.checklists(), api.summary()]);
      setFacilities(f); setHazards(h); setChecklists(c); setSummary(sum); setError('');
      // Decision-support data: optional, so the map still works if these fail
      const [a, r] = await Promise.allSettled([api.answers(), api.floodReports(14)]);
      setAnswers(a.status === 'fulfilled' ? a.value : {});
      setReports(r.status === 'fulfilled' ? r.value : { type: 'FeatureCollection', features: [] });
      setLastUpdated(new Date());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Initial load + keep the map current while managers update their facilities.
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!prefs.autoRefresh) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, prefs.autoRefresh]);

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

  // Admins: count sign-up requests and flood reports waiting for review
  useEffect(() => {
    if (!isAdmin) { setPendingCount(0); setPendingReports(0); return; }
    api.users().then((u) => setPendingCount(u.filter((x) => x.status === 'pending').length)).catch(() => {});
    api.allFloodReports().then((r) => setPendingReports(r.features.filter((x) => x.properties.status === 'pending').length)).catch(() => {});
  }, [isAdmin, refreshKey]);

  // District boundaries (uploaded by an admin) for map shading
  const loadAreas = useCallback(() => api.adminAreas('district').then(setDistrictAreas).catch(() => setDistrictAreas(null)), []);
  useEffect(() => { loadAreas(); }, [loadAreas]);

  // Action tracker (signed-in, active accounts)
  const profileActive = profile?.status === 'active';
  const loadActions = useCallback(() => {
    if (!profileActive) { setActions(null); return; }
    api.actions().then(setActions).catch(() => setActions([]));
  }, [profileActive]);
  useEffect(() => { loadActions(); }, [loadActions, refreshKey]);

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
  const alerts = useMemo(() => floodAlerts(facilities?.features, reports), [facilities, reports]);
  const maxPeople = useMemo(() => maxPeopleByType(facilities?.features), [facilities]);
  const overdueCount = useMemo(() => (actions || []).filter(isOverdue).length, [actions]);
  const myAlert = mine ? alerts.get(mine.properties.id) : null;
  const assess = (id) => setAssessing(id);

  // Map search looks through every facility; clear the type filter if the pick is hidden by it
  const pickFromSearch = (id) => {
    if (typeFilter !== 'all' && byId.get(id)?.properties.facility_type !== typeFilter) setTypeFilter('all');
    setSelected(id);
  };
  const showOnMap = (id) => { setSelected(id); setTypeFilter('all'); setView('map'); };

  return (
    <div className="flex h-full flex-col md:flex-row md:gap-3 md:p-3">
      <Sidebar view={view} setView={setView} onSignIn={() => setAuthOpen('signin')} onJoin={() => setAuthOpen('register')}
        needsAttention={mineStale} staleCount={isAdmin ? staleCount : 0} pendingCount={pendingCount}
        reportBadge={isAdmin ? pendingReports : myAlert ? '!' : 0} overdueCount={overdueCount}
        collapsed={prefs.sidebarCollapsed} onCollapse={(v) => setPrefs({ sidebarCollapsed: v })} />

      <main className="relative min-h-0 flex-1 overflow-y-auto bg-white md:overflow-hidden md:rounded-2xl md:shadow-card">
        {error && (
          <div className="absolute inset-x-3 top-3 z-[1500] flex items-center gap-3 rounded-xl bg-red-50 px-4 py-2.5 text-red-700 shadow-card">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={load} className="btn-ghost px-2.5 py-1"><RefreshCw size={14} />Retry</button>
          </div>
        )}

        {view === 'map' && (
          <div className="flex flex-col md:h-full md:flex-row">
            <div className={`order-2 min-h-0 md:order-1 ${listOpen ? 'flex' : 'flex md:hidden'}`}>
              <FacilityList facilities={facilities} typeFilter={typeFilter} setTypeFilter={setTypeFilter} selectedId={selected} onSelect={setSelected}
                onAdd={() => setEditing('new')} onEditMine={() => setView('my-facility')} onJoin={() => setAuthOpen('register')}
                lastUpdated={lastUpdated} onRefresh={load} onHide={() => setListOpen(false)} />
            </div>
            <div className="relative order-1 h-[58vh] shrink-0 md:order-2 md:h-auto md:flex-1 md:shrink">
              <MapView key={prefs.basemap} facilities={visible} hazards={hazards} selected={selected} onSelect={setSelected} layers={layers} setLayers={setLayers}
                initialBase={prefs.basemap} onShowList={listOpen ? undefined : () => setListOpen(true)}
                allFacilities={facilities} onPick={pickFromSearch} reports={reports} alerts={alerts} districtAreas={districtAreas}
                onReport={() => setReporting(true)} />
              {selectedProps && (
                <div className={`pointer-events-none absolute inset-x-3 bottom-3 z-[1000] sm:bottom-auto sm:right-auto sm:top-16`}>
                  <FacilityCard facility={selectedProps} checklist={checklistFor(selectedProps)} refreshKey={refreshKey} onClose={() => setSelected(null)}
                    onEdit={() => setEditing(selectedProps.id)} onAssess={() => setAssessing(selectedProps.id)}
                    alert={alerts.get(selectedProps.id)} onWhatIf={() => setWhatIf(selectedProps.id)} />
                </div>
              )}
            </div>
          </div>
        )}
        {view === 'dashboard' && <Dashboard summary={summary} facilities={facilities} refreshKey={refreshKey} onPick={showOnMap} alertCount={alerts.size} go={setView} />}
        {view === 'priorities' && (
          <Priorities facilities={facilities} checklists={checklists} answers={answers} onPick={showOnMap} onWhatIf={setWhatIf} onAssess={assess}
            onChanged={() => { load(); loadActions(); }} />
        )}
        {view === 'scenario' && <Scenario facilities={facilities} hazards={hazards} reports={reports} onPick={showOnMap} />}
        {view === 'analysis' && <Analysis facilities={facilities} checklists={checklists} answers={answers} districtAreas={districtAreas} alerts={alerts} onPick={showOnMap} />}
        {view === 'reports' && <FloodReports reports={reports} facilities={facilities} alerts={alerts} onReport={() => setReporting(true)} onPick={showOnMap} onChanged={load} refreshKey={refreshKey} />}
        {view === 'actions' && (
          <Actions actions={actions} facilities={facilities} checklists={checklists} answers={answers} onChanged={loadActions} onPick={showOnMap}
            onAssess={assess} onSignIn={() => setAuthOpen('signin')} />
        )}
        {view === 'brief' && <DistrictBrief facilities={facilities} checklists={checklists} answers={answers} actions={actions} alerts={alerts} />}
        {view === 'admin-boundaries' && isAdmin && <AdminBoundaries onChanged={() => { loadAreas(); load(); }} />}
        {view === 'about' && <About checklists={checklists} />}
        {view === 'settings' && <Settings prefs={prefs} setPrefs={setPrefs} />}
        {view === 'help' && <HelpCenter go={setView} onJoin={() => setAuthOpen('register')} />}
        {view === 'my-facility' && (
          <MyFacility feature={mine} onAssess={() => setAssessing(profile.facility_id)} onShow={() => showOnMap(profile.facility_id)} onSaved={load}
            alert={myAlert} onWhatIf={() => setWhatIf(profile.facility_id)} onReports={() => setView('reports')} />
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
      {whatIf && byId.get(whatIf) && checklists && (
        <WhatIf facility={byId.get(whatIf).properties} checklist={checklistFor(byId.get(whatIf).properties)} answers={answers ? (answers[whatIf] ?? null) : undefined}
          maxPeople={maxPeople[byId.get(whatIf).properties.facility_type]} onClose={() => setWhatIf(null)} onPlanned={loadActions} />
      )}
      {reporting && <ReportFlood onClose={() => setReporting(false)} onSent={load} />}
      {authOpen && <AuthPage key={authOpen} initial={authOpen} facilities={facilities} onClose={closeAuth} />}
      {recovering && <SetNewPassword />}
    </div>
  );
}
