# Cross-Repo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #143 — Cross-repo Migration — examples, blocks-ui, aml, clinical
**Issue group:** #140 (epic), #141 (prerequisite), #142 (prerequisite for blocks-ui scenarios), #143
**Spec:** `docs/specs/2026-07-07-datasource-abstraction-design.md` — sections 7, 8, 11

**Goal:** Port all examples and components across 4 repos from `ExternalDataSetDef`/direct `fetch()` to the DataSource abstraction. Retire `ExternalDataSetDef` from public API. Replace blocks-ui mock infrastructure with scenario-based examples.

**Architecture:** casehub-pages examples switch from `inlineDataset()`/`dataset()` to `bind()`/source constructors — mechanical rewrite. blocks-ui/aml/clinical components switch from direct `fetch()` to DataReceiver pattern (accept `TypedDataSet` via property). blocks-ui mock infrastructure (~870 lines) replaced by `simulated()` sources.

**Tech Stack:** TypeScript 5, Lit, Vitest.

**Prerequisites:**
- #141 (DataSource Core) — must be complete for all tasks
- #142 (Scenario Engine) — must be complete for blocks-ui scenario replacement (Task 2). Tasks 1, 3, 4 can proceed without it.

## Global Constraints

- Use IntelliJ MCP for all code navigation — `ide_find_references`, `ide_find_class`, `ide_search_text`
- Verify each migrated example renders by loading it in the examples gallery
- Components migrated to DataReceiver must preserve all existing functionality
- blocks-ui mock data files (.json) preserved as data — they become `initial` sources
- `dataset-contract` protocol must be updated for DataSourceBinding
- ARC42STORIES.MD data flow diagram must be updated

---

### Task 1: casehub-pages Example Migration (Phase 8)

**Scope:** 42 example files in `examples/samples/`

**Pattern — inline:**
```typescript
// Before
const ds = inlineDataset("id", JSON.stringify([[1, "x"]]), { columns: [...] });
page("Name", ..., { datasets: [ds] })

// After
const ds = bind("id", inlineSource([[1, "x"]], { columns: [...] }));
page("Name", ..., { datasets: [ds] })
```

**Pattern — URL:**
```typescript
// Before
const ds = dataset("id", "http://api/data", { expression: "...", columns: [...] });

// After
const ds = bind("id", restSource("http://api/data", { expression: "...", columns: [...] }));
```

**Files:** All 42 files in `examples/samples/` (list from earlier exploration). Each is a mechanical rewrite.

**Verification:** Load examples gallery (`yarn workspace @casehubio/pages-examples run serve`) and verify each example renders.

### Task 2: blocks-ui Component + Example Migration (Phase 9)

**Scope:**
- Component refactoring: work-item-inbox, notification-center, audit-trail-viewer, case-timeline, and other data-loading components
- Mock infrastructure replacement: mock-fetch.ts (111 lines), mock-sse.ts (85 lines), mock-state.ts (293 lines), sse-script.json (202 lines), notification-sse-script.json (177 lines)

**Component pattern:**
```typescript
// Before: direct fetch
@property() endpoint?: string;
async fetchItems() { const r = await fetch(`${this.endpoint}/workitems/inbox`); ... }

// After: DataReceiver
@property({ attribute: false }) dataSet?: TypedDataSet;
@property() error?: string;
// Rendering uses this.dataSet — source-agnostic
```

**Mock replacement:** The 13 JSON mock data files become `initial` sources for `simulated()` datasets. The sse-script.json timing becomes `transition()` mutations. MockState → `simulated()` with mutation DSL. MockSSESource → `sseSource()` or `simulated()`.

**Depends on:** #142 (Scenario Engine) for the `scenario()` composition and `simulated()` with mutation DSL.

### Task 3: aml + clinical Component Migration (Phase 10)

**aml components:**
- `case-workbench` — container (delegates to children, may need DataSourceBinding propagation)
- `case-list-pane` — table with pagination, `fetch()` → DataReceiver

**clinical data-loading components:**
- `cbr-precedents-panel` — `fetch()` → DataReceiver
- `commitment-lifecycle` — `fetch()` → DataReceiver
- `clinical-pi-approval` — `fetch()` → DataReceiver
- `clinical-susar-gate` — `fetch()` → DataReceiver

**clinical action components:**
- `gdpr-erasure-action` — add `dispatch({ type: 'create', ... })` for demo mode
- `clinical-merkle-verify` — add `dispatch()` for demo mode

**clinical presentation-only (no changes):**
- `sla-breach-policy-indicator`, `trust-feedback-display`, `regulatory-compliance-summary`

### Task 4: Cleanup (Phase 11)

- Remove `ExternalDataSetDef` from `pages-data` public exports (keep internal for YAML compat)
- Remove `dataset()`, `inlineDataset()` from `pages-ui` exports
- Update `docs/protocols/casehub/dataset-contract.md` — add DataSourceBinding to type inventory
- Update `ARC42STORIES.MD` — data flow diagram to show DataSource → DataSink → DataSetManager
- Update `CLAUDE.md` — architecture overview section
- Run `yarn typecheck && yarn lint && yarn test && yarn build` — full verification

### Task 5: Protocol Coherence Review

Final coherence review of implementation against:
- `docs/protocols/casehub/dataset-contract.md`
- `docs/protocols/casehub/pages-event-contract.md`
- `docs/protocols/casehub/web-component-strategy.md`
- `ARC42STORIES.MD`

Any deferred concerns or out-of-scope items captured as GitHub issues.
