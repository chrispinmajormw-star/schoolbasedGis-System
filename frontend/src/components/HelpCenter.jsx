import { useMemo, useState } from 'react';
import {
  LifeBuoy, Search, ChevronDown, Rocket, Building2, ShieldCheck, Map as MapIcon, Wrench, Mail, UserPlus, ClipboardCheck, BookOpen, Target,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL;

// Each answer describes what SafeCom actually does today.
const TOPICS = [
  {
    key: 'start', title: 'Getting started', icon: Rocket,
    items: [
      ['What is SafeCom?', 'SafeCom (Safe Community) maps community facilities that people depend on during floods and other hazards: schools, evacuation centres, health facilities, markets, places of worship, community halls and water points. Each facility gets a Safety Preparedness Index (SPI) from 0 to 100, shown by the colour ring around its map marker.'],
      ['Is SafeCom an early warning system?', 'No. SafeCom is a preparedness and planning tool: it shows how ready community facilities are, where to invest, and what a flood would mean for facilities and shelters. It does not forecast floods or send warnings. For current flood warnings, follow official DCCMS and DoDMA announcements and your Area Civil Protection Committee.'],
      ['Do I need an account to use SafeCom?', 'No. Anyone can browse the map, the dashboard and the scores. You only need an account to update a facility. On the sign-in page, choose "Browse the map" to continue without signing in.'],
      ['How do I create an account?', 'Choose "Create account". Step 1: enter your phone, name, organisation or role, email and a password of at least 8 characters. Step 2: pick your facility from the list, or choose "Propose a new facility" and set its location. Step 3: check the summary and press "Request access".'],
      ['Why can I not edit anything after signing up?', 'New accounts wait for an administrator to check them, often by phone. While you wait, the side menu shows "Waiting for activation" and you can browse the map. Once you are activated, "My facility" appears in the menu.'],
      ['My facility is not on the list. What do I do?', 'During sign-up choose "Propose a new facility", pick its type, give its name and district, and set its location by tapping the map or using GPS while standing at the facility. It appears on the public map once an administrator approves it.'],
    ],
  },
  {
    key: 'managers', title: 'For facility managers', icon: Building2,
    items: [
      ['How do I update my facility information?', 'Open "My facility" from the menu, or use "Update my facility" under the facilities list. You can change the category, people served, staff, contact person, phone, location, photo and notes. Press "Save changes". The map updates straight away.'],
      ['How do I do a preparedness assessment?', 'Open "My facility" and choose "Update assessment". Tick each item your facility has and enter the percentage of staff trained. The score at the top updates as you go. Choose "Save assessment" and the map colour changes immediately.'],
      ['How often should we assess?', 'At least every 6 months, and after any flood or major change such as a drill, new equipment or training. Facilities with no assessment in 180 days are flagged "Needs assessment", and "My facility" shows a reminder.'],
      ['How do I correct my facility\'s location?', 'In "My facility", under Location, drag the pin, tap the map, or stand at the main entrance and choose "Use my GPS". Then save. Locations must be inside Malawi.'],
      ['Can I add a photo?', 'Yes. In "My facility", choose "Add photo". On a phone you can take one with the camera. Photos are reduced in size before uploading to save data, and they upload straight away.'],
      ['Can I update another facility?', 'No. A facility manager can only update the facility linked to their account. If you manage more than one, ask an administrator.'],
    ],
  },
  {
    key: 'scores', title: 'Map and scores', icon: MapIcon,
    items: [
      ['What do the marker colours mean?', 'The ring colour shows preparedness: green is High (80–100), yellow is Moderate (60–79), red is Low (below 60) and grey is Not assessed. The icon inside shows the facility type. Under Layers you can switch to colour by Risk priority instead.'],
      ['How is the SPI calculated?', 'Each facility answers a checklist: core items shared by every type, plus a few for its own type (for example backup power for health facilities). SPI = 100 × Σ(weight × score) ÷ Σ(weight). See "How SPI works" in the menu for every item and weight.'],
      ['What is the Risk Priority Score?', 'It combines the flood hazard level at the facility, how far it is from fully prepared, how many people it serves compared with facilities of the same type, and its distance to the nearest road. Higher means the facility should get support first. The top five are on the Dashboard.'],
      ['What are the blue shaded areas?', 'Flood hazard zones, shaded by level (low, medium, high). Turn them on or off under Layers on the map, or in Settings.'],
      ['How do I share a facility?', 'Select the facility, then press the link icon at the top of its card. The copied link opens SafeCom directly on that facility.'],
      ['Can I download the data?', 'Yes. "Download CSV" in the menu, or the download button above the facilities list, gives one row per facility with its scores and latest answers. It opens in Excel, R, Python or QGIS.'],
    ],
  },
  {
    key: 'decide', title: 'Decision support', icon: Target,
    items: [
      ['Which facilities should we help first?', 'Open "Priorities". "Act now" ranks assessed facilities by risk priority score and shows the missing items worth the most SPI points. "Assess first" lists facilities in flood zones that have never been assessed, so their risk is unknown.'],
      ['What does "What if…" do?', 'It lets you tick the improvements you are considering and shows the new SPI, preparedness class and risk score, plus the indicative cost, before any money is spent. Facility managers and administrators can save the ticked items straight into the action tracker.'],
      ['How does the budget planner choose actions?', 'Enter a budget in kwacha. SafeCom ranks every missing item by preparedness value per kwacha: SPI points gained × flood exposure × people served, divided by cost. It then picks from the top until the budget is used. Costs are indicative and administrators can change them under "Unit costs".'],
      ['How do I run a flood scenario?', 'Open "Flood scenario" and choose a flood extent: the mapped flood zones, an area you draw, a circle around a point, or recent verified flood reports. SafeCom lists affected facilities, shelter places lost, safe shelters within reach and whether there is a shortfall. Set "People needing shelter" when you have official figures.'],
      ['What is "Can shelter"?', 'The number of displaced people a school, church, hall or evacuation centre can host. Keep it up to date in facility information. Flood scenarios and district briefs use it to check shelter capacity.'],
      ['What do the gap heatmap and hotspots show?', 'The heatmap shows, for each district, the share of assessed facilities lacking each checklist item. Dark columns suit a district-wide programme. Hotspots use the Getis-Ord Gi* statistic to find clusters of low preparedness that are unlikely to be chance.'],
      ['What is flood history?', 'A record of floods that have already happened: where, when, how deep the water got, what was affected and which facility was flooded. Anyone can add one with "Record a past flood"; an administrator confirms it first. Flood history shows which facilities have flooded before, checks the flood hazard map (records outside the mapped zones, or flooded facilities mapped as safe), and lets you re-run a past flood in the scenario tool.'],
      ['How do I track progress?', 'The "Action tracker" lists every planned improvement with who is responsible, a due date, status and cost. Overdue actions are shown in red and counted in the menu. When an action is done, update the facility assessment so its SPI reflects it.'],
      ['How do I make a brief for a DCPC meeting?', 'Open "District brief", choose the district and press "Print / save as PDF". It covers key messages, priority facilities, the most common gaps, flood exposure, the SPI trend and the action plan.'],
    ],
  },
  {
    key: 'admins', title: 'For administrators', icon: ShieldCheck, adminOnly: true,
    items: [
      ['How do I activate a new account?', 'Open "User accounts". Requests appear at the top with the person\'s phone, organisation and facility. For a proposed facility, use "Check location" first. You can link the request to an existing facility instead. Then choose "Activate" or "Reject".'],
      ['How do I add a facility or an account myself?', '"Manage facilities" → "Add facility" creates a facility directly. "User accounts" → "Add user" creates an active account with a temporary password that you share with the person.'],
      ['Someone forgot their password.', 'They can use "Forgot password?" on the sign-in page. Or, in "User accounts", press the key icon to set a new temporary password and share it with them.'],
      ['How do I load my own data?', 'Open "Data import" and work through the tabs in order: 1. Remove sample data; 2. Boundaries (districts, then Traditional Authorities); 3. Flood zones; 4. Facilities (schools, health facilities and others, as points); 5. Roads. Each tab takes a zipped shapefile (.shp, .shx, .dbf and .prj together), a GeoJSON file, or for facilities a CSV with latitude and longitude. You choose which field holds the name, code, district and so on. Facilities whose code already exists are updated, not duplicated. Distances to the nearest road and health facility are calculated automatically.'],
      ['How do I review flood records?', 'Open "Flood history". New records wait under "To review". Call the person who added it if needed, then choose Confirm or Reject. Use the hazard map check to see where the flood hazard layer needs updating.'],
      ['How do I stop someone from editing?', 'In "User accounts", press the block icon to disable the account. They can still sign in and browse but cannot change anything. Use the same button to enable it again.'],
    ],
  },
  {
    key: 'trouble', title: 'Troubleshooting', icon: Wrench,
    items: [
      ['The map is slow or says it cannot reach the server.', 'The server sleeps when nobody has used it for a while, so the first visit can take up to a minute. Wait and press "Retry". If it keeps happening, check your internet connection.'],
      ['I forgot my password.', 'On the sign-in page, type your email and choose "Forgot password?". A reset link is sent to your email. If it does not arrive, check your spam folder or ask an administrator to reset it.'],
      ['My changes do not show for other people.', 'Changes are saved immediately. Other people\'s maps refresh every 30 seconds, or when they press "Live · updated" above the list. If live updates are off in Settings, refresh manually.'],
      ['"Waiting for activation" will not go away.', 'An administrator has not yet approved your request. Contact your district office or the SafeCom administrator, then sign out and in again once you are activated.'],
      ['Location: "permission was denied".', 'Your browser blocked GPS. Allow location for this site in the browser settings, or set the location by tapping the map.'],
    ],
  },
];

function Item({ q, a, open, onToggle }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-3 text-left text-[13px] font-medium hover:text-ink">
        {q}
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-4 pr-6 text-[13px] leading-relaxed text-gray-600">{a}</p>}
    </li>
  );
}

export default function HelpCenter({ go, onJoin }) {
  const { isAdmin, session, profile } = useAuth();
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('all');
  const [openKey, setOpenKey] = useState(null);

  const topics = TOPICS.filter((t) => !t.adminOnly || isAdmin);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => topics
    .filter((t) => topic === 'all' || t.key === topic)
    .map((t) => ({ ...t, items: t.items.filter(([qq, aa]) => !needle || `${qq} ${aa}`.toLowerCase().includes(needle)) }))
    .filter((t) => t.items.length), [topics, topic, needle]);

  const quick = [
    !session && { icon: UserPlus, title: 'Register your facility', text: 'Create an account and request access', action: onJoin },
    isAdmin && { icon: ShieldCheck, title: 'Review sign-ups', text: 'Activate or reject account requests', action: () => go('admin-users') },
    profile?.role === 'manager' && profile.status === 'active' && { icon: ClipboardCheck, title: 'Update my facility', text: 'Info, photo and assessment', action: () => go('my-facility') },
    { icon: MapIcon, title: 'Explore the map', text: 'Find facilities and their scores', action: () => go('map') },
    { icon: BookOpen, title: 'How SPI works', text: 'Every checklist item and weight', action: () => go('about') },
  ].filter(Boolean).slice(0, 3);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="auth-hero px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium">
            <LifeBuoy size={13} className="text-accent" />Help center
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">How can we help?</h1>
          <p className="mt-1 text-sm text-gray-300">Answers about accounts, updating your facility, the map and scores.</p>
          <div className="relative mt-5">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setOpenKey(null); }} placeholder="Search, e.g. password, assessment, location"
              className="h-12 w-full rounded-2xl border-0 bg-white pl-11 pr-4 text-[13px] text-gray-900 outline-none ring-4 ring-white/10 placeholder:text-gray-400" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {!needle && (
          <div className="grid gap-3 sm:grid-cols-3">
            {quick.map((c) => (
              <button key={c.title} type="button" onClick={c.action} className="card flex items-start gap-3 p-4 text-left transition hover:border-gray-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-ink"><c.icon size={17} /></span>
                <span><span className="block text-[13px] font-semibold">{c.title}</span><span className="text-[11px] text-gray-500">{c.text}</span></span>
              </button>
            ))}
          </div>
        )}

        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ key: 'all', title: 'All topics', icon: LifeBuoy }, ...topics].map((t) => (
            <button key={t.key} type="button" onClick={() => { setTopic(t.key); setOpenKey(null); }}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                topic === t.key ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
              <t.icon size={13} />{t.title}
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <div className="card p-8 text-center text-gray-500">
            No answers match “{q}”. Try another word{SUPPORT_EMAIL ? ', or contact support below' : ''}.
          </div>
        )}

        {shown.map((t) => (
          <section key={t.key} className="card px-5 pt-4">
            <h2 className="flex items-center gap-2 pb-1 font-semibold"><t.icon size={16} className="text-gray-400" />{t.title}</h2>
            <ul className="divide-y divide-gray-100">
              {t.items.map(([qq, aa]) => {
                const k = `${t.key}:${qq}`;
                return <Item key={k} q={qq} a={aa} open={openKey === k || (!!needle && shown.reduce((n, s) => n + s.items.length, 0) <= 3)}
                  onToggle={() => setOpenKey(openKey === k ? null : k)} />;
              })}
            </ul>
          </section>
        ))}

        <section className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-accent"><Mail size={18} /></span>
          <div className="flex-1">
            <h2 className="font-semibold">Still need help?</h2>
            <p className="text-xs text-gray-500">
              {SUPPORT_EMAIL
                ? 'Write to the SafeCom team and include your facility name and district.'
                : 'Contact your district DRM office or the SafeCom administrator who activated your account.'}
            </p>
          </div>
          {SUPPORT_EMAIL && <a href={`mailto:${SUPPORT_EMAIL}?subject=SafeCom%20help`} className="btn-dark"><Mail size={15} />Email support</a>}
        </section>
      </div>
    </div>
  );
}
