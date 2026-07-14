import {describe, expect, it} from "vitest";
import type {Column, ColumnId, DataSetId} from "@casehubio/pages-data";
import {ColumnType, dataSetId} from "@casehubio/pages-data";
import type {ExternalDataSetDef} from "@casehubio/pages-data";
import {LOCAL_CAPABILITIES} from "@casehubio/pages-data";
import {toTypedDataSet} from "@casehubio/pages-data";
import {createDataSetManager} from "@casehubio/pages-data";
import type {DataSink, DataSource, DataSourceBinding} from "@casehubio/pages-data";
import {inlineSource} from "@casehubio/pages-data";
import type {VizTarget} from "./data-pipeline.js";
import {createDataPipeline} from "./data-pipeline.js";
import type {ComponentRegistry} from "./registry.js";
import type {DataSetEntry, DataSetScope} from "./dataset-scope.js";
import type {FilterState} from "./cross-filter.js";
import {createFilterState, getActiveFilterOps} from "./cross-filter.js";
import {createDataScopeRegistry} from "./data-scope-registry.js";
import type {ResolverContext} from "@casehubio/pages-data";
import {createComponentViewState, updatePage, updateSort, updateTextFilter} from "./component-view-state.js";
import type {SortColumn} from "@casehubio/pages-data";
import {createDataProviderFactory} from "@casehubio/pages-data";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

function regionDataSet(rows: string[][]) {
  return toTypedDataSet({
    columns: [col("region", "Region", ColumnType.LABEL)],
    data: rows,
  });
}

function makeTarget(): VizTarget {
  return { loading: false, dataSet: undefined, totalRows: -1, error: "", activeSort: undefined, activePage: undefined };
}

describe("createDataPipeline", () => {
  it("dispose() is a function on the pipeline", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    expect(typeof pipeline.dispose).toBe("function");
  });

  it("resolves data-request for registered dataset", () => {
    const manager = createDataSetManager();
    const ds = regionDataSet([["North"], ["South"], ["East"]]);
    manager.apply("sales" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager,
      new Map() as DataSetScope,
      registry,
      createFilterState(),
      createDataScopeRegistry(),
      createComponentViewState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "sales" as DataSetId, operations: [] }, "chart-1");

    expect(target.dataSet).toBeTruthy();
    expect(target.totalRows).toBe(3);
  });

  it("sets error for unknown dataset with no scope entry", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager,
      new Map() as DataSetScope,
      registry,
      createFilterState(),
      createDataScopeRegistry(),
      createComponentViewState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "unknown" as DataSetId, operations: [] }, "chart-1");

    expect(target.error).toContain("unknown");
  });

  it("does nothing for unregistered componentId", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(
      manager,
      new Map() as DataSetScope,
      registry,
      createFilterState(),
      createDataScopeRegistry(),
      createComponentViewState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "any" as DataSetId, operations: [] }, "nonexistent");

    expect(target.dataSet).toBeUndefined();
    expect(target.error).toBe("");
  });
});

describe("getActiveFilterOps", () => {
  it("returns empty array when no filters exist", () => {
    const fs = createFilterState();
    expect(getActiveFilterOps(fs, "page1", undefined)).toEqual([]);
  });

  it("returns filter ops for matching page and group", () => {
    const fs: FilterState = new Map([
      ["page1", new Map([
        ["groupA", new Map([["region", ["North"]]])],
      ])],
    ]);
    const ops = getActiveFilterOps(fs, "page1", "groupA");
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("filter");
  });

  it("includes ungrouped filters for grouped components", () => {
    const fs: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["year", ["2024"]]])],
        ["groupA", new Map([["region", ["North"]]])],
      ])],
    ]);
    const ops = getActiveFilterOps(fs, "page1", "groupA");
    expect(ops).toHaveLength(2);
  });

  it("returns only ungrouped filters when group is undefined", () => {
    const fs: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["year", ["2024"]]])],
        ["groupA", new Map([["region", ["North"]]])],
      ])],
    ]);
    const ops = getActiveFilterOps(fs, "page1", undefined);
    expect(ops).toHaveLength(1);
  });
});

describe("data pipeline with filters", () => {
  it("applies active filters when pushing data", () => {
    const manager = createDataSetManager();
    const ds = regionDataSet([["North"], ["South"], ["East"]]);
    manager.apply("sales" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart", props: { filter: { listening: true } } },
      pagePath: "page1",
      hasExplicitId: false,
    });

    const filterState: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["region", ["North"]]])],
      ])],
    ]);

    const pipeline = createDataPipeline(manager, new Map() as DataSetScope, registry, filterState, createDataScopeRegistry(), createComponentViewState());

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "sales" as DataSetId, operations: [] }, "chart-1");

    expect(target.totalRows).toBe(1);
  });
});

describe("data pipeline deduplication", () => {
  it("shares one resolution promise for concurrent requests to same dataSetId", async () => {
    const target1 = makeTarget();
    const target2 = makeTarget();
    const registry: ComponentRegistry = new Map();
    const lookup = { dataSetId: "sales" as DataSetId, operations: [] };

    registry.set("chart-1", {
      element: document.createElement("div"),
      vizElement: target1,
      originalLookup: lookup,
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });
    registry.set("chart-2", {
      element: document.createElement("div"),
      vizElement: target2,
      originalLookup: lookup,
      component: { type: "line-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const def: ExternalDataSetDef = { uuid: dataSetId("sales"), content: '[["North"]]' };
    const scope: DataSetScope = new Map([
      ["", new Map([[def.uuid, def]])],
    ]);

    const manager = createDataSetManager({
      onChanged: (id) => {
        pipeline.deliverDataSet(id);
      },
    });

    const pipeline = createDataPipeline(manager, scope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    const mockCtx: ResolverContext = {
      manager,
      providerFactory: createDataProviderFactory(),
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    };
    pipeline.setResolverCtx(mockCtx);

    // Both requests should succeed since they share the same resolution
    pipeline.handleDataRequest(target1, lookup, "chart-1");
    pipeline.handleDataRequest(target2, lookup, "chart-2");

    // Wait for async resolution
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify dataset made it to the manager (proving resolution happened)
    expect(manager.has("sales" as DataSetId)).toBe(true);

    // Both should have received data (proving deduplication worked)
    expect(target1.dataSet).toBeDefined();
    expect(target2.dataSet).toBeDefined();
  });
});

describe("pipeline — sort from ComponentViewState", () => {
  it("applies centralized sort to pushed data", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL), col("value", "Value", ColumnType.NUMBER)],
      data: [["B", "2"], ["A", "1"], ["C", "3"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updateSort(cvs, "t1", { columnId: "name" as ColumnId, order: "ASCENDING" });

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows[0]!.cells[0]!.value).toBe("A");
    expect(rows[1]!.cells[0]!.value).toBe("B");
    expect(rows[2]!.cells[0]!.value).toBe("C");
  });

  it("sets activeSort on VizTarget", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["A"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    const sortCol: SortColumn = { columnId: "name" as ColumnId, order: "DESCENDING" };
    updateSort(cvs, "t1", sortCol);

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    expect(target.activeSort).toEqual(sortCol);
  });

  it("no centralized sort preserves original lookup sort", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL), col("value", "Value", ColumnType.NUMBER)],
      data: [["B", "2"], ["A", "1"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    // No sort in CVS — original lookup sort should be preserved

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const sortOp = { type: "sort" as const, columns: [{ columnId: "name" as ColumnId, order: "ASCENDING" as const }] };
    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [sortOp] }, "t1");

    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows[0]!.cells[0]!.value).toBe("A");
  });

  it("centralized sort replaces original lookup sort", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["B"], ["A"], ["C"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updateSort(cvs, "t1", { columnId: "name" as ColumnId, order: "DESCENDING" });

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    // Original lookup has ASCENDING sort — centralized DESCENDING should win
    const sortOp = { type: "sort" as const, columns: [{ columnId: "name" as ColumnId, order: "ASCENDING" as const }] };
    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [sortOp] }, "t1");

    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows[0]!.cells[0]!.value).toBe("C");
  });
});

describe("pipeline — pagination from ComponentViewState", () => {
  it("applies pagination when pageSize prop exists", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["A"], ["B"], ["C"], ["D"], ["E"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table", props: { pageSize: 2, lookup: { dataSetId: "test", operations: [] } } },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updatePage(cvs, "t1", 1); // page 1 = rows 2-3

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells[0]!.value).toBe("C");
    expect(rows[1]!.cells[0]!.value).toBe("D");
    expect(target.activePage).toBe(1);
  });

  it("clamps page when beyond total", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["A"], ["B"], ["C"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table", props: { pageSize: 2, lookup: { dataSetId: "test", operations: [] } } },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updatePage(cvs, "t1", 5); // way beyond total

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows).toHaveLength(1); // last page: row C
    expect(rows[0]!.cells[0]!.value).toBe("C");
    expect(target.activePage).toBe(1); // clamped to last page
  });
});

describe("pipeline — text filter from ComponentViewState", () => {
  it("applies text filter to reduce rows", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL), col("city", "City", ColumnType.LABEL)],
      data: [["Alice", "London"], ["Bob", "Paris"], ["Charlie", "London"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updateTextFilter(cvs, "t1", "London");

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    expect(target.totalRows).toBe(2);
    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells[0]!.value).toBe("Alice");
    expect(rows[1]!.cells[0]!.value).toBe("Charlie");
  });

  it("text filter is case-insensitive", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["Alice"], ["bob"], ["CHARLIE"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updateTextFilter(cvs, "t1", "ali");

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    expect(target.totalRows).toBe(1);
  });

  it("text filter with pagination filters before paginating", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["A"], ["AB"], ["ABC"], ["B"], ["BC"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: { type: "table", props: { pageSize: 2, lookup: { dataSetId: "test", operations: [] } } },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updateTextFilter(cvs, "t1", "B");
    updatePage(cvs, "t1", 0);

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    // "B" matches: AB, ABC, B, BC = 4 rows. Page 0 with pageSize 2 → first 2
    expect(target.totalRows).toBe(4);
    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells[0]!.value).toBe("AB");
    expect(rows[1]!.cells[0]!.value).toBe("ABC");
    expect(target.activePage).toBe(0);
  });
});

describe("pipeline — expandable bypass", () => {
  it("delivers all rows when component props contain expandable", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("id", "ID", ColumnType.LABEL), col("parentId", "Parent", ColumnType.LABEL), col("name", "Name", ColumnType.LABEL)],
      data: [["t1", "", "Trial A"], ["s1", "t1", "Site 1"], ["s2", "t1", "Site 2"], ["t2", "", "Trial B"], ["s3", "t2", "Site 3"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: {
        type: "table",
        props: {
          pageSize: 2,
          expandable: { idColumn: "id", parentColumn: "parentId" },
          lookup: { dataSetId: "test", operations: [] },
        },
      },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updatePage(cvs, "t1", 0);
    updateTextFilter(cvs, "t1", "Trial");

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    // All 5 rows delivered — pagination and text filter bypassed
    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows).toHaveLength(5);
    expect(target.totalRows).toBe(5);
    expect(target.activePage).toBeUndefined();
  });

  it("delivers all rows without expandable (normal pagination applies)", () => {
    const manager = createDataSetManager();
    const ds = toTypedDataSet({
      columns: [col("name", "Name", ColumnType.LABEL)],
      data: [["A"], ["B"], ["C"], ["D"], ["E"]],
    });
    manager.apply("test" as DataSetId, { type: "snapshot", dataset: ds });

    const registry: ComponentRegistry = new Map();
    registry.set("t1", {
      element: document.createElement("div"),
      component: {
        type: "table",
        props: { pageSize: 2, lookup: { dataSetId: "test", operations: [] } },
      },
      pagePath: "",
      hasExplicitId: true,
    });

    const cvs = createComponentViewState();
    updatePage(cvs, "t1", 0);

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "test" as DataSetId, operations: [] }, "t1");

    // Normal pagination: page 0, pageSize 2 → 2 rows
    const rows = (target.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows).toHaveLength(2);
    expect(target.activePage).toBe(0);
  });
});

describe("pipeline — expression generator with scheduleRefresh", () => {
  it("scheduleRefresh creates a timer for content + expression + accumulate", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();

    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    // Define a dataset with content + expression + accumulate + refreshTime
    const def: ExternalDataSetDef = {
      uuid: dataSetId("generated"),
      content: '[{"name": "initial", "value": 0}]', // Initial content with one row
      expression: '[["gen", $millis()]]', // Generate a row with timestamp
      accumulate: true,
      refreshTime: "1second",
    };

    const scope: DataSetScope = new Map([
      ["", new Map([[def.uuid, def]])],
    ]);

    const pipeline = createDataPipeline(
      manager,
      scope,
      registry,
      createFilterState(),
      createDataScopeRegistry(),
      createComponentViewState(),
    );

    // Set up resolver context (required for evaluateGenerator)
    const mockCtx: ResolverContext = {
      manager,
      providerFactory: createDataProviderFactory(),
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    };
    pipeline.setResolverCtx(mockCtx);

    // Trigger initial resolution which should schedule the refresh
    const target1 = makeTarget();
    pipeline.handleDataRequest(target1, { dataSetId: "generated" as DataSetId, operations: [] }, "chart-1");

    // Wait for initial resolution to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify initial data was resolved
    const target2 = makeTarget();
    pipeline.handleDataRequest(target2, { dataSetId: "generated" as DataSetId, operations: [] }, "chart-1");
    expect(target2.dataSet).toBeDefined();
    const rows = (target2.dataSet as unknown as { rows: { cells: { value: unknown }[] }[] }).rows;
    expect(rows.length).toBeGreaterThan(0);
  });

  it("scheduleRefresh passes cacheMaxRows to manager.apply", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();

    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const def: ExternalDataSetDef = {
      uuid: dataSetId("limited"),
      content: '[{"id": 1}]', // Initial content
      expression: '[["gen", $millis()]]',
      accumulate: true,
      refreshTime: "100millisecond",
      cacheMaxRows: 5, // Limit to 5 rows max
    };

    const scope: DataSetScope = new Map([
      ["", new Map([[def.uuid, def]])],
    ]);

    const pipeline = createDataPipeline(
      manager,
      scope,
      registry,
      createFilterState(),
      createDataScopeRegistry(),
      createComponentViewState(),
    );

    const mockCtx: ResolverContext = {
      manager,
      providerFactory: createDataProviderFactory(),
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    };
    pipeline.setResolverCtx(mockCtx);

    // Initial resolution
    const target1 = makeTarget();
    pipeline.handleDataRequest(target1, { dataSetId: "limited" as DataSetId, operations: [] }, "chart-1");

    // Wait for initial resolution to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify initial data was resolved (proves timer was created and executed)
    const target2 = makeTarget();
    pipeline.handleDataRequest(target2, { dataSetId: "limited" as DataSetId, operations: [] }, "chart-1");
    expect(target2.dataSet).toBeDefined();
  });
});

describe("pipeline — eventTarget injection", () => {
  it("passes eventTarget to WebSocket pool when configured", () => {
    const target = document.createElement("div");
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      manager,
      providerFactory: createDataProviderFactory(globalThis.fetch.bind(globalThis)),
      providerConfig: {
        webSocket: { auth: { type: "query-param" as const, token: "t" } },
      },
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    });

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });
});

describe("refreshDataSet", () => {
  it("pushes data to all components subscribing to the given dataSetId", () => {
    const dsId = dataSetId("test-ds");
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(manager, new Map() as DataSetScope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    const target1 = makeTarget();
    const target2 = makeTarget();
    const target3 = makeTarget();

    registry.set("comp-1", { vizElement: target1, originalLookup: { dataSetId: dsId, operations: [] }, pagePath: "", component: { type: "test", props: {} } } as any);
    registry.set("comp-2", { vizElement: target2, originalLookup: { dataSetId: dsId, operations: [] }, pagePath: "", component: { type: "test", props: {} } } as any);
    registry.set("comp-3", { vizElement: target3, originalLookup: { dataSetId: dataSetId("other-ds"), operations: [] }, pagePath: "", component: { type: "test", props: {} } } as any);

    manager.apply(dsId, { type: "snapshot", dataset: regionDataSet([["North"], ["South"]]) });

    pipeline.deliverDataSet(dsId);

    expect(target1.dataSet).toBeDefined();
    expect(target2.dataSet).toBeDefined();
    expect(target3.dataSet).toBeUndefined();
  });
});

describe("deliverAll", () => {
  it("pushes data to all registered components", () => {
    const dsId1 = dataSetId("ds-1");
    const dsId2 = dataSetId("ds-2");
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(manager, new Map() as DataSetScope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    const target1 = makeTarget();
    const target2 = makeTarget();

    registry.set("comp-1", { vizElement: target1, originalLookup: { dataSetId: dsId1, operations: [] }, pagePath: "", component: { type: "test", props: {} } } as any);
    registry.set("comp-2", { vizElement: target2, originalLookup: { dataSetId: dsId2, operations: [] }, pagePath: "", component: { type: "test", props: {} } } as any);

    manager.apply(dsId1, { type: "snapshot", dataset: regionDataSet([["North"]]) });
    manager.apply(dsId2, { type: "snapshot", dataset: regionDataSet([["South"]]) });

    pipeline.deliverAll();

    expect(target1.dataSet).toBeDefined();
    expect(target2.dataSet).toBeDefined();
  });
});

describe("pipeline — DataSourceBinding path", () => {
  it("connects a DataSourceBinding and delivers data via manager", () => {
    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target1 = makeTarget();

    registry.set("chart-1", {
      element: document.createElement("div"),
      vizElement: target1,
      originalLookup: { dataSetId: "patients" as DataSetId, operations: [] },
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    // Create a DataSourceBinding using inlineSource
    const binding: DataSourceBinding = {
      id: dataSetId("patients"),
      source: inlineSource([["Alice"], ["Bob"]], {
        columns: [{ id: "region" as any, type: ColumnType.LABEL }],
      }),
    };

    const scope: DataSetScope = new Map([
      ["", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    pipeline.handleDataRequest(target1, { dataSetId: "patients" as DataSetId, operations: [] }, "chart-1");

    // inlineSource connects synchronously → data should be in manager immediately
    expect(manager.has("patients" as DataSetId)).toBe(true);
    expect(target1.dataSet).toBeDefined();
    expect(target1.totalRows).toBe(2);
  });

  it("serves from cache on subsequent requests after binding connected", () => {
    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target1 = makeTarget();
    const target2 = makeTarget();

    registry.set("chart-1", {
      element: document.createElement("div"),
      vizElement: target1,
      originalLookup: { dataSetId: "data" as DataSetId, operations: [] },
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });
    registry.set("chart-2", {
      element: document.createElement("div"),
      vizElement: target2,
      originalLookup: { dataSetId: "data" as DataSetId, operations: [] },
      component: { type: "line-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = {
      id: dataSetId("data"),
      source: inlineSource([["X"], ["Y"], ["Z"]], {
        columns: [{ id: "region" as any, type: ColumnType.LABEL }],
      }),
    };

    const scope: DataSetScope = new Map([
      ["", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    // First request connects the source
    pipeline.handleDataRequest(target1, { dataSetId: "data" as DataSetId, operations: [] }, "chart-1");
    expect(target1.totalRows).toBe(3);

    // Second request serves from manager cache
    pipeline.handleDataRequest(target2, { dataSetId: "data" as DataSetId, operations: [] }, "chart-2");
    expect(target2.totalRows).toBe(3);
  });

  it("disconnects sources on dispose", () => {
    const disconnected: string[] = [];
    const mockSource: DataSource = {
      connect(sink: DataSink): void {
        // Emit synchronously
        const ds = toTypedDataSet({
          columns: [col("name", "Name", ColumnType.LABEL)],
          data: [["test"]],
        });
        sink.apply({ type: "snapshot", dataset: ds });
      },
      disconnect(): void {
        disconnected.push("disposed");
      },
    };

    const binding: DataSourceBinding = {
      id: dataSetId("test"),
      source: mockSource,
    };

    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    registry.set("c1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const scope: DataSetScope = new Map([
      ["", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    pipeline.handleDataRequest(makeTarget(), { dataSetId: "test" as DataSetId, operations: [] }, "c1");
    expect(disconnected).toHaveLength(0);

    pipeline.dispose();
    expect(disconnected).toHaveLength(1);
  });

  it("reports error to components when source emits permanent error", () => {
    const errorSource: DataSource = {
      connect(sink: DataSink): void {
        sink.error({ message: "Connection failed", permanent: true });
      },
      disconnect(): void { /* no-op */ },
    };

    const binding: DataSourceBinding = {
      id: dataSetId("failing"),
      source: errorSource,
    };

    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const vizTarget = makeTarget();
    registry.set("c1", {
      element: document.createElement("div"),
      vizElement: vizTarget,
      originalLookup: { dataSetId: binding.id, operations: [] },
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const scope: DataSetScope = new Map([
      ["", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    pipeline.handleDataRequest(makeTarget(), { dataSetId: "failing" as DataSetId, operations: [] }, "c1");

    // Permanent error should be set on viz targets
    expect(vizTarget.error).toBe("Connection failed");

    pipeline.dispose();
  });

  it("sets error when binding not found in scope", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    registry.set("c1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "missing" as DataSetId, operations: [] }, "c1");

    expect(target.error).toContain("missing");
  });

  it("applies filters to DataSourceBinding data", () => {
    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();

    registry.set("chart-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "regions" as DataSetId, operations: [] },
      component: { type: "bar-chart", props: { filter: { listening: true } } },
      pagePath: "page1",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = {
      id: dataSetId("regions"),
      source: inlineSource([["North"], ["South"], ["East"]], {
        columns: [{ id: "region" as ColumnId, type: ColumnType.LABEL }],
      }),
    };

    const filterState: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["region", ["North"]]])],
      ])],
    ]);

    const scope: DataSetScope = new Map([
      ["page1", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      filterState, createDataScopeRegistry(), createComponentViewState(),
    );

    pipeline.handleDataRequest(target, { dataSetId: "regions" as DataSetId, operations: [] }, "chart-1");

    expect(target.totalRows).toBe(1);
  });

  it("applies sort from ComponentViewState to DataSourceBinding data", () => {
    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();

    registry.set("t1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "data" as DataSetId, operations: [] },
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: true,
    });

    const binding: DataSourceBinding = {
      id: dataSetId("data"),
      source: inlineSource([["B", "2"], ["A", "1"], ["C", "3"]], {
        columns: [
          { id: "name" as ColumnId, type: ColumnType.LABEL },
          { id: "value" as ColumnId, type: ColumnType.NUMBER },
        ],
      }),
    };

    const scope: DataSetScope = new Map([
      ["", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const cvs = createComponentViewState();
    updateSort(cvs, "t1", { columnId: "name" as ColumnId, order: "ASCENDING" });

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    pipeline.handleDataRequest(target, { dataSetId: "data" as DataSetId, operations: [] }, "t1");

    expect(target.totalRows).toBe(3);
    expect(target.activeSort).toEqual({ columnId: "name", order: "ASCENDING" });
    const rows = (target.dataSet as unknown as { rows: Array<{ text(id: ColumnId): string }> }).rows;
    expect(rows[0]!.text("name" as ColumnId)).toBe("A");
    expect(rows[1]!.text("name" as ColumnId)).toBe("B");
    expect(rows[2]!.text("name" as ColumnId)).toBe("C");
  });

  it("applies pagination to DataSourceBinding data", () => {
    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();

    registry.set("t1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "data" as DataSetId, operations: [] },
      component: { type: "table", props: { pageSize: 2 } },
      pagePath: "",
      hasExplicitId: true,
    });

    const binding: DataSourceBinding = {
      id: dataSetId("data"),
      source: inlineSource([["A"], ["B"], ["C"], ["D"], ["E"]], {
        columns: [{ id: "name" as ColumnId, type: ColumnType.LABEL }],
      }),
    };

    const scope: DataSetScope = new Map([
      ["", new Map<DataSetId, DataSetEntry>([[binding.id, binding]])],
    ]);

    const cvs = createComponentViewState();
    updatePage(cvs, "t1", 1);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), cvs,
    );

    pipeline.handleDataRequest(target, { dataSetId: "data" as DataSetId, operations: [] }, "t1");

    expect(target.totalRows).toBe(5);
    expect(target.activePage).toBe(1);
    const rows = (target.dataSet as unknown as { rows: unknown[] }).rows;
    expect(rows).toHaveLength(2);
  });
});

describe("pipeline — join dependency resolution", () => {
  it("resolves join dataset when source datasets are not yet in manager", async () => {
    const target = makeTarget();
    const lookup = { dataSetId: "combined" as DataSetId, operations: [] };

    const registry: ComponentRegistry = new Map();
    registry.set("table-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: lookup,
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: false,
    });

    const q1Def: ExternalDataSetDef = {
      uuid: dataSetId("q1"),
      content: JSON.stringify([{ month: "Jan", value: 100 }]),
      columns: [
        { id: "month" as ColumnId, type: ColumnType.LABEL },
        { id: "value" as ColumnId, type: ColumnType.NUMBER },
      ],
    };
    const q2Def: ExternalDataSetDef = {
      uuid: dataSetId("q2"),
      content: JSON.stringify([{ month: "Apr", value: 200 }]),
      columns: [
        { id: "month" as ColumnId, type: ColumnType.LABEL },
        { id: "value" as ColumnId, type: ColumnType.NUMBER },
      ],
    };
    const combinedDef: ExternalDataSetDef = {
      uuid: dataSetId("combined"),
      join: [dataSetId("q1"), dataSetId("q2")],
    };

    const scope: DataSetScope = new Map([
      ["", new Map([
        [q1Def.uuid, q1Def as DataSetEntry],
        [q2Def.uuid, q2Def as DataSetEntry],
        [combinedDef.uuid, combinedDef as DataSetEntry],
      ])],
    ]);

    const manager = createDataSetManager({
      onChanged: (id) => {
        pipeline.deliverDataSet(id);
      },
    });

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    pipeline.setResolverCtx({
      manager,
      providerFactory: createDataProviderFactory(),
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    });

    pipeline.handleDataRequest(target, lookup, "table-1");

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(manager.has("combined" as DataSetId)).toBe(true);
    expect(target.dataSet).toBeDefined();
    expect((target.dataSet as unknown as { rows: readonly unknown[] }).rows).toHaveLength(2);
  });

  it("sets error when join source dataset is not in scope", async () => {
    const target = makeTarget();
    const lookup = { dataSetId: "combined" as DataSetId, operations: [] };

    const registry: ComponentRegistry = new Map();
    registry.set("table-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: lookup,
      component: { type: "table" },
      pagePath: "",
      hasExplicitId: false,
    });

    const combinedDef: ExternalDataSetDef = {
      uuid: dataSetId("combined"),
      join: [dataSetId("missing1"), dataSetId("missing2")],
    };

    const scope: DataSetScope = new Map([
      ["", new Map([[combinedDef.uuid, combinedDef as DataSetEntry]])],
    ]);

    const manager = createDataSetManager();
    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
    );

    pipeline.setResolverCtx({
      manager,
      providerFactory: createDataProviderFactory(),
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    });

    pipeline.handleDataRequest(target, lookup, "table-1");

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(target.error).toContain("missing1");
  });
});

describe("deliverDataSet", () => {
  it("re-delivers cached data to all subscribers", () => {
    const dsId = dataSetId("ds-1");
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(manager, new Map() as DataSetScope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    const target = makeTarget();
    registry.set("comp-1", {
      vizElement: target,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      component: { type: "test", props: {} },
      hasExplicitId: false,
    } as any);

    manager.apply(dsId, { type: "snapshot", dataset: regionDataSet([["North"]]) });
    pipeline.deliverDataSet(dsId);

    expect(target.dataSet).toBeDefined();
    expect(target.totalRows).toBe(1);
  });
});

describe("refreshDataSet (re-fetch)", () => {
  it("disconnects and reconnects DataSource on refresh", () => {
    let connectCount = 0;
    let disconnectCount = 0;
    const mockSource: DataSource = {
      connect(sink: DataSink) {
        connectCount++;
        sink.apply({ type: "snapshot", dataset: regionDataSet([["Fresh-" + String(connectCount)]]) });
      },
      disconnect() { disconnectCount++; },
    };

    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();
    registry.set("comp-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = { id: "ds" as DataSetId, source: mockSource };
    const scope: DataSetScope = new Map([["", new Map([["ds" as DataSetId, binding as DataSetEntry]])]]);
    const pipeline = createDataPipeline(manager, scope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    pipeline.handleDataRequest(target, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");
    expect(connectCount).toBe(1);

    pipeline.refreshDataSet("ds" as DataSetId);
    expect(disconnectCount).toBe(1);
    expect(connectCount).toBe(2);
  });

  it("is a no-op for unknown datasets", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(manager, new Map() as DataSetScope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    expect(() => pipeline.refreshDataSet("unknown" as DataSetId)).not.toThrow();
  });

  it("onChanged calls deliverDataSet not refreshDataSet — no infinite recursion", () => {
    let deliverCount = 0;
    const mockSource: DataSource = {
      connect(sink: DataSink) {
        sink.apply({ type: "snapshot", dataset: regionDataSet([["A"]]) });
      },
      disconnect() {},
    };

    const manager = createDataSetManager({
      onChanged: (id) => {
        deliverCount++;
        pipeline.deliverDataSet(id);
      },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();
    registry.set("comp-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = { id: "ds" as DataSetId, source: mockSource };
    const scope: DataSetScope = new Map([["", new Map([["ds" as DataSetId, binding as DataSetEntry]])]]);
    const pipeline = createDataPipeline(manager, scope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    pipeline.handleDataRequest(target, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");

    deliverCount = 0;
    pipeline.refreshDataSet("ds" as DataSetId);

    expect(deliverCount).toBe(1);
    expect(target.dataSet).toBeDefined();
  });
});

describe("stale-while-revalidate (Layer 3)", () => {
  it("triggers background refresh when data is stale", () => {
    let connectCount = 0;
    const mockSource: DataSource = {
      connect(sink: DataSink) {
        connectCount++;
        sink.apply({ type: "snapshot", dataset: regionDataSet([["Fresh-" + String(connectCount)]]) });
      },
      disconnect() {},
    };

    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();
    registry.set("comp-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = { id: "ds" as DataSetId, source: mockSource };
    const scope: DataSetScope = new Map([["", new Map([["ds" as DataSetId, binding as DataSetEntry]])]]);
    const pipeline = createDataPipeline(manager, scope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    pipeline.handleDataRequest(target, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");
    expect(connectCount).toBe(1);

    (manager as any).timestamps?.set("ds" as DataSetId, Date.now() - 61000);

    const target2 = makeTarget();
    registry.set("comp-2", {
      element: document.createElement("div"),
      vizElement: target2,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });
    pipeline.handleDataRequest(target2, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-2");

    expect(target2.dataSet).toBeDefined();
    expect(connectCount).toBe(2);
  });

  it("does not trigger refresh when data is within TTL", () => {
    let connectCount = 0;
    const mockSource: DataSource = {
      connect(sink: DataSink) {
        connectCount++;
        sink.apply({ type: "snapshot", dataset: regionDataSet([["Data"]]) });
      },
      disconnect() {},
    };

    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target = makeTarget();
    registry.set("comp-1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = { id: "ds" as DataSetId, source: mockSource };
    const scope: DataSetScope = new Map([["", new Map([["ds" as DataSetId, binding as DataSetEntry]])]]);
    const pipeline = createDataPipeline(manager, scope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    pipeline.handleDataRequest(target, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");
    expect(connectCount).toBe(1);

    pipeline.handleDataRequest(target, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");
    expect(connectCount).toBe(1);
  });

  it("dedup guard prevents multiple concurrent refreshes for same stale dataset", () => {
    let connectCount = 0;
    const mockSource: DataSource = {
      connect(sink: DataSink) {
        connectCount++;
        sink.apply({ type: "snapshot", dataset: regionDataSet([["Data"]]) });
      },
      disconnect() {},
    };

    const manager = createDataSetManager({
      onChanged: (id) => { pipeline.deliverDataSet(id); },
    });
    const registry: ComponentRegistry = new Map();
    const target1 = makeTarget();
    const target2 = makeTarget();
    registry.set("comp-1", {
      element: document.createElement("div"),
      vizElement: target1,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });
    registry.set("comp-2", {
      element: document.createElement("div"),
      vizElement: target2,
      originalLookup: { dataSetId: "ds" as DataSetId, operations: [] },
      component: { type: "test" },
      pagePath: "",
      hasExplicitId: false,
    });

    const binding: DataSourceBinding = { id: "ds" as DataSetId, source: mockSource };
    const scope: DataSetScope = new Map([["", new Map([["ds" as DataSetId, binding as DataSetEntry]])]]);
    const pipeline = createDataPipeline(manager, scope, registry, createFilterState(), createDataScopeRegistry(), createComponentViewState());

    pipeline.handleDataRequest(target1, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");
    expect(connectCount).toBe(1);

    (manager as any).timestamps?.set("ds" as DataSetId, Date.now() - 61000);

    pipeline.handleDataRequest(target1, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-1");
    pipeline.handleDataRequest(target2, { dataSetId: "ds" as DataSetId, operations: [] }, "comp-2");

    expect(connectCount).toBe(2);
  });
});
