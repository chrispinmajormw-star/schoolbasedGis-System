# Methodology: SafeCom (Safe Community)

**Mapping Community Safety & Resilience**: Safety Preparedness Index (SPI) and Risk Priority Score (RPS) for community facilities in Malawi

## 1. Purpose and research questions

**Main question:** How can the disaster preparedness of community facilities be systematically measured, kept up to date by the communities that run them, and represented spatially so that support can be prioritised?

**Sub-questions**

1. Which observable indicators describe the preparedness of a community facility, and which of them are common to all facility types?
2. How can one index stay comparable across facility types (schools, health facilities, markets, shelters, water points) while still reflecting what matters for each type?
3. How can preparedness be combined with hazard, exposure and accessibility layers to rank where support is most urgent?
4. Can facility managers reliably maintain this information through a crowdsourced web GIS with administrator verification?

**Approach in one line:** each facility is scored against a weighted checklist made of a shared core and a few type-specific items to give an SPI (0–100). Facilities are placed on a map with flood hazard, exposure and accessibility layers. Facility managers keep the data current, and administrators verify accounts and new facilities.

## 2. Conceptual basis

- **Risk framing.** Risk is treated in the standard *hazard × vulnerability × exposure* form. Preparedness is treated as the inverse of one component of vulnerability: for the same hazard and the same number of people, a better-prepared facility is less vulnerable.
- **Sendai Framework for Disaster Risk Reduction 2015–2030.** SafeCom operationalises Priority 4, *enhancing disaster preparedness for effective response*, at the level of individual community facilities.
- **Sector frameworks behind the type-specific items**:
  - **Schools:** the Comprehensive School Safety Framework (safe learning facilities, school disaster management, risk-reduction education).
  - **Health facilities:** the WHO/PAHO Hospital Safety Index concept of keeping critical services running during and after a hazard.
  - **Evacuation centres, places of worship and community halls used as shelters:** Sphere minimum standards for shelter and WASH, and camp coordination and camp management guidance.
  - **Water points:** water-safety principles (protecting the source, testing after floods, community management).
- **Community-based DRM.** Facility managers and committees report and update their own facility. This follows community-based disaster risk management practice and the national DRM system coordinated by the Department of Disaster Management Affairs (DoDMA).

## 3. Facility typology

| Type | Examples (category) | "People served" means | "Staff" means |
|---|---|---|---|
| School | Primary, secondary, tertiary, ECD | Learners | Teachers |
| Evacuation centre | Designated centre, temporary camp, relocation site | Shelter capacity (people) | Camp staff / volunteers |
| Health facility | Hospital, health centre, clinic, dispensary, health post | Catchment population | Health workers |
| Market | Daily, weekly | Traders and visitors per day | Market staff |
| Place of worship | Church, mosque | Congregation size | Leaders / staff |
| Community hall | Community hall, community or youth centre | Hall capacity (people) | Caretakers |
| Water point | Borehole, protected well, kiosk, communal tap | People served | Caretakers |

Facilities are points (WGS84, EPSG:4326). Each has a type, an optional official code (e.g. EMIS for schools, MHFR for health facilities), a district, contact details, an optional photo and free-text notes.

## 4. Indicators and weights

### 4.1 Core checklist (all facility types)

| Domain | Indicator | Type | Weight |
|---|---|---|---|
| Planning and governance | Emergency plan | yes/no | 12 |
| Planning and governance | Emergency contacts | yes/no | 8 |
| Evacuation | Evacuation route | yes/no | 10 |
| Evacuation | Evacuation signage | yes/no | 5 |
| Evacuation | Safe assembly point | yes/no | 10 |
| Training and drills | Disaster drill conducted | yes/no | 12 |
| Training and drills | Staff trained | % (0–100) | 12 |
| Warning and communication | Early warning mechanism | yes/no | 12 |
| Response equipment | First aid kit | yes/no | 10 |
| Response equipment | Fire extinguisher | yes/no | 9 |
| | **Core total** | | **100** |

**Weight rationale.** Items that change the behaviour of everyone on site carry the most weight (12 each): plans, drills, training and early warning. Physical evacuation elements and first aid carry medium weight (10). Signage and contact lists are cheap supporting measures (5–8).

### 4.2 Type-specific items and overrides

A type can **add** items, **relabel** a core item (for example "Teachers trained" for schools) or **switch off** a core item that does not apply (weight 0).

| Type | Added items (weight) | Switched off | Total weight |
|---|---|---|---|
| School | Learners taught flood and disaster safety (8) | none | 108 |
| Evacuation centre | Safe water and sanitation (10); food and relief items in stock (8); accessible for elderly and disabled people (6); lighting or backup power (6) | none | 130 |
| Health facility | Backup power / generator (10); emergency medicines and supplies (10); ambulance or referral transport (8); critical services above flood level (8) | none | 136 |
| Market | Working drainage (10); clear access and exit lanes (8); market disaster committee (8) | none | 126 |
| Place of worship | Ready to host evacuees (8); safe water and sanitation (8) | none | 116 |
| Community hall | Ready to host evacuees (8); safe water and sanitation (8) | none | 116 |
| Water point | Raised / protected from floodwater (12); water quality tested after floods (10); active water point committee (8); spare parts / repair arrangement (6) | Evacuation route, signage, assembly point, first aid kit, fire extinguisher | 92 |

**Comparability across types.** Because every SPI is a percentage of its own checklist, scores share the same 0–100 scale and class thresholds. The ten core items are measured the same way for every type, so cross-type statistics (Section 9) use the core items only, and type-specific items are analysed within each type.

**Important caveat.** All weights are expert-judgement defaults, not empirically calibrated values. Before the index informs funding or planning decisions, they should be validated with a Delphi round or AHP pairwise comparison. Panellists should include DoDMA, district councils (DoDMA desk officers and district education and health offices), the Ministries of Education and Health, facility managers and NGO partners. Weights are stored as data in the `indicator_weights` table, so they can be changed without touching code.

## 5. Calculation

Each yes/no item scores 1 or 0; percentage items score as a fraction (60% = 0.60). For facility type *t*, using only items with weight > 0:

```
SPI(t) = 100 × Σ(weight_i × score_i) / Σ(weight_i)
```

**Worked example 1: school.** Sample School A meets: emergency plan 12, contacts 8, route 10, assembly point 10, drill 12, early warning 12, first aid 10 (= 74). Teachers trained: 12 × 0.60 = 7.2. Signage, extinguisher and learner awareness: 0.
SPI = 100 × 81.2 / 108 = **75.2% (moderate)**. With equal weights the same school scores 69.1%. Both are moderate, but the gap shows the weights matter, which is why sensitivity testing is part of the validation (Section 9).

**Worked example 2: health facility.** Sample District Hospital meets all core items except 35% of staff untrained (core = 88 + 12 × 0.65 = 95.8), plus backup power 10, emergency stock 10 and referral transport 8 (= 28). Critical services are not above flood level.
SPI = 100 × 123.8 / 136 = **91.0% (high)**.

Only the most recent assessment of each facility feeds the map. Earlier assessments are kept for trend analysis.

## 6. Classes

| SPI | Class | Map colour |
|---|---|---|
| 80–100 | High preparedness | Green |
| 60–79.9 | Moderate | Yellow |
| below 60 | Low | Red |
| none | Not yet assessed | Grey |

An assessment older than **180 days** is flagged as "needs assessment", so the map does not rely on stale data.

## 7. Risk Priority Score (RPS)

SPI says how prepared a facility is, not where help is most urgent. The RPS combines it with spatial layers:

```
H = flood hazard level at the facility / 3                       (0, 0.33, 0.67, 1)
V = 1 − SPI / 100                                                (preparedness gap)
E = people served / maximum people served among facilities of the same type   (exposure)
A = 1 + 0.5 × min(distance to road, 10 km) / 10 km               (accessibility penalty, 1.0–1.5)

RPS = 100 × H × V × E × A / 1.5
```

- **Exposure is relative within each type.** Without this, a district hospital's catchment (tens of thousands of people) would push every school's exposure towards zero.
- **Facilities outside any hazard zone** get RPS = 0 for that hazard.
- **Further hazards** (drought, strong winds, landslides) can be added as separate layers and combined by maximum or weighted sum.
- **RPS is a ranking heuristic.** Its multiplicative form and accessibility factor should be reviewed with stakeholders.

## 8. Data collection and governance (crowdsourced with verification)

1. **Registration.** Anyone responsible for a facility (head teacher, health facility in-charge, market or water point committee member, camp manager) creates an account with name, phone, email and organisation or role. They either pick their facility from the map list or propose a new one with its location (GPS or a pin on the map).
2. **Verification.** New accounts are **pending** and cannot change any data. An administrator checks the person, for example by phone, and activates or rejects the request. A proposed facility appears on the public map only after activation. The administrator can also link the request to an existing facility instead.
3. **Maintenance.**
   - **Facility managers:** update only their own facility (people served, staff, contact details, location, photo, notes) and submit preparedness assessments.
   - **Administrators:** can edit every facility and manage accounts (activate, disable, reset passwords).
4. **Audit trail.** Every assessment stores the assessor, assessment date, the submitting account and a timestamp, and the date a facility's information was last edited is recorded too. The dashboard shows recent activity to administrators.
5. **Freshness.** Public maps refresh automatically every 30 seconds. Facilities whose last assessment is more than 180 days old, or that have never been assessed, appear in a "Needs assessment" list.

## 9. Spatial representation

- **Facility layer:** points showing a type icon, ringed by SPI class colour (or by RPS), optionally sized by people served. Users can filter by type, class and flood-zone status.
- **Hazard layer:** flood hazard zones shaded by level 1–3.
- **Overlay logic:** hazard level is attached to each facility with a PostGIS `ST_Intersects` point-in-polygon test, recalculated whenever a facility moves.
- **Accessibility:** distance to the nearest road and nearest health facility is stored per facility. It currently comes from QGIS nearest-neighbour analysis. A planned extension calculates both automatically in PostGIS from imported national road and health facility layers.
- **Administrative units (planned):** district and Traditional Authority will be assigned automatically from boundary polygons, allowing aggregation by TA.
- **Basemaps:** OpenStreetMap standard and Humanitarian (HOT) styles. No commercial keys are required.
- **Decision support:**
  - Dashboard totals and mean SPI.
  - People depending on low-SPI facilities in medium or high flood zones.
  - SPI by facility type and by district.
  - The five facilities with the highest RPS.
  - The "needs assessment" list.
  - SPI trend per facility.
  - CSV export for R, Python, Excel or QGIS.

## 10. Validation plan

1. **Internal consistency:** Cronbach's alpha on the 10 core items, for all facilities and per type with enough cases (`analysis/spi_analysis.py`).
2. **Weight sensitivity:**
   - Compare expert weights with equal weights, and run 1,000 random ±50% weight perturbations.
   - Report Spearman rank correlation and the share of facilities that change class.
3. **Inter-rater reliability:**
   - A second assessor independently re-assesses a random sample of about 10% of facilities, stratified by type.
   - Report agreement per indicator (Cohen's kappa) and for SPI (intraclass correlation).
4. **Self-report bias:**
   - Compare manager-submitted assessments with the independent re-assessments.
   - A systematic upward difference would indicate optimistic self-reporting and may justify periodic verification visits or photo evidence for key items.
5. **Face validity:** review rankings and maps with DoDMA, district councils and sector officers.
6. **Usability and participation:** track sign-ups, activation time, the share of facilities assessed and the share assessed within 180 days, by district and type. Optionally add a short usability questionnaire such as the System Usability Scale.

## 11. Limitations

- Weights are expert defaults until validated (Section 4).
- Self-reported data may be optimistic. Verification (Sections 8 and 10) reduces but does not remove this.
- Yes/no indicators record whether something exists, not its quality (for example, an emergency plan that is out of date).
- Flood layers in the sample database are coarse placeholders and must be replaced with official hazard maps.
- Exposure uses people served, not the number present at the moment a hazard strikes (for example, school hours or market days).
- Participation depends on internet access and digital literacy. Administrators can enter data on behalf of facilities to reduce this bias.

## 12. Data sources (to replace the sample data)

| Layer | Source |
|---|---|
| Schools, learners, teachers | Ministry of Education EMIS |
| Health facilities | Ministry of Health facility register (MHFR) |
| Markets, places of worship, community halls, water points | District councils, water point inventories, OpenStreetMap, field GPS survey |
| Evacuation centres | DoDMA and district civil protection committees |
| Flood hazard | DoDMA, Department of Surveys, MASDAP, or global flood hazard products clipped to Malawi |
| Districts and Traditional Authorities | National Statistical Office / Department of Surveys boundaries (also on HDX) |
| Roads | Roads Authority, OpenStreetMap |
| Population | NSO census, WorldPop |

The seed data in `database/seed.sql` is **fictional sample data** for testing the system only.

## 13. System implementation (summary)

- **Frontend:** React + Leaflet (OpenStreetMap tiles), hosted on Firebase Hosting (`safecom-malawi.web.app`).
- **API:** Node/Express on Render.
- **Database:** PostgreSQL/PostGIS on Supabase, with Supabase Auth for accounts and Supabase Storage for facility photos.
- **Implementation of the methods above:**
  - The checklist and weights live in `indicator_weights`.
  - The SPI is computed in the database by `compute_spi(answers, facility_type)`.
  - The `facility_status` view joins each facility's latest assessment, its hazard level, its class and its RPS.
- **Statistics:** `analysis/spi_analysis.py`.
