# PagesElement Lit Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> executing-plans to implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural editing.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #192 — refactor: migrate PagesElement base class to Lit
**Issue group:** #192

**Goal:** Migrate PagesElement, PagesContentElement, and all 26 concrete subclasses from vanilla HTMLElement to LitElement with declarative templates.

**Architecture:** Two independent HTMLElement roots (PagesElement, PagesContentElement) become LitElement subclasses. PagesChartElement and PagesFormInput are intermediate bases that inherit Lit from PagesElement. All subclass `render(container, props, dataset)` methods convert to `renderContent(props, dataset): TemplateResult` returning Lit templates. DataSourceController stays framework-agnostic.

**Tech Stack:** Lit 3.3.3, TypeScript 5 with `experimentalDecorators` + `useDefineForClassFields: false`, vitest with jsdom

## Global Constraints

- `lit ^3.3.3` — match pages-table and pages-primitives version
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig.json — required for Lit decorators with esbuild (GE-20260717-19540a)
- Same flags in `vitest.config.ts` under `esbuild.tsconfigRaw` — vitest uses esbuild to transpile, must match tsconfig
- `@property({ attribute: false })` for all properties set by JS — none of these components use HTML attributes
- `cache()` directive in PagesElement render dispatch — preserves chart DOM across loading transitions
- Immutable collection updates for `@state()` — new Set/Map/Array reference on every mutation (GE-20260705-7c80f2)
- `@customElement('pages-xxx')` decorator replaces `customElements.define()` calls
- All tests add `await el.updateComplete` after property assignments before querying shadow DOM

---

### Task 1: Package infrastructure — add Lit dependency, tsconfig, vitest config

**Files:**
- Modify: `packages/pages-viz/package.json`
- Modify: `packages/pages-viz/tsconfig.json`
- Modify: `packages/pages-viz/vitest.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces: Lit available for import in pages-viz source files; decorator compilation working

- [ ] **Step 1: Add `lit` dependency to pages-viz**

In `packages/pages-viz/package.json`, add `"lit": "^3.3.3"` to `dependencies`.

- [ ] **Step 2: Add decorator flags to tsconfig.json**

In `packages/pages-viz/tsconfig.json`, add to `compilerOptions`:
```json
"experimentalDecorators": true,
"useDefineForClassFields": false
```

- [ ] **Step 3: Add esbuild decorator flags to vitest.config.ts**

Replace `packages/pages-viz/vitest.config.ts` content with:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    target: "es2022",
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
    },
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `yarn install`

- [ ] **Step 5: Verify Lit imports compile**

Run: `yarn workspace @casehubio/pages-viz run typecheck`
Expected: PASS (no new errors — Lit not yet imported anywhere)

- [ ] **Step 6: Commit**

```bash
git add packages/pages-viz/package.json packages/pages-viz/tsconfig.json packages/pages-viz/vitest.config.ts yarn.lock
git commit -m "build(#192): add Lit dependency and decorator config to pages-viz

Refs #192"
```

---

### Task 2: Migrate PagesContentElement base class + 3 content subclasses

**Files:**
- Modify: `packages/pages-viz/src/base/PagesContentElement.ts`
- Modify: `packages/pages-viz/src/base/PagesContentElement.test.ts`
- Modify: `packages/pages-viz/src/components/PagesActionButton.ts`
- Modify: `packages/pages-viz/src/components/PagesActionButton.test.ts`
- Modify: `packages/pages-viz/src/components/PagesAlert.ts`
- Modify: `packages/pages-viz/src/components/PagesAlert.test.ts`
- Modify: `packages/pages-viz/src/components/PagesLegend.ts`
- Modify: `packages/pages-viz/src/components/PagesLegend.test.ts`

**Interfaces:**
- Consumes: Lit from Task 1
- Produces: `PagesContentElement<P>` extending `LitElement` with abstract `renderContent(props: P): TemplateResult`

PagesContentElement is the simpler of the two roots — no data machinery, no DataSourceController. Migrating it first validates the Lit setup end-to-end with a small blast radius.

- [ ] **Step 1: Rewrite PagesContentElement to extend LitElement**

Replace `packages/pages-viz/src/base/PagesContentElement.ts` with:

```typescript
import { LitElement, html, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";

export abstract class PagesContentElement<P extends object> extends LitElement {
  @property({ attribute: false }) props: P | undefined;

  override render(): TemplateResult {
    if (!this.props) return html``;
    return this.renderContent(this.props);
  }

  protected abstract renderContent(props: P): TemplateResult;
}
```

Key changes:
- No manual `attachShadow()` or container div — Lit manages shadow root
- No manual getter/setter — `@property()` triggers re-render automatically
- `render()` is Lit's lifecycle method; subclasses implement `renderContent()`
- `connectedCallback`/`disconnectedCallback` no longer needed (Lit handles lifecycle)

- [ ] **Step 2: Update PagesContentElement tests**

Rewrite `packages/pages-viz/src/base/PagesContentElement.test.ts`. Key changes:
- Test element classes extend migrated PagesContentElement, implement `renderContent()` returning `html` template
- Add `await el.updateComplete` after property assignments
- Shadow DOM queries against Lit-rendered content
- Register test elements with `@customElement` decorator using unique tag names

- [ ] **Step 3: Run PagesContentElement tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/base/PagesContentElement.test.ts`
Expected: All tests pass

- [ ] **Step 4: Migrate PagesLegend to Lit**

Replace `packages/pages-viz/src/components/PagesLegend.ts`:

```typescript
import { html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { PagesContentElement } from "../base/PagesContentElement.js";

interface LegendEntry {
  readonly label: string;
  readonly color: string;
}

export interface LegendProps {
  readonly entries: readonly LegendEntry[];
  readonly layout?: "linear" | "horizontal" | "vertical" | "grid";
  readonly swatchShape?: "square" | "circle";
}

@customElement("pages-legend")
export class PagesLegend extends PagesContentElement<LegendProps> {
  static override styles = css`
    .pages-legend { display: flex; flex-wrap: wrap; gap: var(--pages-space-3, 12px); list-style: none; margin: 0; padding: 0; font-size: var(--pages-font-size-sm, 12px); color: var(--pages-neutral-11, #404040); }
    .pages-legend.horizontal { flex-wrap: nowrap; overflow-x: auto; }
    .pages-legend.vertical { flex-direction: column; flex-wrap: nowrap; }
    .pages-legend.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .legend-entry { display: flex; align-items: center; gap: var(--pages-space-1, 4px); }
    .legend-swatch { width: 12px; height: 12px; border-radius: var(--pages-radius-sm, 4px); flex-shrink: 0; }
    .legend-swatch.circle { border-radius: 50%; }
  `;

  protected override renderContent(props: LegendProps): TemplateResult {
    const layout = props.layout ?? "linear";
    const shape = props.swatchShape ?? "square";
    const layoutClass = layout === "linear" ? "" : ` ${layout}`;

    return html`
      <ul class="pages-legend${layoutClass}">
        ${props.entries.map(entry => html`
          <li class="legend-entry">
            <span class="legend-swatch${shape === "circle" ? " circle" : ""}"
                  style="background:${entry.color}"
                  aria-hidden="true"></span>
            <span>${entry.label}</span>
          </li>
        `)}
      </ul>
    `;
  }
}
```

- [ ] **Step 5: Migrate PagesAlert to Lit**

Replace `packages/pages-viz/src/components/PagesAlert.ts` — convert imperative DOM to `html` template, styles to `static styles = css`, replace `customElements.define()` with `@customElement("pages-alert")`.

- [ ] **Step 6: Migrate PagesActionButton to Lit**

Replace `packages/pages-viz/src/components/PagesActionButton.ts` — convert imperative DOM to `html` template, replace `this.button` and `this.messageContainer` references with `@query` decorators or template state, use `@state()` for `isLoading` and result state. Replace `customElements.define()` with `@customElement("pages-action-button")`.

- [ ] **Step 7: Update all 3 content subclass tests**

Update `PagesLegend.test.ts`, `PagesAlert.test.ts`, `PagesActionButton.test.ts`:
- Add `await el.updateComplete` after property assignments
- Adjust shadow DOM queries for Lit-rendered structure

- [ ] **Step 8: Run all content component tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/base/PagesContentElement.test.ts src/components/PagesLegend.test.ts src/components/PagesAlert.test.ts src/components/PagesActionButton.test.ts`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(#192): migrate PagesContentElement and content subclasses to Lit

Migrate PagesContentElement base class from HTMLElement to LitElement.
Convert PagesLegend, PagesAlert, PagesActionButton to declarative Lit
templates with @customElement decorators and static styles.

Refs #192"
```

---

### Task 3: Migrate PagesElement base class

**Files:**
- Modify: `packages/pages-viz/src/base/PagesElement.ts`
- Modify: `packages/pages-viz/src/base/PagesElement.test.ts`

**Interfaces:**
- Consumes: Lit from Task 1, DataSourceController from pages-component (unchanged)
- Produces: `PagesElement<P>` extending `LitElement` with abstract `renderContent(props: P, dataset: TypedDataSet): TemplateResult`, `cache()` directive for content preservation, `renderLoading(): TemplateResult`, `renderError(message: string): TemplateResult`

This is the core migration — the data-bound base class.

- [ ] **Step 1: Rewrite PagesElement to extend LitElement**

Replace `packages/pages-viz/src/base/PagesElement.ts` with the Lit version:

```typescript
import { LitElement, html, css, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import type { DataSetLookup, SortColumn, TypedDataSet } from "@casehubio/pages-data";
import { DataSourceController } from "@casehubio/pages-component";
import type { VizComponentProps } from "./types.js";

export interface PagesDataRequestDetail {
  readonly element: PagesElement<VizComponentProps>;
  readonly lookup: DataSetLookup;
}

export abstract class PagesElement<
  P extends VizComponentProps,
> extends LitElement {
  readonly controller = new DataSourceController({
    onChange: () => { if (!this._batchUpdate) this.requestUpdate(); },
    onRefresh: () => {
      this._dataRequested = false;
      this.requestDataIfNeeded();
    },
  });

  @property({ attribute: false }) declare props: P | undefined;
  @state() private _theme = "";
  private _batchUpdate = false;
  private _dataRequested = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _resizeObserver: ResizeObserver | undefined;
  private _prevProps: P | undefined;

  // Delegated controller properties
  get loading(): boolean { return this.controller.loading; }
  set loading(v: boolean) { this.controller.loading = v; }

  get dataSet(): TypedDataSet | undefined { return this.controller.dataSet as TypedDataSet | undefined; }
  set dataSet(value: TypedDataSet | undefined) { this.controller.dataSet = value; }

  get totalRows(): number { return this.controller.totalRows; }
  set totalRows(value: number) { this.controller.totalRows = value; }

  get theme(): string { return this._theme; }
  set theme(value: string) { this._theme = value; }

  get error(): string { return this.controller.error; }
  set error(value: string) { this.controller.error = value; }

  get activeSort(): SortColumn | undefined { return this.controller.activeSort; }
  set activeSort(value: SortColumn | undefined) { this.controller.activeSort = value; }

  get activePage(): number | undefined { return this.controller.activePage; }
  set activePage(value: number | undefined) { this.controller.activePage = value; }

  // Lifecycle
  override connectedCallback(): void {
    super.connectedCallback();
    this.requestDataIfNeeded();
    this.startRefreshTimer();
    this.startResizeObserver();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._dataRequested = false;
    this.stopRefreshTimer();
    this.stopResizeObserver();
  }

  override willUpdate(): void {
    const newProps = this.props;
    const oldProps = this._prevProps;
    if (newProps !== oldProps) {
      this._prevProps = newProps;
      const oldLookup = oldProps?.lookup;
      const oldInterval = oldProps?.refresh?.interval;
      this._batchUpdate = true;
      if (newProps?.lookup !== oldLookup) {
        this._dataRequested = false;
        this.controller.dataSet = undefined;
      }
      this._batchUpdate = false;
      this.requestDataIfNeeded();
      if (newProps?.refresh?.interval !== oldInterval) {
        this.startRefreshTimer();
      }
    }
  }

  // Render dispatch with cache() for chart DOM preservation
  override render(): TemplateResult {
    if (this.controller.error) return this.renderError(this.controller.error);
    const showContent = !!this.props && !this.controller.loading && !!this.controller.dataSet;
    return html`${cache(showContent
      ? this.renderContent(this.props!, this.controller.dataSet as TypedDataSet)
      : this.renderLoading()
    )}`;
  }

  // Default renderers — subclasses may override
  protected renderLoading(): TemplateResult {
    return html`
      <div data-pages-loading>
        <div class="pages-skeleton"></div>
        <div class="pages-skeleton" style="width:80%"></div>
        <div class="pages-skeleton" style="width:60%"></div>
      </div>
    `;
  }

  protected renderError(message: string): TemplateResult {
    return html`
      <div data-pages-error>
        <span class="pages-error-icon">⚠</span>
        <span class="pages-error-msg">${message}</span>
        ${this.props?.lookup ? html`
          <button data-pages-retry @click=${this._handleRetry}>Retry</button>
        ` : ""}
      </div>
    `;
  }

  static override styles = css`
    @keyframes pages-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
    [data-pages-loading] { padding: 12px; }
    .pages-skeleton { height: 14px; border-radius: var(--pages-radius-sm, 4px); background: var(--pages-neutral-2, #f0f0f0); margin-bottom: 10px; animation: pages-pulse 1.5s ease-in-out infinite; }
    [data-pages-error] { padding: 12px; border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); background: var(--pages-neutral-1, #fff); }
    .pages-error-icon { display: inline; margin-right: 6px; }
    .pages-error-msg { color: var(--pages-neutral-12, #333); font-size: var(--pages-font-size-base, 14px); }
    [data-pages-retry] { margin-top: 8px; padding: 4px 12px; border: 1px solid var(--pages-accent-9, #5470c6); background: transparent; color: var(--pages-accent-9, #5470c6); border-radius: var(--pages-radius-sm, 4px); cursor: pointer; font-size: 13px; }
    [data-pages-retry]:hover { background: var(--pages-accent-3, #e8eaf6); }
  `;

  // Data request
  private requestDataIfNeeded(): void {
    if (!this.isConnected) return;
    if (this._dataRequested) return;
    const lookup = this.props?.lookup;
    if (!lookup) return;
    this._dataRequested = true;
    this.dispatchEvent(
      new CustomEvent<PagesDataRequestDetail>("pages-data-request", {
        bubbles: true, composed: true,
        detail: { element: this, lookup },
      }),
    );
  }

  // Refresh timer
  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    const interval = this.props?.refresh?.interval;
    if (!interval || !this.isConnected) return;
    this._refreshTimer = setInterval(() => {
      this._dataRequested = false;
      this.requestDataIfNeeded();
    }, interval);
  }

  private stopRefreshTimer(): void {
    if (this._refreshTimer !== undefined) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  // Resize observer
  private startResizeObserver(): void {
    this.stopResizeObserver();
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => { this.onResize(); });
    this._resizeObserver.observe(this);
  }

  private stopResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
  }

  private _handleRetry = (): void => {
    this.controller.error = "";
    this._dataRequested = false;
    this.requestDataIfNeeded();
  };

  // Hooks
  protected onResize(): void {}

  // Subclass contract
  protected abstract renderContent(props: P, dataset: TypedDataSet): TemplateResult;
}
```

Key changes from the original:
- `@property({ attribute: false })` for `props` — Lit triggers re-render on assignment
- Controller `onChange` calls `requestUpdate()` instead of the hand-rolled `update()`
- `willUpdate()` replaces the props setter side-effects (lookup reset, refresh timer)
- `render()` implements the error → loading → content dispatch with `cache()`
- `renderLoading()` and `renderError()` return `TemplateResult` instead of writing to container
- ResizeObserver observes `this` (the host element) instead of a container div
- `static styles` replaces inline `<style>` element creation

- [ ] **Step 2: Rewrite PagesElement tests**

Update `packages/pages-viz/src/base/PagesElement.test.ts`:
- Test elements implement `renderContent()` returning `html` template
- Add `await el.updateComplete` after all property assignments
- Test the render dispatch state machine (loading, error, content)
- Test data request events still fire correctly
- Test refresh timer and resize observer lifecycle

- [ ] **Step 3: Run PagesElement tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/base/PagesElement.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(#192): migrate PagesElement base class to LitElement

Replace HTMLElement with LitElement, manual getter/setter with @property,
hand-rolled update() with Lit render dispatch using cache() directive.
DataSourceController stays framework-agnostic — onChange calls requestUpdate().

Refs #192"
```

---

### Task 4: Migrate PagesChartElement base class + 11 chart subclasses

**Files:**
- Modify: `packages/pages-viz/src/base/PagesChartElement.ts`
- Modify: `packages/pages-viz/src/base/PagesChartElement.test.ts`
- Modify: 11 chart files in `packages/pages-viz/src/charts/` (PagesBarChart, PagesLineChart, PagesAreaChart, PagesPieChart, PagesScatterChart, PagesBubbleChart, PagesTimeseries, PagesTimeline, PagesMeter, PagesMap, PagesGraph)
- Modify: all chart test files that exist

**Interfaces:**
- Consumes: PagesElement from Task 3
- Produces: `PagesChartElement<P>` with `ref()` directive for ECharts container, `updated()` for option pipeline, unchanged `buildOption()` subclass contract

- [ ] **Step 1: Rewrite PagesChartElement to use Lit lifecycle**

Replace `packages/pages-viz/src/base/PagesChartElement.ts`:

```typescript
import { html, type TemplateResult, type PropertyValues } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { TitleComponent } from "echarts/components";
import { PagesElement } from "./PagesElement.js";
import type { VizComponentProps } from "./types.js";
import type { TypedDataSet, Column } from "@casehubio/pages-data";
import type { ChartSettings } from "@casehubio/pages-component";
import type { PagesFilterDetail, PagesFilterApply, PagesFilterReset, ChartClickParams } from "./filter-types.js";
import { cellToRaw } from "./cell-extract.js";

use([CanvasRenderer, TitleComponent]);

export abstract class PagesChartElement<
  P extends VizComponentProps & ChartSettings,
> extends PagesElement<P> {
  private _chartRef = createRef<HTMLDivElement>();
  private _chart: ECharts | undefined;
  private _chartContainer: HTMLDivElement | undefined;
  private _currentTheme = "";
  private _selectedValue: string | undefined;
  private _selectedDataIndex: number | undefined;
  private _renderGen = 0;

  protected override renderContent(props: P, dataset: TypedDataSet): TemplateResult {
    this.applySizing(props);
    return html`<div ${ref(this._chartRef)}
                     style="width:100%;min-height:300px;overflow:hidden"></div>`;
  }

  override updated(changed: PropertyValues): void {
    super.updated(changed);
    const container = this._chartRef.value;
    if (!container || !this.props || !this.dataSet) return;

    ++this._renderGen;
    const gen = this._renderGen;
    const chart = this.ensureChart(container);
    const result = this.buildOption(this.props, this.dataSet);

    const apply = (option: Record<string, unknown>): void => {
      if (this._renderGen !== gen) return;
      chart.setOption(option, true);
      if (this._selectedValue !== undefined && this._selectedDataIndex !== undefined) {
        this.syncHighlight(chart, undefined, this._selectedDataIndex);
      }
    };

    if (result instanceof Promise) {
      void result.then(apply).catch((e: unknown) => {
        if (this._renderGen !== gen) return;
        this.error = e instanceof Error ? e.message : String(e);
      });
    } else {
      apply(result);
    }
  }

  // Subclasses also override to set dataSet with selection tracking
  override set dataSet(value: TypedDataSet | undefined) {
    super.dataSet = value;
    if (this._selectedValue !== undefined && value) {
      const filterCol = this.resolveFilterColumn();
      if (filterCol) {
        const idx = value.rows.findIndex(r => {
          const cell = r.cell(filterCol.id);
          return cell.type !== "NULL" && String(cellToRaw(cell)) === this._selectedValue;
        });
        if (idx >= 0) {
          this._selectedDataIndex = idx;
        } else {
          this._selectedValue = undefined;
          this._selectedDataIndex = undefined;
        }
      }
    }
  }

  override get dataSet(): TypedDataSet | undefined {
    return super.dataSet;
  }

  protected resolveFilterColumn(): Column | undefined {
    return this.dataSet?.columns[0];
  }

  private applySizing(props: P): void {
    const raw = props as Readonly<Record<string, unknown>>;
    const h = raw.height;
    if (typeof h === "number") {
      this.style.minHeight = `${String(h)}px`;
      this.style.height = `${String(h)}px`;
    } else if (typeof h === "string") {
      this.style.minHeight = h;
      this.style.height = h;
    }
    const w = raw.width;
    if (typeof w === "number") {
      this.style.width = `${String(w)}px`;
    } else if (typeof w === "string") {
      this.style.width = w;
    }
  }

  abstract buildOption(
    props: P,
    dataset: TypedDataSet,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;

  // ECharts instance management with container identity check
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

  // Click handler — unchanged logic
  private registerClickHandler(chart: ECharts): void {
    chart.on("click", (params) => {
      const clickParams = params as unknown as ChartClickParams;
      const filter = this.props?.filter;
      if (!filter?.enabled) return;
      const ds = this.dataSet;
      if (!ds) return;
      const filterCol = this.resolveFilterColumn();
      if (!filterCol) return;
      const row = ds.rows[clickParams.dataIndex];
      if (!row) return;
      const cell = row.cell(filterCol.id);
      if (cell.type === "NULL") return;
      const value = String(cellToRaw(cell));

      if (value === this._selectedValue) {
        const prevIndex = this._selectedDataIndex;
        this._selectedValue = undefined;
        this._selectedDataIndex = undefined;
        this.syncHighlight(chart, prevIndex, undefined);
        this.dispatchEvent(
          new CustomEvent<PagesFilterDetail>("pages-filter", {
            bubbles: true, composed: true,
            detail: { columnId: filterCol.id, reset: true, group: filter.group } satisfies PagesFilterReset,
          }),
        );
      } else {
        const prevIndex = this._selectedDataIndex;
        this._selectedValue = value;
        this._selectedDataIndex = clickParams.dataIndex;
        this.syncHighlight(chart, prevIndex, clickParams.dataIndex);
        this.dispatchEvent(
          new CustomEvent<PagesFilterDetail>("pages-filter", {
            bubbles: true, composed: true,
            detail: { columnId: filterCol.id, value, row, reset: false, group: filter.group } satisfies PagesFilterApply,
          }),
        );
      }
    });
  }

  private syncHighlight(chart: ECharts, prevIndex: number | undefined, newIndex: number | undefined): void {
    const seriesCount = (chart.getOption().series as unknown[]).length;
    const seriesIndex = Array.from({ length: seriesCount }, (_, i) => i);
    if (prevIndex !== undefined) {
      chart.dispatchAction({ type: "downplay", seriesIndex, dataIndex: prevIndex });
    }
    if (newIndex !== undefined) {
      chart.dispatchAction({ type: "highlight", seriesIndex, dataIndex: newIndex });
    }
  }

  override onResize(): void {
    this._chart?.resize();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._chart) {
      this._chart.dispose();
      this._chart = undefined;
    }
    this._chartContainer = undefined;
    this._selectedValue = undefined;
    this._selectedDataIndex = undefined;
  }
}
```

- [ ] **Step 2: Update PagesChartElement tests**

Update `packages/pages-viz/src/base/PagesChartElement.test.ts`:
- Add `await el.updateComplete` after property assignments
- Adjust for Lit lifecycle (chart init happens in `updated()` after `render()`)

- [ ] **Step 3: Migrate all 11 chart subclasses**

Each chart subclass change is minimal — they don't do DOM construction. Changes:
- Remove `customElements.define()` at file bottom
- Add `@customElement('pages-xxx')` decorator on the class
- Add `import { customElement } from "lit/decorators.js";`
- The `buildOption()` method and all chart logic stays identical

Files: PagesBarChart.ts, PagesLineChart.ts, PagesAreaChart.ts, PagesPieChart.ts, PagesScatterChart.ts, PagesBubbleChart.ts, PagesTimeseries.ts, PagesTimeline.ts, PagesMeter.ts, PagesMap.ts, PagesGraph.ts

- [ ] **Step 4: Update all chart tests**

Add `await el.updateComplete` after property/dataset assignments in all chart test files.

- [ ] **Step 5: Run all chart tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/base/PagesChartElement.test.ts src/charts/`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(#192): migrate PagesChartElement and 11 chart subclasses to Lit

PagesChartElement uses ref() directive for ECharts container, updated()
for option pipeline, cache() from PagesElement preserves chart DOM across
loading transitions. buildOption() subclass contract unchanged — chart
subclasses only gain @customElement decorator.

Refs #192"
```

---

### Task 5: Migrate PagesFormInput base class + 6 form input subclasses

**Files:**
- Modify: `packages/pages-viz/src/form-inputs/PagesFormInput.ts`
- Modify: `packages/pages-viz/src/form-inputs/PagesTextInput.ts`
- Modify: `packages/pages-viz/src/form-inputs/PagesNumberInput.ts`
- Modify: `packages/pages-viz/src/form-inputs/PagesDropdown.ts`
- Modify: `packages/pages-viz/src/form-inputs/PagesCheckbox.ts`
- Modify: `packages/pages-viz/src/form-inputs/PagesDatePicker.ts`
- Modify: `packages/pages-viz/src/form-inputs/PagesTextarea.ts`
- Modify: `packages/pages-viz/src/form-inputs/form-inputs.test.ts`
- Modify: `packages/pages-viz/src/form-inputs/form-submit.test.ts`

**Interfaces:**
- Consumes: PagesElement from Task 3
- Produces: `PagesFormInput<P>` with `@query` for input element, Lit lifecycle replacing MutationObserver

- [ ] **Step 1: Rewrite PagesFormInput base to use Lit lifecycle**

Key changes:
- MutationObserver for input detection → `@query('input, textarea')` decorator + `updated()` lifecycle
- Manual `addEventListener`/`removeEventListener` → Lit `@keydown` in subclass templates or `updated()` wiring
- `extractFieldValue()` and `emitFieldChange()` stay as-is (pure logic, no DOM)

- [ ] **Step 2: Migrate all 6 form input subclasses**

Each converts imperative DOM construction to `html` templates:
- PagesTextInput: `<input type="text">` with `@input` and `@change` handlers
- PagesNumberInput: `<input type="number">` with min/max/step attributes
- PagesDropdown: `<select>` with `<option>` mapping from dataset
- PagesCheckbox: `<input type="checkbox">` with label
- PagesDatePicker: `<input type="date">` with min/max
- PagesTextarea: `<textarea>` with rows

All replace `customElements.define()` with `@customElement()` decorator.

- [ ] **Step 3: Update form input tests**

Update `form-inputs.test.ts` and `form-submit.test.ts`:
- Add `await el.updateComplete` after property assignments
- Adjust element queries for Lit-rendered templates

- [ ] **Step 4: Run form input tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/form-inputs/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(#192): migrate PagesFormInput and 6 form input subclasses to Lit

Replace MutationObserver input detection with @query decorator and
updated() lifecycle. Convert imperative DOM to html templates with
@event bindings. extractFieldValue() and emitFieldChange() unchanged.

Refs #192"
```

---

### Task 6: Migrate remaining data component subclasses (PagesMetric, PagesSelector, PagesBadge, PagesCountdown, PagesIframePlugin)

**Files:**
- Modify: `packages/pages-viz/src/components/PagesMetric.ts`
- Modify: `packages/pages-viz/src/components/PagesMetric.test.ts`
- Modify: `packages/pages-viz/src/components/PagesSelector.ts`
- Modify: `packages/pages-viz/src/components/PagesSelector.test.ts`
- Modify: `packages/pages-viz/src/components/PagesBadge.ts`
- Modify: `packages/pages-viz/src/components/PagesBadge.test.ts`
- Modify: `packages/pages-viz/src/components/PagesCountdown.ts`
- Modify: `packages/pages-viz/src/components/PagesCountdown.test.ts`
- Modify: `packages/pages-viz/src/components/PagesIframePlugin.ts`
- Modify: `packages/pages-viz/src/components/PagesIframePlugin.test.ts`

**Interfaces:**
- Consumes: PagesElement from Task 3
- Produces: 5 migrated components with `renderContent()` returning `TemplateResult`

- [ ] **Step 1: Migrate PagesMetric**

Convert all `document.createElement`/`appendChild` chains to `html` templates. Move CSS from inline `<style>` element to `static styles = css`. Replace `customElements.define()` with `@customElement("pages-metric")`.

Example — `renderCard()` becomes:
```typescript
private renderCard(title: string, value: string): TemplateResult {
  return html`<div class="card">
    <div class="title">${title}</div>
    <div class="value">${value}</div>
  </div>`;
}
```

- [ ] **Step 2: Migrate PagesSelector**

Convert `<select>` construction and option rendering to `html` template. Move event handler from `addEventListener` to `@change` in template.

- [ ] **Step 3: Migrate PagesBadge**

Convert badge DOM construction to template. Multiple badge variants (status, counter, dot) become conditional template blocks.

- [ ] **Step 4: Migrate PagesCountdown**

Convert countdown timer display to template. `setInterval` for countdown ticks stays imperative in `connectedCallback`/`disconnectedCallback`.

- [ ] **Step 5: Migrate PagesIframePlugin**

Convert iframe element construction to template. `postMessage` communication logic stays imperative.

- [ ] **Step 6: Update all 5 component tests**

Add `await el.updateComplete`, adjust shadow DOM queries.

- [ ] **Step 7: Run all component tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/components/PagesMetric.test.ts src/components/PagesSelector.test.ts src/components/PagesBadge.test.ts src/components/PagesCountdown.test.ts src/components/PagesIframePlugin.test.ts`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor(#192): migrate 5 data component subclasses to Lit templates

Convert PagesMetric, PagesSelector, PagesBadge, PagesCountdown,
PagesIframePlugin from imperative DOM to declarative html templates
with static styles and @customElement decorators.

Refs #192"
```

---

### Task 7: Migrate PagesGroupedView

**Files:**
- Modify: `packages/pages-viz/src/components/grouped-view/PagesGroupedView.ts`
- Modify: `packages/pages-viz/src/components/grouped-view/PagesGroupedView.test.ts`
- Possibly modify: render helpers in `packages/pages-viz/src/components/grouped-view/`

**Interfaces:**
- Consumes: PagesElement from Task 3
- Produces: PagesGroupedView with `renderContent()` using `repeat()` directive, `@state()` for expand/collapse and selection state

This is the most complex migration — 783 lines of entangled imperative DOM management.

- [ ] **Step 1: Read all PagesGroupedView source files**

Read PagesGroupedView.ts and all render helper files in the grouped-view directory to understand the full scope before writing any code.

- [ ] **Step 2: Convert state management to Lit reactive properties**

- `_expandState: Map` → `@state()` with new Map on every mutation
- `_selectedKeys: Set` → `@state()` with new Set on every mutation
- `_hiddenColumnIds: Set` → `@state()` with new Set on every mutation
- `_pickerOpen: boolean` → `@state()`

- [ ] **Step 3: Convert render methods to templates**

- `_renderNode()` recursive DOM construction → recursive template helper returning `TemplateResult`
- Child `<pages-table>` creation → `repeat()` directive iterating over group boundaries with template bindings
- Column picker overlay → conditional template rendering
- `_forwardToTables()` imperative setter calls → removed (Lit template bindings propagate automatically)

- [ ] **Step 4: Convert styles**

Move all inline `<style>` creation to `static styles = css`.

- [ ] **Step 5: Replace customElements.define with @customElement**

- [ ] **Step 6: Update PagesGroupedView tests**

Add `await el.updateComplete`, adjust for Lit-rendered structure.

- [ ] **Step 7: Run PagesGroupedView tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --reporter verbose src/components/grouped-view/`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor(#192): migrate PagesGroupedView to Lit

Convert 783 lines of imperative DOM management to declarative Lit
templates. Child pages-table instances use template bindings instead of
_forwardToTables(). Expand/collapse, selection, and column visibility
use @state() with immutable updates.

Refs #192"
```

---

### Task 8: Update custom-elements.ts, barrel exports, and activation.ts legend fix

**Files:**
- Modify: `packages/pages-viz/src/custom-elements.ts`
- Modify: `packages/pages-runtime/src/activation.ts`
- Modify: `packages/pages-runtime/src/activation.test.ts` (or relevant test for legend)

**Interfaces:**
- Consumes: All migrated components from Tasks 2-7
- Produces: Clean barrel with `@customElement` decorator registration, PagesLegend activation fix

- [ ] **Step 1: Update custom-elements.ts**

With `@customElement()` decorators on every class, the `customElements.define()` calls are gone from individual files. However, `custom-elements.ts` still serves as the side-effect import that triggers registration and the `HTMLElementTagNameMap` declaration. Update imports — the type imports stay as-is (they reference the classes for the tag name map), and the bare `import "./components/PagesLegend.js"` stays (PagesLegend's `@customElement` runs at import time).

- [ ] **Step 2: Fix PagesLegend activation in activation.ts**

Replace lines 267-299 in `packages/pages-runtime/src/activation.ts` (the imperative legend DOM construction) with:

```typescript
if (component.type === "legend" && component.props) {
  const legendEl = document.createElement("pages-legend");
  (legendEl as unknown as PagesContentElement<Record<string, unknown>>).props = component.props;
  el.appendChild(legendEl);
  if (component.visibleWhen && contextManager) {
    registerVisibleWhenConsumer(el, null, component.visibleWhen, contextManager);
  }
  return;
}
```

This matches the existing action-button and alert activation patterns.

- [ ] **Step 3: Add/update activation test for legend**

Verify the legend activation now creates a `<pages-legend>` element and sets props.

- [ ] **Step 4: Run activation tests**

Run: `yarn workspace @casehubio/pages-runtime run test -- --reporter verbose src/activation.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(#192): update custom-elements.ts and fix PagesLegend activation

Update custom-elements.ts for @customElement decorator pattern. Fix
activation.ts legend handler to use <pages-legend> Web Component instead
of imperative DOM construction, matching action-button and alert patterns.

Refs #192"
```

---

### Task 9: Full test suite, typecheck, and build verification

**Files:**
- No new modifications — verification only

**Interfaces:**
- Consumes: all changes from Tasks 1-8
- Produces: green build, clean typecheck, all tests passing

- [ ] **Step 1: Run full pages-viz test suite**

Run: `yarn workspace @casehubio/pages-viz run test`
Expected: All tests pass

- [ ] **Step 2: Run pages-runtime test suite**

Run: `yarn workspace @casehubio/pages-runtime run test`
Expected: All tests pass (activation changes verified)

- [ ] **Step 3: Run cross-package typecheck**

Run: `yarn typecheck`
Expected: No type errors

- [ ] **Step 4: Run full build**

Run: `yarn build`
Expected: Clean build with no errors

- [ ] **Step 5: Run lint**

Run: `yarn lint`
Expected: No new lint errors

- [ ] **Step 6: Commit any lint fixes if needed**

```bash
git commit -m "fix(#192): lint fixes for Lit migration

Refs #192"
```
