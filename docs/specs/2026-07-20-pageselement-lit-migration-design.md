# PagesElement Lit Migration Design

**Issue:** #192
**Date:** 2026-07-20
**Status:** Approved

## Problem

PagesElement (pages-viz base class for data-bound visualization components) uses vanilla HTMLElement with manual shadow DOM, hand-rolled getter/setter property system, and imperative DOM construction. This creates a rendering model mismatch with pages-table and pages-primitives (both Lit-based), preventing composition between the two worlds.

The grouped-view / pages-table composition work (#188) exposed this directly: PagesGroupedView couldn't delegate rendering to pages-table because they use different rendering models. While #188 worked around this, the underlying misalignment remains — every future composition scenario hits the same wall.

## Approach

Full migration of PagesElement and all subclasses to Lit. No compatibility bridge, no incremental migration — every class converts in one pass.

## Scope

**Inheritance hierarchy:**

```
HTMLElement
  ├── PagesElement (data-bound base) → LitElement
  │     ├── PagesChartElement (intermediate base, inherits Lit from PagesElement)
  │     │     └── 11 chart subclasses
  │     ├── PagesFormInput (intermediate base, inherits Lit from PagesElement)
  │     │     └── 6 form input subclasses
  │     └── PagesMetric, PagesSelector, PagesBadge, PagesCountdown,
  │         PagesIframePlugin, PagesGroupedView (extend PagesElement directly)
  │
  └── PagesContentElement (non-data base, independent root) → LitElement
        └── PagesActionButton, PagesAlert, PagesLegend
```

Two independent HTMLElement roots become LitElement subclasses: **PagesElement** and **PagesContentElement**. PagesChartElement and PagesFormInput are intermediate bases — they inherit Lit automatically from PagesElement and are not independent migration points.

**In scope:**
- PagesElement, PagesContentElement (2 migration roots) + PagesChartElement, PagesFormInput (2 intermediate bases)
- 26 concrete subclasses: 11 charts, 6 data components, 6 form inputs, 3 content components
- All associated test files
- Package dependency and tsconfig updates
- pages-runtime `activation.ts` — fix PagesLegend activation inconsistency (see §Runtime activation fix)

**Out of scope:**
- pages-table — already Lit
- pages-primitives — already Lit
- pages-component DataSourceController — stays framework-agnostic (see §Base class: PagesElement for rationale)
- Adding a11y mixins to viz components — follow-up after migration lands

## Design

### Base class: PagesElement

| Aspect | Current (vanilla) | Migrated (Lit) |
|---|---|---|
| Inheritance | `extends HTMLElement` | `extends LitElement` |
| Shadow DOM | Manual `attachShadow()` + container div in constructor | Lit manages shadow root |
| Properties | Manual getter/setter with `update()` calls | `@property({ attribute: false })` decorators |
| Update pipeline | Private `update()` dispatching to loading/error/render | Lit `render()` returns appropriate template based on state |
| Subclass contract | `abstract render(container, props, dataset): void` | `abstract renderContent(props, dataset): TemplateResult` |
| Loading/error | `renderLoading(container)`, `renderError(container, msg)` — imperative | `renderLoading(): TemplateResult`, `renderError(msg): TemplateResult` — declarative |
| Styles | Inline `document.createElement("style")` per render | `static styles = css`...`` on the class |

**Render dispatch:** The current private `update()` method checks `controller.error` → no `_props` → `controller.loading || !controller.dataSet` → `render()`. In Lit, PagesElement overrides `render()` to implement this state machine using `cache()` to preserve content DOM across loading transitions:

```typescript
override render(): TemplateResult {
  if (this.controller.error) return this.renderError(this.controller.error);
  const showContent = !!this._props && !this.controller.loading && !!this.controller.dataSet;
  return html`${cache(showContent
    ? this.renderContent(this._props!, this.controller.dataSet as TypedDataSet)
    : this.renderLoading()
  )}`;
}
```

The `cache()` directive (from `lit/directives/cache.js`) preserves the content template's DOM when the dispatch switches to loading — moving it to a document fragment rather than destroying it. When data arrives and the dispatch switches back to content, the cached DOM is restored. This is critical for chart components: without `cache()`, every loading→content transition creates a new div, leaving the ECharts instance bound to a detached element (see §Base class: PagesChartElement). With `cache()`, the chart div and its ECharts canvas survive data refreshes, preserving chart state (zoom, selection, highlight). Error state bypasses `cache()` because error recovery is rare and chart re-init is acceptable there.

Subclasses implement only `renderContent(props, dataset): TemplateResult`. The dispatch logic lives in PagesElement — subclasses never need to check loading or error state.

**DataSourceController stays as a plain object, not a Lit ReactiveController.** DataSourceController lives in `pages-component`, which is intentionally framework-agnostic (ARC42STORIES §10: "Separation keeps Lit at the leaf level — data and rendering pipeline are framework-free"). Making it a `ReactiveController` would pull `@lit/reactive-element` into `pages-component`, violating this constraint. Its `onChange` callback calls `this.requestUpdate()` instead of the hand-rolled `this.update()`.

The refresh timer, resize observer, and data request dispatch all move into Lit lifecycle hooks (`connectedCallback`/`disconnectedCallback`) with `super` calls to preserve Lit's own lifecycle.

### Base class: PagesChartElement

ECharts instance management is imperative by nature — `echarts.init()` needs a real DOM element. The current pattern creates a container div in the constructor and passes it directly. With Lit, PagesChartElement uses a `ref()` directive to capture a rendered div:

```typescript
private _chartRef = createRef<HTMLDivElement>();

override renderContent(props: P, dataset: TypedDataSet): TemplateResult {
  return html`<div ${ref(this._chartRef)} style="width:100%;min-height:300px"></div>`;
}

override updated(changed: PropertyValues): void {
  super.updated(changed);
  const container = this._chartRef.value;
  if (!container || !this._props || !this.controller.dataSet) return;
  const chart = this.ensureChart(container);
  // ... existing buildOption + setOption pipeline
}
```

The `ref()` directive captures the DOM element after Lit renders the template. `updated()` fires after every render — the ECharts option pipeline runs there, replacing the current inline `render(container, props, dataset)` call. `firstUpdated()` handles one-time setup (click handler registration). The `buildOption(props, dataset)` subclass contract is unchanged — chart subclasses don't need template changes.

**Defensive container identity check:** Although PagesElement's `cache()` directive preserves the chart div across loading transitions (see §Render dispatch above), `ensureChart()` adds a container identity guard as a safety net for paths that bypass cache (error recovery):

```typescript
private _chartContainer: HTMLDivElement | undefined;

private ensureChart(container: HTMLDivElement): ECharts {
  if (this._chart && (this._currentTheme !== this.theme || container !== this._chartContainer)) {
    this._chart.dispose();
    this._chart = undefined;
  }
  if (!this._chart) {
    this._currentTheme = this.theme;
    this._chartContainer = container;
    this._chart = init(container, this.theme || "", undefined);
    this.registerClickHandler(this._chart);
  }
  return this._chart;
}
```

If the container div is ever a different element (e.g., after error recovery creates new DOM), the old chart is disposed and a new one is initialized on the correct container. This belt-and-suspenders approach ensures correctness regardless of which template caching path was taken.

### Base class: PagesFormInput

Lit base class, with MutationObserver and keydown listener logic moving into Lit lifecycle hooks. The `extractFieldValue()` and `emitFieldChange()` helpers stay as-is.

### Base class: PagesContentElement

Simplest migration — `extends LitElement`, `@property({ attribute: false }) props`, Lit `render()` dispatching to abstract `renderContent(props): TemplateResult`.

**PagesContentElement remains a separate base class from PagesElement.** Content components (PagesActionButton, PagesAlert, PagesLegend) have no data machinery — no DataSourceController, no refresh timer, no resize observer, no data request dispatch, no loading/error state dispatch. PagesElement carries all of this. Merging them would either add unused data machinery to content components or add conditional branching to skip it — both are worse than the current clean separation. With Lit, both inherit LitElement, but the intermediate bases carry different responsibilities: PagesElement wires data-bound reactivity, PagesContentElement provides bare props-driven rendering.

### Subclass rendering migration

**Chart subclasses (11 classes):** Lightest migration. They implement `buildOption()` returning ECharts option objects — no DOM construction. Only the class signature changes to inherit from the migrated PagesChartElement.

**Simple component subclasses (5 classes — PagesMetric, PagesSelector, PagesBadge, PagesCountdown, PagesIframePlugin):** Convert imperative `document.createElement` / `appendChild` chains to `html` tagged templates. Styles move to `static styles = css`...``.

**PagesGroupedView (1 class — dedicated subsection):** PagesGroupedView is 783 lines of deeply entangled imperative DOM management. It is qualitatively different from every other component and requires a separate migration strategy:

- **Child table management:** `_groupTables` Map creates and tracks child `<pages-table>` elements imperatively. In Lit, this becomes a `repeat()` directive iterating over group boundaries, with property forwarding via template bindings (`.dataSet=${groupDataSet}`, `.columnRenderers=${this._columnRenderers}`). The `_forwardToTables()` imperative setter calls become unnecessary — Lit's template diffing propagates changes automatically.
- **Expand/collapse state:** `_expandState` Map controls section visibility. Becomes `@state()` reactive property. Toggle handlers update the Map (with new reference per GE-20260705-7c80f2), triggering re-render.
- **Selection management:** `_handleChildSelectionChange()` and `_selectedKeys` Set aggregate selection across child tables. These become `@state()` properties with event listeners using `@selection-change=${this._handleChildSelectionChange}` in templates.
- **Column picker overlay:** `_pickerOpen` boolean and dropdown DOM construction become template conditional rendering with `@state()`.
- **Column visibility:** `_hiddenColumnIds` Set filters columns — becomes `@state()` with new reference on mutation.
- **Multi-level tree rendering:** `_renderNode()` recursive DOM construction becomes a recursive template helper returning `TemplateResult`.

This is a substantial redesign of the rendering path, though the business logic (group extraction, column width computation, boundary reconciliation) is unchanged.

**Form input subclasses (6 classes):** Convert imperative rendering to templates. Event listeners move from `addEventListener` to Lit `@event` syntax. PagesFormInput's `inputElement` reference (currently found via MutationObserver + `querySelector`) becomes a `@query('input, textarea')` decorator — the MutationObserver can be removed since Lit's `updated()` lifecycle replaces it.

**Content subclasses (3 classes — PagesActionButton, PagesAlert, PagesLegend):** Small components, no data machinery. PagesActionButton stores `this.button` and `this.messageContainer` as imperative DOM references — these become `@query` decorators or template-local references. The loading spinner and success/error message containers become conditional template blocks with `@state()` for `isLoading` and result state.

All `customElements.define("pages-xxx", ClassName)` calls convert to `@customElement('pages-xxx')` decorators.

### Runtime consumer compatibility

The runtime (`activation.ts`) sets properties imperatively:

```typescript
vizEl.props = { ...component.props, lookup };
vizEl.dataSet = value;
vizEl.loading = true;
```

Lit `@property({ attribute: false })` properties accept imperative assignment identically. The runtime creates elements with `document.createElement()` and sets properties before appending to DOM — Lit handles this correctly (property values queue until connection, then first render fires with all properties set).

The only runtime change is the PagesLegend activation fix (see §Runtime activation fix).

### Package dependency changes

`pages-viz/package.json`:
- Add `"lit": "^3.3.3"` to dependencies

`pages-viz/tsconfig.json`:
- Add `"experimentalDecorators": true` (required for esbuild + Lit decorator compatibility — see garden entry GE-20260717-19540a)
- Add `"useDefineForClassFields": false` (required alongside `experimentalDecorators` — TypeScript 5 defaults to TC39 define semantics which use `Object.defineProperty`, silently overwriting Lit's `@property()` accessor. Both existing Lit packages — pages-table and pages-primitives — require both flags)

### Test migration

**New devDependencies for pages-viz:**
- `@open-wc/testing` (v4) — provides `fixture()`, `expect`, and shadow DOM assertions. Matches pages-table's existing test infrastructure.
- `jsdom` — explicit dependency for shadow DOM support in vitest (pages-table already uses this).

**Element creation pattern:** Current tests use `document.createElement("test-pages-element")` directly. This still works with Lit, but `await el.updateComplete` must be added after property changes before querying shadow DOM. Alternatively, `fixture(html`<test-element></test-element>`)` from `@open-wc/testing` handles async setup automatically and is the preferred pattern for new tests.

**Pervasive changes across all test files:**
- Add `await el.updateComplete` after every property assignment that triggers a render
- Shadow DOM queries remain the same (`el.shadowRoot.querySelector(...)`)
- Custom event dispatch and assertions unchanged

## Garden warnings

Three garden entries are directly relevant:

1. **GE-20260705-7c80f2** — Lit `@state()` Set/Map mutation must create new references, not mutate in-place. Applies to any component holding mutable collections.
2. **GE-20260717-19540a** — esbuild TC39 decorator pass-through breaks Lit in Chromium 138+. Mitigated by `experimentalDecorators: true` in tsconfig.
3. **GE-20260720-96fab8** — Barrel re-exports couple side-effect modules, causing duplicate `customElements.define()`. Migrating `customElements.define()` calls to `@customElement()` decorators does not change this coupling — the decorator executes `customElements.define()` at module evaluation time, identical to the current standalone call. The barrel `import "./custom-elements.js"` in `index.ts` plus the re-exports still forces all components to register when any single component is imported. **This coupling is unchanged and accepted for this migration.** Sub-path exports are a separate concern that can be evaluated independently if tree-shaking becomes a priority.

### Runtime activation fix

`activation.ts` handles `component.type === "legend"` by constructing legend DOM imperatively — creating `<ul>`, `<li>`, `<span>` elements directly inside the activation callback (lines ~267-300). It does NOT create a `<pages-legend>` Web Component. Meanwhile, `component.type === "action-button"` and `component.type === "alert"` both use their Web Components correctly: `document.createElement("pages-action-button")` and `document.createElement("pages-alert")`.

This migration fixes the inconsistency: the legend handler will use `document.createElement("pages-legend")` and set props, matching the action-button and alert patterns. The imperative DOM construction is removed. This is the only runtime change.

## Risk

This is a large blast radius change — every visualization component and its tests. The risk is mitigated by:

1. The rendering output should be pixel-identical — same DOM structure, same CSS, same behavior
2. The runtime wiring is unchanged — property assignment works the same
3. Existing test coverage validates behavior preservation
4. pages-table already proves this Lit pattern works in this codebase
