# pages-ui-components — Standalone Lit Form Components

**Date:** 2026-07-23
**Issue:** #233 (covers #93, #185)
**Branch:** issue-233-pages-ui-components
**Status:** Design approved

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

### Data format unification

The same data structures work for both usage modes. For form inputs, the
component property is a primitive (`string | number | boolean`). For tabular
components (grid-table, data-table), the component accepts a simple tabular
shape. `TypedDataSet` never appears in a component's public API — it is a
pipeline-internal type. The adapter in the activation layer converts
`TypedDataSet` → component properties.

| Component type | Component property API | Pipeline converts from |
|----------------|----------------------|----------------------|
| Form input | `.value: string` | `TypedDataSet` → extract field → primitive |
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

`pages-viz` does NOT depend on `pages-ui-components` — the form input classes
are deleted from pages-viz entirely, not wrapped.

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

## Activation Layer Changes

`packages/pages-runtime/src/activation.ts` currently creates data-bound form
elements and wires them directly. With the new architecture:

1. The activation callback creates the standalone component (`pages-input`, etc.)
2. Sets component properties from `component.props`
3. Wires the pipeline externally:
   - Dispatches `pages-data-request` on behalf of the component
   - Receives the dataset, extracts field values, sets `.value`
   - Listens for native events, translates to `pages-field-change`

The `FORM_INPUT_TYPES` set in activation.ts updates to use the new type names.
The `DATA_COMPONENT_TYPES` set updates accordingly.

`PagesFormInput` and the form input classes in `pages-viz/src/form-inputs/`
are removed. Their rendering logic now lives in `pages-ui-components`. Their
data-binding logic is extracted into the activation layer.

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

Existing form input tests in `pages-viz` are removed (the classes are deleted).
New integration tests verify that the activation layer correctly wires the
pipeline to the standalone components.

### pages-runtime activation tests

Updated to test the new pipeline-external wiring:
- Pipeline sets `.value` from resolved dataset
- Native `input`/`change` events are translated to `pages-field-change`
- Submit-on-Enter produces `pages-action-request`
- Error propagation from pipeline to component `.error`

## Follow-up Issues

- **#236** — Rename blocks-ui components to use `blocks-` prefix consistently
- **#237** — Propagate tag renames to downstream repos (devtown, Claudony, etc.)
- Future: standalone `pages-number-input`, `pages-date-picker` equivalents
- Future: extract chart pipeline adapter (same pattern as form field adapter)
- Future: extract grid/table pipeline adapter with `TabularData` type

## Protocols Referenced

- `casehub/css-design-tokens.md` — `--pages-` prefix, OKLCH 12-step scales
- `casehub/web-component-strategy.md` — Lit for all, sub-path exports, `pages-` tag prefix

## Garden Entries Referenced

- GE-20260615-d356e6: `HTMLElement.dataset` is reserved — avoid as property name
- GE-20260623-06914b: esbuild drops `customElements.define()` from bare imports — use sub-path exports
- GE-20260705-7c80f2: Lit `@state()` Set/Map mutation needs immutable patterns
