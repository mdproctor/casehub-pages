# Phase 0: React Flow + Lit Bridge Spike — Design Spec

**Date:** 2026-08-02
**Status:** Approved
**Issues:** #259 (React Flow + Lit bridge spike), #260 (cross-parser compatibility test)
**Parent epic:** #258 (Visual Diagram Editor — Foundation)
**Parent spec:** `casehubio/parent` — `specs/2026-08-01-visual-diagram-editor-design.md`

---

## Purpose

Validate the two hard-gate prerequisites before any Phase 1 implementation:

1. **React Flow v12 can be hosted inside a Lit Web Component** with proper CSS isolation, design token availability, and correct interaction handling — without Shadow DOM on the canvas.
2. **The `yaml` npm package round-trips CaseHub Playbook YAML** with semantic fidelity, and Jackson + SnakeYAML can parse the output identically.

This spike produces production code in a real package (`packages/graph-renderer/`), not a throwaway prototype.

## Corrections to Parent Spec

This spec corrects two errors discovered during design analysis:

### Correction 1: React Version

**Parent spec says:** React Flow v11 (`reactflow` npm, React 17) for compatibility with pages' current React 17.

**Correction:** React Flow v12 (`@xyflow/react`, React 18). The parent spec also states "React is isolated to a single package (graph-renderer)" — graph-renderer bundles its own React, and pages' iframe components use React 17 in separate iframe documents. There is no version constraint. v11 is in maintenance mode (bug fixes only); v12 has better TypeScript types, subscription-based reactivity, and active development. Starting with v12 eliminates a future migration.

### Correction 2: CSS @layer Role

**Parent spec says:** "CSS cascade layers prevent host globals from affecting internals."

**Correction:** This is backwards. In the CSS cascade, unlayered CSS has higher priority than layered CSS for normal declarations. Pages' global resets are unlayered. Putting our CSS in `@layer` makes it *weaker* than the host — the opposite of isolation. The corrected approach uses `all: initial` for host isolation, scoped `all: revert` for element-specific resets, and `applyTheme()` for token re-declaration. `@layer` is not used — source order provides internal CSS cascade control without the layered-vs-unlayered pitfall.

---

## 1. Package Structure

**Package:** `packages/graph-renderer/` — new workspace package in the pages monorepo.

**Production dependencies:**
- `react` ^18, `react-dom` ^18
- `@xyflow/react` (React Flow v12)
- `lit` (bridge component)
- `@casehubio/pages-ui-tokens` (theme injection via `applyTheme()`)
- `elkjs` (layout — secondary validation)

**Dev dependencies:**
- `@casehubio/pages-tsconfig` (strict TypeScript config)
- `vitest` (testing)
- `vite` (dev server for visual validation page — dev page only; the package's production build output is consumed by the existing Webpack 5 pipeline via the webapp assembler)

**File structure:**

```
packages/graph-renderer/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                — public API exports
│   ├── bridge/
│   │   ├── GraphCanvas.ts      — Lit custom element (the bridge)
│   │   ├── ReactFlowApp.tsx    — React Flow wrapper component
│   │   └── css-isolation.ts    — isolation stylesheet generation
│   ├── registry/
│   │   └── node-registry.ts    — plugin-based node type registration
│   └── layout/
│       └── elk-layout.ts       — ELK layout adapter
├── test/
│   ├── bridge.test.ts          — bridge lifecycle tests
│   └── css-isolation.test.ts   — token availability, no leakage
└── dev/
    ├── index.html              — visual validation page
    └── dev-app.ts              — demo app with Pages shell globals
```

**Not in scope:**
- `graph-core` — no graph model, stencil registry, or persistence. The spike uses hard-coded React Flow nodes.
- Cross-parser test — lives in `test/cross-parser/` at repo root (see §5).

## 2. Bridge Component

**`GraphCanvas`** (`pages-graph-canvas`) — a Lit custom element that mounts React Flow v12 into light DOM.

**Shadow DOM:** Skipped on this component (`createRenderRoot() { return this; }`). Per the web-component-strategy protocol, all other graph components (palette, properties, toolbar — Phase 2+) will keep Shadow DOM enabled.

**Element registration:** Guarded per web-component-strategy protocol:
```ts
if (!customElements.get('pages-graph-canvas')) {
  customElements.define('pages-graph-canvas', GraphCanvas);
}
```

**Naming:** `pages-graph-canvas` (pages-tier, domain-agnostic). The `casehub-diagram-*` names from the parent spec are for the blocks-ui domain layer (Phase 2+).

**Lifecycle:**

```
connectedCallback()
  1. Create container div with class .diagram-root
  2. Apply CSS isolation (§3)
  3. Call applyTheme('default-light', container)
  4. Append container to this (light DOM)
  5. ReactDOM.createRoot(container) → render <ReactFlowApp />

updated()
  6. Re-render React app with new Lit property values

disconnectedCallback()
  7. root.unmount()
  8. Remove container
```

**Props flow:** Lit `@property()` declarations → React props on `ReactFlowApp`. React callbacks (node click, selection change) → emit `pages-event` with `composed: true` on the host element, per the pages-event-contract protocol.

**Event emission:** graph-renderer defines its own protocol-compliant `emitPagesEvent()` (5-line utility constructing `CustomEvent('pages-event', { bubbles: true, composed: true, detail: { topic, payload } })`) rather than depending on `@casehubio/pages-component`. pages-component has no sub-path exports — importing its events module would pull in the full layout renderer. The protocol defines the contract shape; any package can implement it.

**`ReactFlowApp.tsx`** — React component wrapping `<ReactFlow>`:
- Receives nodes/edges/nodeTypes as props
- Enables `<MiniMap>`, `<Controls>`, `<Background>`
- Forwards interaction events to callback props
- Node types come from the registry (§4), not hardcoded imports

**Theme mode switching:** The bridge listens for `pages-theme-change` events on `document.documentElement`. To prevent re-entrancy (`applyTheme()` dispatches `pages-theme-change` with `bubbles: true` — the bridge's own container theme application would bubble up and trigger the listener again), the listener filters by `e.target === document.documentElement` — only host-originated theme changes trigger re-injection on the container.

**Initial theme detection:** On mount, the bridge reads the current theme from the host via `getTheme(document.documentElement)` rather than hardcoding `'default-light'`. If no theme is applied to the host, falls back to `'default-light'`.

## 3. CSS Isolation

Three mechanisms, each with a distinct role:

### 3.1 `all: initial` on container — blocks inheritance

```css
.diagram-root {
  all: initial;
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
}
```

Resets all inherited properties (font, color, line-height, custom properties) from the host. This is the only mechanism that actually blocks inherited host styles in light DOM.

**Container height constraint:** `all: initial` resets `height` to `auto`. The `height: 100%` declaration only takes effect if the parent element has an explicit height. React Flow requires a container with known dimensions. Consumers must ensure the parent of `<pages-graph-canvas>` has an explicit height (e.g., via CSS grid row, flexbox, or a fixed pixel value).

### 3.2 Scoped revert on children — blocks host element-specific resets

```css
.diagram-root * {
  all: revert;
}
```

Specificity 0,1,0 beats the host's `* { box-sizing }` (0,0,0) and `button { appearance }` (0,0,1). Reverts all host author styles on container children to browser user-agent defaults. React Flow's CSS (loaded after, with class selectors at 0,1,0+) overrides the revert via source order.

### 3.3 `applyTheme()` on container — re-declares design tokens

```ts
import { applyTheme } from '@casehubio/pages-ui-tokens';

applyTheme('default-light', this.container);
```

`applyTheme()` (pages-ui-tokens runtime.ts) injects a `<style>` as a child of the container and sets `.pages-theme-default-light` on it. Because this `<style>` appears later in document order than the head stylesheet's `all: initial`, the theme token declarations win. This re-declares all `--pages-*` tokens without maintaining a manual list — `applyTheme()` already knows every token.

### 3.4 Source order for internal CSS cascade

Instead of `@layer` (which would make our CSS weaker than unlayered host CSS), we use import order:

```
1. isolation.css        — .diagram-root reset, .diagram-root * revert
2. @xyflow/react CSS    — React Flow base styles
3. Plugin-contributed   — registered node type styles (§4)
4. decorations.css      — runtime overlay badges (Phase 7, future)
```

Later imports win at equal specificity. Achieves the same cascade ordering the parent spec intended with `@layer`, without the unlayered-beats-layered pitfall.

### Why this works (cascade analysis)

For the container element (has both `.diagram-root` and `.pages-theme-default-light` classes):
- `.diagram-root { all: initial; }` — in head stylesheet, specificity 0,1,0
- `.pages-theme-default-light { --pages-accent-1: oklch(...); }` — in container-internal `<style>`, specificity 0,1,0
- Same specificity → source order → container-internal style is later → tokens survive

For container children:
- Host's `* { box-sizing: border-box }` — specificity 0,0,0
- Our `.diagram-root * { all: revert; }` — specificity 0,1,0 → wins
- React Flow's `.react-flow { ... }` — specificity 0,1,0, loaded after revert → wins via source order

## 4. Plugin-First Architecture

Nothing is built-in; everything is registered. graph-renderer provides hosting infrastructure; all content comes through registration.

### Node type registry

```ts
interface NodeTypeDescriptor {
  type: string;
  component: React.ComponentType<NodeProps>;
  defaultStyle?: string;
}

function registerNodeType(descriptor: NodeTypeDescriptor): void;
function getNodeTypes(): Record<string, React.ComponentType<NodeProps>>;
```

The spike registers sample node types through this interface. The bridge reads the registry to build React Flow's `nodeTypes` prop. Plugin-contributed `defaultStyle` CSS is injected into the cascade after React Flow base CSS.

### What this establishes

- `graph-stencil-case` (Phase 2+) registers Binding, Worker, Milestone, Goal, SubCase via the same interface
- `graph-stencil-swf` (Phase 5) registers workflow step types via the same interface
- Work registry stencils register via the same interface
- graph-renderer never imports domain-specific code

Phase 0 scope is minimal — a Map-based registry with `registerNodeType` / `getNodeTypes`. Phase 1 evolves it (edge type registration, grammar validation hooks, deregistration).

**Evolution path:** `NodeTypeDescriptor` is Phase 0's minimal registration contract. In Phase 1, it evolves into the parent spec's `StencilDescriptor` — adding `grammar` (connection rules), `properties` (JSON Schema), `label`, `icon`, and a `render` function returning `StencilTemplate`. The Phase 0 `component` field maps to Phase 1's React wrapper around the `render` function output. The registry API (`registerNodeType` / `getNodeTypes`) evolves into the `StencilDescriptor` registry with the same registration pattern.

### Style injection mechanism

Plugin-contributed `defaultStyle` CSS (from `NodeTypeDescriptor`) is injected as a `<style>` element in `document.head` at registration time, after the React Flow CSS import. This ensures plugin styles participate in the normal cascade at the correct position (after React Flow base, before decoration overrides). The `<style>` element is tagged with `data-graph-plugin="${descriptor.type}"` for identification and removal on deregistration (Phase 1).

## 5. Cross-Parser Compatibility Test (#260)

Validates that `yaml` npm v2+ CST-preserving parser produces YAML that Jackson + SnakeYAML parse identically.

### Test location

Standalone at repo root — not inside graph-renderer (different concern):

```
test/cross-parser/
├── package.json          — yaml, js-yaml, vitest
├── fixtures/
│   ├── case-definition-full.yaml
│   ├── expression-strings.yaml
│   ├── multiline-strings.yaml
│   └── quoting-edge-cases.yaml
└── yaml-roundtrip.test.ts
```

### TypeScript layer (primary, CI via `yarn test`)

Per fixture file:
1. **Round-trip fidelity:** parse with `yaml` `parseDocument()` → `toString()` → parse again → assert `toJSON()` deep-equal
2. **Cross-parser proxy:** parse round-tripped output with `js-yaml` (YAML 1.1, same spec as SnakeYAML) → assert equivalence
3. **Expression string preservation:** assert JQ/CEL expressions like `${ .document.contentType }` survive byte-for-byte

### Java layer (rigorous validation)

A minimal backend test module (`backend/cross-parser-test/`) with `jackson-dataformat-yaml`:

```java
ObjectMapper yamlMapper = new ObjectMapper(new YAMLFactory());
JsonNode original = yamlMapper.readTree(new File("fixtures/case-definition-full.yaml"));
JsonNode roundTripped = yamlMapper.readTree(new File("output/case-definition-full.yaml"));
assertEquals(original, roundTripped);
```

The TypeScript test writes round-tripped output to `test/cross-parser/output/`. The Java test reads those files.

### Fixtures

Self-contained samples capturing CaseHub-specific constructs:
- Expression strings with `${}` syntax
- Binding declarations with `when` conditions
- Worker capability arrays
- Multiline descriptions (block and folded scalars)
- Mixed quoting styles (single, double, unquoted)

Not copies from the engine repo — avoids cross-repo dependency.

## 6. ELK Layout (secondary validation)

**What we validate:** `elkjs` computes hierarchical layout positions for React Flow v12 nodes, including containment groups with `INCLUDE_CHILDREN`.

**Scope:** A single `elk-layout.ts` adapter: React Flow nodes/edges → ELK → positioned nodes. The dev page renders the sample graph with ELK-computed positions.

**Not gating:** If bridge + CSS isolation pass but ELK has issues, Phase 0 still passes. ELK issues get a GitHub issue and Phase 1B adapts.

**ELK options:**
```ts
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.spacing.nodeNode': '50',
};
```

## 7. Validation Plan

### #259 acceptance criteria

| Criterion | Validation method | Pass condition |
|-----------|------------------|----------------|
| React Flow renders inside Lit | Dev page mounts `<pages-graph-canvas>` | Nodes, edges, labels visible; no console errors |
| Design tokens apply to custom nodes | Sample node uses `var(--pages-accent-9)` | `getComputedStyle` returns theme value, not fallback |
| No CSS leakage host → RF | Dev page includes Pages shell globals | RF controls render with browser defaults, not host resets |
| No CSS leakage RF → host | Sibling elements outside `.diagram-root` | Sibling styling unchanged after graph-renderer CSS loads |
| Pan/zoom/select work | Manual interaction + programmatic viewport test | Pan moves canvas, zoom changes scale, click selects |
| Minimap and controls render | Enable `<MiniMap>` and `<Controls>` | Both visible, positioned within container bounds |
| ELK layout computes | Feed sample graph through elk-layout adapter | Non-overlapping, hierarchically grouped positions |

### #260 acceptance criteria

| Criterion | Validation method | Pass condition |
|-----------|------------------|----------------|
| Round-trip fidelity | yaml npm parse → serialize → parse → JSON compare | `toJSON()` deep-equal |
| Cross-parser compatibility | js-yaml + Jackson parse round-tripped output | Identical structure to original |
| Expression string preservation | Byte-level string assertions | `${ .document.contentType }` unchanged |
| CI-repeatable | `yarn test` (TS) + `mvn test` (Java) | Both green |

### Gate classification

- **Hard gate:** Bridge pattern, CSS isolation, token availability, cross-parser fidelity. If any fail, Phase 1 cannot proceed.
- **Soft gate:** ELK layout. If it fails, file an issue; Phase 1B adapts.

### Automated tests (Vitest)

- Bridge lifecycle: mount → verify container → unmount → verify cleanup
- CSS isolation: mount with global resets → `getComputedStyle` → assert no host leakage
- Token availability: mount with theme → `getComputedStyle` on custom node → assert token value
- Registry: register node type → mount → verify registered component renders
- Cross-parser: all fixture round-trips (§5)

### Manual validation (dev page)

- Visual correctness of rendering, controls, minimap
- Interaction testing (pan, zoom, click, drag)
- Theme switching (light → dark → verify token re-injection)

## 8. Garden Entries Referenced

- **GE-20260801-d3e4fe** — React-in-Lit bridge pattern (technique, directly applicable)
- **GE-20260801-bda7a8** — @xyflow/system is 25% of total logic (validates against building on system core)
- **GE-20260801-355ce5** — CSS `all:initial` resets custom properties (critical for isolation design)
- **GE-20260706-9335b9** — Shadow DOM CSS property override behaviour
- **GE-20260712-f5b872** — Theme injection must target host element (`injectTheme` / `applyTheme` usage)
- **GE-20260713-777d8a** — Shadow DOM focus retargeting (relevant for interaction validation)

## 9. Protocols Consulted

- **web-component-strategy** (PP-20260705-c7687d) — Lit conventions, element naming, guarded registration
- **css-design-tokens** (PP-20260705-2ae91d) — OKLCH tokens, `--pages-` prefix, theme class naming
- **pages-event-contract** (PP-20260705-bac842) — `pages-event` with topic/payload, `composed: true`
- **iframe-component-lifecycle** (PP-20260706-93dd4b) — not directly applicable (iframe isolation), consulted for contrast
- **dataset-contract** (PP-20260705-7a5da4) — not directly applicable, consulted for completeness
