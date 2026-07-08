# Grouped View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> subagent-driven-development (recommended) or executing-plans to
> implement this plan task-by-task. Each task follows TDD
> (test-driven-development) and uses ide-tooling for structural
> editing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Focal issue:** #142 — Scenario Engine (grouped-view is a prerequisite component)
**Issue group:** TBD — create a grouped-view issue before starting

**Goal:** Build a `pages-grouped-view` web component that renders grouped tabular data with configurable visual modes (spreadsheet, sectioned, list) and LLM-readable preset guidance.

**Architecture:** Single `PagesElement<GroupedViewProps>` component in `pages-viz` with two independent axes (group display × content display). Presets bundle common combinations; explicit mode overrides provide composability. Existing `GroupOp` pipeline handles data grouping — the component only renders the result.

**Tech Stack:** TypeScript 5, Web Components (vanilla HTMLElement via PagesElement base), Vitest, Playwright, CSS custom properties with `--pages-` design tokens.

## Global Constraints

- All CSS custom properties use `--pages-` prefix (protocol PP-20260705-2ae91d)
- Data components extend `PagesElement<P>` — not Lit (protocol PP-20260705-c7687d)
- Inter-component events use `pages-event` CustomEvent with topic/payload (protocol PP-20260705-bac842)
- No new design tokens — compose from existing neutral, spacing, font, motion tokens
- `table-row` + `list` combination is invalid — reject at desugaring time

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `packages/pages-component/src/model/grouped-view-types.ts` | `GroupedViewMode`, `GroupedViewPreset`, `AggregationBinding`, `GroupedViewProps` types |
| `packages/pages-viz/src/components/grouped-view/presets.ts` | Preset definitions, `resolvePreset()` |
| `packages/pages-viz/src/components/grouped-view/group-extraction.ts` | `GroupBoundary`, `extractGroupBoundaries()` |
| `packages/pages-viz/src/components/grouped-view/column-widths.ts` | `computeColumnWidths()` via Canvas measurement |
| `packages/pages-viz/src/components/grouped-view/render-group-table-row.ts` | Spreadsheet group header renderer |
| `packages/pages-viz/src/components/grouped-view/render-group-section.ts` | Section-heading group header renderer |
| `packages/pages-viz/src/components/grouped-view/render-content-table.ts` | Table content renderer |
| `packages/pages-viz/src/components/grouped-view/render-content-list.ts` | List content renderer |
| `packages/pages-viz/src/components/grouped-view/group-view-styles.ts` | CSS string constants using design tokens |
| `packages/pages-viz/src/components/grouped-view/PagesGroupedView.ts` | Main component — extends `PagesElement<GroupedViewProps>` |
| `packages/pages-viz/src/components/grouped-view/presets.test.ts` | Unit tests for preset resolution |
| `packages/pages-viz/src/components/grouped-view/group-extraction.test.ts` | Unit tests for group boundary extraction |
| `packages/pages-viz/src/components/grouped-view/column-widths.test.ts` | Unit tests for column width computation |
| `packages/pages-viz/src/components/grouped-view/PagesGroupedView.test.ts` | Component render tests |
| `packages/pages-ui/src/parser/grouped-view-desugar.ts` | YAML → GroupOp desugaring |
| `packages/pages-ui/src/parser/grouped-view-desugar.test.ts` | Desugaring tests |
| `e2e/grouped-view.spec.ts` | Playwright visual tests |
| `e2e/grouped-view-harness.html` | Test harness page for visual tests |

### Modified files

| File | Change |
|------|--------|
| `packages/pages-component/src/model/displayer-types.ts` | Re-export `GroupedViewProps` |
| `packages/pages-component/src/model/type-guards.ts` | Add `"grouped-view": GroupedViewProps` to registry, add `isGroupedView()` |
| `packages/pages-runtime/src/activation.ts` | Add `"grouped-view"` to `DATA_COMPONENT_TYPES` |
| `packages/pages-ui/src/parser/displayer-desugar.ts` | Add `GROUPED_VIEW: "grouped-view"` to `TYPE_MAP`, call `desugarGroupedView()` |
| `packages/pages-viz/src/index.ts` | Export `PagesGroupedView` |

---

## Task 1: Types and Presets

**Files:**
- Create: `packages/pages-component/src/model/grouped-view-types.ts`
- Create: `packages/pages-viz/src/components/grouped-view/presets.ts`
- Create: `packages/pages-viz/src/components/grouped-view/presets.test.ts`
- Modify: `packages/pages-component/src/model/displayer-types.ts`

**Interfaces:**
- Consumes: `DataComponentCommon` from `displayer-types.ts`, `GroupingKey`, `Aggregation`, `ColumnId` from `@casehubio/pages-data`
- Produces: `GroupDisplayMode`, `ContentDisplayMode`, `GroupedViewPreset`, `GroupedViewMode`, `AggregationBinding`, `GroupedViewProps`, `resolvePreset(props: GroupedViewProps): GroupedViewMode`

- [ ] **Step 1: Write failing tests for preset resolution**

```typescript
// packages/pages-viz/src/components/grouped-view/presets.test.ts
import { describe, it, expect } from "vitest";
import { resolvePreset } from "./presets.js";
import type { GroupedViewProps } from "@casehubio/pages-component";
import type { ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";

function minProps(overrides: Partial<GroupedViewProps> = {}): GroupedViewProps {
  return {
    lookup: { dataSetId: "test", operations: [] } as unknown as GroupedViewProps["lookup"],
    groupBy: {
      sourceId: "status" as ColumnId,
      columnId: "status" as ColumnId,
      strategy: { mode: "distinct" as const },
      maxIntervals: 100,
      emptyIntervals: false,
      ascendingOrder: true,
    },
    ...overrides,
  };
}

describe("resolvePreset", () => {
  it("defaults to sectioned when no preset or modes given", () => {
    const result = resolvePreset(minProps());
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "table" });
  });

  it("resolves spreadsheet preset", () => {
    const result = resolvePreset(minProps({ preset: "spreadsheet" }));
    expect(result).toEqual({ groupDisplay: "table-row", contentDisplay: "table" });
  });

  it("resolves sectioned preset", () => {
    const result = resolvePreset(minProps({ preset: "sectioned" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "table" });
  });

  it("resolves list preset", () => {
    const result = resolvePreset(minProps({ preset: "list" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "list" });
  });

  it("explicit contentDisplay overrides preset", () => {
    const result = resolvePreset(minProps({ preset: "sectioned", contentDisplay: "list" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "list" });
  });

  it("explicit groupDisplay overrides preset", () => {
    const result = resolvePreset(minProps({ preset: "list", groupDisplay: "table-row" }));
    expect(result).toEqual({ groupDisplay: "table-row", contentDisplay: "list" });
  });

  it("fully explicit modes ignore preset", () => {
    const result = resolvePreset(minProps({
      preset: "spreadsheet",
      groupDisplay: "section-heading",
      contentDisplay: "list",
    }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "list" });
  });

  it("throws on invalid combination table-row + list", () => {
    expect(() => resolvePreset(minProps({
      groupDisplay: "table-row",
      contentDisplay: "list",
    }))).toThrow(/invalid.*combination/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-viz run test -- --run presets.test`
Expected: FAIL — modules not found

- [ ] **Step 3: Create the types file**

```typescript
// packages/pages-component/src/model/grouped-view-types.ts
import type { ColumnId } from "@casehubio/pages-data";
import type { Aggregation, GroupingKey } from "@casehubio/pages-data/dist/dataset/group.js";
import type { DataComponentCommon } from "./displayer-types.js";

export type GroupDisplayMode = "table-row" | "section-heading";
export type ContentDisplayMode = "table" | "list";
export type GroupedViewPreset = "spreadsheet" | "sectioned" | "list";

export type GroupedViewMode =
  | { readonly groupDisplay: "table-row"; readonly contentDisplay: "table" }
  | { readonly groupDisplay: "section-heading"; readonly contentDisplay: "table" }
  | { readonly groupDisplay: "section-heading"; readonly contentDisplay: "list" };

export interface AggregationBinding {
  readonly column: ColumnId;
  readonly fn: Aggregation;
}

export interface GroupedViewProps extends DataComponentCommon {
  readonly groupBy: GroupingKey;
  readonly preset?: GroupedViewPreset;
  readonly groupDisplay?: GroupDisplayMode;
  readonly contentDisplay?: ContentDisplayMode;
  readonly defaultExpanded?: boolean;
  readonly showGroupSummary?: boolean;
  readonly aggregations?: readonly AggregationBinding[];
  readonly order?: "asc" | "desc";
  readonly emptyGroups?: boolean;
}
```

- [ ] **Step 4: Add re-export to displayer-types.ts**

Add to the bottom of `packages/pages-component/src/model/displayer-types.ts`:

```typescript
export type {
  GroupDisplayMode,
  ContentDisplayMode,
  GroupedViewPreset,
  GroupedViewMode,
  AggregationBinding,
  GroupedViewProps,
} from "./grouped-view-types.js";
```

- [ ] **Step 5: Create presets.ts**

```typescript
// packages/pages-viz/src/components/grouped-view/presets.ts
import type {
  GroupedViewProps,
  GroupedViewMode,
  GroupedViewPreset,
} from "@casehubio/pages-component";

interface PresetDef extends GroupedViewMode {
  readonly defaultExpanded: boolean;
  readonly guidance: string;
}

export const PRESETS: Record<GroupedViewPreset, PresetDef> = {
  spreadsheet: {
    groupDisplay: "table-row",
    contentDisplay: "table",
    defaultExpanded: true,
    guidance: "Dense data, comparison tasks, >20 items per group. Traditional spreadsheet look.",
  },
  sectioned: {
    groupDisplay: "section-heading",
    contentDisplay: "table",
    defaultExpanded: true,
    guidance: "Browsing/navigation, date or category groups, mixed group sizes. Group headers are page-level text outside the table.",
  },
  list: {
    groupDisplay: "section-heading",
    contentDisplay: "list",
    defaultExpanded: true,
    guidance: "Small datasets (<7 items/group), status boards, at-a-glance views. Items render as aligned key-value rows, not table rows.",
  },
} as const;

export function resolvePreset(props: GroupedViewProps): GroupedViewMode {
  const base = props.preset ? PRESETS[props.preset] : PRESETS.sectioned;
  const groupDisplay = props.groupDisplay ?? base.groupDisplay;
  const contentDisplay = props.contentDisplay ?? base.contentDisplay;

  if (groupDisplay === "table-row" && contentDisplay === "list") {
    throw new Error(
      "Invalid combination: groupDisplay 'table-row' + contentDisplay 'list'. " +
      "<dl> content cannot render inside table rows.",
    );
  }

  return { groupDisplay, contentDisplay } as GroupedViewMode;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-viz run test -- --run presets.test`
Expected: all 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-component/src/model/grouped-view-types.ts packages/pages-component/src/model/displayer-types.ts packages/pages-viz/src/components/grouped-view/presets.ts packages/pages-viz/src/components/grouped-view/presets.test.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(grouped-view): types and preset resolution with TDD

Refs #142"
```

---

## Task 2: Group Boundary Extraction

**Files:**
- Create: `packages/pages-viz/src/components/grouped-view/group-extraction.ts`
- Create: `packages/pages-viz/src/components/grouped-view/group-extraction.test.ts`

**Interfaces:**
- Consumes: `TypedDataSet`, `ColumnId` from `@casehubio/pages-data`
- Produces: `GroupBoundary { name, startRow, rowCount, aggregates }`, `extractGroupBoundaries(dataset, keyColumnId, aggregateColumnIds): readonly GroupBoundary[]`

- [ ] **Step 1: Write failing tests for group boundary extraction**

```typescript
// packages/pages-viz/src/components/grouped-view/group-extraction.test.ts
import { describe, it, expect } from "vitest";
import { extractGroupBoundaries } from "./group-extraction.js";
import type { DataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";

function makeGroupedDataset(groups: { key: string; rows: string[][] }[]): {
  dataset: ReturnType<typeof toTypedDataSet>;
  keyCol: ColumnId;
  aggCols: ColumnId[];
} {
  const keyCol = "group_key" as ColumnId;
  const col1 = "name" as ColumnId;
  const col2 = "value" as ColumnId;

  const allRows: (string | null)[][] = [];
  for (const g of groups) {
    for (const row of g.rows) {
      allRows.push([g.key, ...row]);
    }
  }

  const ds: DataSet = {
    columns: [
      { id: keyCol, name: "Group", type: ColumnType.LABEL },
      { id: col1, name: "Name", type: ColumnType.LABEL },
      { id: col2, name: "Value", type: ColumnType.LABEL },
    ],
    data: allRows,
  };

  return { dataset: toTypedDataSet(ds), keyCol, aggCols: [] };
}

describe("extractGroupBoundaries", () => {
  it("extracts groups from consecutive key values", () => {
    const { dataset, keyCol, aggCols } = makeGroupedDataset([
      { key: "Critical", rows: [["a", "1"], ["b", "2"]] },
      { key: "Warning", rows: [["c", "3"]] },
    ]);

    const boundaries = extractGroupBoundaries(dataset, keyCol, aggCols);
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]!.name).toBe("Critical");
    expect(boundaries[0]!.startRow).toBe(0);
    expect(boundaries[0]!.rowCount).toBe(2);
    expect(boundaries[1]!.name).toBe("Warning");
    expect(boundaries[1]!.startRow).toBe(2);
    expect(boundaries[1]!.rowCount).toBe(1);
  });

  it("handles single group", () => {
    const { dataset, keyCol, aggCols } = makeGroupedDataset([
      { key: "All", rows: [["a", "1"], ["b", "2"], ["c", "3"]] },
    ]);
    const boundaries = extractGroupBoundaries(dataset, keyCol, aggCols);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]!.rowCount).toBe(3);
  });

  it("handles empty dataset", () => {
    const ds: DataSet = {
      columns: [
        { id: "k" as ColumnId, name: "Key", type: ColumnType.LABEL },
      ],
      data: [],
    };
    const boundaries = extractGroupBoundaries(toTypedDataSet(ds), "k" as ColumnId, []);
    expect(boundaries).toHaveLength(0);
  });

  it("extracts aggregate values from aggregate columns", () => {
    const keyCol = "group_key" as ColumnId;
    const aggCol = "total" as ColumnId;
    const ds: DataSet = {
      columns: [
        { id: keyCol, name: "Group", type: ColumnType.LABEL },
        { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
        { id: aggCol, name: "Total", type: ColumnType.NUMBER },
      ],
      data: [
        ["Critical", "a", "100"],
        ["Critical", "b", "100"],
        ["Warning", "c", "50"],
      ],
    };
    const boundaries = extractGroupBoundaries(toTypedDataSet(ds), keyCol, [aggCol]);
    expect(boundaries[0]!.aggregates.get(aggCol)).toBe("100");
    expect(boundaries[1]!.aggregates.get(aggCol)).toBe("50");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-viz run test -- --run group-extraction.test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement extractGroupBoundaries**

```typescript
// packages/pages-viz/src/components/grouped-view/group-extraction.ts
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";

export interface GroupBoundary {
  readonly name: string;
  readonly startRow: number;
  readonly rowCount: number;
  readonly aggregates: ReadonlyMap<ColumnId, unknown>;
}

export function extractGroupBoundaries(
  dataset: TypedDataSet,
  keyColumnId: ColumnId,
  aggregateColumnIds: readonly ColumnId[],
): readonly GroupBoundary[] {
  const rowCount = dataset.data.length;
  if (rowCount === 0) return [];

  const keyColIndex = dataset.columns.findIndex((c) => c.id === keyColumnId);
  if (keyColIndex < 0) return [];

  const aggColIndices = aggregateColumnIds.map((id) =>
    dataset.columns.findIndex((c) => c.id === id),
  );

  const boundaries: GroupBoundary[] = [];
  let currentName = String(dataset.data[0]![keyColIndex] ?? "");
  let startRow = 0;

  for (let i = 1; i <= rowCount; i++) {
    const name = i < rowCount ? String(dataset.data[i]![keyColIndex] ?? "") : null;
    if (name !== currentName) {
      const aggregates = new Map<ColumnId, unknown>();
      for (let a = 0; a < aggregateColumnIds.length; a++) {
        const colIdx = aggColIndices[a]!;
        if (colIdx >= 0) {
          aggregates.set(aggregateColumnIds[a]!, dataset.data[startRow]![colIdx]);
        }
      }
      boundaries.push({ name: currentName, startRow, rowCount: i - startRow, aggregates });
      if (name !== null) {
        currentName = name;
        startRow = i;
      }
    }
  }

  return boundaries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-viz run test -- --run group-extraction.test`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-viz/src/components/grouped-view/group-extraction.ts packages/pages-viz/src/components/grouped-view/group-extraction.test.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(grouped-view): group boundary extraction with TDD

Refs #142"
```

---

## Task 3: Column Width Computation

**Files:**
- Create: `packages/pages-viz/src/components/grouped-view/column-widths.ts`
- Create: `packages/pages-viz/src/components/grouped-view/column-widths.test.ts`

**Interfaces:**
- Consumes: `TypedDataSet`, `ColumnId` from `@casehubio/pages-data`
- Produces: `computeColumnWidths(dataset, columns, font, sampleSize?): readonly number[]`

- [ ] **Step 1: Write failing tests for column width computation**

```typescript
// packages/pages-viz/src/components/grouped-view/column-widths.test.ts
import { describe, it, expect, vi } from "vitest";
import { computeColumnWidths } from "./column-widths.js";
import type { DataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";

function makeDataset(headers: string[], rows: string[][]): ReturnType<typeof toTypedDataSet> {
  const ds: DataSet = {
    columns: headers.map((h) => ({ id: h as ColumnId, name: h, type: ColumnType.LABEL })),
    data: rows,
  };
  return toTypedDataSet(ds);
}

describe("computeColumnWidths", () => {
  it("returns equal widths when Canvas is unavailable", () => {
    // In Vitest/jsdom, Canvas may not be available
    const dataset = makeDataset(["A", "B", "C"], [["x", "y", "z"]]);
    const widths = computeColumnWidths(dataset, ["A", "B", "C"] as ColumnId[], "14px sans-serif");
    expect(widths).toHaveLength(3);
    // Fallback: all equal
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
  });

  it("returns one width per column", () => {
    const dataset = makeDataset(["Name", "Value"], [["short", "1"], ["a much longer name", "2"]]);
    const widths = computeColumnWidths(dataset, ["Name", "Value"] as ColumnId[], "14px sans-serif");
    expect(widths).toHaveLength(2);
    widths.forEach((w) => expect(w).toBeGreaterThan(0));
  });

  it("handles empty dataset", () => {
    const dataset = makeDataset(["A", "B"], []);
    const widths = computeColumnWidths(dataset, ["A", "B"] as ColumnId[], "14px sans-serif");
    expect(widths).toHaveLength(2);
    widths.forEach((w) => expect(w).toBeGreaterThan(0));
  });

  it("respects sampleSize limit", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [String(i), "val"]);
    const dataset = makeDataset(["ID", "Val"], rows);
    // Should not throw or hang with large datasets
    const widths = computeColumnWidths(dataset, ["ID", "Val"] as ColumnId[], "14px sans-serif", 10);
    expect(widths).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-viz run test -- --run column-widths.test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement computeColumnWidths**

```typescript
// packages/pages-viz/src/components/grouped-view/column-widths.ts
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";

const DEFAULT_SAMPLE_SIZE = 50;
const MIN_COL_WIDTH = 60;
const COL_PADDING = 24;

export function computeColumnWidths(
  dataset: TypedDataSet,
  columns: readonly ColumnId[],
  font: string,
  sampleSize: number = DEFAULT_SAMPLE_SIZE,
): readonly number[] {
  const colIndices = columns.map((id) => dataset.columns.findIndex((c) => c.id === id));

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    if (ctx) ctx.font = font;
  } catch {
    // Canvas unavailable (SSR, restricted env)
  }

  if (!ctx) {
    const equalWidth = Math.max(MIN_COL_WIDTH, 120);
    return columns.map(() => equalWidth);
  }

  const maxWidths = columns.map((id) => {
    const col = dataset.columns.find((c) => c.id === id);
    const headerText = col?.name ?? String(id);
    return ctx.measureText(headerText).width + COL_PADDING;
  });

  const rowCount = dataset.data.length;
  const step = rowCount <= sampleSize ? 1 : Math.ceil(rowCount / sampleSize);

  for (let r = 0; r < rowCount; r += step) {
    const row = dataset.data[r]!;
    for (let c = 0; c < columns.length; c++) {
      const colIdx = colIndices[c]!;
      if (colIdx < 0) continue;
      const cellText = String(row[colIdx] ?? "");
      const cellWidth = ctx.measureText(cellText).width + COL_PADDING;
      if (cellWidth > maxWidths[c]!) maxWidths[c] = cellWidth;
    }
  }

  return maxWidths.map((w) => Math.max(w, MIN_COL_WIDTH));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-viz run test -- --run column-widths.test`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-viz/src/components/grouped-view/column-widths.ts packages/pages-viz/src/components/grouped-view/column-widths.test.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(grouped-view): column width computation via Canvas with TDD

Refs #142"
```

---

## Task 4: Styles and Renderers

**Files:**
- Create: `packages/pages-viz/src/components/grouped-view/group-view-styles.ts`
- Create: `packages/pages-viz/src/components/grouped-view/render-group-table-row.ts`
- Create: `packages/pages-viz/src/components/grouped-view/render-group-section.ts`
- Create: `packages/pages-viz/src/components/grouped-view/render-content-table.ts`
- Create: `packages/pages-viz/src/components/grouped-view/render-content-list.ts`

**Interfaces:**
- Consumes: `GroupBoundary` from Task 2, `TypedDataSet`, `ColumnId` from `@casehubio/pages-data`
- Produces: `GROUPED_VIEW_CSS: string`, `renderGroupTableRow(...)`, `renderGroupSection(...)`, `renderContentTable(...)`, `renderContentList(...)`

Each renderer is a pure function that returns an HTML string fragment. The main component (`PagesGroupedView` in Task 5) calls them and sets `innerHTML`. This matches the pattern in existing components like `PagesBadge` and `PagesCountdown`.

- [ ] **Step 1: Create styles file**

```typescript
// packages/pages-viz/src/components/grouped-view/group-view-styles.ts

export const GROUPED_VIEW_CSS = `
:host {
  display: block;
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: var(--pages-font-size-base, 14px);
  color: var(--pages-neutral-12, #333);
}

/* ── Spreadsheet mode (table-row groups) ─────────────────── */

.pages-grouped-view table {
  width: 100%;
  border-collapse: collapse;
}

.pages-grouped-view th {
  text-align: left;
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  font-weight: var(--pages-font-weight-semibold, 600);
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-9, #666);
  border-bottom: 2px solid var(--pages-neutral-5, #ddd);
  white-space: nowrap;
}

.pages-grouped-view td {
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  border-bottom: 1px solid var(--pages-neutral-3, #eee);
}

.pages-grouped-view tr:nth-child(even) td {
  background: var(--pages-neutral-2, #fafafa);
}

.group-header td {
  background: var(--pages-neutral-3, #f5f5f5) !important;
  font-weight: var(--pages-font-weight-semibold, 600);
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  border-bottom: 1px solid var(--pages-neutral-5, #ddd);
}

.group-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-weight: var(--pages-font-weight-semibold, 600);
  color: var(--pages-neutral-12, #333);
  padding: 0;
  display: flex;
  align-items: center;
  gap: var(--pages-space-2, 8px);
}

/* ── Section-heading mode ────────────────────────────────── */

.column-header-bar {
  display: grid;
  padding: 0 var(--pages-space-3, 12px);
  border-bottom: 2px solid var(--pages-neutral-5, #ddd);
}

.col-header {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: var(--pages-space-2, 8px) 0;
  font-weight: var(--pages-font-weight-semibold, 600);
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-9, #666);
  white-space: nowrap;
}

.col-label {
  text-align: left;
  padding: var(--pages-space-2, 8px) 0;
  font-weight: var(--pages-font-weight-semibold, 600);
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-9, #666);
  white-space: nowrap;
}

.section-toggle {
  font-size: var(--pages-font-size-lg, 18px);
  font-weight: var(--pages-font-weight-semibold, 600);
  color: var(--pages-neutral-12, #333);
  background: none;
  border: none;
  padding: var(--pages-space-3, 12px) 0 var(--pages-space-2, 8px);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--pages-space-2, 8px);
  width: 100%;
}

.section-chevron {
  font-size: var(--pages-font-size-sm, 12px);
  transition: transform var(--pages-duration-fast, 150ms) var(--pages-ease-default, ease);
  display: inline-block;
}

.section-chevron.expanded {
  transform: rotate(90deg);
}

.section-summary {
  font-size: var(--pages-font-size-sm, 12px);
  font-weight: var(--pages-font-weight-normal, 400);
  color: var(--pages-neutral-8, #888);
  margin-left: var(--pages-space-2, 8px);
}

.section-content {
  overflow: hidden;
  transition: max-height var(--pages-duration-normal, 250ms) var(--pages-ease-default, ease),
              opacity var(--pages-duration-fast, 150ms) var(--pages-ease-default, ease);
}

.section-content.collapsing {
  max-height: 0 !important;
  opacity: 0;
}

/* ── List mode ───────────────────────────────────────────── */

.aligned-list {
  display: grid;
  row-gap: 0;
  padding: 0 var(--pages-space-3, 12px);
}

.list-item {
  display: contents;
}

.list-item dd {
  margin: 0;
  padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
  color: var(--pages-neutral-11, #444);
}

.list-item + .list-item dd {
  border-top: 1px solid var(--pages-neutral-3, #eee);
}

/* ── Accessibility ───────────────────────────────────────── */

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Reduced motion ──────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .section-content,
  .section-chevron {
    transition: none !important;
  }
}
`;
```

- [ ] **Step 2: Create render-group-table-row.ts**

```typescript
// packages/pages-viz/src/components/grouped-view/render-group-table-row.ts
import type { GroupBoundary } from "./group-extraction.js";
import type { ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";

export function renderGroupTableRowHeader(
  boundary: GroupBoundary,
  colSpan: number,
  expanded: boolean,
  instanceId: string,
  index: number,
  showSummary: boolean,
): string {
  const chevron = expanded ? "▼" : "▶";
  const summary = showSummary && boundary.aggregates.size > 0
    ? " · " + Array.from(boundary.aggregates.entries())
        .map(([, v]) => String(v)).join(", ")
    : "";
  const ariaId = `${instanceId}-group-${index}`;

  return `<tr class="group-header">
    <td colspan="${colSpan}">
      <button class="group-toggle"
              aria-expanded="${expanded}"
              aria-controls="${ariaId}"
              data-group="${boundary.name}">
        ${chevron} ${boundary.name} (${boundary.rowCount})${summary}
      </button>
    </td>
  </tr>`;
}
```

- [ ] **Step 3: Create render-group-section.ts**

```typescript
// packages/pages-viz/src/components/grouped-view/render-group-section.ts
import type { GroupBoundary } from "./group-extraction.js";

export function renderGroupSectionHeader(
  boundary: GroupBoundary,
  expanded: boolean,
  instanceId: string,
  index: number,
  showSummary: boolean,
): string {
  const chevronClass = expanded ? "section-chevron expanded" : "section-chevron";
  const summary = showSummary && boundary.aggregates.size > 0
    ? " · " + Array.from(boundary.aggregates.entries())
        .map(([, v]) => String(v)).join(", ")
    : "";
  const ariaId = `${instanceId}-group-${index}`;

  return `<div class="group-section">
    <button class="section-toggle"
            aria-expanded="${expanded}"
            aria-controls="${ariaId}"
            data-group="${boundary.name}">
      <span class="${chevronClass}">▶</span>
      <span class="section-title">${boundary.name}</span>
      <span class="section-summary">${boundary.rowCount} items${summary}</span>
    </button>`;
}
```

- [ ] **Step 4: Create render-content-table.ts**

```typescript
// packages/pages-viz/src/components/grouped-view/render-content-table.ts
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupBoundary } from "./group-extraction.js";

export function renderContentTable(
  dataset: TypedDataSet,
  boundary: GroupBoundary,
  contentColumns: readonly ColumnId[],
  colWidths: readonly number[],
  instanceId: string,
  index: number,
  expanded: boolean,
): string {
  const ariaId = `${instanceId}-group-${index}`;
  const hiddenAttr = expanded ? "" : " hidden";
  const colgroup = colWidths
    .map((w) => `<col style="width: ${w}px">`)
    .join("");
  const theadCells = contentColumns.map((id) => {
    const col = dataset.columns.find((c) => c.id === id);
    return `<th>${col?.name ?? String(id)}</th>`;
  }).join("");

  let rows = "";
  const colIndices = contentColumns.map((id) => dataset.columns.findIndex((c) => c.id === id));

  for (let r = boundary.startRow; r < boundary.startRow + boundary.rowCount; r++) {
    const row = dataset.data[r]!;
    const cells = colIndices.map((ci) => `<td>${ci >= 0 ? (row[ci] ?? "") : ""}</td>`).join("");
    rows += `<tr>${cells}</tr>`;
  }

  return `<div class="section-content" id="${ariaId}"${hiddenAttr}>
    <table style="table-layout: fixed">
      <colgroup>${colgroup}</colgroup>
      <thead class="visually-hidden"><tr>${theadCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}
```

- [ ] **Step 5: Create render-content-list.ts**

```typescript
// packages/pages-viz/src/components/grouped-view/render-content-list.ts
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupBoundary } from "./group-extraction.js";

export function renderContentList(
  dataset: TypedDataSet,
  boundary: GroupBoundary,
  contentColumns: readonly ColumnId[],
  colWidthsCss: string,
  instanceId: string,
  index: number,
  expanded: boolean,
): string {
  const ariaId = `${instanceId}-group-${index}`;
  const hiddenAttr = expanded ? "" : " hidden";
  const colIndices = contentColumns.map((id) => dataset.columns.findIndex((c) => c.id === id));

  let items = "";
  for (let r = boundary.startRow; r < boundary.startRow + boundary.rowCount; r++) {
    const row = dataset.data[r]!;
    const pairs = contentColumns.map((id, ci) => {
      const col = dataset.columns.find((c) => c.id === id);
      const label = col?.name ?? String(id);
      const value = colIndices[ci]! >= 0 ? (row[colIndices[ci]!] ?? "") : "";
      return `<dt class="visually-hidden">${label}</dt><dd>${value}</dd>`;
    }).join("");
    items += `<div class="list-item">${pairs}</div>`;
  }

  return `<div class="section-content" id="${ariaId}"${hiddenAttr}>
    <dl class="aligned-list" style="grid-template-columns: ${colWidthsCss}">
      ${items}
    </dl>
  </div>
</div>`;
}
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-viz/src/components/grouped-view/group-view-styles.ts packages/pages-viz/src/components/grouped-view/render-group-table-row.ts packages/pages-viz/src/components/grouped-view/render-group-section.ts packages/pages-viz/src/components/grouped-view/render-content-table.ts packages/pages-viz/src/components/grouped-view/render-content-list.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(grouped-view): styles and render functions

Refs #142"
```

---

## Task 5: Main Component

**Files:**
- Create: `packages/pages-viz/src/components/grouped-view/PagesGroupedView.ts`
- Create: `packages/pages-viz/src/components/grouped-view/PagesGroupedView.test.ts`
- Modify: `packages/pages-viz/src/index.ts`

**Interfaces:**
- Consumes: All from Tasks 1–4
- Produces: `PagesGroupedView` custom element registered as `pages-grouped-view`

- [ ] **Step 1: Write failing component tests**

```typescript
// packages/pages-viz/src/components/grouped-view/PagesGroupedView.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import type { GroupedViewProps } from "@casehubio/pages-component";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import { PagesGroupedView } from "./PagesGroupedView.js";

function mockLookup(): DataSetLookup {
  return { dataSetId: "test", operations: [] } as unknown as DataSetLookup;
}

function makeGroupedDataset(): ReturnType<typeof toTypedDataSet> {
  const ds: DataSet = {
    columns: [
      { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
      { id: "date" as ColumnId, name: "Date", type: ColumnType.LABEL },
    ],
    data: [
      ["Critical", "Server outage", "Jul 7"],
      ["Critical", "Data loss", "Jul 6"],
      ["Warning", "Slow query", "Jul 5"],
    ],
  };
  return toTypedDataSet(ds);
}

function makeProps(overrides: Partial<GroupedViewProps> = {}): GroupedViewProps {
  return {
    lookup: mockLookup(),
    groupBy: {
      sourceId: "status" as ColumnId,
      columnId: "status" as ColumnId,
      strategy: { mode: "distinct" as const },
      maxIntervals: 100,
      emptyIntervals: false,
      ascendingOrder: true,
    },
    ...overrides,
  };
}

describe("PagesGroupedView", () => {
  let element: PagesGroupedView;

  beforeEach(() => {
    element = document.createElement("pages-grouped-view") as PagesGroupedView;
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it("renders in sectioned mode by default", async () => {
    element.props = makeProps();
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const sections = shadow.querySelectorAll(".group-section");
    expect(sections.length).toBe(2);
  });

  it("renders spreadsheet mode with single table", async () => {
    element.props = makeProps({ preset: "spreadsheet" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const tables = shadow.querySelectorAll("table");
    expect(tables.length).toBe(1);
    const groupHeaders = shadow.querySelectorAll(".group-header");
    expect(groupHeaders.length).toBe(2);
  });

  it("renders list mode with dl elements", async () => {
    element.props = makeProps({ preset: "list" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const dls = shadow.querySelectorAll("dl");
    expect(dls.length).toBe(2);
  });

  it("toggles expand/collapse on group click", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const toggleBtn = shadow.querySelector(".section-toggle") as HTMLButtonElement;
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("has unique aria-controls IDs", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const toggles = shadow.querySelectorAll(".section-toggle");
    const ids = Array.from(toggles).map((t) => t.getAttribute("aria-controls"));
    expect(new Set(ids).size).toBe(ids.length);
    // Each ID should match a content element
    for (const id of ids) {
      expect(shadow.getElementById(id!)).not.toBeNull();
    }
  });

  it("emits pages-event on group toggle", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const events: CustomEvent[] = [];
    element.addEventListener("pages-event", ((e: CustomEvent) => events.push(e)) as EventListener);

    const shadow = element.shadowRoot;
    const toggleBtn = shadow.querySelector(".section-toggle") as HTMLButtonElement;
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(events.length).toBe(1);
    expect(events[0]!.detail.topic).toBe("group-toggle");
    expect(events[0]!.detail.payload.group).toBe("Critical");
    expect(events[0]!.detail.payload.expanded).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-viz run test -- --run PagesGroupedView.test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PagesGroupedView**

```typescript
// packages/pages-viz/src/components/grouped-view/PagesGroupedView.ts
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupedViewProps } from "@casehubio/pages-component";
import { PagesElement } from "../../base/PagesElement.js";
import { resolvePreset } from "./presets.js";
import { extractGroupBoundaries } from "./group-extraction.js";
import type { GroupBoundary } from "./group-extraction.js";
import { computeColumnWidths } from "./column-widths.js";
import { renderGroupTableRowHeader } from "./render-group-table-row.js";
import { renderGroupSectionHeader } from "./render-group-section.js";
import { renderContentTable } from "./render-content-table.js";
import { renderContentList } from "./render-content-list.js";
import { GROUPED_VIEW_CSS } from "./group-view-styles.js";

export class PagesGroupedView extends PagesElement<GroupedViewProps> {
  private _expandState = new Map<string, boolean>();
  private _instanceId = "";
  private _styleEl: HTMLStyleElement;

  constructor() {
    super();
    this._styleEl = document.createElement("style");
    this._styleEl.textContent = GROUPED_VIEW_CSS;
    this.shadowRoot.insertBefore(this._styleEl, this.container);
  }

  override connectedCallback(): void {
    this._instanceId = crypto.randomUUID().slice(0, 8);
    super.connectedCallback();
  }

  protected override update(): void {
    const props = this.props;
    const dataset = this.dataSet;
    if (!props || !dataset) {
      this.container.innerHTML = "";
      return;
    }

    const mode = resolvePreset(props);
    const keyColumnId = props.groupBy.columnId;
    const aggColumnIds = (props.aggregations ?? []).map((a) => a.column);
    const boundaries = extractGroupBoundaries(dataset, keyColumnId, aggColumnIds);

    const contentColumnIds = dataset.columns
      .filter((c) => c.id !== keyColumnId && !aggColumnIds.includes(c.id))
      .map((c) => c.id);

    // Initialize expand state for new groups
    const defaultExpanded = props.defaultExpanded ?? true;
    for (const b of boundaries) {
      if (!this._expandState.has(b.name)) {
        const isEmpty = b.rowCount === 0;
        this._expandState.set(b.name, isEmpty ? false : defaultExpanded);
      }
    }

    const colWidths = mode.groupDisplay === "section-heading"
      ? computeColumnWidths(dataset, contentColumnIds, "14px sans-serif")
      : [];
    const colWidthsCss = colWidths.map((w) => `${w}px`).join(" ");

    const showSummary = props.showGroupSummary ?? false;

    if (mode.groupDisplay === "table-row" && mode.contentDisplay === "table") {
      this.renderSpreadsheet(dataset, boundaries, contentColumnIds, keyColumnId, showSummary);
    } else {
      this.renderSectioned(dataset, boundaries, contentColumnIds, mode.contentDisplay, colWidths, colWidthsCss, showSummary);
    }

    this.attachToggleListeners();
  }

  private renderSpreadsheet(
    dataset: TypedDataSet,
    boundaries: readonly GroupBoundary[],
    contentColumns: readonly ColumnId[],
    keyColumnId: ColumnId,
    showSummary: boolean,
  ): void {
    const allCols = [keyColumnId, ...contentColumns];
    const headerCells = allCols.map((id) => {
      const col = dataset.columns.find((c) => c.id === id);
      return `<th>${col?.name ?? String(id)}</th>`;
    }).join("");

    const colIndices = contentColumns.map((id) => dataset.columns.findIndex((c) => c.id === id));
    let bodyHtml = "";

    for (let gi = 0; gi < boundaries.length; gi++) {
      const b = boundaries[gi]!;
      const expanded = this._expandState.get(b.name) ?? true;
      bodyHtml += renderGroupTableRowHeader(b, allCols.length, expanded, this._instanceId, gi, showSummary);

      if (expanded) {
        for (let r = b.startRow; r < b.startRow + b.rowCount; r++) {
          const row = dataset.data[r]!;
          const cells = [`<td></td>`, ...colIndices.map((ci) => `<td>${ci >= 0 ? (row[ci] ?? "") : ""}</td>`)].join("");
          bodyHtml += `<tr>${cells}</tr>`;
        }
      }
    }

    this.container.innerHTML = `<div class="pages-grouped-view">
      <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyHtml}</tbody></table>
    </div>`;
  }

  private renderSectioned(
    dataset: TypedDataSet,
    boundaries: readonly GroupBoundary[],
    contentColumns: readonly ColumnId[],
    contentDisplay: "table" | "list",
    colWidths: readonly number[],
    colWidthsCss: string,
    showSummary: boolean,
  ): void {
    const isListMode = contentDisplay === "list";
    const headerBarItems = contentColumns.map((id) => {
      const col = dataset.columns.find((c) => c.id === id);
      const label = col?.name ?? String(id);
      if (isListMode) {
        return `<span class="col-label">${label}</span>`;
      }
      return `<button class="col-header" data-column="${String(id)}">${label}</button>`;
    }).join("");

    let sectionsHtml = "";
    for (let gi = 0; gi < boundaries.length; gi++) {
      const b = boundaries[gi]!;
      const expanded = this._expandState.get(b.name) ?? true;
      sectionsHtml += renderGroupSectionHeader(b, expanded, this._instanceId, gi, showSummary);

      if (isListMode) {
        sectionsHtml += renderContentList(dataset, b, contentColumns, colWidthsCss, this._instanceId, gi, expanded);
      } else {
        sectionsHtml += renderContentTable(dataset, b, contentColumns, colWidths, this._instanceId, gi, expanded);
      }
    }

    const modeClass = isListMode ? "list-mode" : "sectioned";
    this.container.innerHTML = `<div class="pages-grouped-view ${modeClass}">
      <div class="column-header-bar" style="grid-template-columns: ${colWidthsCss}">${headerBarItems}</div>
      ${sectionsHtml}
    </div>`;
  }

  private attachToggleListeners(): void {
    const buttons = this.container.querySelectorAll("[data-group]");
    for (const btn of buttons) {
      btn.addEventListener("click", (e) => {
        const groupName = (e.currentTarget as HTMLElement).getAttribute("data-group")!;
        const wasExpanded = this._expandState.get(groupName) ?? true;
        this._expandState.set(groupName, !wasExpanded);

        this.dispatchEvent(new CustomEvent("pages-event", {
          bubbles: true,
          composed: true,
          detail: {
            topic: "group-toggle",
            payload: { group: groupName, expanded: !wasExpanded },
          },
        }));

        // Focus rescue: if focus is inside collapsing content, move to toggle
        if (wasExpanded) {
          const controlsId = (e.currentTarget as HTMLElement).getAttribute("aria-controls");
          if (controlsId) {
            const content = this.shadowRoot.getElementById(controlsId);
            if (content && content.contains(document.activeElement)) {
              (e.currentTarget as HTMLElement).focus();
            }
          }
        }

        this.update();
      });
    }
  }
}

customElements.define("pages-grouped-view", PagesGroupedView);
```

- [ ] **Step 4: Add export to index.ts**

Add to `packages/pages-viz/src/index.ts`:

```typescript
export { PagesGroupedView } from "./components/grouped-view/PagesGroupedView.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @casehubio/pages-viz run test -- --run PagesGroupedView.test`
Expected: all 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-viz/src/components/grouped-view/PagesGroupedView.ts packages/pages-viz/src/components/grouped-view/PagesGroupedView.test.ts packages/pages-viz/src/index.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(grouped-view): main PagesGroupedView component with TDD

Refs #142"
```

---

## Task 6: Component Registration and Desugaring

**Files:**
- Modify: `packages/pages-component/src/model/type-guards.ts`
- Modify: `packages/pages-runtime/src/activation.ts`
- Modify: `packages/pages-ui/src/parser/displayer-desugar.ts`
- Create: `packages/pages-ui/src/parser/grouped-view-desugar.ts`
- Create: `packages/pages-ui/src/parser/grouped-view-desugar.test.ts`

**Interfaces:**
- Consumes: `GroupedViewProps` from Task 1, `GroupOp`, `ResultColumn`, `GroupingKey` from `@casehubio/pages-data`
- Produces: `desugarGroupedView(raw): Component` — converts YAML object to typed Component with attached GroupOp

- [ ] **Step 1: Write failing desugaring tests**

```typescript
// packages/pages-ui/src/parser/grouped-view-desugar.test.ts
import { describe, it, expect } from "vitest";
import { desugarGroupedView } from "./grouped-view-desugar.js";

describe("desugarGroupedView", () => {
  it("desugars minimal grouped-view YAML", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
    });
    expect(result.type).toBe("grouped-view");
    expect(result.props).toBeDefined();
    const props = result.props as Record<string, unknown>;
    expect(props.groupBy).toBeDefined();
    const groupBy = props.groupBy as Record<string, unknown>;
    expect(groupBy.strategy).toEqual({ mode: "distinct" });
  });

  it("desugars fixedCalendar strategy with unit", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "date", strategy: "fixedCalendar", unit: "MONTH" },
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.strategy).toEqual({ mode: "fixedCalendar", unit: "MONTH" });
  });

  it("rejects fixedCalendar without unit", () => {
    expect(() => desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "date", strategy: "fixedCalendar" },
    })).toThrow(/unit.*required/i);
  });

  it("desugars aggregations", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      aggregations: [{ column: "amount", fn: "SUM" }],
    });
    const props = result.props as Record<string, unknown>;
    const aggs = props.aggregations as Array<Record<string, unknown>>;
    expect(aggs).toHaveLength(1);
    expect(aggs[0]!.column).toBe("amount");
    expect(aggs[0]!.fn).toEqual({ fn: "SUM" });
  });

  it("maps preset field through", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      preset: "spreadsheet",
    });
    expect((result.props as Record<string, unknown>).preset).toBe("spreadsheet");
  });

  it("maps order field", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      order: "desc",
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.ascendingOrder).toBe(false);
  });

  it("rejects table-row + list combination", () => {
    expect(() => desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      groupDisplay: "table-row",
      contentDisplay: "list",
    })).toThrow(/invalid.*combination/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @casehubio/pages-ui run test -- --run grouped-view-desugar.test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement grouped-view-desugar.ts**

```typescript
// packages/pages-ui/src/parser/grouped-view-desugar.ts
import type { Component } from "../model/types.js";
import type { ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupingKey, GroupStrategy, Aggregation } from "@casehubio/pages-data/dist/dataset/group.js";
import type { AggregationBinding, GroupedViewProps } from "@casehubio/pages-component";

function parseStrategy(raw: Record<string, unknown>): GroupStrategy {
  const strategy = raw.strategy as string;
  switch (strategy) {
    case "distinct":
      return { mode: "distinct" };
    case "fixedCalendar": {
      const unit = raw.unit as string | undefined;
      if (!unit) throw new Error("Unit is required when strategy is fixedCalendar");
      return { mode: "fixedCalendar", unit: unit as "QUARTER" | "MONTH" | "DAY_OF_WEEK" | "HOUR" | "MINUTE" | "SECOND" };
    }
    case "dynamicRange":
      return { mode: "dynamicRange", preferredUnit: raw.preferredUnit as string | undefined } as GroupStrategy;
    case "dynamic":
      return { mode: "dynamic", preferredUnit: raw.preferredUnit as string | undefined } as GroupStrategy;
    default:
      throw new Error(`Unknown group strategy: ${strategy}`);
  }
}

function parseAggregation(fnStr: string): Aggregation {
  switch (fnStr) {
    case "SUM": return { fn: "SUM" };
    case "AVERAGE": return { fn: "AVERAGE" };
    case "MEDIAN": return { fn: "MEDIAN" };
    case "COUNT": return { fn: "COUNT" };
    case "DISTINCT": return { fn: "DISTINCT" };
    case "MIN": return { fn: "MIN" };
    case "MAX": return { fn: "MAX" };
    default:
      if (fnStr === "JOIN") return { fn: "JOIN", separator: ", " };
      if (fnStr === "DISTINCTJOIN") return { fn: "DISTINCTJOIN", separator: ", " };
      throw new Error(`Unknown aggregation function: ${fnStr}`);
  }
}

export function desugarGroupedView(raw: Record<string, unknown>): Component {
  const groupByRaw = raw.groupBy as Record<string, unknown>;
  if (!groupByRaw) throw new Error("grouped-view requires a groupBy field");

  const column = groupByRaw.column as string;
  const order = raw.order as string | undefined;

  const groupBy: GroupingKey = {
    sourceId: column as ColumnId,
    columnId: column as ColumnId,
    strategy: parseStrategy(groupByRaw),
    maxIntervals: (groupByRaw.maxIntervals as number) ?? 100,
    emptyIntervals: (raw.emptyGroups as boolean) ?? false,
    ascendingOrder: order === "desc" ? false : true,
  };

  const aggregations: AggregationBinding[] = ((raw.aggregations as Array<Record<string, unknown>>) ?? []).map((a) => ({
    column: a.column as ColumnId,
    fn: parseAggregation(a.fn as string),
  }));

  // Validate mode combination
  const groupDisplay = raw.groupDisplay as string | undefined;
  const contentDisplay = raw.contentDisplay as string | undefined;
  if (groupDisplay === "table-row" && contentDisplay === "list") {
    throw new Error(
      "Invalid combination: groupDisplay 'table-row' + contentDisplay 'list'. " +
      "<dl> content cannot render inside table rows.",
    );
  }

  const props: GroupedViewProps = {
    lookup: undefined as unknown as GroupedViewProps["lookup"],
    groupBy,
    preset: raw.preset as GroupedViewProps["preset"],
    groupDisplay: groupDisplay as GroupedViewProps["groupDisplay"],
    contentDisplay: contentDisplay as GroupedViewProps["contentDisplay"],
    defaultExpanded: raw.defaultExpanded as boolean | undefined,
    showGroupSummary: raw.showGroupSummary as boolean | undefined,
    aggregations: aggregations.length > 0 ? aggregations : undefined,
    order: order as GroupedViewProps["order"],
    emptyGroups: raw.emptyGroups as boolean | undefined,
  };

  return { type: "grouped-view", props } as unknown as Component;
}
```

- [ ] **Step 4: Register in type-guards.ts**

Add to `packages/pages-component/src/model/type-guards.ts`:

In the import block, add `GroupedViewProps` to the import from `./displayer-types.js`.

In the `ComponentTypeRegistry` interface, add after the `map` entry:

```typescript
  "grouped-view": GroupedViewProps;
```

Add a type guard function after `isMap`:

```typescript
export function isGroupedView(c: Component): c is TypedComponent<"grouped-view"> {
  return c.type === "grouped-view";
}
```

- [ ] **Step 5: Register in activation.ts**

Add `"grouped-view"` to the `DATA_COMPONENT_TYPES` set in `packages/pages-runtime/src/activation.ts`.

- [ ] **Step 6: Register in displayer-desugar.ts**

Add `GROUPED_VIEW: "grouped-view"` to the `TYPE_MAP` in `packages/pages-ui/src/parser/displayer-desugar.ts`.

- [ ] **Step 7: Run desugaring tests**

Run: `yarn workspace @casehubio/pages-ui run test -- --run grouped-view-desugar.test`
Expected: all 7 tests PASS

- [ ] **Step 8: Run full build to verify integration**

Run: `yarn build:packages`
Expected: builds successfully with no TypeScript errors

- [ ] **Step 9: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add packages/pages-component/src/model/type-guards.ts packages/pages-runtime/src/activation.ts packages/pages-ui/src/parser/displayer-desugar.ts packages/pages-ui/src/parser/grouped-view-desugar.ts packages/pages-ui/src/parser/grouped-view-desugar.test.ts
git -C /Users/mdproctor/claude/casehub/pages commit -m "feat(grouped-view): registration and YAML desugaring with TDD

Refs #142"
```

---

## Task 7: Playwright Visual Tests

**Files:**
- Create: `e2e/grouped-view.spec.ts`
- Create: `e2e/grouped-view-harness.html`

**Interfaces:**
- Consumes: `PagesGroupedView` from Task 5 (loaded via script tag in harness)
- Produces: Playwright screenshot baselines for all visual modes

- [ ] **Step 1: Create test harness HTML page**

```html
<!-- e2e/grouped-view-harness.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grouped View Test Harness</title>
  <style>
    body { margin: 24px; font-family: system-ui, sans-serif; background: #fff; }
    .test-container { max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="test-container">
    <pages-grouped-view id="target"></pages-grouped-view>
  </div>
  <script type="module">
    import "./setup-grouped-view.js";
  </script>
</body>
</html>
```

The `setup-grouped-view.js` module reads query params (`preset`, `data`, `showGroupSummary`) and configures the component. Create it alongside the harness:

```typescript
// e2e/setup-grouped-view.ts
import { PagesGroupedView } from "@casehubio/pages-viz";
import { ColumnType, toTypedDataSet } from "@casehubio/pages-data";
import type { ColumnId, DataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupedViewProps } from "@casehubio/pages-component";

const DATASETS: Record<string, DataSet> = {
  cases: {
    columns: [
      { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
      { id: "name" as ColumnId, name: "Case Name", type: ColumnType.LABEL },
      { id: "date" as ColumnId, name: "Date", type: ColumnType.LABEL },
      { id: "priority" as ColumnId, name: "Priority", type: ColumnType.LABEL },
    ],
    data: [
      ["Critical", "Server outage", "Jul 7", "P0"],
      ["Critical", "Data loss", "Jul 6", "P0"],
      ["Critical", "Auth failure", "Jul 5", "P1"],
      ["Warning", "Slow query", "Jul 4", "P2"],
      ["Warning", "Memory spike", "Jul 3", "P2"],
      ["Info", "Deployment log", "Jul 2", "P3"],
    ],
  },
  "mixed-widths": {
    columns: [
      { id: "category" as ColumnId, name: "Category", type: ColumnType.LABEL },
      { id: "description" as ColumnId, name: "Description", type: ColumnType.LABEL },
      { id: "value" as ColumnId, name: "Value", type: ColumnType.NUMBER },
      { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
    ],
    data: [
      ["Revenue", "Q1 subscription income from enterprise tier", "450000", "Confirmed"],
      ["Revenue", "Ad revenue", "12000", "Estimated"],
      ["Costs", "Infrastructure hosting and bandwidth", "85000", "Invoiced"],
      ["Costs", "Personnel", "320000", "Confirmed"],
      ["Costs", "Travel", "5000", "Pending"],
    ],
  },
};

const params = new URLSearchParams(window.location.search);
const preset = params.get("preset") ?? "sectioned";
const dataKey = params.get("data") ?? "cases";
const showGroupSummary = params.get("showGroupSummary") === "true";
const groupCol = params.get("groupCol") ?? (dataKey === "mixed-widths" ? "category" : "status");

const dataset = DATASETS[dataKey] ?? DATASETS.cases!;
const typed = toTypedDataSet(dataset);

const el = document.getElementById("target") as PagesGroupedView;
el.props = {
  lookup: { dataSetId: "test", operations: [] },
  groupBy: {
    sourceId: groupCol as ColumnId,
    columnId: groupCol as ColumnId,
    strategy: { mode: "distinct" },
    maxIntervals: 100,
    emptyIntervals: false,
    ascendingOrder: true,
  },
  preset: preset as GroupedViewProps["preset"],
  showGroupSummary,
} as GroupedViewProps;
el.dataSet = typed;
```

- [ ] **Step 2: Create Playwright visual tests**

```typescript
// e2e/grouped-view.spec.ts
import { test, expect } from "@playwright/test";

test.describe("pages-grouped-view visual", () => {
  test("spreadsheet preset — expanded", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=spreadsheet&data=cases");
    await page.waitForSelector("pages-grouped-view table");
    await expect(page.locator(".test-container")).toHaveScreenshot("spreadsheet-expanded.png");
  });

  test("spreadsheet preset — one group collapsed", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=spreadsheet&data=cases");
    await page.waitForSelector("pages-grouped-view table");
    const toggle = page.locator("pages-grouped-view").locator(".group-toggle").first();
    await toggle.click();
    await expect(page.locator(".test-container")).toHaveScreenshot("spreadsheet-collapsed.png");
  });

  test("sectioned preset — expanded", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=sectioned&data=cases");
    await page.waitForSelector("pages-grouped-view .group-section");
    await expect(page.locator(".test-container")).toHaveScreenshot("sectioned-expanded.png");
  });

  test("sectioned preset — one group collapsed", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=sectioned&data=cases");
    await page.waitForSelector("pages-grouped-view .group-section");
    const toggle = page.locator("pages-grouped-view").locator(".section-toggle").first();
    await toggle.click();
    await expect(page.locator(".test-container")).toHaveScreenshot("sectioned-one-collapsed.png");
  });

  test("list preset — expanded", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=list&data=cases");
    await page.waitForSelector("pages-grouped-view dl");
    await expect(page.locator(".test-container")).toHaveScreenshot("list-expanded.png");
  });

  test("list preset — cross-group alignment", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=list&data=mixed-widths&groupCol=category");
    await page.waitForSelector("pages-grouped-view dl");
    await expect(page.locator(".test-container")).toHaveScreenshot("list-aligned.png");
  });

  test("sectioned with list content — override", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=sectioned&data=cases&contentDisplay=list");
    await page.waitForSelector("pages-grouped-view dl");
    await expect(page.locator(".test-container")).toHaveScreenshot("sectioned-list-override.png");
  });

  test("single-item group", async ({ page }) => {
    await page.goto("/e2e/grouped-view-harness.html?preset=sectioned&data=cases");
    await page.waitForSelector("pages-grouped-view .group-section");
    // Info group has 1 item in the cases dataset
    await expect(page.locator(".test-container")).toHaveScreenshot("single-item-group.png");
  });
});
```

- [ ] **Step 3: Run Playwright tests to generate baselines**

Run: `npx playwright test e2e/grouped-view.spec.ts --update-snapshots`
Expected: generates screenshot baselines in `e2e/grouped-view.spec.ts-snapshots/`

- [ ] **Step 4: Run Playwright tests to verify baselines pass**

Run: `npx playwright test e2e/grouped-view.spec.ts`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git -C /Users/mdproctor/claude/casehub/pages add e2e/grouped-view.spec.ts e2e/grouped-view-harness.html e2e/setup-grouped-view.ts e2e/grouped-view.spec.ts-snapshots/
git -C /Users/mdproctor/claude/casehub/pages commit -m "test(grouped-view): Playwright visual tests with screenshot baselines

Refs #142"
```

---

## Task 8: Full Integration Verification

**Files:**
- No new files — verification task only

**Interfaces:**
- Consumes: Everything from Tasks 1–7

- [ ] **Step 1: Run full type check**

Run: `yarn typecheck`
Expected: no errors

- [ ] **Step 2: Run full lint**

Run: `yarn lint`
Expected: no errors (or only pre-existing ones)

- [ ] **Step 3: Run all unit tests**

Run: `yarn workspace @casehubio/pages-viz run test -- --run`
Expected: all tests pass including grouped-view tests

- [ ] **Step 4: Run full build**

Run: `yarn build`
Expected: builds successfully

- [ ] **Step 5: Run Playwright visual tests**

Run: `npx playwright test e2e/grouped-view.spec.ts`
Expected: all visual tests pass

- [ ] **Step 6: Commit if any fixes were needed**

Only if fixes were applied in steps 1–5.
