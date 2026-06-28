# Clinical Trial Demo — Platform Capabilities

**Epic:** #50 — Clinical trial demo — casehub-pages capabilities
**Date:** 2026-06-28
**Covers:** #37, #38, #39, #40, #41, #42, #43, #46, #47, #48, #49, #54
**Deferred:** #55 (Casehub* → Pages* rename — blocked on clinical shipping), #52/#53 (WebSocket provider — separate branch, compatible with this design)

## S1: Problem

casehub-pages is a static dashboard runtime — data sources, content, and visibility are all fixed at YAML parse time. The platform has no concept of:

- Components that show/hide based on runtime state
- Content that interpolates runtime values
- Dataset URLs that resolve from filter context
- Write operations (POST back to a server)

The clinical trial demo (casehubio/clinical) is the first consumer that needs all of these. But these are platform capabilities, not clinical-specific features. Every capability designed here is domain-agnostic and reusable by any casehub-pages consumer.

## S2: Architectural Decisions

- **Unified context resolution model** — #47 (conditional visibility), #48 (content interpolation), and #49 (parameterised URLs) share a single runtime context and template mechanism rather than three independent implementations.
- **Rich context (Approach B)** — the context includes filter state, dataset snapshots, page state, and parameters. Filter-only context (Approach A) was rejected because alerts and visibility conditions need dataset-aware values (row counts, first-row fields). Two-layer static/reactive split (Approach C) was rejected as premature optimisation.
- **`#{}` syntax for runtime templates** — distinct from the existing parse-time `${}` property substitution. No ambiguity, no backward-compatibility risk.
- **Shared HTTP action infrastructure** — #46 (action button) and #54 (form submit) both delegate to a common `ActionExecutor`. Designing them separately would produce two parallel implementations of the same mechanism.
- **Minimal expression language** — visibility and row styling conditions use a deliberately constrained grammar (comparisons, logical operators, no function calls). Complex logic belongs in the data pipeline, not the UI layer.
- **WebSocket compatibility** — the context model's reactivity handles WebSocket dataset pushes naturally. No design changes needed when #52/#53 are implemented later.
- **Naming convention** — all new components use the current `Casehub*` prefix. The rename to `Pages*` (#55) is deferred until casehubio/clinical ships its initial UI.

---

## S3: 1. Context Resolution Model (#47, #48, #49)

### S3.1: 1.1 RuntimeContext

The runtime maintains a context object capturing the current dashboard state:

```typescript
interface RuntimeContext {
  readonly filter: Record<string, readonly string[]>;
  readonly datasets: Record<string, DataSetSnapshot>;
  readonly page: { name: string; path: string };
  readonly params: Record<string, string>;
}

interface DataSetSnapshot {
  readonly rowCount: number;
  readonly columns: readonly string[];
  readonly first?: Record<string, string | number | null>;
}
```

- `filter` — active filter values keyed by columnId, page-scoped. Derived from the current page's `FilterState` via `deriveActiveFilters()`, which merges all filter groups into a single flat record. This is intentional: `#{filter.*}` in expressions reflects the user's complete filter state regardless of group, while the data pipeline's group-aware filtering determines which datasets are affected. Values are always `string[]` — a single-select filter produces a one-element array, not a bare string.
- `datasets` — metadata snapshots published after each dataset registration or accumulation. `rowCount` is the total rows in the **resolved dataset** (post-fetch, pre-cross-filter, pre-pagination). This is a stable count independent of per-component view state. Dashboard authors who need a count reflecting active filters should use a parameterised URL that applies filters server-side.

**Snapshot publication mechanism:** `createDataSetManager()` in `@casehubio/pages-data` gains an optional `onChanged` callback:

```typescript
interface DataSetManagerOptions {
  readonly onChanged?: (dataSetId: DataSetId, dataset: TypedDataSet) => void;
}
export function createDataSetManager(options?: DataSetManagerOptions): DataSetManager;
```

The manager invokes `onChanged` after every `register()` and `accumulate()` call that modifies a dataset. The runtime provides this callback to build `DataSetSnapshot` and update `RuntimeContext.datasets`:

```typescript
function buildSnapshot(dataset: TypedDataSet): DataSetSnapshot {
  return {
    rowCount: dataset.rows.length,
    columns: dataset.columns.map(c => c.id),
    first: dataset.rows.length > 0
      ? Object.fromEntries(
          dataset.columns.map((c, i) => [c.id, dataset.rows[0]?.cells[i]?.value ?? null])
        )
      : undefined,
  };
}
```

This design covers all data arrival paths: external URL resolution, inline datasets, WebSocket `accumulate()` pushes, and action-complete refreshes. The snapshot is built from the manager's registered data (pre-cross-filter, pre-pagination), not from the pipeline's filtered output. Each snapshot update triggers a context change evaluation pass (§1.4).
- `page` — current page/navigation state
- `params` — URL hash parameters and page-level properties

### S3.2: 1.2 Template syntax

`#{path.to.value}` resolves at runtime and re-evaluates when context changes.

| Template | Resolves to |
|----------|-------------|
| `#{filter.ward}` | Active filter value for column "ward" |
| `#{datasets.patients.rowCount}` | Number of rows in the "patients" dataset |
| `#{datasets.patients.first.name}` | First row's "name" cell value |
| `#{page.name}` | Current page name |
| `#{params.trialId}` | URL parameter or page property |

**Array-valued filters:** `#{filter.ward}` resolves from `readonly string[]`. In string interpolation contexts (URLs, content), the first element is used. An empty array resolves to empty string. For expression semantics, see §1.3.

**Context-aware escaping:** The template resolver escapes interpolated values based on output context:

| Context | Escaping |
|---------|----------|
| `html:` content | HTML-entity escape (`<` → `&lt;`, `"` → `&quot;`, etc.) |
| `markdown:` content | Markdown-escape formatting characters (`*` → `\*`, `_` → `\_`, `` ` `` → `` \` ``, `[` → `\[`, `#` → `\#`, `~` → `\~`) then HTML-entity escape |
| Dataset URL templates | `encodeURIComponent()` |
| Expression evaluation (visibility, row styling) | None — values are compared, not rendered |
| Action body/headers | None — values are data, not markup |

Escaping happens at interpolation time in the template resolver — input values remain raw in the context.

### S3.3: 1.3 Expression language for conditions

Used by `visibleWhen` (#47) and row styling (#40). Minimal grammar — no function calls, no ternary. `#{}` expressions cannot be nested inside each other.

**Operators:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`, `!`

**Operator precedence** (standard, highest to lowest):

| Precedence | Operators |
|------------|-----------|
| 1 (highest) | `!` (unary NOT) |
| 2 | `>`, `<`, `>=`, `<=` |
| 3 | `==`, `!=` |
| 4 | `&&` |
| 5 (lowest) | `\|\|` |

**Parentheses** `()` are supported for explicit grouping:
```
(#{row.status} == 'Critical' && #{filter.showHighlights}) || #{row.daysOverdue} > 0
```

**Literals:** `'single-quoted strings'`, numeric literals, `true`, `false`, `null`

**Type coercion:** When both operands can be parsed as finite numbers, the comparison is numeric. Otherwise, operands are compared as strings. This applies consistently to all operators: `==`, `!=`, `>`, `<`, `>=`, `<=`.

**Array-valued filter semantics:** Filters are always `string[]`. In all scalar operations, the first element is used. An empty array resolves to `undefined`.
- Truthy check: `#{filter.ward}` → true if the array is non-empty
- Equality: `#{filter.ward} == 'ICU'` → compares first element: `filter.ward[0] === 'ICU'`
- Comparison: `#{filter.grade} >= 4` → compares first element: `Number(filter.grade[0]) >= 4`

Dashboard authors who need multi-value awareness (e.g., checking whether any selected value in a multi-select filter satisfies a condition) should use server-side parameterised URLs that accept array parameters.

**Examples:**
- Truthy check: `#{filter.ward}` — true if value exists and is non-empty
- Comparison: `#{filter.grade} >= 4`
- Equality: `#{row.status} == 'Critical'`
- Negation: `!#{filter.ward}`
- Logical AND: `#{filter.ward} && #{filter.status}`
- Grouped: `(#{row.status} == 'Critical' && #{filter.showHighlights}) || #{row.daysOverdue} > 0`

### S3.4: 1.4 Reactivity

**Change-detection model:** Object replacement. Each context change produces a new `RuntimeContext` reference. The runtime retains the previous reference for comparison.

**Consumer lifecycle — two registration paths:**

- **Web Components** (data components via `CasehubElement`, content Web Components via `CasehubContentElement`): Registration is automatic during `connectedCallback`. The runtime scans the component's props for `#{}` patterns and registers matching components as context consumers. On registration, the runtime **immediately evaluates** all expressions against the current context and applies effects. Deregistration is automatic during `disconnectedCallback`. Re-activation after a lazy container swap re-registers and re-evaluates against the current context. No stale state survives the DOM round-trip.
- **Plain-DOM content** (`html:`, `markdown:`, `title:`): These are not Web Components — they have no `connectedCallback`. During activation, the runtime's activation callback checks content props for `#{}` patterns. When found, it registers a lightweight consumer entry storing the DOM element, component type, and original template string. On context change, the runtime re-resolves the template and re-invokes the content renderer (`renderHtml`, `renderMarkdown`, or `renderTitle`) with the resolved props, replacing the element's content. Deregistration occurs when the parent is torn down by a lazy container's `innerHTML = ""`.

**Evaluation pass:** When context changes (filter applied, dataset resolved, page navigated):

1. Runtime creates a new `RuntimeContext` with the updated state
2. For each registered consumer:
   a. If the consumer is **suspended** (`visibleWhen` evaluated to falsy): re-evaluate **only** the `visibleWhen` expression. If it transitions to truthy, mark the consumer as **resumed** and continue to step 2c. Otherwise, skip this consumer.
   b. If the consumer has a `visibleWhen` expression and it transitions to falsy: apply suspension (§1.5) and skip remaining evaluations for this consumer.
   c. If the consumer is **active**: re-evaluate all `#{}` templates/conditions.
3. For each evaluated expression, compare the resolved value against the consumer's previous resolved value
4. If changed, apply the effect:
   - **Dataset URL** (#49) → re-fetch the dataset (see §1.9)
   - **Visibility** (#47) → show/hide the component (see §1.5 suspension model)
   - **Content** (#48) → re-render the text (Web Component re-renders internally; plain-DOM re-invokes content renderer)
   - **Row style** (#40) → re-render the table

**Cascade termination:** A dataset re-fetch (triggered by a URL template resolving to a new URL) updates the `datasets.*` portion of the context, which triggers another evaluation pass. Cascades terminate because:

- URL consumers whose templates resolve to the **same URL as before** do not re-fetch
- Visibility/content consumers that resolve to the **same value as before** do not re-render
- No consumer effect feeds back into `filter` or `page` state — these are updated only by user interaction or explicit navigation

**Cascade depth:** When dataset URLs reference only `filter.*` and `params.*`, a single filter change produces at most two evaluation passes (filter → URL re-evaluation → fetch → snapshot update → content/visibility re-evaluation). When dataset URLs reference `datasets.*` (e.g., a drill-down where dataset B's URL depends on `datasets.A.first.siteId`), each level of inter-dataset dependency adds another pass. The worst case is O(D) where D is the longest chain of dataset-to-dataset URL dependencies. The runtime enforces a maximum cascade depth of 10 — exceeding this logs a warning and halts the cascade. Circular dependencies (A's URL depends on B's snapshot, B's URL depends on A's snapshot) are caught by the same guard.

### S3.5: 1.5 `visibleWhen` property

New property on the base `Component` type in `pages-component/model/types.ts`:

```typescript
export interface Component<
  T extends string = string,
  P extends object = Record<string, unknown>,
> {
  readonly type: T;
  readonly id?: string;
  readonly visibleWhen?: string;  // new — context expression
  readonly props?: Readonly<P>;
  readonly style?: Readonly<Record<string, string>>;
  readonly access?: AccessControl;
  readonly slots?: Readonly<Record<string, readonly Component[]>>;
  readonly items?: readonly GridItem[];
}
```

Accepts a context expression string. When the expression evaluates to falsy, the component enters **suspended** state. When truthy, the component resumes.

**Suspension model:** When `visibleWhen` transitions to falsy:

1. The component's DOM element receives the `hidden` attribute (semantically indicates unavailability to assistive technologies; prevents display)
2. The component's refresh timer is stopped
3. Dataset fetches for the component are suppressed — parameterised URL changes do not trigger re-fetches
4. Other `#{}` templates (content, row styling) are not re-evaluated
5. The `visibleWhen` expression itself continues to be evaluated on every context change

When `visibleWhen` transitions back to truthy:

1. The `hidden` attribute is removed
2. All other `#{}` templates are re-evaluated against the current context
3. Dataset URLs are re-resolved — if the URL has changed since suspension, a fetch is triggered
4. The refresh timer is restarted

This model avoids resource waste (no fetches or re-renders for hidden components) while keeping DOM elements in place (no re-creation latency on toggle). It is distinct from the lazy-container lifecycle, which tears down DOM via `innerHTML = ""` and triggers `disconnectedCallback`. `visibleWhen` suspension is lighter-weight: the element stays connected but dormant.

**Static `visible` property:** The existing `visible?: boolean` on `DataComponentCommon` and `IframePluginProps` is currently unenforced — it is parsed from YAML but never checked at render time. This spec adds enforcement: during component activation, if `props.visible === false`, the component is not rendered. The `hidden` attribute is set on its container element at activation time and never re-evaluated.

**Precedence:** `visibleWhen` (runtime) > `visible` (static YAML) > default (visible). When `visibleWhen` is present, the `visible` static property is ignored.

### S3.6: 1.6 YAML integration

```yaml
# #49 — Parameterised dataset URL
datasets:
  - uuid: site_patients
    url: "/api/trials/#{filter.trialId}/sites/#{filter.siteId}/patients"

# #47 — Conditional visibility
- displayer:
    type: TABLE
    visibleWhen: "#{filter.patientId}"
    lookup:
        uuid: patient_vitals

# #48 — Content interpolation
- markdown:
    content: "## #{filter.ward} Ward\n\n#{datasets.patients.rowCount} patients"
```

### S3.7: 1.7 Package placement

| What | Package |
|------|---------|
| `RuntimeContext`, `DataSetSnapshot` types | `@casehubio/pages-component/context/` |
| Template parser (string → resolved value) | `@casehubio/pages-component/context/` |
| Expression evaluator (string → boolean) | `@casehubio/pages-component/context/` |
| `visibleWhen` property on `Component` | `@casehubio/pages-component/model/types.ts` |
| `CasehubContentElement<P>` base class | `@casehubio/pages-viz/base/CasehubContentElement.ts` |
| Context wiring (state tracking, consumer registration, cascade) | `@casehubio/pages-runtime` |
| Content interpolation reactivity (plain-DOM) | `@casehubio/pages-runtime` (activation callback) |
| `DataSetManager.onChanged` callback | `@casehubio/pages-data/dataset/manager.ts` |
| Snapshot construction + context update | `@casehubio/pages-runtime` |

Template parser and expression evaluator are pure functions with zero dependencies.

### S3.8: 1.8 Row-scoped context

Row styling conditions (#40) receive an extended context with a `row.*` namespace providing cell values for the current row. Row conditions can reference both row data and global context:

```yaml
condition: "#{row.status} == 'Critical' && #{filter.showHighlights}"
```

### S3.9: 1.9 Parameterised dataset URL resolution

Template resolution for dataset URLs happens in `@casehubio/pages-runtime`, not in `@casehubio/pages-data`. The runtime calls the template parser (pure function from `pages-component/context/`) with the URL template and current `RuntimeContext`, then passes the resolved concrete URL to the data pipeline. The data pipeline never sees `#{}` templates — it receives plain URLs. This preserves the correct dependency direction (`pages-runtime` → `pages-component`, `pages-runtime` → `pages-data`; `pages-data` never imports from `pages-component`).

**Deferred fetch:** If any `#{}` variable in a dataset URL is unresolved (references a filter or param that has no value), the fetch is suppressed. The dataset remains in a pending state with no `DataSetSnapshot` published. Components bound to that dataset render their empty/loading state. Once all variables resolve, the fetch proceeds normally.

**Request cancellation:** When a parameterised URL resolves to a new value while a fetch for the previous URL is in-flight, the runtime aborts the stale request before dispatching the new fetch. This prevents out-of-order response races.

The cancellation mechanism requires extending the resolver and provider interfaces:

1. `DataRequest` gains an optional `signal?: AbortSignal` field — mirrors the Fetch API's `RequestInit.signal` pattern:
   ```typescript
   interface DataRequest {
     readonly url: string;
     readonly method: HttpMethod;
     readonly headers: Readonly<Record<string, string>>;
     readonly query: Readonly<Record<string, string>>;
     readonly form?: Readonly<Record<string, string>>;
     readonly body?: string;
     readonly signal?: AbortSignal;  // new
   }
   ```
2. `resolveExternalDataSet` populates `request.signal` from `ctx.signal` via `buildRequest(def)`. The `DataProvider.fetch(request)` method signature is unchanged — signal travels as part of the request, not as a separate argument
3. `DataProvider` implementations pass `request.signal` to their internal `fetch()` calls. Existing providers that don't use the signal are unaffected — the field is optional
4. The runtime maintains a `Map<DataSetId, AbortController>` alongside `pendingResolutions`
5. On URL change: the runtime calls `abort()` on the existing controller for that dataset, creates a new `AbortController`, sets `ctx.signal = controller.signal`, and dispatches the new fetch
6. Aborted fetches reject with `AbortError`, which the pipeline catches and ignores (no error state set on the component)

### S3.10: 1.10 Content Web Component base class

`CasehubElement` is a data-component base class — its `update()` method gates rendering on `this._dataset` being defined, and it carries dataset-oriented machinery (data request dispatch, refresh timers, sort/page state, resize observer). Content Web Components (alert, action-button) have no dataset and would be stuck in a perpetual loading state if they extended `CasehubElement`.

New base class: `CasehubContentElement<P>` in `@casehubio/pages-viz/base/CasehubContentElement.ts`.

```typescript
abstract class CasehubContentElement<P extends object> extends HTMLElement {
  declare readonly shadowRoot: ShadowRoot;
  private _props: P | undefined;
  protected readonly container: HTMLDivElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    this.container = document.createElement("div");
    this.container.style.width = "100%";
    shadow.appendChild(this.container);
  }

  get props(): P | undefined { return this._props; }
  set props(value: P | undefined) {
    this._props = value;
    this.update();
  }

  connectedCallback(): void { this.update(); }
  disconnectedCallback(): void { /* runtime deregisters from context consumer registry */ }

  private update(): void {
    if (!this.isConnected || !this._props) return;
    this.render(this.container, this._props);
  }

  protected abstract render(container: HTMLDivElement, props: P): void;
}
```

Provides shadow DOM, props management, and `connectedCallback`/`disconnectedCallback` lifecycle. No refresh timer, no data request, no resize observer, no sort/page state. The `render(container, props)` signature has no dataset parameter.

**Deregistration:** `disconnectedCallback` triggers context consumer deregistration, consistent with `CasehubElement`. The runtime deregisters the consumer during this callback — the exact mechanism is the same as for data components: the runtime's context wiring code maintains the registry, and deregistration is driven by the lifecycle hook. For plain-DOM content consumers (§1.11), the runtime prunes stale entries by checking `element.isConnected` during evaluation passes — this is consistent with the existing slot swap registry's eviction pattern (ARC42STORIES §4).

Alert and ActionButton extend this class. Data components (Badge, Countdown, Timeline, Graph) continue to extend `CasehubElement` or `CasehubChartElement`.

### S3.11: 1.11 Content interpolation reactivity for plain-DOM components

Existing content components (`html:`, `markdown:`, `title:`) are rendered as plain DOM by utility functions in `content.ts` — they are not Web Components and have no `connectedCallback`. Content interpolation (#48) requires these elements to re-render when context changes.

The runtime handles this during activation. When the activation callback processes an `html:`, `markdown:`, or `title:` component whose props contain `#{}` patterns:

1. The runtime resolves all `#{}` templates against the current `RuntimeContext` before initial rendering
2. It registers a lightweight consumer entry in the context consumer registry: `{ element, componentType, originalTemplate, lastResolvedValue }`
3. On context change, the evaluation pass (§1.4) re-resolves the template. If the resolved value differs from `lastResolvedValue`, the runtime clears the element's content and re-invokes the appropriate renderer (`renderHtml`, `renderMarkdown`, or `renderTitle`) with the resolved props
4. Escaping rules from §1.2 apply: `html:` content uses HTML-entity escaping, `markdown:` content uses markdown-then-HTML escaping

This gives plain-DOM content components the same reactivity as Web Component consumers, without converting them to Web Components (which would change activation behavior for all existing dashboards).

### S3.12: 1.12 YAML desugar pipeline changes

**`visibleWhen` extraction:** Since `visibleWhen` is a `Component`-level property (not a prop), both `desugarComponent()` and `desugarDisplayer()` need to extract it from the raw YAML and place it on the output `Component` object. In both functions, after constructing the component: if `raw.visibleWhen` is a string, set `component.visibleWhen = raw.visibleWhen`.

**New content component branches in `component-desugar.ts`:**

```typescript
if ("alert" in raw) {
  return { type: "alert", props: raw.alert, visibleWhen: raw.visibleWhen, ... };
}
if ("action-button" in raw) {
  return { type: "action-button", props: raw["action-button"], visibleWhen: raw.visibleWhen, ... };
}
```

**New displayer type mappings in `displayer-desugar.ts` `TYPE_MAP`:**

```typescript
const TYPE_MAP: Record<string, string> = {
  // existing...
  BADGE: "badge",
  COUNTDOWN: "countdown",
  TIMELINE: "timeline",
  GRAPH: "graph",
};
```

**Type-specific settings extraction blocks in `displayer-desugar.ts`:**

Each new displayer type has a nested YAML settings block. Without extraction, these blocks would be silently ignored by `desugarDisplayer()`. New extraction blocks follow the same pattern as the existing `table:` and `meter:` blocks:

| YAML block | Properties to extract |
|-----------|----------------------|
| `badge:` | `column`, `colorMap` |
| `countdown:` | `deadlineColumn`, `format`, `warningThreshold`, `criticalThreshold` |
| `timeline:` | `startColumn`, `endColumn`, `labelColumn`, `categoryColumn` |
| `graph:` | `layout`, `sourceColumn`, `targetColumn`, `valueColumn`, `directed`, `nodeLabelColumn`, `nodeColorColumn`, `nodeColorMap`, `nodeSizeColumn` |

**Existing table extraction gap — fix alongside new features:**

The current `table:` extraction block (`displayer-desugar.ts:166-171`) only extracts `pageSize`. `sortable` and `resizable` are defined on `TableProps` but not extracted — YAML `table.sortable: true` is silently ignored. Since the spec adds `rowStyle` and `expandable` to the same block, the table extraction should be updated to extract all `TableProps` fields:

| Property | Status |
|----------|--------|
| `pageSize` | Existing — already extracted |
| `sortable` | Pre-existing gap — add extraction |
| `resizable` | Pre-existing gap — add extraction |
| `rowStyle` | New — add extraction |
| `expandable` | New — add extraction |

**New entries in `DATA_COMPONENT_TYPES` in `activation.ts`:**

```typescript
const DATA_COMPONENT_TYPES = new Set([
  // existing...
  "badge",
  "countdown",
  "timeline",
  "graph",
]);
```

Alert and action-button are NOT added to `DATA_COMPONENT_TYPES` — they are content Web Components activated via the new `CasehubContentElement` path.

**New activation path for content Web Components:** The activation callback needs a branch for content Web Component types (`alert`, `action-button`) that creates the custom element, sets props, and appends it — similar to the data component path but without dataset lookup, data request, or inline data handling.

---

## S4: 2. HTTP Action Infrastructure (#46, #54)

### S4.1: 2.1 ActionExecutor

Shared execution logic consumed by both the action button component and form submit.

```typescript
interface ActionRequest {
  readonly url: string;
  readonly method: 'POST' | 'PUT' | 'DELETE';
  readonly headers?: Record<string, string>;
  readonly body?: Record<string, unknown> | string;
}

interface ActionCallbacks {
  readonly onSuccess?: {
    readonly refresh?: DataSetId[];
    readonly message?: string;
  };
  readonly onError?: {
    readonly message?: string;
  };
}
```

**Host fetch injection:** `ActionExecutor` is constructed with the host-provided `fetch` function and `baseUrl` from `SiteOptions` — the same values used by the data pipeline's `ResolverContext.providerFactory`. This ensures action requests carry authentication headers, CSRF tokens, and base URL resolution consistent with data fetches. `ActionExecutor` never uses `globalThis.fetch` directly.

**Component-to-runtime bridge:** Action components (button, form submit) dispatch a `casehub-action-request` custom event (bubbles, composed). The runtime listens on the container element — consistent with the existing event model (`casehub-data-request`, `casehub-filter`, `casehub-sort`, `casehub-page`). The result is returned via the event's `resolve` callback, allowing the component to manage its own loading/success/error lifecycle.

```typescript
interface CasehubActionRequestDetail {
  readonly config: ActionRequest & { callbacks: ActionCallbacks };
  readonly resolve: (result: ActionResult) => void;
}

interface ActionResult {
  readonly success: boolean;
  readonly status?: number;
  readonly error?: string;
}
```

**Execution flow:**

1. Component dispatches `casehub-action-request` and transitions to loading state
2. Runtime catches the event, resolves all `#{}` templates in URL, body values, and headers against the current `RuntimeContext`
3. Runtime sends HTTP request via the host-provided `fetch`
4. Runtime classifies response: success (2xx), client error (4xx), server error (5xx)
5. Runtime calls `resolve({ success: true })` or `resolve({ success: false, status, error })` — component transitions to success/error state
6. On success: runtime dispatches `casehub-action-complete` event with `refresh` dataset IDs
7. Runtime handles `casehub-action-complete` by re-fetching specified datasets and pushing to all subscribing components

Lives in `@casehubio/pages-runtime/action.ts`.

### S4.2: 2.2 Action Button (`<casehub-action-button>`) — #46

A content component (no dataset lookup). Renders a `<button>` in shadow DOM.

```typescript
interface ActionButtonProps {
  readonly label: string;
  readonly url: string;
  readonly method?: 'POST' | 'PUT' | 'DELETE';
  readonly body?: Record<string, unknown>;
  readonly headers?: Record<string, string>;
  readonly confirm?: string;
  readonly style?: 'primary' | 'danger' | 'secondary';
  readonly disabledWhen?: string;
  readonly onSuccess?: { refresh?: DataSetId[]; message?: string };
  readonly onError?: { message?: string };
}
```

YAML:

```yaml
- action-button:
    label: "Submit Report"
    url: "/api/trials/#{filter.trialId}/deviations"
    method: POST
    body:
      type: "#{filter.deviationType}"
      severity: "#{filter.severity}"
    confirm: "Submit this deviation report?"
    style: primary
    onSuccess:
      refresh: [deviations, audit_trail]
      message: "Report submitted"
```

Lifecycle: idle → click → confirm dialog (if configured) → loading (disabled + spinner) → success/error → idle.

**Accessibility:** Renders with `aria-disabled="true"` when `disabledWhen` evaluates to truthy or while loading. Sets `aria-busy="true"` during the HTTP request.

Extends `CasehubContentElement<ActionButtonProps>` (see §1.10). Registered as a content component alongside `html:`, `markdown:`, `alert:` — not under `displayer:`.

### S4.3: 2.3 Form Submit — #54

New `submit` prop on form input components. When present, the input POSTs its value on Enter instead of binding to a dataScope.

```typescript
interface SubmitConfig {
  readonly url: string;
  readonly method?: 'POST' | 'PUT';
  readonly fieldName?: string;
  readonly clearOnSubmit?: boolean;
  readonly onSuccess?: { refresh?: DataSetId[]; message?: string };
  readonly onError?: { message?: string };
}
```

YAML:

```yaml
- text-input:
    field: message
    placeholder: "Type a message..."
    submit:
      url: "/api/channels/#{filter.channelId}/messages"
      method: POST
      clearOnSubmit: true
```

When `submit` is present, the form input operates independently of `dataScope`. On Enter: constructs the request body as `{ [fieldName ?? field]: inputValue }` where `fieldName` is from `SubmitConfig` and `field` is the input's own field prop, then dispatches `casehub-action-request`. On success: clears the field (if `clearOnSubmit`), triggers dataset refresh. On error: shows inline error, preserves field value.

### S4.4: 2.4 New events

```typescript
interface CasehubActionRequestDetail {
  readonly config: ActionRequest & { callbacks: ActionCallbacks };
  readonly resolve: (result: ActionResult) => void;
}

interface ActionResult {
  readonly success: boolean;
  readonly status?: number;
  readonly error?: string;
}

interface CasehubActionCompleteDetail {
  readonly refresh: DataSetId[];
}
```

`casehub-action-request`: Dispatched by action button and form submit. The runtime listens, resolves `#{}` templates, executes the HTTP request via `ActionExecutor`, and calls `resolve` with the result.

`casehub-action-complete`: Dispatched by the runtime after a successful action. The runtime re-fetches the listed datasets.

### S4.5: 2.5 Package placement

| What | Package |
|------|---------|
| `ActionButtonProps`, `SubmitConfig` types | `@casehubio/pages-component/model/` |
| `ActionExecutor` | `@casehubio/pages-runtime/action.ts` |
| `<casehub-action-button>` Web Component | `@casehubio/pages-viz/components/` |
| Form submit behavior | Extends `CasehubFormInput` in `@casehubio/pages-viz/form-inputs/` |
| `action-button:` desugar mapping | `@casehubio/pages-ui/parser/` |

---

## S5: 3. New Visualization Components (#37, #38, #39, #41, #43)

### S5.1: 3.1 Alert Banner (`<casehub-alert>`) — #38

Content component — no dataset lookup. Uses context interpolation for dynamic content and conditional visibility.

```typescript
interface AlertProps {
  readonly severity: 'info' | 'warning' | 'error' | 'success';
  readonly content: string;
  readonly dismissible?: boolean;
}
```

YAML:

```yaml
- alert:
    severity: warning
    content: "#{datasets.overdue_items.rowCount} items past deadline"
    visibleWhen: "#{datasets.overdue_items.rowCount} > 0"
    dismissible: true
```

Extends `CasehubContentElement<AlertProps>` (see §1.10). Renders a styled banner in shadow DOM with severity-based colors using CSS custom properties. Dismissible alerts add a close button; dismiss state is keyed on the resolved content string — the alert stays dismissed until the interpolated content actually changes, then reappears. Registered as a content component alongside `html:`, `markdown:`, `title:`.

**Accessibility:** Renders with `role="alert"` for `error` and `warning` severity (assertive announcement), `role="status"` for `info` and `success` (polite announcement). Dismiss button has `aria-label="Dismiss alert"`.

### S5.2: 3.2 Status Badge (`<casehub-badge>`) — #39

Data component — bound to a dataset via lookup. Renders styled label tags from column values.

```typescript
interface BadgeProps extends DataComponentCommon {
  readonly column?: ColumnId;
  readonly colorMap?: Record<string, string>;
}
```

YAML:

```yaml
displayer:
  type: BADGE
  lookup:
    uuid: deviations
    filter:
      - column: id
        function: EQUALS_TO
        args: ["#{filter.deviationId}"]
  badge:
    column: status
    colorMap:
      PENDING: "#fac858"
      APPROVED: "#91cc75"
      REJECTED: "#ee6666"
```

Extends `CasehubElement<BadgeProps>`. For each row in the dataset, renders a `<span class="casehub-badge">` with background color from `colorMap` (falls back to a palette derived from `--casehub-accent`). Single-row datasets show one badge; multi-row shows a row of badges.

### S5.3: 3.3 Countdown (`<casehub-countdown>`) — #43

Data component with an internal render timer. Reads a deadline date from the dataset and continuously updates the time remaining.

```typescript
interface CountdownProps extends DataComponentCommon {
  readonly deadlineColumn?: ColumnId;
  readonly format?: 'full' | 'compact' | 'days-only';
  readonly warningThreshold?: string;
  readonly criticalThreshold?: string;
}
```

YAML:

```yaml
displayer:
  type: COUNTDOWN
  general:
    title: "SLA Deadline"
  lookup:
    uuid: active_items
  countdown:
    deadlineColumn: deadline
    warningThreshold: "24hour"
    criticalThreshold: "4hour"
```

Extends `CasehubElement<CountdownProps>` — not a MetricProps subtype. Reason: needs its own render timer (ticking per second for <1h, per minute for >1h) independent of the data refresh timer. On dataset arrival, reads the deadline from the first row. Starts a `setInterval` that recalculates and re-renders the time delta. Changes color at warning/critical thresholds. Shows "EXPIRED" with critical styling when past deadline. Timer cleared in `disconnectedCallback`.

**Threshold format:** `warningThreshold` and `criticalThreshold` use the same `<number><unit>` format as dataset `refreshTime` — parsed by the existing `parseRefreshTime()` utility in `@casehubio/pages-data`. Supported units: `millisecond`, `second`, `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`. Examples: `"24hour"`, `"4hour"`, `"30minute"`. Invalid strings fall back to 10 seconds (consistent with `parseRefreshTime` behavior).

**Accessibility:** Uses `aria-live="polite"` on the countdown display. Screen reader announcements are throttled to meaningful state changes — threshold crossings (normal → warning, warning → critical, critical → expired) trigger announcements, but per-second/per-minute ticks do not.

### S5.4: 3.4 Timeline (`<casehub-timeline>`) — #37

ECharts chart component using custom series to render horizontal duration bars on a time axis.

```typescript
interface TimelineProps extends DataComponentCommon, ChartSettings {
  readonly startColumn?: ColumnId;
  readonly endColumn?: ColumnId;
  readonly labelColumn?: ColumnId;
  readonly categoryColumn?: ColumnId;
}
```

YAML:

```yaml
displayer:
  type: TIMELINE
  general:
    title: "Event Timeline"
  lookup:
    uuid: events
  timeline:
    startColumn: startDate
    endColumn: endDate
    labelColumn: description
    categoryColumn: category
```

Extends `CasehubChartElement<TimelineProps>`. Uses ECharts `type: 'custom'` with `renderItem` to draw horizontal bars from start to end on a time x-axis. Category axis on y-axis groups items. Rows with null `endColumn` render as diamond milestone markers. Supports all standard ChartSettings (legend, margin, zoom, extra).

### S5.5: 3.5 Graph (`<casehub-graph>`) — #41

ECharts chart component using the graph series for network/relationship visualization.

```typescript
interface GraphProps extends DataComponentCommon, ChartSettings {
  readonly layout?: 'force' | 'circular' | 'none';
  readonly sourceColumn?: ColumnId;
  readonly targetColumn?: ColumnId;
  readonly valueColumn?: ColumnId;
  readonly directed?: boolean;
  readonly nodeLabelColumn?: ColumnId;
  readonly nodeColorColumn?: ColumnId;
  readonly nodeColorMap?: Record<string, string>;
  readonly nodeSizeColumn?: ColumnId;
}
```

YAML:

```yaml
displayer:
  type: GRAPH
  general:
    title: "Relationship Network"
  lookup:
    uuid: edges
  graph:
    layout: force
    sourceColumn: from
    targetColumn: to
    valueColumn: weight
    directed: true
```

Extends `CasehubChartElement<GraphProps>`. Dataset rows represent edges. Nodes are derived from distinct values across source and target columns. `buildOption()` constructs ECharts `{ nodes: [...], links: [...] }`.

**Node properties:** When `nodeLabelColumn` is specified, the column provides display names separate from node IDs (source/target values). `nodeColorColumn` maps each node to a color via `nodeColorMap` (explicit mapping) or the default ECharts palette (when only `nodeColorColumn` is set). `nodeSizeColumn` scales node size proportionally. All node property columns are read from the same edge dataset — the relevant column values are extracted from the row where the node first appears as source or target. For use cases requiring richer node configuration (custom symbols, categories, tooltips), the ECharts `extra` passthrough applies to the series options directly.

Supports all standard ChartSettings.

### S5.6: 3.6 Registration

| Component | Tag | Extends | Category |
|-----------|-----|---------|----------|
| Alert | `<casehub-alert>` | `CasehubContentElement<AlertProps>` | Content (`alert:`) |
| Action Button | `<casehub-action-button>` | `CasehubContentElement<ActionButtonProps>` | Content (`action-button:`) |
| Badge | `<casehub-badge>` | `CasehubElement<BadgeProps>` | Displayer (`type: BADGE`) |
| Countdown | `<casehub-countdown>` | `CasehubElement<CountdownProps>` | Displayer (`type: COUNTDOWN`) |
| Timeline | `<casehub-timeline>` | `CasehubChartElement<TimelineProps>` | Displayer (`type: TIMELINE`) |
| Graph | `<casehub-graph>` | `CasehubChartElement<GraphProps>` | Displayer (`type: GRAPH`) |

All registered in `custom-elements.ts`. Props types in `displayer-types.ts` (Badge, Countdown, Timeline, Graph) or `component-props.ts` (Alert, ActionButton). Desugar mappings in `displayer-desugar.ts` and `component-desugar.ts` (see §1.12).

---

## S6: 4. Table Enhancements (#40, #42)

### S6.1: 4.1 Row-level conditional styling — #40

New `rowStyle` prop on `TableProps`:

```typescript
interface RowStyleRule {
  readonly condition: string;
  readonly className?: string;
  readonly style?: Record<string, string>;
}

// Added to TableProps:
readonly rowStyle?: readonly RowStyleRule[];
```

YAML:

```yaml
displayer:
  table:
    sortable: true
    rowStyle:
      - condition: "#{row.status} == 'Critical'"
        className: casehub-row-danger
      - condition: "#{row.daysOverdue} > 0"
        className: casehub-row-warning
      - condition: "#{row.resolved} == 'true'"
        className: casehub-row-muted
```

**Evaluation:** During `render()`, for each row, the table creates a row-scoped context (global `RuntimeContext` + `row.*` namespace) and evaluates each rule. First matching rule wins. The matching className or inline style is applied to the `<tr>`.

**Predefined CSS classes** in shadow DOM:

| Class | Effect |
|-------|--------|
| `casehub-row-danger` | Red-tinted background |
| `casehub-row-warning` | Yellow-tinted background |
| `casehub-row-success` | Green-tinted background |
| `casehub-row-muted` | Grey/dimmed text and background |

All use CSS custom properties (`--casehub-row-danger-bg`, etc.) for theme overrides. Dashboard authors can also use `style:` for arbitrary inline CSS.

### S6.2: 4.2 Expandable rows (tree-table) — #42

New `expandable` prop on `TableProps`:

```typescript
interface ExpandableConfig {
  readonly idColumn: ColumnId;
  readonly parentColumn: ColumnId;
  readonly defaultExpanded?: boolean | number;
}

// Added to TableProps:
readonly expandable?: ExpandableConfig;
```

YAML:

```yaml
displayer:
  table:
    sortable: true
    expandable:
      idColumn: id
      parentColumn: parentId
      defaultExpanded: 1
```

**Data model:** Flat dataset with self-referencing parent/child structure. Each row has an `id` and a `parentId`. Rows with null/empty `parentId` are roots.

**Rendering:**

1. On dataset arrival, build tree index: `Map<id, childRows[]>`, identify root rows
2. Initially render root rows with expand/collapse toggle (`▶`/`▼`) if they have children
3. `defaultExpanded: 1` auto-expands roots to show first-level children
4. Child rows render with visual indentation (padding-left scales with depth)
5. Click toggle → show/hide children recursively

**Interaction with other table features:**

- **Sorting:** Sorts within each level (siblings sorted among siblings)
- **Pipeline bypass:** When `expandable` is present in the component's props, the pipeline skips both pagination (`rowOffset`/`rowCount`) and text filtering (`applyTextFilter`). The pipeline delivers all rows — unfiltered by text, unpaginated — leaving both concerns to the component. The component retains its `pageSize` prop for internal use. This is a single guard in the pipeline: when `expandable` is detected, `pageSize` and `textFilter` are both set to `undefined` before processing.
- **Pagination:** Handled internally by the component using its `pageSize` prop. Page boundaries are determined by root row count. Expanding a root row reveals its children within the current page without pushing other roots to the next page. This avoids disorienting row-push effects and orphaned children on subsequent pages.
- **Text search:** Handled internally by the component. The tree-table renders its own search input within its shadow DOM — it does not use the `casehub-text-filter` event path. User input is handled directly by the component, which applies text matching to all rows. When a child matches but its ancestor does not, the ancestor is shown as a non-matching context row (dimmed) to preserve hierarchy. Cross-filters continue to flow through the pipeline as normal — the tree-table renders the pipeline's filtered result as a tree.

**Accessibility:** Expand/collapse toggles render with `aria-expanded`. Tree rows render with `aria-level`, `aria-setsize`, and `aria-posinset` to convey tree structure to assistive technologies.

Expand/collapse state is local to the component, not persisted in view state.

---

## S7: 5. Implementation Phasing

### S7.1: Layer 1 — Foundation

| Step | What | Issue |
|------|------|-------|
| 1 | Context types, template parser, expression evaluator | #47, #48, #49 |
| 2 | Context wiring in runtime (state tracking, consumer registration, cascade) | #47, #48, #49 |
| 3 | `visibleWhen` property on Component model | #47 |
| 4 | Content interpolation in markdown/html/title | #48 |
| 5 | Parameterised dataset URLs | #49 |

### S7.2: Layer 2 — New components (depends on Layer 1)

| Step | What | Issue |
|------|------|-------|
| 6 | ActionExecutor shared infrastructure | #46, #54 |
| 7 | Action button component | #46 |
| 8 | Form submit prop | #54 |
| 9 | Alert banner | #38 |
| 10 | Badge component | #39 |
| 11 | Countdown component | #43 |
| 12 | Timeline component | #37 |
| 13 | Graph component | #41 |

### S7.3: Layer 3 — Table enhancements (depends on Layer 1 for row context, parallel with Layer 2)

| Step | What | Issue |
|------|------|-------|
| 14 | Row-level conditional styling | #40 |
| 15 | Expandable rows (tree-table) | #42 |

### S7.4: Post-implementation

- Update `Clinical/Patient Tracker` example dashboard to exercise new capabilities with inline mock data
- Playwright tests for new components and features

### S7.5: Deferred

| Issue | What | Blocked by |
|-------|------|------------|
| #55 | `Casehub*` → `Pages*` rename | Clinical shipping initial UI |
| #52 | WebSocket dataset provider | Separate branch (connectors concern) |
| #53 | WebSocket multiplexing | Depends on #52 |

---

## S8: 6. WebSocket Compatibility (#52, #53)

The context model handles WebSocket dataset pushes with no changes:

1. WebSocket provider updates a dataset via `DataSetManager.accumulate()` or `.register()`
2. Runtime publishes a new `DataSetSnapshot` to `RuntimeContext`
3. All context consumers re-evaluate (visibility, content, parameterised URLs)
4. Components with `visibleWhen: "#{datasets.messages.rowCount} > 0"` react to live data
5. `casehub-action-complete` event's dataset refresh works with WebSocket datasets — the runtime triggers a re-subscribe or requests a fresh snapshot

No design modifications needed. The WebSocket provider is a new data source type in the pipeline, not a context model change.
