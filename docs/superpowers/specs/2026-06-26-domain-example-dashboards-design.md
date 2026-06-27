# Domain-Specific Example Dashboards

**Issue:** #14 — Add domain-specific example dashboards to the gallery
**Date:** 2026-06-26
**Deferred:** #33 (remaining nav types), #34 (withAccess, joins, includes), #35 (map geo data loading), #36 (accumulate + expression for inline datasets)

## Problem

The gallery has 36 dashboards across 11 categories, almost all DevOps/monitoring-themed. The TS builder API is richer than what examples exercise:

- **Chart types** — pieChart, donut, areaChart, scatterChart have no standalone examples (Kitchensink shows them in isolation)
- **Navigation as primary UX** — Navigation Rebinding demonstrates all 8 nav types in a switching demo, but no example uses multi-page sidebar or tabs as the dominant navigation pattern for a real-world application
- **Layout** — grid() unused; all examples use rows/columns
- **Forms** — only Contact Manager demonstrates the form API
- **Filtering** — selfApply never used correctly (Kitchensink uses `selfapply` — wrong casing, silently ignored; runtime reads `selfApply` at `site.ts:487`)
- **Data operations** — groupByCalendar unused in any example
- **Containers** — panel() unused
- **Content** — markdown() used only in DevOps contexts (Podman Stats, Kepler Metrics)
- **Map** — broken; `registerMap()` never called (#35)

The gallery gives the impression this is a monitoring-only tool. Domain-specific dashboards fix this by demonstrating real-world use cases while systematically covering the feature gaps.

## Dual-Format Convention

Each dashboard has both `.dash.yaml` and `.ts` companion files:
- **YAML** is primary — it's what the gallery renders at runtime (discovered by `generate-samples.js`, loaded by `loadSite()`)
- **TS** is the programmatic equivalent — demonstrates the TypeScript builder API, compiled by webpack, displayed in the gallery's source panel

They must stay in sync — representing the same dashboard in two formats. The formats have different naming conventions:

| YAML | TS builder |
|------|-----------|
| `type: BARCHART` | `barChart()` |
| `subtype: COLUMN_STACKED` | `subtype: "column-stacked"` |
| `selfApply: true` | `selfApply: true` |
| `type: SELECTOR` / `subtype: SELECTOR_LABELS` | `selector()` / `subtype: "labels"` |

The mapping is documented in `displayer-desugar.ts`. Spec descriptions below use YAML conventions for field names since YAML is the primary format.

**YAML-only features:** Property substitution (`${name}` → value) runs in `parsePage()` during YAML parsing (`property-substitution.ts`). The TS builder creates components directly — no substitution pass. The `.ts` companion must hardcode the default property values where the YAML uses `${var}` references. The FIFA 2022 Goals `.ts` demonstrates this pattern: it passes `"${GoalsFunction}"` as a literal string because the gallery renders the YAML version, not the TS.

**Layout model divergence:** YAML supports only rows/columns (Bootstrap-style 12-column grid). The TS builder additionally supports `grid(cols, ...at())` for CSS grid positioning and `panel(title, ...children)` for titled card containers. When a dashboard uses `grid()`/`at()`/`panel()` in TS, the YAML companion uses rows/columns with `general.title` on each displayer instead. Both render correctly — the visual output is equivalent but the layout models are not semantically identical. Workforce Analytics is the primary example of this divergence.

## Design

### Structure

Four new category folders under `examples/dashboards/`. All data is inline. No changes to gallery infrastructure — `generate-samples.js` auto-discovers new dashboards.

```
dashboards/
  Sales/
    Sales Dashboard.dash.yaml
    Sales Dashboard.ts
  IoT/
    Fleet Monitor.dash.yaml
    Fleet Monitor.ts
  People/
    Workforce Analytics.dash.yaml
    Workforce Analytics.ts
  Clinical/
    Patient Tracker.dash.yaml
    Patient Tracker.ts
```

### Feature Coverage Matrix

YAML conventions shown; TS equivalents in parentheses where they differ.

| Feature | Sales | IoT | People | Clinical |
|---------|-------|-----|--------|----------|
| pieChart / donut | donut | — | donut + pie | pie |
| areaChart / AREA_STACKED (`"area-stacked"`) | — | area stacked | — | area |
| scatterChart | — | — | scatter | — |
| meterChart | — | meter | — | — |
| multi-page nav | sidebar (4pg) | sidebar (3pg) | — | tabs (3pg) |
| grid() layout | — | — | grid | — |
| panel() | — | — | panel | panel |
| forms + dataScope | — | — | — | all form types (see M4 note) |
| filter selfApply | selfApply | — | — | selfApply |
| filter chains | notif + listen | listen | notif + listen | notif + listen |
| groupByCalendar | MONTH, QUARTER | — | — | — |
| properties/vars | `${GoalsFunction}` | — | — | — |
| markdown() | — | — | — | markdown |
| zoom | — | zoom | — | — |
| csvExport | — | — | csvExport (table) | — |
| dark mode | — | dark | — | — |
| selector variant | SELECTOR_LABELS (`"labels"`) | — | SELECTOR_LABELS (`"labels"`) | dropdown |
| COLUMN_STACKED (`"column-stacked"`) | yes | — | yes | — |
| BAR (`"bar"`) horizontal | yes | — | yes | — |
| SMOOTH (`"smooth"`) | — | yes | — | — |
| table pagination | pageSize + sort | — | pageSize | pageSize + sort |
| column expressions | currency, date | battery % | currency, date | temp flag |

Every major feature gap is covered at least once, most twice across different domains.

---

## Dashboard 1: Sales Dashboard

**Format:** Multi-page, sidebar navigation (4 pages)
**Data:** 2 inline datasets

### Dataset: `sales_transactions` (~60 rows)

| Column | Type | Description |
|--------|------|-------------|
| id | NUMBER | Transaction ID |
| date | DATE | Transaction date, spanning 12 months |
| region | LABEL | EMEA, APAC, Americas, ANZ |
| rep | LABEL | 8-10 sales reps |
| product | LABEL | Product name |
| category | LABEL | Platform, Services, Support |
| amount | NUMBER | Deal value |
| quantity | NUMBER | Units |
| status | LABEL | Won, Lost, Pending (~60/25/15 ratio) |

Amounts vary by category — Platform deals are large/few, Support is small/many.

### Dataset: `pipeline` (~15 rows)

| Column | Type | Description |
|--------|------|-------------|
| deal | TEXT | Deal name |
| account | TEXT | Company name |
| stage | LABEL | Prospect, Qualified, Proposal, Negotiation, Closed |
| value | NUMBER | Deal value |
| probability | NUMBER | Close probability 0-100 |
| rep | LABEL | Assigned rep |
| closeDate | DATE | Expected close date |

### Properties

```yaml
properties:
    GoalsFunction: SUM
```

`${GoalsFunction}` is used in lookup function references, demonstrating property substitution — the same mechanism as the FIFA 2022 Goals dashboard. The substitution happens during YAML parsing (`parsePage()`). Note: the gallery's config bar only surfaces URL-like properties, so GoalsFunction is not interactively editable — it must be changed in the YAML `properties` block directly.

### Page 1 — Overview (default)

- **Row 1:** 4 metrics — Total Revenue (SUM amount WHERE status=Won), Won Deals (COUNT WHERE status=Won), Avg Deal Size (AVERAGE amount), Total Deals (COUNT)
- **Row 2, span 8+4:** barChart COLUMN_STACKED by region (stacks = category) | donut of revenue by category
- **Row 3:** selector SELECTOR_LABELS on `region`, selfApply: true + notification: true — filters all charts
- **Row 4, span 6+6:** lineChart of monthly revenue (groupByCalendar MONTH, `${GoalsFunction}` amount) | barChart of top reps sorted descending

### Page 2 — Pipeline

- **Row 1:** metric cards — Total Pipeline Value, Weighted Value, Avg Probability
- **Row 2:** table of pipeline data, sortable, pageSize 10
- **Row 3, span 6+6:** barChart BAR (horizontal) of pipeline by stage | donut of pipeline by rep

### Page 3 — Trends

- **Row 1, span 12:** lineChart SMOOTH of monthly revenue, zoom enabled
- **Row 2, span 6+6:** barChart quarterly revenue (groupByCalendar QUARTER) | barChart COLUMN_STACKED by category over months

### Page 4 — Deals

- Full transactions table, sortable, filter enabled + notification
- Column expressions: amount formatted `$#,###`, date formatted

### Navigation

Sidebar with 4 entries: Overview, Pipeline, Trends, Deals.

---

## Dashboard 2: IoT Fleet Monitor

**Format:** Multi-page, sidebar navigation (3 pages), dark mode
**Data:** 2 inline datasets

### Dataset: `sensor_readings` (~50 rows)

| Column | Type | Description |
|--------|------|-------------|
| timestamp | DATE | 24-hour span, irregular intervals |
| deviceId | LABEL | 6 devices |
| location | LABEL | Warehouse A/B, Factory Floor, Cold Storage, Loading Dock, Server Room |
| temperature | NUMBER | Realistic per-location (-18°C cold storage, 22°C server room) |
| humidity | NUMBER | % |
| pressure | NUMBER | hPa |
| battery | NUMBER | % declining over time |
| status | LABEL | Online, Warning, Offline |

Plain inline data — static sensor readings. The accumulate mechanism (`accumulate: true` + expression) only works with URL-based datasets (#36) — inline content re-parses the same data on each refresh cycle. No `refresh` on components — re-pushing identical cached data produces no visual change, just CPU overhead.

### Dataset: `devices` (~6 rows)

| Column | Type | Description |
|--------|------|-------------|
| deviceId | LABEL | Device ID |
| name | TEXT | Human-readable name |
| lat | NUMBER | Latitude |
| lon | NUMBER | Longitude |
| type | LABEL | Environmental, Industrial, Storage |
| installDate | DATE | Install date |

Plain inline data — static device registry. Lat/lon columns are included for documentation value and future use when map geo data loading is fixed (#35).

### Page 1 — Fleet Status (default)

- **Row 1:** 4 metrics — Devices Online, Avg Temperature, Avg Humidity, Low Battery Count
- **Row 2, span 8+4:** table of devices (deviceId, name, location, type, status), sortable, filter listening | 3 meterCharts stacked vertically — Temperature (end: 60, warning: 30, critical: 40), Humidity (end: 100, warning: 70, critical: 85), Pressure (end: 1060, warning: 1020, critical: 1040)
- **Row 3:** selector on `location`, notification: true

Note: mapChart MAP_MARKERS was originally planned here but deferred — map geo data loading is broken (#35, ARC42STORIES §12). The device table replaces it. When #35 is fixed, the table can be swapped for a map using the lat/lon columns already in the devices dataset.

### Page 2 — Sensor History

- **Row 1, span 12:** areaChart AREA_STACKED of temperature per device, zoom enabled
- **Row 2, span 6+6:** lineChart SMOOTH of humidity per device | areaChart of pressure per device
- **Row 3, span 12:** timeseries of battery level per device

### Page 3 — Device Detail

- **Row 1:** table of device registry, sortable, filter listening + notification
- **Row 2, span 6+6:** barChart of latest readings per device | donut of devices by type
- **Row 3:** table of all sensor readings, sortable, pageSize 10, battery formatted as `##%`

### Navigation

Sidebar with 3 entries: Fleet Status, Sensor History, Device Detail.

### Global settings

`mode: dark`, default chart height, grid lines off.

---

## Dashboard 3: Workforce Analytics (People)

**Format:** Single page, grid() layout
**Data:** 1 inline dataset

### Dataset: `employees` (~40 rows)

| Column | Type | Description |
|--------|------|-------------|
| id | NUMBER | Employee ID |
| name | TEXT | Full name |
| department | LABEL | Engineering, Product, Design, Marketing, Sales, Finance, HR, Operations |
| level | LABEL | Junior, Mid, Senior, Lead, Director |
| tenure | NUMBER | Years at company |
| salary | NUMBER | Annual salary, realistic by dept/level |
| rating | NUMBER | Performance rating 1-5 |
| location | LABEL | Office location |
| gender | LABEL | M, F, NB |
| startDate | DATE | Start date |

### Layout: CSS grid, 3×4

- **(0,0, 3,1) full width:** selector SELECTOR_LABELS on `department`, notification + filter enabled
- **(0,1, 1,1):** panel("Headcount") — donut by department, filter listening
- **(1,1, 1,1):** panel("Level Distribution") — barChart COLUMN_STACKED (depts × levels), filter listening
- **(2,1, 1,1):** panel("Avg Salary by Level") — barChart BAR (horizontal), sorted ascending, filter listening
- **(0,2, 2,1) spans 2 cols:** panel("Tenure vs Salary") — scatterChart (tenure × salary), filter listening
- **(2,2, 1,1):** panel("Rating Distribution") — pieChart, filter listening
- **(0,3, 3,1) full width:** table, sortable, pageSize 15, filter listening, csvExport: true, salary formatted `$#,###`

---

## Dashboard 4: Patient Tracker (Clinical)

**Format:** Multi-page, tabs navigation (3 pages)
**Data:** 2 inline datasets

### Dataset: `patients` (~25 rows)

| Column | Type | Description |
|--------|------|-------------|
| id | NUMBER | Patient ID |
| name | TEXT | Patient name |
| age | NUMBER | Age |
| gender | LABEL | M, F |
| ward | LABEL | ICU, General, Pediatrics, Maternity, Outpatient |
| diagnosis | LABEL | Pneumonia, Fracture, Post-Op, Diabetes, Asthma, etc. |
| admitDate | DATE | Admission date |
| status | LABEL | Stable (~60%), Monitoring (~25%), Critical (~15%) |
| doctor | TEXT | Attending doctor |
| notes | TEXT | Brief clinical notes |
| flagged | LABEL | true/false — flagged for review |

### Dataset: `vitals` (~60 rows)

| Column | Type | Description |
|--------|------|-------------|
| patientId | NUMBER | FK to patients |
| timestamp | DATE | 48-hour span, multiple readings per patient |
| heartRate | NUMBER | BPM (critical patients trending >100) |
| systolic | NUMBER | mmHg |
| diastolic | NUMBER | mmHg |
| temperature | NUMBER | °C (critical patients >38.5) |
| o2Saturation | NUMBER | % (critical patients <94) |

### Differentiation from Contact Manager (M4)

Both Clinical and Contact Manager demonstrate the form API, but Clinical adds:
- **Mixed editability** — readonly fields (name, age, admitDate) alongside editable fields (ward, status, doctor, notes, flagged), showing that forms can protect certain fields
- **Master-detail with cross-filtering** — table selection on Page 3 drives form population via filter notification → listening, unlike Contact Manager's tab-based page switch
- **Multi-dataset context** — forms are one page among three in a dashboard that also includes charts and vitals data, demonstrating forms as part of a larger analytical application rather than a standalone CRUD view

### Page 1 — Ward Overview (default tab)

- **Row 1:** 4 metrics — Total Patients, Critical Count, Avg Age, Avg Stay Length
- **Row 2:** selector dropdown on `ward`, selfApply: true + notification: true
- **Row 3, span 4+4+4:** pie by diagnosis | barChart patients by ward | donut by status
- **Row 4:** markdown component — ward protocol notes (demonstrates markdown builder in a non-DevOps context)

### Page 2 — Vitals Monitor

- **Row 1, span 12:** areaChart of heart rate over time per patient, filter listening
- **Row 2, span 6+6:** lineChart blood pressure (systolic + diastolic) | lineChart O2 saturation
- **Row 3, span 12:** table of all vitals, sortable, pageSize 10, temperature expression flags >38.5

### Page 3 — Patient Detail

- **Row 1:** panel("Patient Records") — table of patients, sortable, filter listening + notification
- **Row 2:** panel("Edit Patient") — forms bound via dataScope to `patients`, idColumn `id`:
  - textInput: name (readonly)
  - numberInput: age (readonly)
  - dropdown: ward (ICU, General, Pediatrics, Maternity, Outpatient)
  - dropdown: status (Stable, Monitoring, Critical)
  - textInput: doctor
  - textarea: notes (rows: 4)
  - datePicker: admitDate (readonly)
  - checkbox: flagged
  - save: trigger auto, delay 2000, adapter local

### Navigation

Tabs with 3 entries: Ward Overview, Vitals Monitor, Patient Detail.

---

## Data Strategy

All data inline as JSON arrays within the YAML `content` field. Target 30-80 rows per dataset. Data is domain-realistic — values correlate logically (salaries match levels, critical patients have abnormal vitals, IoT readings match locations). Trends and outliers exist so charts are visually meaningful.

Note: Live accumulation (new rows generated on refresh) only works with URL-based datasets — the inline accumulate + expression pipeline is broken (#36). All IoT data is static.

## Testing Strategy

Each dashboard serves as an integration test. The existing Playwright test infrastructure (`examples/tests/`) can be extended with a smoke test that loads each new dashboard and verifies it renders without errors. The `gallery.spec.ts` test already iterates over `samples.json` — new dashboards are automatically included.

Feature-specific assertions (e.g., "pie chart renders 5 slices", "filter click updates bar chart") would be per-dashboard tests added as follow-up work.

## No Infrastructure Changes

- `generate-samples.js` auto-discovers dashboards by scanning `dashboards/` — new folders are picked up automatically
- Gallery app (`app.js`) renders any category — no code changes needed
- Build scripts (`copy-dashboards.js`) copy all files under `dashboards/` — no changes needed
