# pages-ui-components — Standalone Lit Form Components

**Date:** 2026-07-23
**Issue:** #233
**Branch:** issue-233-pages-ui-components
**Status:** Design approved
**Depends on:** #192 (PagesElement Lit migration)

## Problem

The existing form components in `pages-viz/src/form-inputs/` (PagesTextInput,
PagesDropdown, PagesTextarea, PagesCheckbox, PagesDatePicker, PagesNumberInput,
PagesSchemaForm) fuse rendering with data pipeline machinery. They extend
`PagesFormInput` → `PagesElement` → `LitElement`, inheriting:

- `DataSourceController` — data lifecycle management
- `pages-data-request` event dispatch — requires a runtime host to catch
- `TypedDataSet` / `DataSetLookup` / `ColumnId` — pipeline-internal types in the component API
- Refresh timers, resize observers, loading/error state management

This makes them unusable outside `loadSite()`. Consumer apps (Claudony, devtown,
chat-app) cannot use a styled text input without importing `pages-data`,
`pages-component`, `echarts`, and the entire rendering engine.

## Architecture: One Component, Pipeline External

### Core principle

**Components have simple property APIs. That IS the contract. The pipeline sets
those properties. So can you.**

There is ONE component per type — not a standalone version and a data-bound
version. The component accepts primitive properties (`value`, `label`, `error`,
`disabled`) and fires standard DOM events (`input`, `change`). It does not know
whether its properties were set by application code or by the data pipeline.

```
┌─────────────────────────┐
│      pages-input        │  ← ONE component
│  value, label, error,   │     Properties in, events out.
│  disabled, required     │     Doesn't know where data comes from.
│  fires: input, change   │
└─────────────────────────┘
          │
     Two ways to feed it:
          │
  ┌───────┴─────────┐
  │                 │
Direct props     Pipeline
(any app)        (pages-runtime)
                    │
              Sets .value, .label, .error
              from resolved TypedDataSet.
              Listens for input/change,
              emits pages-field-change.
              Manages refresh, submit.
```

### What the component does (rendering)

- Renders label + input element + error message markup
- Manages focus, keyboard interaction, ARIA attributes
- Fires standard DOM events (`input`, `change`)
- Styles via `--pages-*` CSS custom properties

### What the component does NOT do

- Dispatch `pages-data-request` events
- Receive `TypedDataSet` callbacks
- Emit `pages-field-change` events
- Manage refresh timers or data lifecycle
- Reference any type from `pages-data` or `pages-component`

### What the pipeline does (external to the component)

The data pipeline (in `pages-runtime` activation layer) orchestrates the
component from outside:

1. Dispatches `pages-data-request` on behalf of the component
2. Receives the `TypedDataSet` via the existing callback pattern
3. Extracts the field value and sets `.value` on the component element
4. Sets `.error`, `.loading` as pipeline state changes
5. Listens for native `input`/`change` events on the component
6. Converts them to `pages-field-change` events for the runtime
7. Handles submit-on-Enter → `pages-action-request`
8. Manages refresh timer

This is everything currently in `PagesFormInput` + `PagesElement`, extracted
into the activation layer. The component is a passive rendering target.

### Design rationale: deletion over wrapping

Issue #233's body suggested that pages-viz form inputs could eventually
**wrap** standalone components, keeping PagesFormInput's data lifecycle on
top. This spec deliberately chose the **deletion** approach instead:

1. **One component, not two.** Wrapping creates two components per type — a
   standalone `<pages-input>` and a wrapper `PagesTextInput` in pages-viz.
   Consumers must choose which to import. The single-component design
   eliminates this ambiguity.

2. **Pipeline logic belongs in the pipeline.** PagesFormInput's data
   lifecycle (data request, dataset extraction, field-change events, refresh
   timers) is pipeline orchestration, not component rendering. Moving it to
   the activation layer — where the pipeline already lives — is
   architecturally correct. Keeping it in a wrapper class preserves the
   coupling this spec aims to break.

3. **Coherence with the platform direction.** The same adapter pattern
   (activation layer bridges pipeline to component) extends to charts,
   tables, and future component types. Wrapping would be a form-input-only
   special case that diverges from the platform pattern.

The wrapping approach is simpler to implement but creates the wrong
abstraction boundary. The cost of the adapter is paid once; the cost of
the wrong boundary compounds across every future component extraction.

### Coordination with PagesElement Lit migration (#192)

The PagesElement Lit migration spec (#192, approved 2026-07-20) plans to
migrate PagesFormInput and all 6 form input subclasses to Lit. This spec
must execute AFTER #192:

- **#192 first:** All form input classes become Lit-based. This is already
  approved and in flight.
- **#233 second:** The 4 extracted classes (now Lit-based) have their
  rendering logic extracted to pages-ui-components. The Lit rendering code
  migrated by #192 transfers directly — extraction from Lit components is
  cleaner than extraction from the current vanilla implementations.
- **#192 scope unchanged:** #192 should migrate all 6 form input subclasses
  as planned. The brief period where all 6 are Lit-based before 4 are
  extracted is acceptable — it avoids complicating #192's "all at once"
  approach.

### Data format unification

The same data structures work for both usage modes. For form inputs, the
component property is a primitive. For tabular components (grid-table,
data-table), the component accepts a simple tabular shape. `TypedDataSet`
never appears in a component's public API — it is a pipeline-internal type.
The adapter in the activation layer converts `TypedDataSet` → component
properties.

| Component type | Component property API | Pipeline converts from |
|----------------|----------------------|----------------------|
| Form input | `.value: string` / `.checked: boolean` | `TypedDataSet` → extract field → primitive |
| Grid/table | `.data: TabularData` | `TypedDataSet` → columns + rows |
| Chart | `.options: ChartOptions` | `TypedDataSet` → ECharts option object |

This pattern extends beyond form inputs — it is a platform-wide architectural
direction. Form components are the first instance.

## Package Structure

### New package: `packages/pages-ui-components/`

```
pages-ui-tokens  →  pages-ui-components  →  pages-viz (activation uses both)
(CSS variables)     (standalone Lit WCs)     (charts, existing data-bound WCs)
```

**Dependencies:**

- `lit` — runtime
- `@casehubio/pages-ui-tokens` — design token constants (test/dev use; runtime
  styling is via CSS custom properties injected by the theme)

**No dependency on:** `pages-data`, `pages-component`, `pages-runtime`, `echarts`

### Build order

`pages-ui-tokens` → `pages-ui-components` → other packages → components → webapp

`pages-runtime` gains a new dependency: `@casehubio/pages-ui-components: workspace:*`
(for the activation layer that creates and wires these components).

`pages-viz` does NOT depend on `pages-ui-components`. PagesSchemaForm's
side-effect imports for extracted child types are removed — element
registration is handled by the activation layer (see §PagesSchemaForm
Migration).

### Sub-path exports

Per the web-component-strategy protocol, side-effect isolation via `exports` map:

```jsonc
{
  ".":          "barrel — re-exports everything (side-effectful: registers all elements)",
  "./input":    "PagesInput only",
  "./select":   "PagesSelect only",
  "./textarea": "PagesTextarea only",
  "./checkbox": "PagesCheckbox only",
  "./button":   "PagesButton only",
  "./types":    "shared type definitions only (side-effect-free)"
}
```

`sideEffects` array lists the barrel and each component sub-path. The `./types`
sub-path is side-effect-free. Consumers import from the narrowest sub-path.

## Component API

Five components. Each extends `LitElement`, uses `@property()` for public API,
standard DOM events, `--pages-*` CSS custom properties for all styling.

Common patterns:
- `:host { display: block }`
- Label rendered as `<label>` when provided
- Error message rendered as `<span role="alert">` when provided
- No built-in validation — validation state communicated via `error` prop
- Guarded registration: `if (!customElements.get('pages-xxx')) customElements.define(...)`

### `<pages-input>` — text input

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `value` | `string` | `''` | Current value |
| `label` | `string \| undefined` | — | Optional label |
| `placeholder` | `string \| undefined` | — | |
| `maxlength` | `number \| undefined` | — | |
| `required` | `boolean` | `false` | Adds `aria-required` |
| `readonly` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |
| `error` | `string \| undefined` | — | Error message, sets `aria-invalid` |
| `type` | `'text' \| 'email' \| 'password' \| 'url'` | `'text'` | HTML input type |

Events: `input` (on keystroke), `change` (on commit/blur).

### `<pages-select>` — dropdown select

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `value` | `string` | `''` | Selected value |
| `label` | `string \| undefined` | — | |
| `options` | `Array<{value: string, label: string}>` | `[]` | Option entries |
| `required` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |
| `error` | `string \| undefined` | — | |

Events: `change` on selection.

### `<pages-textarea>` — multi-line text input

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `value` | `string` | `''` | |
| `label` | `string \| undefined` | — | |
| `placeholder` | `string \| undefined` | — | |
| `rows` | `number \| undefined` | — | Visible rows |
| `maxlength` | `number \| undefined` | — | |
| `required` | `boolean` | `false` | |
| `readonly` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |
| `error` | `string \| undefined` | — | |

Events: `input`, `change`.

### `<pages-checkbox>` — checkbox with label

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `checked` | `boolean` | `false` | |
| `label` | `string \| undefined` | — | |
| `required` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |
| `error` | `string \| undefined` | — | |

Events: `change` on toggle.

### `<pages-button>` — button with variants

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `label` | `string` | `''` | Button text |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'secondary'` | Visual style |
| `disabled` | `boolean` | `false` | |
| `loading` | `boolean` | `false` | Shows spinner, disables click |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |

Events: `click` (native). Content via default slot as alternative to `label`.

### `<pages-button>` and PagesActionButton relationship

`<pages-button>` is a standalone rendering component — variants, sizes,
loading state, slot content. It does NOT handle action requests.

`PagesActionButton` in pages-viz extends `PagesContentElement` and handles:
- `pages-action-request` dispatch
- Confirm dialogs
- Loading/success/error state management
- Resolve callbacks

`PagesActionButton` will eventually delegate its rendering to
`<pages-button>`, keeping only the action request orchestration. This
follows the same "pipeline external" principle — rendering in the
standalone component, orchestration in the pipeline layer.

In the interim, both coexist with no naming conflict:
- `<pages-button>` — standalone, usable by consumer apps
- `<pages-action-button>` — data-bound, activated by the runtime for
  `component.type === "action-button"`

## Styling

All visual styling via `--pages-*` CSS custom properties with fallback values.
Components render correctly with or without an injected theme.

Token usage:

- Colours: `--pages-neutral-{1-12}`, `--pages-accent-{1-12}`, `--pages-danger-{1-12}`
- Typography: `--pages-font-family`, `--pages-font-size-{size}`, `--pages-font-weight-{weight}`
- Spacing: `--pages-space-{key}`
- Radius: `--pages-radius-{size}`
- Motion: `--pages-duration-{speed}`, `--pages-ease-{type}`

Each component defines styles via Lit's `static styles = css\`...\`` — scoped
to shadow DOM, no global CSS pollution.

Components use primitive step tokens (`--pages-neutral-6`, `--pages-accent-9`,
etc.), consistent with all existing components in the platform. The
css-design-tokens protocol defines semantic role tokens (tier 2) as a future
migration target, but primitives remain valid and the migration is incremental
and platform-wide — not per-component.

## Naming Convention

Established during this design: consistent prefixes across the platform.

| Layer | Prefix | Examples |
|-------|--------|----------|
| Pages (design system components) | `pages-` | `pages-input`, `pages-bar-chart`, `pages-data-table` |
| Blocks (domain components) | `blocks-` | `blocks-work-item-inbox`, `blocks-case-explorer` |

**YAML type → tag convention:** `pages-${type}`. The YAML `type:` value,
prefixed with `pages-`, IS the custom element tag name. The JS class is
`Pages${PascalCase(type)}`.

| YAML type | Tag | Class |
|-----------|-----|-------|
| `input` | `pages-input` | `PagesInput` |
| `select` | `pages-select` | `PagesSelect` |
| `textarea` | `pages-textarea` | `PagesTextarea` |
| `checkbox` | `pages-checkbox` | `PagesCheckbox` |
| `button` | `pages-button` | `PagesButton` |

### Tag renames (pre-release, breaking)

| Old tag | New tag | Reason |
|---------|---------|--------|
| `pages-text-input` | `pages-input` | Simplified — "text" was redundant with `type` prop |
| `pages-dropdown` | `pages-select` | Aligned with HTML semantics |

`pages-textarea` and `pages-checkbox` keep their existing tag names — no change.

`pages-number-input` and `pages-date-picker` are not in scope for this issue.
They remain as data-bound components in `pages-viz` until standalone equivalents
are added.

### YAML type migration

The `pages-${type}` convention requires YAML `type:` values to match the
new tag names. The 4 extracted types change:

| Old YAML type | New YAML type | Tag |
|---------------|---------------|-----|
| `text-input` | `input` | `pages-input` |
| `dropdown` | `select` | `pages-select` |
| `textarea` | `textarea` | `pages-textarea` (unchanged) |
| `checkbox` | `checkbox` | `pages-checkbox` (unchanged) |

Out-of-scope types retain their current names:

| YAML type | Tag | Status |
|-----------|-----|--------|
| `number-input` | `pages-number-input` | Unchanged |
| `date-picker` | `pages-date-picker` | Unchanged |

The naming style difference (compound `number-input` vs simple `input`) is
a phased migration artifact. When standalone equivalents for number-input and
date-picker are added, their YAML types will be evaluated for simplification.

### Type system change set

The renames touch the component type system foundation in `pages-component`,
not just `pages-runtime`. The full change set:

| Location | Package | Change |
|----------|---------|--------|
| `ComponentTypeRegistry` in `type-guards.ts` | pages-component | `"text-input": TextInputProps` → `"input": TextInputProps`, `dropdown: DropdownProps` → `select: DropdownProps` |
| `isTextInput()` → `isInput()` | pages-component | Type guard renamed, checks `c.type === "input"` |
| `isDropdown()` → `isSelect()` | pages-component | Type guard renamed, checks `c.type === "select"` |
| `FORM_INPUT_TYPES` set | pages-ui | Second set in `pages-ui/src/model/type-guards.ts` — update entries |
| `isFormInput()` | pages-ui | Depends on FORM_INPUT_TYPES — updated transitively |
| Re-exports in `pages-ui/type-guards.ts` | pages-ui | Re-export `isInput`/`isSelect` instead of old names |
| `FORM_INPUT_TYPES` set | pages-runtime | Update entries in `activation.ts` |
| `DATA_COMPONENT_TYPES` set | pages-runtime | Spreads FORM_INPUT_TYPES — updated transitively |
| `mapFieldToComponentType()` | pages-viz | Returns `"input"` / `"select"` instead of old names |
| `buildChildProps()` | pages-viz | Conditionals use `componentType === "select"` / `"input"` |

The `ComponentTypeRegistry` change is the root — it redefines `ComponentType`
(which is `keyof ComponentTypeRegistry`), cascading to every `TypedComponent<T>`,
every `getProps()` call, and every `isComponentType()` usage. TypeScript will
surface all stale references as compile errors.

Issue #237 covers propagating the YAML type renames to downstream repos.

## Activation Layer Changes

`packages/pages-runtime/src/activation.ts` currently creates data-bound form
elements and wires them directly. With the new architecture:

### What changes

The `FORM_INPUT_TYPES` set updates to the new type names: `input`, `select`,
`textarea`, `checkbox`. The out-of-scope types (`number-input`, `date-picker`)
remain as separate entries still routed to PagesFormInput-based elements.

For the 4 extracted types, the activation callback no longer creates
PagesElement subclasses. Instead it creates standalone components and
registers a form field adapter proxy that bridges the pipeline.

For `number-input` and `date-picker`, the activation callback continues to
create PagesFormInput-based elements as today — no change.

### PagesFormInput retention

PagesFormInput base class is **retained** in `pages-viz/src/form-inputs/`.
It remains the base class for `PagesNumberInput` and `PagesDatePicker`
(both out of scope). Only the 4 concrete extracted classes are deleted:
`PagesTextInput`, `PagesDropdown`, `PagesTextarea`, `PagesCheckbox`.

### Form field adapter proxy

For each standalone form component, the activation layer creates a
`FormFieldProxy` that implements `VizTarget` and bridges between the
pipeline's `TypedDataSet` delivery and the component's primitive properties.
This follows the existing `createHostPanelProxy()` pattern in activation.ts.

```typescript
function createFormFieldProxy(
  component: HTMLElement,
  fieldName: string,
): VizTarget {
  let _dataSet: TypedDataSet | undefined;
  // Implements DataReceiver mutual-clearing invariant:
  // - set dataSet clears error
  // - set error clears dataSet (proxy reference, not displayed value)
  // - set loading(true) clears error
  return {
    get loading() { return false; },
    set loading(v: boolean) {
      if (v) (component as any).error = undefined;
    },
    get dataSet() { return _dataSet; },
    set dataSet(ds: TypedDataSet | undefined) {
      _dataSet = ds;
      (component as any).error = undefined;
      if (ds) {
        const value = extractFieldValue(ds, fieldName);
        setComponentValue(component, value);
      }
    },
    get error() { return (component as any).error ?? ""; },
    set error(msg: string) {
      _dataSet = undefined;
      (component as any).error = msg || undefined;
    },
    get totalRows() { return 0; },
    set totalRows(_: number) {},
    get activeSort() { return undefined; },
    set activeSort(_: SortColumn | undefined) {},
    get activePage() { return undefined; },
    set activePage(_: number | undefined) {},
  };
}
```

`setComponentValue()` maps the extracted primitive to the correct property:
`.checked` for checkbox, `.value` for all others.

### Data request dispatch timing

PagesElement dispatches `pages-data-request` in `connectedCallback()`. For
standalone components, the activation callback handles dispatch externally:

1. Creates the component element
2. Creates the FormFieldProxy
3. Registers the proxy in the ComponentRegistry as the `vizElement`
4. Appends the component to the DOM
5. Dispatches `pages-data-request` with the proxy as the `element` and the
   lookup from component props

Step 5 happens after DOM append so the event bubbles through the DOM tree
to the runtime's listener. This matches the existing `createHostPanelProxy`
dispatch pattern used for host panels.

### Native event translation

The activation callback listens for native events on the standalone
component and translates them to pipeline events:

- `input` → `pages-field-change` with `{ field, value, committed: false }`
- `change` → `pages-field-change` with `{ field, value, committed: true }`

For checkbox: reads `.checked` instead of `.value`.

### DataSetOptions and cascade filtering

When YAML props for a `select` component include `DataSetOptions`
(dataset-backed options with optional cascade filtering), the activation
callback replicates PagesDropdown's current logic (~120 lines):

1. Detects `DataSetOptions` in `component.props.options` (non-FixedOptions)
2. Creates a minimal proxy receiver for a second `pages-data-request`
   targeting the options dataset
3. On options dataset delivery, extracts `valueColumn` and `labelColumn`
   from each row, converts to `Array<{value, label}>`, sets on
   `<pages-select>.options`
4. If `filterField` and `filterColumn` are specified, listens for
   `pages-field-change` events from ancestor form fields
5. On cascade match, re-requests the options dataset with a filter
   operation applied, updates `<pages-select>.options` with the result

For `FixedOptions` (simple value arrays), the activation callback converts
directly to the `Array<{value, label}>` shape — no data request needed.

### Submit-on-Enter

Keyboard events have `composed: true` by default and bubble through shadow
DOM boundaries. The activation layer handles submit-on-Enter without
penetrating shadow DOM encapsulation:

1. If `component.props.submit` is present, the activation callback attaches
   a `keydown` listener on the standalone component's host element
2. On Enter keypress, reads the component's `.value` property
3. Constructs an `ActionRequest` from the submit config (URL, method,
   fieldName, body, callbacks)
4. Dispatches `pages-action-request` with a resolve callback
5. On success with `clearOnSubmit`, sets `.value = ""` on the component

### Refresh timer

If `component.props.refresh?.interval` is set, the activation callback:

1. Starts a `setInterval` timer
2. On each tick, re-dispatches `pages-data-request` via the proxy
3. Timer is cleared when the component is removed (see Disconnect lifecycle)
4. Timer is restarted if the component's props change with a new interval

### Disconnect lifecycle

The activation callback uses a Lit `ReactiveController` attached to the
standalone component for cleanup. Since standalone components extend
`LitElement` (which extends `ReactiveElement`), they support
`addController()`:

```typescript
class ActivationCleanupController implements ReactiveController {
  constructor(private cleanup: () => void) {}
  hostConnected(): void {}
  hostDisconnected(): void { this.cleanup(); }
}

// In the activation callback:
const controller = new ActivationCleanupController(() => {
  clearInterval(refreshTimer);
  component.removeEventListener("input", inputHandler);
  component.removeEventListener("change", changeHandler);
  component.removeEventListener("keydown", keydownHandler);
  registry.delete(componentId);
});
(component as ReactiveElement).addController(controller);
```

`hostDisconnected()` fires on `disconnectedCallback()`, which fires for
any DOM removal — direct or ancestor-triggered. This is gap-free for the
page navigation scenario (ancestor container removed, all descendants
disconnect). The component doesn't know what the controller does — it
just hosts it. Pipeline cleanup stays external to the component.

## PagesSchemaForm Migration

PagesSchemaForm (`pages-viz/src/form-inputs/PagesSchemaForm.ts`) creates
child form input elements dynamically via `document.createElement()` and
interacts with them via the PagesFormInput API (`.props`, `.dataSet`,
`.editable`, `.required`, `.currentValue`, `.errorMessage`).

After the extraction, PagesSchemaForm creates a mix of:
- **Standalone components** (`pages-input`, `pages-select`, `pages-checkbox`,
  `pages-textarea`) — no PagesFormInput API
- **PagesFormInput-based components** (`pages-number-input`,
  `pages-date-picker`) — full PagesFormInput API

### Changes required

1. **`mapFieldToComponentType()` updates:** Returns `"input"` instead of
   `"text-input"`, `"select"` instead of `"dropdown"`. Other returns
   unchanged.

2. **Side-effect imports migrate:** PagesSchemaForm's current side-effect
   imports (`import "./PagesTextInput.js"`, etc.) for the 4 extracted types
   are removed. Element registration is handled by the activation layer,
   which imports from `@casehubio/pages-ui-components` sub-paths before
   activating any `schema-form` component. This avoids adding a
   `pages-viz → pages-ui-components` dependency.

3. **Child interaction adapter:** PagesSchemaForm introduces a thin adapter
   to normalize the API difference between standalone and PagesFormInput
   children:

   | PagesFormInput API | Standalone equivalent |
   |---|---|
   | `formInput.props = childProps` | Set `.label`, `.value` etc. individually |
   | `formInput.dataSet = dataset` | Extract field value, set `.value` / `.checked` |
   | `formInput.editable = boolean` | Set `.disabled = !editable` |
   | `formInput.required = boolean` | Set `.required` directly |
   | `formInput.currentValue` | Read `.value` / `.checked` |
   | `formInput.errorMessage = string` | Set `.error` |

   For PagesFormInput children (number-input, date-picker), the existing
   API is used unchanged.

This is a bounded change to PagesSchemaForm — the core schema derivation,
validation, and submit logic are unchanged.

### Tag name conflict with pages-form package

`packages/pages-form/` contains a separate `PagesSchemaForm` that extends
`LitElement` directly (not `PagesElement`). It registers the same tag:
`@customElement('pages-schema-form')`. The pages-viz version uses guarded
registration: `if (!customElements.get("pages-schema-form"))`. Whichever
package loads first wins.

The two implementations serve different purposes:
- **pages-form PagesSchemaForm:** standalone, pipeline-free. Takes `schema`
  and `data` as direct Lit properties, renders native HTML form elements
  (no custom element children), fires `pages-form-change` and
  `pages-form-submit` events. This is the consumer-facing standalone form
  for apps that want schema-driven forms without the data pipeline.
- **pages-viz PagesSchemaForm:** data-bound (`extends PagesElement`). Takes
  schema via dataset, creates custom element children, integrated with the
  data pipeline via activation layer.

The tag name conflict must be resolved. A follow-up issue tracks this —
the likely resolution is renaming the pages-viz version's tag (e.g.,
`pages-data-schema-form`) since it's internal to the pipeline and only
instantiated by the activation layer.

## Testing

### pages-ui-components tests (Vitest)

Each component gets unit tests covering:
- Rendering with various prop combinations
- Event emission (`input`, `change`, `click`)
- ARIA attributes (`aria-required`, `aria-invalid`, `aria-describedby`)
- Disabled/readonly states
- Error message display
- Label rendering
- Edge cases (empty value, missing props)

### pages-viz form input tests

Existing form input tests for the 4 deleted classes are removed. Tests for
PagesFormInput base class, PagesNumberInput, PagesDatePicker, and
PagesSchemaForm are retained and updated as needed.

### pages-runtime activation tests

Updated to test the new pipeline-external wiring:
- FormFieldProxy delivers field values from resolved dataset
- Native `input`/`change` events are translated to `pages-field-change`
- Submit-on-Enter produces `pages-action-request`
- Error propagation from pipeline to component `.error`
- DataSetOptions resolution and cascade filtering for `<pages-select>`
- Refresh timer lifecycle (start, tick, clear on disconnect)
- ReactiveController cleanup on component removal (direct and ancestor)

## Follow-up Issues

- **#236** — Rename blocks-ui components to use `blocks-` prefix consistently
- **#237** — Propagate tag renames to downstream repos (devtown, Claudony, etc.)
- **NEW** — PagesSchemaForm: complete migration to standalone child adapter
- **NEW** — PagesActionButton: delegate rendering to `<pages-button>`
- **NEW** — Resolve `pages-schema-form` tag name conflict between pages-form
  and pages-viz packages (rename pages-viz version's tag)
- **NEW** — Update web-component-strategy protocol: add standalone UI
  component category (extends LitElement directly, no PagesElement/
  PagesContentElement data machinery)
- **NEW** — Platform-wide migration from primitive step tokens to semantic
  role tokens (when semantic-map pipeline is ready)
- **NEW** — Update ARC42STORIES: add `@casehubio/pages-ui-components` to §5
  Building Block View, update §6 Runtime View data request dispatch
  description, add note to §10 Architectural Decisions
- Future: standalone `pages-number-input`, `pages-date-picker` equivalents
- Future: extract chart pipeline adapter (same pattern as form field adapter)
- Future: extract grid/table pipeline adapter with `TabularData` type

## Protocols Referenced

- `casehub/css-design-tokens.md` — `--pages-` prefix, OKLCH 12-step scales.
  Components use primitive step tokens, consistent with all existing platform
  components. Migration to semantic role tokens (tier 2) is a follow-up.
- `casehub/web-component-strategy.md` — Lit for all, sub-path exports,
  `pages-` tag prefix. **Update needed:** the protocol's base class hierarchy
  doesn't include a category for standalone UI components that extend
  `LitElement` directly (neither `PagesElement` data-bound nor
  `PagesContentElement` props-only). A follow-up issue adds this third
  category for `pages-ui-components` and similar packages.

## Garden Entries Referenced

- GE-20260615-d356e6: `HTMLElement.dataset` is reserved — avoid as property name
- GE-20260623-06914b: esbuild drops `customElements.define()` from bare imports — use sub-path exports
- GE-20260705-7c80f2: Lit `@state()` Set/Map mutation needs immutable patterns
