# Native Forms and Page Nesting Design

**Date:** 2026-06-18
**Status:** Approved
**Scope:** Native form components, data-bound pages, save system, master-detail, separate-file pages

## Problem

Melviz has no native form input components. The existing "Forms" page in the Kitchensink example uses `type: EXTERNAL` with `componentId: uniforms`, but the uniforms component is not registered — the page renders empty. The Developers Registration example references a dead external URL and uses the legacy `layoutTemplates` format.

Forms existed in the original DashBuilder. Melviz needs native form support that integrates with the existing component model rather than relying on external iframe-based form libraries.

Additionally, pages defined in separate files should be nestable within other pages. The lazy-page infrastructure is already implemented in `activation.ts` but the YAML parser does not yet desugar `src` on page references.

## Design Principles

1. **A form is a page** — no separate "form" abstraction. A page with a data scope and editable components *is* a form.
2. **The page binds, it doesn't distinguish** — a page connects data to components uniformly. Whether a component is editable (text-input) or display-only (metric chart) is the component's concern, not the page's.
3. **Datasets are the unified data model** — dataset column definitions are the type schema. A table shows many records; a form shows/edits one record. Same data, different cardinality.
4. **Save is a page-level concern** — dirty tracking, trigger configuration, and adapter selection live on the page, not on individual components.
5. **One data pipeline** — form inputs are data components with implicit lookups derived from `dataScope`. They participate in the same `casehub-data-request` / `handleDataRequest` / `pushData` pipeline as charts and tables. No second resolution track.
6. **YAML and TS parity** — every form expressible in YAML is expressible in TS, and vice versa. TS is expected to be promoted for forms due to type safety on field bindings.

## Architecture Overview

Three new layers on top of the existing melviz component model:

```
Parent Page (table of records)
    │ filter (row click → narrows dataset to 1 record)
    │ ↓ hierarchical filter propagation (new)
    ▼
Child Form Page (dataScope = dataset + idColumn)
    ├── text-input  ← casehub-text-input Web Component, implicit lookup, field: "name"
    ├── metric      ← existing casehub-metric, explicit lookup (unchanged)
    ├── dropdown    ← casehub-dropdown Web Component, implicit lookup + options resolution
    └── EditState   ← dirty tracking, save triggers, adapter dispatch
```

1. **Data scope on pages** — a page declares which dataset it's bound to and which column is the record identity.
2. **Form input components** — six new Web Components extending `CasehubElement`, registered in `ComponentTypeRegistry`, participating in the standard data pipeline.
3. **Save system** — `EditState` at page level in the runtime, `casehub-field-change` events, configurable triggers, pluggable adapters resolved by name.
4. **Hierarchical filter propagation** — child pages with `dataScope` inherit ancestor page filters for their dataset.

## Data Scope Model

A page declares its data scope to bind a dataset to its components. Form inputs reference columns by name via the `field` property.

### YAML

```yaml
datasets:
  - uuid: employees
    url: http://acme.com/employees
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: age
        type: NUMBER
      - id: department
        type: LABEL
      - id: salary
        type: NUMBER

pages:
  - name: Employee Form
    dataScope:
      dataset: employees
      idColumn: id
    save:
      trigger: auto
      delay: 3000
      adapter: rest
    components:
      - text-input:
          field: name
          label: Full Name
      - number-input:
          field: age
          label: Age
          min: 18
          max: 120
      - dropdown:
          field: department
          label: Department
          options:
            values: [Engineering, Sales, Marketing, HR]
      - displayer:
          type: METRIC
          lookup:
            uuid: employees
            group:
              - functions:
                  - source: salary
                    function: SUM
```

### TypeScript Equivalent

```typescript
page("Employee Form",
  textInput({ field: "name", label: "Full Name" }),
  numberInput({ field: "age", label: "Age", min: 18, max: 120 }),
  dropdown({
    field: "department",
    label: "Department",
    options: { values: ["Engineering", "Sales", "Marketing", "HR"] },
  }),
  metric({ lookup: createLookup("employees" as DataSetId, [...]) }),
  {
    dataScope: { dataset: "employees" as DataSetId, idColumn: "id" },
    save: { trigger: "auto", delay: 3000, adapter: "rest" },
  },
)
```

Note: `page()` uses a variadic signature `(name: string, ...args: (Component | PageOptions)[])`. Components are listed as separate arguments. `PageOptions` is the last argument, detected by `isPageOptions()`. No array wrapper.

### DataScope Type (model — `@casehub/ui`)

```typescript
export interface DataScopeRef {
  readonly $ref: string;  // "datasetId.columnId"
}

export interface DataScope {
  readonly dataset: DataSetId;
  readonly idColumn: string;
  readonly filter?: Readonly<Record<string, string | DataScopeRef>>;
}
```

Filter values can be `$ref` objects (runtime binding to a parent record's column) or plain strings (static filter, e.g. `{ status: "active" }`). When all filter entries are static strings, no parent record lookup is needed — the filters are applied directly as `EQUALS_TO` operations.

### SaveConfig Type (model — `@casehub/ui`)

```typescript
export interface SaveConfig {
  readonly trigger?: "auto" | "field" | "button" | "manual";
  readonly delay?: number;
  readonly adapter: string;
  readonly adapterConfig?: Readonly<Record<string, unknown>>;
}
```

`SaveConfig` is model-level — all fields are primitive types or simple unions. The runtime resolves `adapter` (a name) to a `SaveAdapter` implementation. `SaveAdapter` lives in `@casehub/runtime`, not in the model.

### PageProps Extension

```typescript
export interface PageProps {
  readonly name?: string;
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Readonly<Record<string, string>>;
  readonly dataScope?: DataScope;    // NEW
  readonly save?: SaveConfig;        // NEW
}
```

### Key Behaviours

- `dataScope.dataset` references a dataset by `DataSetId`.
- `dataScope.idColumn` identifies which column is the record's primary key. Both the REST adapter (URL construction) and the local adapter (update-in-place) use this.
- Form inputs use `field` to bind to a column in the scoped dataset.
- Display-only components (existing displayers) continue using `lookup` — they coexist on the same page.
- When a parent filter narrows the dataset to one record, form inputs show/edit that record's field values.
- Without a filter (full dataset), default behaviour is to show the first record. Future work may add record navigation controls.
- If `dataScope.dataset` is unresolvable (no ancestor page defines a dataset with that uuid in its `datasets` array), form inputs receive the same error treatment as data components with unresolvable lookups: `element.error` is set via `data-pipeline.ts:91-93` (`Dataset "..." not found in scope for page "..."`). No crash.

## Form Input Data Resolution

Form inputs are data components. They participate in the same pipeline as charts and tables — no second resolution track.

### Implicit Lookup

When the runtime activates a form input component on a page with `dataScope`, it constructs an implicit `DataSetLookup`:

```typescript
const implicitLookup: DataSetLookup = {
  dataSetId: page.dataScope.dataset,
  operations: [],   // no ops — ancestor filters provide row selection
};
```

The runtime injects the implicit lookup onto the form input element during activation — `vizEl.lookup = implicitLookup` — before appending it to the DOM. This ensures the element has a lookup by the time `connectedCallback` fires. The element dispatches `casehub-data-request` with this lookup, identical to how existing viz components dispatch with `this.props.lookup`. The form input is registered in `ComponentRegistry` with this implicit lookup as `originalLookup`. The runtime resolves the dataset, applies ancestor filters (§ Hierarchical Filter Propagation), and pushes the result via `element.dataSet`.

The `field` property then selects which column to render from the pushed dataset. This is a rendering concern — the data pipeline pushes the full (filtered) dataset; the component extracts its column.

### Classification in Activation Model

The `DATA_COMPONENT_TYPES` set in `activation.ts` gains six entries:

```typescript
const DATA_COMPONENT_TYPES = new Set([
  // existing
  "bar-chart", "line-chart", "area-chart", "pie-chart",
  "scatter-chart", "bubble-chart", "timeseries", "table",
  "metric", "meter", "selector", "map", "iframe-plugin",
  // new form inputs
  "text-input", "number-input", "dropdown", "checkbox",
  "date-picker", "textarea",
]);
```

Tag rule follows the existing convention: `"casehub-" + component.type` → `casehub-text-input`, `casehub-number-input`, etc.

## Hierarchical Filter Propagation

### The Problem

The cross-filter system is page-scoped. `getActiveFilterOps(filterState, pagePath, group)` looks up filters for exactly one `pagePath`. `updateFilter()` stores them keyed by `pagePath`. When a table on pagePath `"Employee List"` emits a filter, form inputs on pagePath `"Employee List/Employee Form"` don't see it — different pagePath, no match.

### Solution: Two-Part Hierarchy

**Pull side — ancestor filter collection:**

When `pushData` resolves data for a component on a page with `dataScope`, it collects filters from ancestor pagePaths, not just the component's own pagePath:

```typescript
function collectAncestorFilterOps(
  filterState: FilterState,
  pagePath: string,
  group: string | undefined,
): DataSetOp[] {
  const ops: DataSetOp[] = [];
  let path: string | undefined = pagePath;
  while (path !== undefined) {
    ops.push(...getActiveFilterOps(filterState, path, group));
    const lastSlash = path.lastIndexOf("/");
    path = lastSlash > 0 ? path.substring(0, lastSlash) : (path === "" ? undefined : "");
  }
  return ops;
}
```

This is used instead of `getActiveFilterOps` when the component's page has a `dataScope`. The existing per-pagePath resolution for regular data components is unchanged.

**Push side — child page re-resolution:**

When the `casehub-filter` handler in `site.ts` processes a filter event, after re-pushing data to same-page components (existing behaviour), it also iterates components whose `pagePath` is a descendant of the emitting page's `pagePath` AND whose page has a `dataScope`:

```typescript
// After same-page re-push (existing)...
for (const [id, candidate] of registry) {
  if (!candidate.pagePath.startsWith(entry.pagePath + "/")) continue;
  if (!hasDataScope(candidate.pagePath)) continue;
  pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
}
```

This requires the runtime to track which pagePaths have `dataScope` — a `DataScopeRegistry`:

```typescript
type DataScopeRegistry = Map<string, DataScope>;  // pagePath → DataScope
```

Populated during page activation when `PageProps.dataScope` is present.

### Interaction with Existing Filtering

The filter resolution strategy depends on how the page declares its data linkage:

| Page configuration | Ancestor filter resolution | Rationale |
|---|---|---|
| `dataScope` without `filter` | `collectAncestorFilterOps` (walk up pagePath hierarchy) | Same dataset as parent — direct propagation is correct |
| `dataScope` with `filter` (`$ref` entries) | `$ref`-derived `FilterOp`s only — ancestor collection **disabled** | Cross-dataset join — `$ref` translates the parent's record selection into the child's filter context. Raw ancestor propagation would apply the parent dataset's column filters to the child dataset, producing incorrect results (e.g. applying `employees.id = 42` to the `projects` dataset would filter to `projects.id = 42` instead of all projects for employee 42). |
| No `dataScope` | `getActiveFilterOps` (existing same-page behaviour) | No change |

In all cases, the page's **own** interactive filters (from components on that page, stored under the page's own pagePath) are still applied normally.

### Column Mismatch Behaviour (dataScope without filter only)

When ancestor filter collection is active (dataScope without filter), `collectAncestorFilterOps` collects ALL filters from ALL ancestors regardless of which dataset they were originally applied to. In the common master-detail case (parent and child reference the same dataset), columns always match. When an ancestor filter references a column not present in the child's dataset, `row.cell(columnId)` in `filter-eval.ts` throws `DataSetError("UNKNOWN_COLUMN")`, caught by `pushData`'s try/catch, setting `element.error`. For pages where ancestor pages have multiple datasets with conflicting filter columns, use filter groups (`filter.group`) to scope which filters propagate.

## DataScope Binding (Foreign-Key Joins)

### The Concept

`dataScope.filter` declares a foreign-key relationship binding one dataset to a record in another. This is distinct from interactive cross-filtering (user-driven, same-page) and from `DataSetLookup` filter operations (within one dataset). It is a declarative join condition at the page level.

### Syntax

Uses `$ref` object syntax to distinguish from parse-time `${property}` substitution:

```yaml
- name: Employee Projects
  dataScope:
    dataset: projects
    idColumn: id
    filter:
      employee_id:
        $ref: employees.id
```

The `$ref` value is `datasetId.columnId` — it references the current record's column value in the parent page's dataset.

Parse-time `${name}` (from root `properties`) is string substitution resolved during YAML parsing. `$ref` is a runtime binding resolved when the parent's record selection changes. The object form makes parsing unambiguous.

### Semantics

| Question | Answer |
|----------|--------|
| When is the filter evaluated? | On child page activation AND whenever the parent's record selection changes (parent filter change triggers child re-resolution via hierarchical propagation). |
| What if the parent has no current record? | Child page receives an empty dataset. Form inputs render in empty state (no values). |
| Multiple parent columns? | Yes — the filter map can reference multiple parent fields: `{ employee_id: { $ref: employees.id }, department: { $ref: employees.dept } }`. |
| Composable with interactive filtering? | Yes — `$ref` bindings narrow the dataset first. Interactive cross-filters on the child page further narrow within that subset. |

### Resolution

The runtime resolves `$ref` bindings at data resolution time:

1. Walk up to the parent page's `dataScope`.
2. Obtain the parent's current record. This is a **computed value**, not a stored one: construct a `DataSetLookup` for the parent's `dataScope.dataset`, apply the parent's own ancestor filters via `collectAncestorFilterOps`, call `manager.lookup()`, and take the first row of the result. For deeply nested forms, each level re-queries — performance implications should be considered if many nesting levels are used.
3. Extract the referenced column value from the parent record.
4. Construct a `FilterOp` with `EQUALS_TO` on the child's column.
5. Prepend to the child's implicit lookup operations.

If the parent record is unavailable (no parent dataScope, parent dataset is empty, or parent dataset is unresolvable), the child receives an empty dataset.

Circular `$ref` chains (page A's `$ref` points to page B's dataset, page B's `$ref` points to page A's dataset) are detected at resolution time via a visited-pages set. When a cycle is detected, resolution short-circuits and produces an empty dataset.

## Form Input Components

Six native component types for the first cut, covering the four column types (LABEL, NUMBER, DATE, TEXT) plus boolean.

### Web Component Architecture

All form inputs extend `CasehubElement` and participate in the standard lifecycle:

```
connectedCallback → dispatchEvent("casehub-data-request") → runtime pushes dataSet
    → component renders field from dataSet using field property
    → user edits → dispatchEvent("casehub-field-change") → runtime updates EditState
```

Form inputs differ from viz components in one way: they also emit `casehub-field-change` events (the write path). The read path is identical.

```typescript
interface CasehubFieldChangeDetail {
  readonly field: string;
  readonly value: unknown;
  readonly committed: boolean;  // false = in-progress (typing), true = finalized (blur/enter)
}
```

### ComponentTypeRegistry Additions

```typescript
export interface ComponentTypeRegistry extends BaseRegistry {
  // ... existing entries ...
  "text-input": TextInputProps;
  "number-input": NumberInputProps;
  "dropdown": DropdownProps;
  "checkbox": CheckboxProps;
  "date-picker": DatePickerProps;
  "textarea": TextareaProps;
}
```

Plus type guards following the existing `c is Component & { props: XyzProps }` pattern.

### Props Interfaces

```typescript
interface FormInputCommon {
  readonly field: string;
  readonly label?: string;
  readonly required?: boolean;
  readonly readonly?: boolean;
}

export interface TextInputProps extends FormInputCommon {
  readonly placeholder?: string;
  readonly maxLength?: number;
}

export interface NumberInputProps extends FormInputCommon {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface DropdownProps extends FormInputCommon {
  readonly options: FixedOptions | DataSetOptions;
}

interface FixedOptions {
  readonly values: readonly string[];
}

interface DataSetOptions {
  readonly dataset: DataSetId;
  readonly labelColumn: string;
  readonly valueColumn: string;
}

export interface CheckboxProps extends FormInputCommon {}

export interface DatePickerProps extends FormInputCommon {
  readonly min?: string;  // ISO 8601 date
  readonly max?: string;
}

export interface TextareaProps extends FormInputCommon {
  readonly rows?: number;
  readonly maxLength?: number;
}
```

Note: Form input props do NOT extend `DataComponentCommon` (which requires `lookup`). Form inputs have no `lookup` — their implicit lookup is derived from `dataScope` at activation time by the runtime. They are data components by virtue of being in `DATA_COMPONENT_TYPES` and receiving data via the activation callback, not by carrying a lookup in their props.

### Editability Requires Save

Editability requires both the component capability (`readonly: false`) AND the page declaring a `save` configuration. If a page has `dataScope` and form inputs but no `save` block, all form inputs are **implicitly read-only** regardless of their `readonly` prop. Without a save mechanism, `casehub-field-change` events are not wired, `EditState` is not tracked, and user input is not accepted. This prevents silent data loss from accumulated-but-never-flushed dirty state.

To enable editing with external save control, declare `save: { trigger: "manual", adapter: "local" }`. This forces every editable form to be explicit about its save strategy.

### Form Inputs Without DataScope

A form input component on a page without `dataScope` is a configuration error. The runtime cannot construct an implicit lookup without a dataset reference. During activation, `element.error` is set (`"Form input requires page dataScope"`), same treatment as an unresolvable dataset.

### YAML Shorthands

```yaml
- text-input:
    field: name
    label: Full Name
```

### Desugar Rule (component-desugar.ts)

Each form input shorthand desugars to a component with the corresponding type:

```
text-input: { field: name, label: "Full Name" }
→ { type: "text-input", props: { field: "name", label: "Full Name" } }
```

Same pattern for all six types. Added to `desugarComponent()` alongside the existing `html:`, `markdown:`, `title:` shorthand checks.

### Type Coercion Rules

Form inputs bridge between dataset column types (string representations) and native input values:

| Input Type | Column Type | Read (dataset → input) | Write (input → dataset) |
|------------|-------------|----------------------|------------------------|
| text-input | TEXT, LABEL | Direct string | Direct string |
| number-input | NUMBER | `parseFloat(value)`. NaN → empty. | `String(value)`. Empty → `null`. |
| dropdown | LABEL | Match against option values | Selected value as string |
| checkbox | LABEL | `"true"` (case-insensitive) → checked. All else → unchecked. | `"true"` / `"false"` |
| date-picker | DATE | ISO 8601 string → Date input value | Date input value → ISO 8601 string |
| textarea | TEXT | Direct string | Direct string |

### Dropdown Options Resolution

A dropdown has a dual data dependency when using dataset-sourced options:

1. **Primary data** (current field value) — from the page's `dataScope` via the standard pipeline.
2. **Options data** (dropdown choices) — from a secondary dataset.

The options dataset is resolved **at activation time** as reference data — a one-shot fetch via `resolveExternalDataSet()`, not reactive to filters. The resolved options are stored on the component and do not change when filters change. Cascading dropdowns (reactive options filtered by another field's value) are future work.

## Save System

### EditState (Dirty Buffer)

Lives at the page level in the runtime, alongside `FilterState`:

```typescript
// pagePath → fieldId → dirty value
export type EditState = Map<string, Map<string, unknown>>;

export function createEditState(): EditState {
  return new Map();
}
```

Form inputs dispatch `casehub-field-change` events. The runtime's event handler in `site.ts` updates `EditState`:

```typescript
target.addEventListener("casehub-field-change", ((e: Event) => {
  const detail = (e as CustomEvent<CasehubFieldChangeDetail>).detail;
  const componentId = findComponentId(e);
  const entry = registry.get(componentId);
  if (!entry) return;

  updateEditState(editState, entry.pagePath, detail.field, detail.value);
  fireSaveTrigger(entry.pagePath, detail.committed);
}) as EventListener);
```

### SaveConfig (model — `@casehub/ui`)

```typescript
export interface SaveConfig {
  readonly trigger?: "auto" | "field" | "button" | "manual";
  readonly delay?: number;     // ms — only for auto trigger, default 2000
  readonly adapter: string;    // adapter name, resolved by runtime
  readonly adapterConfig?: Readonly<Record<string, unknown>>;
}
```

YAML:

```yaml
save:
  trigger: auto
  delay: 2000
  adapter: rest
  rest:
    method: PATCH
    headers:
      Authorization: Bearer ${token}
```

**Desugaring rule:** The YAML parser extracts `save[save.adapter]` into `SaveConfig.adapterConfig`. When `adapter` is `"rest"`, the `rest:` block becomes `adapterConfig`. When `adapter` is `"local"`, the `local:` block (if present) becomes `adapterConfig`. Keys other than `trigger`, `delay`, and `adapter` that don't match the adapter name are ignored.

### Trigger Behaviour

| Trigger | On `casehub-field-change` | On `committed: true` | On page exit |
|---------|--------------------------|---------------------|--------------|
| `auto` (default) | Reset debounce timer | Reset debounce timer | Flush immediately |
| `field` | No action | Save dirty fields immediately | Flush immediately |
| `button` | No action | No action | Warn if dirty (unsaved changes) |
| `manual` | No action | No action | No action |

Timer state lives in the runtime, keyed by pagePath:

```typescript
type SaveTimers = Map<string, ReturnType<typeof setTimeout>>;
```

### SaveAdapter (runtime — `@casehub/runtime`)

```typescript
export interface SaveAdapter {
  save(
    dataSetId: DataSetId,
    record: Readonly<Record<string, unknown>>,
    changedFields: readonly string[],
    idColumn: string,
    idValue: unknown,
  ): Promise<SaveResult>;

  delete?(
    dataSetId: DataSetId,
    idColumn: string,
    idValue: unknown,
  ): Promise<SaveResult>;
}

export interface SaveResult {
  readonly success: boolean;
  readonly error?: string;
  readonly updatedRecord?: Readonly<Record<string, unknown>>;
}
```

The runtime resolves adapter names to implementations. Built-in adapters are registered by default; custom adapters are registered via `SiteOptions.adapters`:

```typescript
export interface SiteOptions {
  // ... existing options ...
  readonly adapters?: Readonly<Record<string, SaveAdapter>>;
}
```

Built-in registry (always available):

```typescript
const BUILT_IN_ADAPTERS = new Map<string, SaveAdapterFactory>([
  ["rest", createRestAdapter],
  ["local", createLocalAdapter],
]);
```

Custom adapters from `SiteOptions.adapters` are merged at `loadSite()` time, overriding built-ins if names collide.

### Two Initial Adapters

**rest** — Derives endpoint from dataset's `url`. Constructs record URL as `${datasetUrl}/${idValue}`. Sends only changed fields.

```yaml
save:
  adapter: rest
  rest:
    method: PATCH           # PUT | PATCH | POST — default PATCH
```

**local** — Mutates the in-memory dataset in `DataSetManager`. Creates a new `TypedDataSet` with the updated row and re-registers it.

```yaml
save:
  adapter: local
```

**Custom adapters (TS only):**

Custom adapters are registered by name via `SiteOptions`, keeping `SaveConfig.adapter` as a plain string:

```typescript
loadSite(target, source, {
  adapters: { "myCustom": myCustomAdapter },
});
```

Page config references the custom adapter by name:

```typescript
page("Form",
  textInput({ field: "name" }),
  { save: { trigger: "auto", adapter: "myCustom" } },
)
```

This keeps the model free of runtime concerns — `SaveConfig` uses names, the runtime resolves them to implementations. Same pattern as dataset providers.

### Post-Save Dataset Synchronization

After a successful save, the in-memory dataset is stale. The synchronization flow:

1. Adapter returns `SaveResult` with `success: true`.
2. If `updatedRecord` is present: runtime constructs a new `TypedDataSet` with the updated row, re-registers in `DataSetManager`.
3. If `updatedRecord` is absent: runtime applies the dirty field values from `EditState` to the dataset directly (same new-dataset construction).
4. Runtime clears `EditState` for the saved fields.
5. Runtime re-pushes data to all components referencing that `dataSetId` — using the same iteration pattern as `scheduleRefresh` in `data-pipeline.ts` (iterate `ComponentRegistry` entries matching `originalLookup.dataSetId`, call `handleDataRequest` for each).

This ensures charts, tables, and other components on the same or ancestor pages reflect the saved changes.

### Record Change Invalidation

When hierarchical filter propagation re-pushes a form page (parent record selection changed), the runtime compares the new record's `idColumn` value against the previous value. If the record has changed:

1. Cancel any pending save timer for this pagePath.
2. Clear `EditState` for this pagePath (discard unsaved edits from the previous record).
3. Push the new record's data to form inputs.

This prevents a race condition where a save timer fires after record navigation and applies the previous record's edits to the new record. Navigating away from a dirty record discards unsaved changes. Extending the `button` trigger's "warn if dirty" behaviour to warn on record change is a UX refinement for follow-up.

## Nested Forms (Master-Detail)

Uses hierarchical filter propagation for record selection. A parent table emits a filter on row click; the child form page inherits the filter via ancestor collection.

### Parent Page

```yaml
pages:
  - name: Employee List
    components:
      - displayer:
          type: TABLE
          filter:
            notification: true
          lookup:
            uuid: employees
      - page: Employee Form
```

### Child Form Page

```yaml
  - name: Employee Form
    dataScope:
      dataset: employees
      idColumn: id
    save:
      trigger: auto
      delay: 2000
      adapter: rest
    components:
      - text-input:
          field: name
          label: Full Name
      - dropdown:
          field: department
          label: Department
          options:
            values: [Engineering, Sales, Marketing, HR]
      - number-input:
          field: salary
          label: Salary
          min: 0
```

### Flow

1. Table renders all employees on pagePath `"Employee List"`.
2. User clicks a row → table emits `casehub-filter` with `{ columnId: "id", rowIndex: 0, reset: false }`.
3. Runtime stores filter under pagePath `"Employee List"`: `updateFilter(filterState, "Employee List", ...)`.
4. Runtime re-pushes same-page components (existing behaviour).
5. Runtime detects child pagePath `"Employee List/Employee Form"` has `dataScope` referencing `employees` → re-pushes form input components.
6. Form input `pushData` calls `collectAncestorFilterOps` → walks up to `"Employee List"` → finds the `id = 42` filter → applies it.
7. Dataset resolves to one row → form inputs populate with that record's field values.
8. User edits → `casehub-field-change` → `EditState` updated → auto-save fires after 2s → REST adapter PATCHes changed fields to `http://acme.com/employees/42`.
9. Post-save synchronization re-pushes dataset to all components.

### Recursive Nesting (Subforms with Foreign-Key Binding)

An employee form can contain a nested page showing related child records from a different dataset:

```yaml
  - name: Employee Form
    dataScope:
      dataset: employees
      idColumn: id
    components:
      - text-input:
          field: name
      - page: Employee Projects
        src: ./employee-projects.yaml

  - name: Employee Projects
    dataScope:
      dataset: projects
      idColumn: id
      filter:
        employee_id:
          $ref: employees.id
    components:
      - displayer:
          type: TABLE
          lookup:
            uuid: projects
```

The `$ref: employees.id` creates a foreign-key binding — the child's `projects` dataset is filtered where `employee_id` equals the parent record's `id` column value. See § DataScope Binding for full semantics.

## Separate-File Pages

The lazy-page infrastructure is already implemented in `activation.ts` — fetch, parse, `integrateAndRender()`, caching via `lazyPageResolutions`, and tree integration (extend `PagePathMap`, `DataSetScope`, `pageIndex`).

### Desugaring Rule

The YAML parser's `component-desugar.ts` needs a new shorthand rule:

```
- page: Employee Form
  src: ./employee-form.yaml
```

desugars to:

```typescript
{ type: "lazy-page", props: { name: "Employee Form", href: "./employee-form.yaml" } }
```

When `src` is absent, the existing `page-ref` desugaring applies (lookup by name in current file).

Resolution order:
1. If `src` is present → desugar to `lazy-page` with `href`.
2. If `src` is absent → desugar to `page-ref` (existing behaviour — lookup by name in current file's pages).

## Validation

For the first cut, validation derives from existing declarations:

- **Column type** — number-input rejects non-numeric input, date-picker enforces date format.
- **Component props** — `min`, `max` on number-input; `required` on any input; `maxLength` on text-input/textarea.
- **Dropdown options** — constrained to declared values (fixed list) or dataset values.

No custom validation rules engine. The type schema (dataset columns) plus component props cover common cases. Richer validation (cross-field, async, regex patterns) is future work.

## DSL Builder Functions

New builders in `@casehub/ui/dsl/builders.ts`, following the existing pattern (frozen objects, type-safe props):

```typescript
export function textInput(props: TextInputProps): Component;
export function numberInput(props: NumberInputProps): Component;
export function dropdown(props: DropdownProps): Component;
export function checkbox(props: CheckboxProps): Component;
export function datePicker(props: DatePickerProps): Component;
export function textarea(props: TextareaProps): Component;
```

Each returns `Object.freeze({ type: "<type>", props: Object.freeze(props) })`.

The existing `page()` builder accepts `DataScope` and `SaveConfig` via `PageOptions`:

```typescript
export interface PageOptions {
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Record<string, string>;
  readonly dataScope?: DataScope;    // NEW
  readonly save?: SaveConfig;        // NEW
}
```

**Required changes to `builders.ts`:**

1. `isPageOptions()` heuristic must also check the new fields. Current code checks `"datasets" in obj || "settings" in obj || "properties" in obj`. A PageOptions with only `dataScope` and `save` would fail this check and be misclassified as a Component. Updated check:

```typescript
return "datasets" in obj || "settings" in obj || "properties" in obj
    || "dataScope" in obj || "save" in obj;
```

2. The PageProps extraction in the `page()` function body (lines 95-100) must also spread `dataScope` and `save`:

```typescript
const props: PageProps = {
  name,
  ...(options?.datasets && { datasets: options.datasets }),
  ...(options?.settings && { settings: options.settings }),
  ...(options?.properties && { properties: options.properties }),
  ...(options?.dataScope && { dataScope: options.dataScope }),
  ...(options?.save && { save: options.save }),
};
```

## Package Placement

Form inputs follow existing package boundaries — no separate `casehub-forms` package:

| Concern | Package | Files |
|---------|---------|-------|
| Props interfaces (`TextInputProps`, etc.) | `@casehub/ui` | `model/form-input-types.ts` (new) |
| `FormInputCommon` base interface | `@casehub/ui` | `model/form-input-types.ts` |
| `DataScope`, `SaveConfig` types | `@casehub/ui` | `model/page-types.ts` (extended) |
| ComponentTypeRegistry additions | `@casehub/ui` | `model/type-guards.ts` (extended) |
| YAML desugar rules | `@casehub/ui` | `parser/component-desugar.ts` (extended) |
| DSL builder functions | `@casehub/ui` | `dsl/builders.ts` (extended) |
| Web Components (`CasehubTextInput`, etc.) | `@casehub/viz` | `form-inputs/` (new directory) |
| `SaveAdapter` interface | `@casehub/runtime` | `save-adapter.ts` (new) |
| `EditState`, save trigger logic | `@casehub/runtime` | `edit-state.ts` (new) |
| `DataScopeRegistry` | `@casehub/runtime` | `data-scope-registry.ts` (new) |
| Adapter implementations (rest, local) | `@casehub/runtime` | `adapters/` (new directory) |
| Hierarchical filter collection | `@casehub/runtime` | `cross-filter.ts` (extended) |
| `casehub-field-change` handler | `@casehub/runtime` | `site.ts` (extended) |

## Gallery Example: Contact Manager

A self-contained master-detail demo with all six input types:

```yaml
datasets:
  - uuid: contacts
    content: >-
      [
        [1, "Alice Johnson", "alice@example.com", "+1-555-0101", "Work", "true", "2024-03-15", "Key client contact"],
        [2, "Bob Smith", "bob@example.com", "+1-555-0102", "Personal", "true", "2023-11-20", ""],
        [3, "Carol Davis", "carol@example.com", "+1-555-0103", "Work", "false", "2025-01-08", "On leave until March"]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: email
        type: TEXT
      - id: phone
        type: TEXT
      - id: category
        type: LABEL
      - id: active
        type: LABEL
      - id: startDate
        type: DATE
      - id: notes
        type: TEXT

pages:
  - name: Contact List
    components:
      - title: Contact Manager
      - displayer:
          type: TABLE
          filter:
            notification: true
          table:
            pageSize: 10
            sortable: true
          lookup:
            uuid: contacts
      - page: Contact Form

  - name: Contact Form
    dataScope:
      dataset: contacts
      idColumn: id
    save:
      trigger: auto
      delay: 2000
      adapter: local
    components:
      - text-input:
          field: name
          label: Full Name
          required: true
      - text-input:
          field: email
          label: Email
          required: true
      - text-input:
          field: phone
          label: Phone
      - dropdown:
          field: category
          label: Category
          options:
            values: [Work, Personal, Family, Other]
      - checkbox:
          field: active
          label: Active
      - date-picker:
          field: startDate
          label: Start Date
      - textarea:
          field: notes
          label: Notes
          rows: 3
```

Note: `active` column is `type: LABEL` with values `"true"` / `"false"`. The checkbox component coerces per the type coercion rules.

## Out of Scope (Tracked for Future Work)

| Item | Why deferred | Dependency |
|------|-------------|------------|
| **Lazy on-demand pagination for datasets** | Current datasets fetch everything upfront. Production forms with large datasets need server-side pagination with page size, cursor/offset, and total count at the dataset protocol level. | Needed before forms handle large datasets in production |
| **Cascading dropdown options** | Options from a secondary dataset, reactively filtered by another field's value. First cut resolves options at activation time (static). | Needed for dependent field patterns (country → city) |
| **Custom validation rules** | Cross-field validation, async validation (e.g. uniqueness check), regex patterns. First cut uses type-derived validation. | Needed for complex business forms |
| **Record navigation controls** | When a form page has no parent filter, it shows the first record. Navigation (next/prev/search) within the dataset. | Nice-to-have |
| **New record creation** | Adding records to a dataset. POST for new records, empty/default state handling. | Needed for complete CRUD |
| **Delete records** | `SaveAdapter.delete` is defined but not wired to triggers or UI. | Needed for complete CRUD |
| **Undo/redo** | Reverting changes before save. | Nice-to-have |
| **Optimistic updates** | Showing saved state immediately before server confirms. | Performance optimisation |
| **Form-level error display** | Consistent display of adapter errors (network failure, validation rejection). | Needed for production use |

## Cross-References

- **Site runtime spec** (2026-06-15) — §4.2 component classification, §5 data pipeline, §7.4 lazy-page activation
- **Dashboard model spec** (2026-06-14) — §2 page model, §3.1 ComponentTypeRegistry, §6 cross-filtering, §10 YAML desugar
- **Expression evaluator spec** (2026-06-12) — parse-time vs runtime substitution distinction (informs `$ref` vs `${}` syntax choice)
- **ARC42STORIES.MD** — §4 solution strategy data flow, §4.3 cross-filter event protocol
