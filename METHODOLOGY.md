# Methodology: School Preparedness Index (SPI) and Risk Priority Score (RPS)

**Research question:** How can the preparedness of schools be systematically measured and spatially represented?

**Answer in one line:** Score ten observable indicators against a weighted, domain-structured checklist to get an SPI (0-100) per school, then place the schools on a map with hazard, exposure and accessibility layers so preparedness gaps can be compared across space.

## 1. Conceptual basis

The indicators follow the three pillars of the Comprehensive School Safety Framework (CSSF) and the school-level actions of the Sendai Framework for Disaster Risk Reduction 2015-2030:

1. Safe learning facilities
2. School disaster management (plans, drills, warning, response)
3. Risk reduction and resilience education (teacher training)

Risk is treated in the standard hazard x vulnerability x exposure form. Preparedness is the inverse of one component of vulnerability: a better-prepared school has lower vulnerability for the same hazard and the same number of learners.

## 2. Indicators and weights

| Domain | Indicator | Type | Weight |
|---|---|---|---|
| Planning and governance | Emergency plan | yes/no | 12 |
| Planning and governance | Emergency contacts | yes/no | 8 |
| Evacuation | Evacuation route | yes/no | 10 |
| Evacuation | Evacuation signage | yes/no | 5 |
| Evacuation | Safe assembly point | yes/no | 10 |
| Training and drills | Disaster drill conducted | yes/no | 12 |
| Training and drills | Teachers trained | % (0-100) | 12 |
| Warning and communication | Early warning mechanism | yes/no | 12 |
| Response equipment | First aid kit | yes/no | 10 |
| Response equipment | Fire extinguisher | yes/no | 9 |
| | **Total** | | **100** |

**Weight rationale (default set).** Weights reflect how much each item changes the outcome when a hazard strikes: plans, drills, training and early warning change behaviour of everyone on site, so they carry the most weight (12 each). Physical evacuation elements and first aid carry medium weight (10). Signage and contact lists are cheap, supporting measures (5-8).

**Important caveat.** These weights are expert-judgement defaults, not empirically calibrated values. Before the index is used for funding decisions they should be validated with a Delphi round or AHP pairwise comparison involving the Department of Disaster Management Affairs (DoDMA), the Ministry of Education, district education offices, head teachers and NGO partners. The weights live in the `indicator_weights` table, so they can be changed without touching code.

## 3. Calculation

Each binary indicator scores 1 (yes) or 0 (no). Teachers trained scores as a fraction (60% = 0.60).

```
SPI = 100 x  sum( weight_i x score_i ) / sum( weight_i )
```

**Worked example (School A):** plan 12 + route 10 + assembly point 10 + drill 12 + early warning 12 + contacts 8 + first aid 10 = 74; teachers trained 12 x 0.60 = 7.2; signage 0 and extinguisher 0. SPI = **81.2%**.

The 72% in the brief was illustrative. With equal weights the same School A scores 76%, so the choice of weights matters, which is why the analysis script includes a sensitivity test.

## 4. Classes

| SPI | Class | Map colour |
|---|---|---|
| 80-100 | Higher preparedness | Green |
| 60-79.9 | Moderate | Yellow |
| below 60 | Lower | Red |
| none | Not yet assessed | Grey |

## 5. Risk Priority Score (RPS)

SPI alone says how prepared a school is, not where help is most urgent. The RPS combines it with spatial layers:

```
H = flood hazard level at the school location / 3        (0, 0.33, 0.67, 1)
V = 1 - SPI / 100                                       (vulnerability gap)
E = learners / maximum learners among all schools       (exposure)
A = 1 + 0.5 x min(distance to road, 10 km) / 10 km      (accessibility penalty, 1.0-1.5)

RPS = 100 x H x V x E x A / 1.5
```

A school outside any hazard zone gets RPS = 0 for that hazard; add further hazards (drought, cyclone, landslide) as separate layers and take the maximum or a weighted sum. The RPS is a ranking heuristic. Its multiplicative form and the accessibility factor should also be reviewed by stakeholders.

## 6. Spatial representation

- **Point layer:** each school coloured by SPI class, sized by learners.
- **Polygon layer:** flood hazard zones, shaded by level 1-3.
- **Overlay logic:** hazard level is attached to each school by a PostGIS `ST_Intersects` point-in-polygon test.
- **Accessibility:** distance to nearest road (and health facility) stored per school; compute these in QGIS using the "Distance to nearest hub" or "Join by nearest" tools against OpenStreetMap roads, then load the values.
- **Decision support:** the dashboard lists learners in flood zones attending lower-preparedness schools, and the top schools by RPS.

## 7. Validation plan

1. **Reliability:** Cronbach's alpha on the indicator set (`analysis/spi_analysis.py`).
2. **Weight sensitivity:** compare expert weights against equal weights and 1,000 random perturbations; report Spearman rank correlation and class changes.
3. **Field verification:** re-assess a random 10% of schools with a second assessor; report agreement per indicator (Cohen's kappa).
4. **Face validity:** review results with DoDMA and district officers.
5. **Data quality:** all assessments store assessor and date; the latest assessment per school feeds the map and history is kept.

## 8. Data sources to replace the sample data

- School register and learner numbers: Malawi Ministry of Education EMIS
- School coordinates: EMIS, or verified by GPS survey in the assessment visit
- Flood hazard: DoDMA / Department of Surveys / MASDAP, or global flood hazard products clipped to Malawi
- Roads and health facilities: OpenStreetMap, Ministry of Health facility register
- Population: WorldPop or census enumeration areas

The seed data in `database/seed.sql` is **fictional sample data** for testing the system only.
