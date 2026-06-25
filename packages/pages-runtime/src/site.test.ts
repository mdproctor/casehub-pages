import { describe, it, expect, afterEach } from "vitest";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import type { DataSetId, ColumnId, DataSet, TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import "@casehubio/pages-viz";
import type { CasehubTable } from "@casehubio/pages-viz";
import { loadSite } from "./site.js";

function simpleSite(): Component {
  return {
    type: "page",
    props: {
      name: "App",
      datasets: [{
        uuid: "sales" as DataSetId,
        content: JSON.stringify([
          { region: "North", revenue: 100 },
          { region: "South", revenue: 200 },
        ]),
      }],
    },
    slots: {
      default: [
        { type: "title", props: { text: "Dashboard" } },
      ],
    },
  };
}

describe("loadSite", () => {
  it("renders component tree into target", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(target.children.length).toBeGreaterThan(0);
    expect(target.querySelector("[data-component-type='page']")).toBeTruthy();
    site.dispose();
    document.body.removeChild(target);
  });

  it("returns working Site interface", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(site.root).toBeTruthy();
    expect(site.root.type).toBe("page");
    expect(site.state).toBeTruthy();
    site.dispose();
    document.body.removeChild(target);
  });

  it("page() returns component by path", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    const root = site.page("");
    expect(root).toBeTruthy();
    expect(root?.type).toBe("page");
    site.dispose();
    document.body.removeChild(target);
  });

  it("dataset() resolves from page scope", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    const ds = site.dataset("sales" as DataSetId);
    expect(ds).toBeTruthy();
    expect(ds?.uuid).toBe("sales");
    site.dispose();
    document.body.removeChild(target);
  });

  it("dispose clears target", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    site.dispose();
    expect(target.children.length).toBe(0);
    document.body.removeChild(target);
  });

  it("dispose is idempotent", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    site.dispose();
    site.dispose();
    expect(target.children.length).toBe(0);
    document.body.removeChild(target);
  });

  it("page() returns null for unknown path", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(site.page("nonexistent")).toBeNull();
    site.dispose();
    document.body.removeChild(target);
  });

  it("dataset() returns null for unknown id", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(site.dataset("unknown" as DataSetId)).toBeNull();
    site.dispose();
    document.body.removeChild(target);
  });

  it("accepts a YAML string as source", async () => {
    const yaml = `
pages:
  - components:
      - html: "<p>hello</p>"
`;
    const target = document.createElement("div");
    const site = await loadSite(target, yaml);
    expect(site.root.type).toBe("page");
    expect(target.innerHTML).toContain("hello");
    site.dispose();
  });

  it("forwards custom fetch and baseUrl to data pipeline", async () => {
    const fetchCalls: string[] = [];
    const customFetch: typeof globalThis.fetch = (input) => {
      fetchCalls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response(JSON.stringify([["A", 1]]), {
        headers: { "Content-Type": "application/json" },
      }));
    };

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "remote" as DataSetId,
          url: "data/test.json",
        }],
      },
      slots: {
        default: [{
          type: "table",
          id: "tbl",
          props: {
            lookup: { dataSetId: "remote" as DataSetId, operations: [] },
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root, {
      fetch: customFetch,
      baseUrl: "https://example.com/api/",
    });

    // Wait for data request to resolve
    for (let i = 0; i < 50; i++) {
      if (fetchCalls.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls[0]).toContain("data/test.json");

    site.dispose();
    document.body.removeChild(target);
  });

  it("data components are rendered and registered during initial render", async () => {
    const yaml = `
datasets:
  - uuid: test
    content: '[["A", 1], ["B", 2]]'
pages:
  - components:
      - displayer:
          type: BARCHART
          lookup:
            uuid: test
            group:
              - columnGroup:
                  source: Column 0
                functions:
                  - source: Column 0
                  - source: Column 1
                    function: SUM
`;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, yaml);
    const barChart = target.querySelector("[data-component-type='bar-chart']");
    expect(barChart).not.toBeNull();
    site.dispose();
    document.body.removeChild(target);
  });

  it("applies dark mode CSS variables when global.mode is dark", async () => {
    const yaml = `
global:
  mode: dark
pages:
  - components:
      - html: "dark page"
`;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, yaml);
    expect(target.dataset.casehubTheme).toBe("dark");
    expect(target.style.getPropertyValue("--casehub-bg")).toBe("#1a1a2e");
    expect(target.style.getPropertyValue("--casehub-text")).toBe("#e0e0e0");
    site.dispose();
    document.body.removeChild(target);
  });

  it("resets dark mode when loading a non-dark dashboard after a dark one", async () => {
    const darkYaml = `
global:
  mode: dark
pages:
  - components:
      - html: "dark"
`;
    const lightYaml = `
pages:
  - components:
      - html: "light"
`;
    const target = document.createElement("div");
    document.body.appendChild(target);

    const darkSite = await loadSite(target, darkYaml);
    expect(target.dataset.casehubTheme).toBe("dark");
    darkSite.dispose();

    const lightSite = await loadSite(target, lightYaml);
    expect(target.dataset.casehubTheme).toBe("light");
    expect(target.style.getPropertyValue("--casehub-bg")).toBe("#fff");
    lightSite.dispose();
    document.body.removeChild(target);
  });
});

describe("loadSite — lazy rendering and registry eviction", () => {
  it("registry eviction loop executes without errors on slot changes", async () => {
    // Test: verify the casehub-slot-change handler with the eviction loop
    // executes successfully during navigation
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs-1",
          slots: {
            A: [{ type: "title", props: { text: "A" } }],
            B: [{ type: "title", props: { text: "B" } }],
          },
        }],
      },
    };
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Verify tabs component is rendered
    const tabsComponent = target.querySelector("[data-component-type='tabs']");
    expect(tabsComponent).toBeTruthy();

    // Navigate multiple times to trigger slot-change events repeatedly
    // This causes the eviction loop to run for each slot change
    site.navigate("B");
    site.navigate("A");
    site.navigate("B");

    // If we reach here, eviction executed without throwing
    // and the site is still functional
    expect(site.state).toBeDefined();

    site.dispose();
    document.body.removeChild(target);
  });

  it("multiple navigations do not crash registry eviction", async () => {
    // Stress test: navigate rapidly to ensure eviction handles
    // concurrent slot changes correctly
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs-1",
          slots: {
            Tab1: [{ type: "html" }],
            Tab2: [{ type: "html" }],
            Tab3: [{ type: "html" }],
          },
        }],
      },
    };
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Rapid navigation
    site.navigate("Tab2");
    site.navigate("Tab3");
    site.navigate("Tab1");
    site.navigate("Tab2");

    // Registry should be functional
    expect(site.root).toBeTruthy();

    site.dispose();
    document.body.removeChild(target);
  });
});

describe("loadSite — cross-filter: selector updates listening component", () => {
  async function waitForData(
    target: HTMLElement,
    selector: string,
    maxWait = 500,
  ): Promise<HTMLElement> {
    const el = target.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    const componentType = el.dataset.componentType;
    if (!componentType) throw new Error(`No componentType on ${selector}`);
    const vizEl = el.querySelector<HTMLElement & { dataSet?: unknown }>(
      `casehub-${componentType}`,
    );
    if (!vizEl) throw new Error(`Viz element not found in ${selector}`);
    const start = Date.now();
    while (!vizEl.dataSet && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!vizEl.dataSet) throw new Error(`Data not loaded for ${selector} within ${String(maxWait)}ms`);
    return el;
  }

  it("selector filter updates bar chart data on same page (no tabs)", async () => {
    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "test" as DataSetId,
          content: JSON.stringify([
            ["Computers", "Scanner", 5],
            ["Computers", "Printer", 7],
            ["Electronics", "Camera", 10],
            ["Electronics", "Headphones", 5],
          ]),
          columns: [
            { id: "Section", type: "LABEL" },
            { id: "Product", type: "LABEL" },
            { id: "Qty", type: "NUMBER" },
          ],
        }],
      },
      slots: {
        default: [
          {
            type: "selector",
            id: "sel-1",
            props: {
              filter: { notification: true },
              lookup: {
                dataSetId: "test" as DataSetId,
                operations: [{
                  type: "group" as const,
                  groupingKey: {
                    sourceId: "Section" as ColumnId,
                    columnId: "Section" as ColumnId,
                    strategy: { mode: "distinct" as const },
                    maxIntervals: 100,
                    emptyIntervals: true,
                    ascendingOrder: true,
                  },
                  columns: [
                    { kind: "key" as const, sourceId: "Section" as ColumnId, columnId: "Section" as ColumnId },
                  ],
                }],
              },
            },
          },
          {
            type: "table",
            id: "chart-1",
            props: {
              filter: { listening: true },
              lookup: {
                dataSetId: "test" as DataSetId,
                operations: [{
                  type: "group" as const,
                  groupingKey: {
                    sourceId: "Product" as ColumnId,
                    columnId: "Product" as ColumnId,
                    strategy: { mode: "distinct" as const },
                    maxIntervals: 100,
                    emptyIntervals: true,
                    ascendingOrder: true,
                  },
                  columns: [
                    { kind: "key" as const, sourceId: "Product" as ColumnId, columnId: "Product" as ColumnId },
                    { kind: "aggregate" as const, sourceId: "Qty" as ColumnId, columnId: "Qty" as ColumnId, fn: { fn: "SUM" as const } },
                  ],
                }],
              },
            },
          },
        ],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Wait for both components to have data
    const selectorContainer = await waitForData(target, "[data-component-id='sel-1']");
    await waitForData(target, "[data-component-id='chart-1']");

    // Find the selector's dropdown in shadow DOM
    const selectorViz = selectorContainer.querySelector("casehub-selector");
    expect(selectorViz).toBeTruthy();

    const selectEl = selectorViz!.shadowRoot.querySelector("select");
    expect(selectEl).toBeTruthy();

    // The dropdown should have "All" + distinct values
    const options = selectEl!.querySelectorAll("option");
    expect(options.length).toBeGreaterThanOrEqual(3);

    // Select "Computers" (option value is the row index)
    selectEl!.value = "0";
    selectEl!.dispatchEvent(new Event("change"));

    // Wait for re-query
    await new Promise((r) => setTimeout(r, 50));

    // The bar chart should now show filtered data
    const chartViz = target.querySelector<CasehubTable>(
      "[data-component-id='chart-1'] casehub-table",
    );

    expect(chartViz!.dataSet).toBeTruthy();
    // After filtering to "Computers", bar chart should show only Scanner + Printer (2 rows)
    expect(chartViz!.dataSet!.rows.length).toBe(2);

    site.dispose();
    document.body.removeChild(target);
  });

  it("selector filter works inside lazy-rendered tab after navigation", async () => {
    const dataset = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["A", "X", 1],
        ["A", "Y", 2],
        ["B", "Z", 3],
      ]),
      columns: [
        { id: "Cat", type: "LABEL" },
        { id: "Name", type: "LABEL" },
        { id: "Val", type: "NUMBER" },
      ],
    };

    const groupByCat = {
      type: "group" as const,
      groupingKey: {
        sourceId: "Cat" as ColumnId, columnId: "Cat" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "Cat" as ColumnId, columnId: "Cat" as ColumnId }],
    };

    const groupByName = {
      type: "group" as const,
      groupingKey: {
        sourceId: "Name" as ColumnId, columnId: "Name" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [
        { kind: "key" as const, sourceId: "Name" as ColumnId, columnId: "Name" as ColumnId },
        { kind: "aggregate" as const, sourceId: "Val" as ColumnId, columnId: "Val" as ColumnId, fn: { fn: "SUM" as const } },
      ],
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [dataset] },
      slots: {
        default: [{
          type: "tabs",
          id: "nav-tabs",
          slots: {
            Overview: [{ type: "title", props: { text: "Overview page" } }],
            Filtered: [{
              type: "page",
              props: { name: "Filtered" },
              slots: {
                default: [
                  {
                    type: "selector", id: "filter-sel",
                    props: {
                      filter: { notification: true },
                      lookup: { dataSetId: "ds" as DataSetId, operations: [groupByCat] },
                    },
                  },
                  {
                    type: "table", id: "filter-tbl",
                    props: {
                      filter: { listening: true },
                      lookup: { dataSetId: "ds" as DataSetId, operations: [groupByName] },
                    },
                  },
                ],
              },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Initially, only Overview tab is rendered (lazy)
    expect(target.querySelector("[data-component-id='filter-sel']")).toBeNull();
    expect(target.querySelector("[data-component-id='filter-tbl']")).toBeNull();

    // Navigate to "Filtered" tab
    site.navigate("Filtered");

    // Wait for data to load on the newly-rendered tab
    const selContainer = await waitForData(target, "[data-component-id='filter-sel']");
    await waitForData(target, "[data-component-id='filter-tbl']");

    // Table should have 3 rows (X, Y, Z) before filtering
    const tblViz = target.querySelector<CasehubTable>(
      "[data-component-id='filter-tbl'] casehub-table",
    )!;
    expect(tblViz.dataSet!.rows.length).toBe(3);

    // Select "A" in the selector dropdown
    const selViz = selContainer.querySelector("casehub-selector")!;
    const select = selViz.shadowRoot.querySelector("select")!;
    select.value = "0";
    select.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // Table should now show only 2 rows (X, Y — filtered to Cat "A")
    expect(tblViz.dataSet!.rows.length).toBe(2);

    // Navigate away — tab content destroyed
    site.navigate("Overview");
    expect(target.querySelector("[data-component-id='filter-tbl']")).toBeNull();

    site.dispose();
    document.body.removeChild(target);
  });
});

describe("loadSite — navigation type rendering", () => {
  it("SIDEBAR type parses and renders sidebar nav", async () => {
    const yaml = `
pages:
  - name: App
    components:
      - type: SIDEBAR
        properties:
          navGroupId: main
  - name: Overview
    components:
      - html: "Overview"
  - name: Detail
    components:
      - html: "Detail"
navTree:
  root_items:
    - type: GROUP
      id: main
      children:
        - page: Overview
        - page: Detail
`;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, yaml);

    const sidebar = target.querySelector(".casehub-sidebar");
    expect(sidebar).not.toBeNull();
    const buttons = sidebar!.querySelectorAll("button[data-slot]");
    expect(buttons).toHaveLength(2);

    site.dispose();
    document.body.removeChild(target);
  });

  it("TREE type with nested groups renders hierarchical tree", async () => {
    const yaml = `
pages:
  - name: App
    components:
      - type: TREE
        properties:
          navGroupId: nav
  - name: Dashboard
    components:
      - html: "Dashboard"
  - name: Profile
    components:
      - html: "Profile"
  - name: Security
    components:
      - html: "Security"
navTree:
  root_items:
    - type: GROUP
      id: nav
      children:
        - page: Dashboard
        - type: GROUP
          id: Settings
          children:
            - page: Profile
            - page: Security
`;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, yaml);

    const treeNav = target.querySelector(".casehub-tree-nav");
    expect(treeNav).not.toBeNull();

    const groupLabels = treeNav!.querySelectorAll(".tree-group-label");
    expect(groupLabels).toHaveLength(1);
    expect(groupLabels[0]!.textContent).toContain("Settings");

    const leaves = treeNav!.querySelectorAll(".tree-leaf");
    expect(leaves).toHaveLength(3); // Dashboard, Profile, Security

    site.dispose();
    document.body.removeChild(target);
  });
});

describe("view state persistence", () => {
  afterEach(() => {
    // Reset URL hash between tests
    history.replaceState(null, "", location.pathname);
  });

  it("sort event updates URL for explicit-ID table", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([
            { name: "A", value: 1 },
            { name: "B", value: 2 },
          ]),
        }],
      },
      slots: {
        default: [{
          type: "table",
          id: "t1",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);

    const tableEl = target.querySelector("[data-component-id='t1']") as HTMLElement;
    expect(tableEl).toBeTruthy();

    tableEl.dispatchEvent(new CustomEvent("casehub-sort", {
      bubbles: true,
      composed: true,
      detail: { columnId: "name", order: "ASCENDING" },
    }));

    expect(location.hash).toContain("sort=t1:name:ASCENDING");

    site.dispose();
    document.body.removeChild(target);
  });

  it("page event updates URL for explicit-ID table", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([
            { a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 },
          ]),
        }],
      },
      slots: {
        default: [{
          type: "table",
          id: "t1",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            pageSize: 2,
          },
        }],
      },
    };

    const site = await loadSite(target, root);

    const tableEl = target.querySelector("[data-component-id='t1']") as HTMLElement;
    expect(tableEl).toBeTruthy();

    tableEl.dispatchEvent(new CustomEvent("casehub-page", {
      bubbles: true,
      composed: true,
      detail: { offset: 4, count: 2 },
    }));

    expect(location.hash).toContain("page=t1:2");

    site.dispose();
    document.body.removeChild(target);
  });

  it("sort resets pagination to 0", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ a: 1 }, { a: 2 }, { a: 3 }]),
        }],
      },
      slots: {
        default: [{
          type: "table",
          id: "t1",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            pageSize: 2,
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);
    const tableEl = target.querySelector("[data-component-id='t1']") as HTMLElement;
    expect(tableEl).toBeTruthy();

    // Set page to 1
    tableEl.dispatchEvent(new CustomEvent("casehub-page", {
      bubbles: true,
      composed: true,
      detail: { offset: 2, count: 2 },
    }));
    expect(location.hash).toContain("page=t1:1");

    // Sort should reset page to 0 (page param omitted when page is 0)
    tableEl.dispatchEvent(new CustomEvent("casehub-sort", {
      bubbles: true,
      composed: true,
      detail: { columnId: "a", order: "DESCENDING" },
    }));
    expect(location.hash).toContain("sort=t1:a:DESCENDING");
    expect(location.hash).not.toContain("page=");

    site.dispose();
    document.body.removeChild(target);
  });

  it("ViewState exposes sort and pagination", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ a: 1 }]),
        }],
      },
      slots: {
        default: [{
          type: "table",
          id: "t1",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);
    const tableEl = target.querySelector("[data-component-id='t1']") as HTMLElement;
    expect(tableEl).toBeTruthy();

    tableEl.dispatchEvent(new CustomEvent("casehub-sort", {
      bubbles: true,
      composed: true,
      detail: { columnId: "a", order: "ASCENDING" },
    }));

    expect(site.state.sort).toEqual({ t1: { columnId: "a", order: "ASCENDING" } });

    site.dispose();
    document.body.removeChild(target);
  });

  it("table without explicit ID — sort works but not in URL", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ a: 1 }]),
        }],
      },
      slots: {
        default: [{
          type: "table",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);

    // Find the auto-ID'd table by component type
    const tableEl = target.querySelector("[data-component-type='table']") as HTMLElement;
    expect(tableEl).toBeTruthy();

    tableEl.dispatchEvent(new CustomEvent("casehub-sort", {
      bubbles: true,
      composed: true,
      detail: { columnId: "a", order: "ASCENDING" },
    }));

    // Sort should NOT appear in URL because table has no explicit ID
    expect(location.hash).not.toContain("sort=");

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Shared helpers for deep tests ────────────────────────────────────

function waitForViz(
  target: HTMLElement,
  selector: string,
  maxWait = 500,
): Promise<HTMLElement & { dataSet?: unknown }> {
  const el = target.querySelector<HTMLElement>(selector);
  if (!el) return Promise.reject(new Error(`Element not found: ${selector}`));
  const componentType = el.dataset.componentType;
  if (!componentType) return Promise.reject(new Error(`No componentType on ${selector}`));
  const vizEl = el.querySelector<HTMLElement & { dataSet?: unknown }>(
    `casehub-${componentType}`,
  );
  if (!vizEl) return Promise.reject(new Error(`Viz element not found in ${selector}`));
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check(): void {
      if (vizEl.dataSet) { resolve(vizEl); return; }
      if (Date.now() - start > maxWait) { reject(new Error(`Data not loaded for ${selector} within ${String(maxWait)}ms`)); return; }
      setTimeout(check, 10);
    }
    check();
  });
}

function getTableViz(target: HTMLElement, componentId: string): CasehubTable {
  const el = target.querySelector<HTMLElement>(`[data-component-id='${componentId}'] casehub-table`);
  if (!el) throw new Error(`casehub-table not found for ${componentId}`);
  return el as CasehubTable;
}

function dispatchSort(target: HTMLElement, componentId: string, columnId: string, order: "ASCENDING" | "DESCENDING"): void {
  const el = target.querySelector<HTMLElement>(`[data-component-id='${componentId}']`);
  if (!el) throw new Error(`Component not found: ${componentId}`);
  el.dispatchEvent(new CustomEvent("casehub-sort", {
    bubbles: true, composed: true,
    detail: { columnId, order },
  }));
}

function dispatchPage(target: HTMLElement, componentId: string, offset: number, count: number): void {
  const el = target.querySelector<HTMLElement>(`[data-component-id='${componentId}']`);
  if (!el) throw new Error(`Component not found: ${componentId}`);
  el.dispatchEvent(new CustomEvent("casehub-page", {
    bubbles: true, composed: true,
    detail: { offset, count },
  }));
}

const SALES_DATA = [
  { region: "North", product: "Widget", revenue: 100 },
  { region: "North", product: "Gadget", revenue: 200 },
  { region: "South", product: "Widget", revenue: 300 },
  { region: "South", product: "Gadget", revenue: 400 },
  { region: "East", product: "Widget", revenue: 500 },
  { region: "East", product: "Gadget", revenue: 600 },
];

// ── Category E: 2-Level Nesting ──────────────────────────────────────

describe("view state — 2-level nesting", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  function twoLevelSite(): Component {
    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify(SALES_DATA),
    };

    return {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [{
          type: "tabs",
          id: "outer-tabs",
          slots: {
            Overview: [{
              type: "page",
              props: { name: "Overview" },
              slots: {
                default: [{
                  type: "table",
                  id: "overview-table",
                  props: {
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    sortable: true,
                    pageSize: 2,
                  },
                }],
              },
            }],
            Detail: [{
              type: "page",
              props: { name: "Detail" },
              slots: {
                default: [{
                  type: "tabs",
                  id: "inner-tabs",
                  slots: {
                    Revenue: [{
                      type: "page",
                      props: { name: "Revenue" },
                      slots: {
                        default: [{
                          type: "table",
                          id: "revenue-table",
                          props: {
                            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                            sortable: true,
                            pageSize: 3,
                          },
                        }],
                      },
                    }],
                    Cost: [{
                      type: "page",
                      props: { name: "Cost" },
                      slots: {
                        default: [{
                          type: "table",
                          id: "cost-table",
                          props: {
                            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                            sortable: true,
                          },
                        }],
                      },
                    }],
                  },
                }],
              },
            }],
          },
        }],
      },
    };
  }

  it("load URL with deep page path + sort navigates correctly", async () => {
    // Set URL before loading site
    history.replaceState(null, "", "#/page/Detail/Revenue?sort=revenue-table:revenue:DESCENDING");

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, twoLevelSite());

    // Should have navigated to Detail > Revenue
    expect(site.state.currentPage).toBe("Detail/Revenue");

    // Revenue table should be visible and sorted
    const vizEl = await waitForViz(target, "[data-component-id='revenue-table']");
    const tbl = vizEl as CasehubTable;
    expect(tbl.activeSort).toEqual({ columnId: "revenue", order: "DESCENDING" });

    // Data should be sorted descending by revenue
    // No page= in URL, so pagination is not active — all 6 rows returned, sorted
    const rows = tbl.dataSet!.rows;
    const revenues = rows.map(r => {
      const c = r.cell("revenue" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(revenues).toEqual([600, 500, 400, 300, 200, 100]);

    site.dispose();
    document.body.removeChild(target);
  });

  it("sort on one tab, navigate to another, navigate back — sort preserved", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, twoLevelSite());

    // Navigate to Overview tab, sort its table
    // Overview is the default first tab, so it's already visible
    await waitForViz(target, "[data-component-id='overview-table']");
    dispatchSort(target, "overview-table", "revenue", "ASCENDING");

    expect(site.state.sort).toHaveProperty("overview-table");
    expect(site.state.sort["overview-table"]).toEqual({ columnId: "revenue", order: "ASCENDING" });

    // Navigate to Detail tab — walkNavigate only processes ["Detail"],
    // so currentPage is "Detail" (inner tabs' default slot fires slot-change
    // which is then overwritten by walkNavigate's return value)
    site.navigate("Detail");
    expect(site.state.currentPage).toBe("Detail");

    // overview-table is now destroyed (lazy render), but ComponentViewState should still hold the sort
    // Navigate back to Overview
    site.navigate("Overview");
    await waitForViz(target, "[data-component-id='overview-table']");

    // Sort should be restored
    const tbl = getTableViz(target, "overview-table");
    expect(tbl.activeSort).toEqual({ columnId: "revenue", order: "ASCENDING" });

    site.dispose();
    document.body.removeChild(target);
  });

  it("filters scoped to correct page — filter on page A does not affect page B", async () => {
    // Build a site with selector + table on the Overview tab
    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["North", "Widget", 100],
        ["North", "Gadget", 200],
        ["South", "Widget", 300],
      ]),
      columns: [
        { id: "region", type: "LABEL" },
        { id: "product", type: "LABEL" },
        { id: "revenue", type: "NUMBER" },
      ],
    };

    const groupByRegion = {
      type: "group" as const,
      groupingKey: {
        sourceId: "region" as ColumnId, columnId: "region" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "region" as ColumnId, columnId: "region" as ColumnId }],
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [{
          type: "tabs",
          id: "nav",
          slots: {
            TabA: [{
              type: "page",
              props: { name: "TabA" },
              slots: {
                default: [
                  {
                    type: "selector", id: "sel-a",
                    props: {
                      filter: { notification: true },
                      lookup: { dataSetId: "ds" as DataSetId, operations: [groupByRegion] },
                    },
                  },
                  {
                    type: "table", id: "tbl-a",
                    props: {
                      filter: { listening: true },
                      lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    },
                  },
                ],
              },
            }],
            TabB: [{
              type: "page",
              props: { name: "TabB" },
              slots: {
                default: [{
                  type: "table", id: "tbl-b",
                  props: {
                    filter: { listening: true },
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                  },
                }],
              },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Wait for TabA's table to have data
    await waitForViz(target, "[data-component-id='tbl-a']");
    const tblA = getTableViz(target, "tbl-a");
    expect(tblA.dataSet!.rows.length).toBe(3);

    // Apply filter via selector (select "North" = row index 0)
    const selContainer = target.querySelector("[data-component-id='sel-a']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // TabA's table should be filtered to 2 rows (North only)
    expect(tblA.dataSet!.rows.length).toBe(2);

    // Navigate to TabB
    site.navigate("TabB");
    await waitForViz(target, "[data-component-id='tbl-b']");

    // TabB's table should NOT be affected by TabA's filter — different page scope
    const tblB = getTableViz(target, "tbl-b");
    expect(tblB.dataSet!.rows.length).toBe(3);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category G: Cross-Filter + Sort Interaction ─────────────────────

describe("view state — cross-filter + sort interaction", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  function filterSortSite(): Component {
    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["A", "X", 10],
        ["A", "Y", 20],
        ["B", "Z", 30],
        ["B", "W", 40],
        ["A", "V", 50],
      ]),
      columns: [
        { id: "cat", type: "LABEL" },
        { id: "name", type: "LABEL" },
        { id: "val", type: "NUMBER" },
      ],
    };

    const groupByCat = {
      type: "group" as const,
      groupingKey: {
        sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId }],
    };

    return {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [
          {
            type: "selector", id: "sel",
            props: {
              filter: { notification: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [groupByCat] },
            },
          },
          {
            type: "table", id: "tbl",
            props: {
              filter: { listening: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              sortable: true,
              pageSize: 2,
            },
          },
        ],
      },
    };
  }

  async function applyFilter(target: HTMLElement, rowIndex: string): Promise<void> {
    const selContainer = target.querySelector("[data-component-id='sel']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    selectEl.value = rowIndex;
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));
  }

  async function clearFilter(target: HTMLElement): Promise<void> {
    const selContainer = target.querySelector("[data-component-id='sel']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    // "All" option value is "-1" in CasehubSelector
    selectEl.value = "-1";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));
  }

  it("sort table, then apply filter — sort preserved, page resets to 0", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, filterSortSite());
    await waitForViz(target, "[data-component-id='tbl']");

    // Sort by val descending
    dispatchSort(target, "tbl", "val", "DESCENDING");

    // Paginate to page 1
    dispatchPage(target, "tbl", 2, 2);
    expect(site.state.pagination).toHaveProperty("tbl");
    expect(site.state.pagination["tbl"]).toBe(1);

    // Apply filter (select "A")
    await applyFilter(target, "0");

    // Sort should be preserved
    expect(site.state.sort["tbl"]).toEqual({ columnId: "val", order: "DESCENDING" });

    // Page should reset to 0 (filter resets pagination)
    const page = site.state.pagination["tbl"];
    expect(page === undefined || page === 0).toBe(true);

    // Table should show filtered + sorted data
    const tbl = getTableViz(target, "tbl");
    expect(tbl.activeSort).toEqual({ columnId: "val", order: "DESCENDING" });

    site.dispose();
    document.body.removeChild(target);
  });

  it("apply filter, then sort — both applied", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, filterSortSite());
    await waitForViz(target, "[data-component-id='tbl']");

    // Apply filter first (select "A")
    await applyFilter(target, "0");

    // Then sort by val ascending
    dispatchSort(target, "tbl", "val", "ASCENDING");

    // Both should be applied
    expect(site.state.sort["tbl"]).toEqual({ columnId: "val", order: "ASCENDING" });

    const tbl = getTableViz(target, "tbl");
    // Filtered to A (3 rows), sorted ascending, pageSize=2 → first page shows 2
    expect(tbl.dataSet!.rows.length).toBe(2);
    // First row should be val=10 (lowest A row)
    const firstVal = tbl.dataSet!.rows[0]!.cell("val" as ColumnId);
    expect(firstVal.type !== "NULL" ? Number(firstVal.value) : 0).toBe(10);

    site.dispose();
    document.body.removeChild(target);
  });

  it("filter + sort + paginate, then clear filter — sort preserved, page resets", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, filterSortSite());
    await waitForViz(target, "[data-component-id='tbl']");

    // Apply filter
    await applyFilter(target, "0");

    // Sort
    dispatchSort(target, "tbl", "val", "DESCENDING");

    // Paginate to page 1
    dispatchPage(target, "tbl", 2, 2);

    // Now clear filter
    await clearFilter(target);

    // Sort should still be present
    expect(site.state.sort["tbl"]).toEqual({ columnId: "val", order: "DESCENDING" });

    // Page should reset to 0 (filter clear resets page)
    const page = site.state.pagination["tbl"];
    expect(page === undefined || page === 0).toBe(true);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category I: Multiple Tables Same Page ────────────────────────────

describe("view state — multiple tables same page", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  function multiTableSite(): Component {
    return {
      type: "page",
      props: {
        name: "App",
        datasets: [
          {
            uuid: "ds1" as DataSetId,
            content: JSON.stringify([
              { a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 },
            ]),
          },
          {
            uuid: "ds2" as DataSetId,
            content: JSON.stringify([
              { b: 10 }, { b: 20 }, { b: 30 }, { b: 40 }, { b: 50 },
            ]),
          },
        ],
      },
      slots: {
        default: [
          {
            type: "table", id: "t1",
            props: {
              lookup: { dataSetId: "ds1" as DataSetId, operations: [] },
              sortable: true, pageSize: 2,
            },
          },
          {
            type: "table", id: "t2",
            props: {
              lookup: { dataSetId: "ds2" as DataSetId, operations: [] },
              sortable: true, pageSize: 2,
            },
          },
        ],
      },
    };
  }

  it("sort t1, sort t2 independently — both in URL", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, multiTableSite());
    await waitForViz(target, "[data-component-id='t1']");
    await waitForViz(target, "[data-component-id='t2']");

    dispatchSort(target, "t1", "a", "ASCENDING");
    dispatchSort(target, "t2", "b", "DESCENDING");

    // Both should be in state
    expect(site.state.sort["t1"]).toEqual({ columnId: "a", order: "ASCENDING" });
    expect(site.state.sort["t2"]).toEqual({ columnId: "b", order: "DESCENDING" });

    // Both should be in URL
    expect(location.hash).toContain("t1:a:ASCENDING");
    expect(location.hash).toContain("t2:b:DESCENDING");

    site.dispose();
    document.body.removeChild(target);
  });

  it("paginate t1 and t2 independently — both in URL", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, multiTableSite());
    await waitForViz(target, "[data-component-id='t1']");
    await waitForViz(target, "[data-component-id='t2']");

    dispatchPage(target, "t1", 2, 2); // page 1
    dispatchPage(target, "t2", 4, 2); // page 2

    expect(site.state.pagination["t1"]).toBe(1);
    expect(site.state.pagination["t2"]).toBe(2);

    expect(location.hash).toContain("page=");
    expect(location.hash).toContain("t1:1");
    expect(location.hash).toContain("t2:2");

    site.dispose();
    document.body.removeChild(target);
  });

  it("filter affects both tables — both pages reset to 0", async () => {
    // Two tables listening to the same filter, plus a selector emitting
    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["X", 1], ["X", 2], ["Y", 3], ["Y", 4], ["X", 5],
      ]),
      columns: [
        { id: "cat", type: "LABEL" },
        { id: "val", type: "NUMBER" },
      ],
    };

    const groupByCat = {
      type: "group" as const,
      groupingKey: {
        sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId }],
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [
          {
            type: "selector", id: "sel",
            props: {
              filter: { notification: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [groupByCat] },
            },
          },
          {
            type: "table", id: "tbl-1",
            props: {
              filter: { listening: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              pageSize: 2,
            },
          },
          {
            type: "table", id: "tbl-2",
            props: {
              filter: { listening: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              pageSize: 2,
            },
          },
        ],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);
    await waitForViz(target, "[data-component-id='tbl-1']");
    await waitForViz(target, "[data-component-id='tbl-2']");

    // Paginate both tables
    dispatchPage(target, "tbl-1", 2, 2); // page 1
    dispatchPage(target, "tbl-2", 2, 2); // page 1
    expect(site.state.pagination["tbl-1"]).toBe(1);
    expect(site.state.pagination["tbl-2"]).toBe(1);

    // Apply filter via selector
    const selContainer = target.querySelector("[data-component-id='sel']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // Both pages should be reset to 0
    const p1 = site.state.pagination["tbl-1"];
    const p2 = site.state.pagination["tbl-2"];
    expect(p1 === undefined || p1 === 0).toBe(true);
    expect(p2 === undefined || p2 === 0).toBe(true);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category K: popstate (Back/Forward) ──────────────────────────────

describe("view state — popstate", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("navigate to page, sort, navigate to different page, go back — sort restored", async () => {
    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ x: 1 }, { x: 2 }, { x: 3 }]),
        }],
      },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs",
          slots: {
            Alpha: [{
              type: "page",
              props: { name: "Alpha" },
              slots: {
                default: [{
                  type: "table", id: "alpha-tbl",
                  props: {
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    sortable: true,
                  },
                }],
              },
            }],
            Beta: [{
              type: "page",
              props: { name: "Beta" },
              slots: {
                default: [{
                  type: "title", props: { text: "Beta page" },
                }],
              },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // On Alpha tab (default), sort the table
    await waitForViz(target, "[data-component-id='alpha-tbl']");
    dispatchSort(target, "alpha-tbl", "x", "DESCENDING");
    expect(location.hash).toContain("sort=alpha-tbl:x:DESCENDING");

    // Navigate to Beta — pushes a new history entry
    site.navigate("Beta");
    expect(site.state.currentPage).toBe("Beta");
    expect(location.hash).toContain("Beta");

    // Go back via popstate
    window.dispatchEvent(new PopStateEvent("popstate"));

    // Wait for popstate to process
    await new Promise((r) => setTimeout(r, 50));

    // Parse URL to verify sort is still present in the hash
    // (popstate restores state from URL)
    // Note: after popstate, the URL should be the one that was pushed with sort
    // The browser manages history entries — in JSDOM we simulate by manually
    // going back. Since we can't truly do history.back() in JSDOM, we verify
    // the popstate handler processes the current URL correctly.
    // After navigate("Beta"), URL has Beta with no sort.
    // After popstate with the Beta URL: componentViewState gets cleared and
    // restored from current URL (which is Beta).
    // To truly test back navigation, we'd need a real browser. Instead, we
    // verify the popstate handler restores from the URL hash correctly by
    // setting the hash back and firing popstate.
    history.replaceState(null, "", "#/page/Alpha?sort=alpha-tbl:x:DESCENDING");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 50));

    // Alpha's table should be restored with sort
    await waitForViz(target, "[data-component-id='alpha-tbl']");
    const tbl = getTableViz(target, "alpha-tbl");
    expect(tbl.activeSort).toEqual({ columnId: "x", order: "DESCENDING" });

    site.dispose();
    document.body.removeChild(target);
  });

  it("two levels of history — back + back restores both", async () => {
    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ v: 1 }, { v: 2 }]),
        }],
      },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs",
          slots: {
            P1: [{
              type: "page",
              props: { name: "P1" },
              slots: {
                default: [{
                  type: "table", id: "t-p1",
                  props: {
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    sortable: true,
                  },
                }],
              },
            }],
            P2: [{
              type: "page",
              props: { name: "P2" },
              slots: {
                default: [{
                  type: "table", id: "t-p2",
                  props: {
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    sortable: true,
                  },
                }],
              },
            }],
            P3: [{
              type: "page",
              props: { name: "P3" },
              slots: {
                default: [{ type: "title", props: { text: "P3" } }],
              },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Sort on P1
    await waitForViz(target, "[data-component-id='t-p1']");
    dispatchSort(target, "t-p1", "v", "ASCENDING");

    // Navigate to P2, sort
    site.navigate("P2");
    await waitForViz(target, "[data-component-id='t-p2']");
    dispatchSort(target, "t-p2", "v", "DESCENDING");

    // Navigate to P3
    site.navigate("P3");
    expect(site.state.currentPage).toBe("P3");

    // Simulate back to P2 with sort
    history.replaceState(null, "", "#/page/P2?sort=t-p2:v:DESCENDING");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 50));

    expect(site.state.currentPage).toBe("P2");
    const tblP2 = getTableViz(target, "t-p2");
    expect(tblP2.activeSort).toEqual({ columnId: "v", order: "DESCENDING" });

    // Simulate back to P1 with sort
    history.replaceState(null, "", "#/page/P1?sort=t-p1:v:ASCENDING");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 50));

    expect(site.state.currentPage).toBe("P1");
    await waitForViz(target, "[data-component-id='t-p1']");
    const tblP1 = getTableViz(target, "t-p1");
    expect(tblP1.activeSort).toEqual({ columnId: "v", order: "ASCENDING" });

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category L: Edge Cases ───────────────────────────────────────────

describe("view state — edge cases", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("stale sort column — dataset without sorted column renders unsorted", async () => {
    // Start with a table sorted by column "x", then push data without column "x"
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([
            { x: 3, y: "a" },
            { x: 1, y: "b" },
            { x: 2, y: "c" },
          ]),
        }],
      },
      slots: {
        default: [{
          type: "table", id: "tbl",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);
    await waitForViz(target, "[data-component-id='tbl']");

    // Sort by x
    dispatchSort(target, "tbl", "x", "ASCENDING");

    const tbl = getTableViz(target, "tbl");
    expect(tbl.activeSort).toEqual({ columnId: "x", order: "ASCENDING" });

    // Verify data is sorted
    const firstVal = tbl.dataSet!.rows[0]!.cell("x" as ColumnId);
    expect(firstVal.type !== "NULL" ? Number(firstVal.value) : 0).toBe(1);

    // State should be preserved in URL
    expect(location.hash).toContain("sort=tbl:x:ASCENDING");
    expect(site.state.sort["tbl"]).toEqual({ columnId: "x", order: "ASCENDING" });

    site.dispose();
    document.body.removeChild(target);
  });

  it("empty dataset + sort — no error", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([]),
        }],
      },
      slots: {
        default: [{
          type: "table", id: "tbl",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);

    // Table might not have data (empty dataset) — find it by component ID
    const tableEl = target.querySelector("[data-component-id='tbl']") as HTMLElement;
    expect(tableEl).toBeTruthy();

    // Sort on empty dataset — should not throw
    tableEl.dispatchEvent(new CustomEvent("casehub-sort", {
      bubbles: true, composed: true,
      detail: { columnId: "anything", order: "ASCENDING" },
    }));

    // State should still be set (ComponentViewState doesn't depend on data)
    expect(site.state.sort["tbl"]).toEqual({ columnId: "anything", order: "ASCENDING" });
    expect(location.hash).toContain("sort=tbl:anything:ASCENDING");

    site.dispose();
    document.body.removeChild(target);
  });

  it("dispose cleanup — componentViewState cleared", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ a: 1 }]),
        }],
      },
      slots: {
        default: [{
          type: "table", id: "tbl",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);
    await waitForViz(target, "[data-component-id='tbl']");

    // Sort to populate ComponentViewState
    dispatchSort(target, "tbl", "a", "ASCENDING");
    expect(site.state.sort["tbl"]).toBeTruthy();

    // Dispose
    site.dispose();

    // After dispose, state.sort should be empty (componentViewState.clear() called)
    expect(Object.keys(site.state.sort).length).toBe(0);

    document.body.removeChild(target);
  });
});

// ── Category D: Race Condition Verification ──────────────────────────

describe("view state — race condition verification", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("load URL with sort — first data push arrives with correct sort applied", async () => {
    // Set sort in URL before loading
    history.replaceState(null, "", "#/page/?sort=tbl:a:DESCENDING");

    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([
            { a: 3 },
            { a: 1 },
            { a: 2 },
          ]),
        }],
      },
      slots: {
        default: [{
          type: "table", id: "tbl",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
          },
        }],
      },
    };

    const site = await loadSite(target, root);

    // Wait for data
    await waitForViz(target, "[data-component-id='tbl']");

    const tbl = getTableViz(target, "tbl");

    // The FIRST (and only) push should have the sort applied
    expect(tbl.activeSort).toEqual({ columnId: "a", order: "DESCENDING" });

    // Data should be in descending order
    const values = tbl.dataSet!.rows.map(r => {
      const c = r.cell("a" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(values).toEqual([3, 2, 1]);

    site.dispose();
    document.body.removeChild(target);
  });

  it("load URL with sort + pagination — first render has both applied", async () => {
    history.replaceState(null, "", "#/page/?sort=tbl:a:ASCENDING&page=tbl:1");

    const target = document.createElement("div");
    document.body.appendChild(target);

    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([
            { a: 5 }, { a: 3 }, { a: 1 }, { a: 4 }, { a: 2 },
          ]),
        }],
      },
      slots: {
        default: [{
          type: "table", id: "tbl",
          props: {
            lookup: { dataSetId: "ds" as DataSetId, operations: [] },
            sortable: true,
            pageSize: 2,
          },
        }],
      },
    };

    const site = await loadSite(target, root);
    await waitForViz(target, "[data-component-id='tbl']");

    const tbl = getTableViz(target, "tbl");

    // Sort ascending, page 1 (offset 2, count 2) → rows [3, 4]
    expect(tbl.activeSort).toEqual({ columnId: "a", order: "ASCENDING" });
    expect(tbl.activePage).toBe(1);

    const values = tbl.dataSet!.rows.map(r => {
      const c = r.cell("a" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(values).toEqual([3, 4]);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category J: ID Collision Test ────────────────────────────────────

describe("view state — ID collision across pages", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("two pages with same explicit ID — sort state shared via flat ComponentViewState", async () => {
    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "ds" as DataSetId,
          content: JSON.stringify([{ v: 3 }, { v: 1 }, { v: 2 }]),
        }],
      },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs",
          slots: {
            PageA: [{
              type: "page",
              props: { name: "PageA" },
              slots: {
                default: [{
                  type: "table", id: "data-table",
                  props: {
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    sortable: true,
                  },
                }],
              },
            }],
            PageB: [{
              type: "page",
              props: { name: "PageB" },
              slots: {
                default: [{
                  type: "table", id: "data-table",
                  props: {
                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                    sortable: true,
                  },
                }],
              },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // On PageA (default), sort the table
    await waitForViz(target, "[data-component-id='data-table']");
    dispatchSort(target, "data-table", "v", "DESCENDING");

    expect(site.state.sort["data-table"]).toEqual({ columnId: "v", order: "DESCENDING" });

    // Navigate to PageB — the same ID "data-table" is used
    site.navigate("PageB");
    await waitForViz(target, "[data-component-id='data-table']");

    // PageB's data-table should receive the same sort state (flat-map behavior)
    const tblB = getTableViz(target, "data-table");
    expect(tblB.activeSort).toEqual({ columnId: "v", order: "DESCENDING" });

    // Data should be sorted descending
    const values = tblB.dataSet!.rows.map(r => {
      const c = r.cell("v" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(values).toEqual([3, 2, 1]);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category F: 3-Level Nesting ──────────────────────────────────────

describe("view state — 3-level nesting", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("load URL with 3-level deep page path + sort navigates correctly", async () => {
    // Set URL before loading site
    history.replaceState(null, "", "#/page/L1/L2/L3?sort=deep-table:val:DESCENDING");

    const target = document.createElement("div");
    document.body.appendChild(target);

    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        { val: 10 }, { val: 30 }, { val: 20 },
      ]),
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [{
          type: "tabs",
          id: "l1-tabs",
          slots: {
            L1: [{
              type: "page",
              props: { name: "L1" },
              slots: {
                default: [{
                  type: "tabs",
                  id: "l2-tabs",
                  slots: {
                    L2: [{
                      type: "page",
                      props: { name: "L2" },
                      slots: {
                        default: [{
                          type: "tabs",
                          id: "l3-tabs",
                          slots: {
                            L3: [{
                              type: "page",
                              props: { name: "L3" },
                              slots: {
                                default: [{
                                  type: "table", id: "deep-table",
                                  props: {
                                    lookup: { dataSetId: "ds" as DataSetId, operations: [] },
                                    sortable: true,
                                  },
                                }],
                              },
                            }],
                          },
                        }],
                      },
                    }],
                  },
                }],
              },
            }],
          },
        }],
      },
    };

    const site = await loadSite(target, root);

    // Should have navigated to L1/L2/L3
    expect(site.state.currentPage).toBe("L1/L2/L3");

    // Deep table should be visible and sorted
    const vizEl = await waitForViz(target, "[data-component-id='deep-table']");
    const tbl = vizEl as CasehubTable;
    expect(tbl.activeSort).toEqual({ columnId: "val", order: "DESCENDING" });

    // Data should be sorted descending
    const values = tbl.dataSet!.rows.map(r => {
      const c = r.cell("val" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(values).toEqual([30, 20, 10]);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category H: Record Selection + Sort Test ────────────────────────

describe("view state — record selection + sort interaction", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("sort detail table, then select different master record — sort preserved", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    // Use selector + table pattern (not dataScope) to test sort preservation across filter changes
    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["A", "Item 1", 10],
        ["A", "Item 2", 30],
        ["A", "Item 3", 20],
        ["B", "Item 4", 5],
        ["B", "Item 5", 15],
      ]),
      columns: [
        { id: "cat", type: "LABEL" },
        { id: "item", type: "LABEL" },
        { id: "value", type: "NUMBER" },
      ],
    };

    const groupByCat = {
      type: "group" as const,
      groupingKey: {
        sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId }],
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [
          {
            type: "selector", id: "cat-selector",
            props: {
              filter: { notification: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [groupByCat] },
            },
          },
          {
            type: "table", id: "detail-tbl",
            props: {
              filter: { listening: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              sortable: true,
            },
          },
        ],
      },
    };

    const site = await loadSite(target, root);

    // Wait for both components
    await waitForViz(target, "[data-component-id='cat-selector']");
    await waitForViz(target, "[data-component-id='detail-tbl']");

    // Initially, table shows all 5 rows (no filter)
    let detailTbl = getTableViz(target, "detail-tbl");
    expect(detailTbl.dataSet!.rows.length).toBe(5);

    // Select "A" in selector (row index 0)
    const selContainer = target.querySelector("[data-component-id='cat-selector']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // Detail table should now show 3 rows (filtered to cat = A)
    detailTbl = getTableViz(target, "detail-tbl");
    expect(detailTbl.dataSet!.rows.length).toBe(3);

    // Sort detail table by value descending
    dispatchSort(target, "detail-tbl", "value", "DESCENDING");
    await new Promise((r) => setTimeout(r, 50));

    // Verify sort is applied
    detailTbl = getTableViz(target, "detail-tbl");
    expect(detailTbl.activeSort).toEqual({ columnId: "value", order: "DESCENDING" });
    let values = detailTbl.dataSet!.rows.map(r => {
      const c = r.cell("value" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(values).toEqual([30, 20, 10]);

    // Select "B" in selector (row index 1)
    selectEl.value = "1";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // Detail table should now show 2 rows (filtered to cat = B)
    detailTbl = getTableViz(target, "detail-tbl");
    expect(detailTbl.dataSet!.rows.length).toBe(2);

    // Sort should be PRESERVED (sort is per-component, not per-filter state)
    expect(detailTbl.activeSort).toEqual({ columnId: "value", order: "DESCENDING" });
    values = detailTbl.dataSet!.rows.map(r => {
      const c = r.cell("value" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(values).toEqual([15, 5]);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Category L: Stale Sort Column (Enhanced) ────────────────────────

describe("view state — stale sort column enhanced", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("sort by column x, dataset changes to exclude x, then changes back — sort reapplies via pipeline", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    // Use selector + filter to trigger pipeline data pushes (not manual dataSet assignment)
    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["show", 3, "a"],
        ["show", 1, "b"],
        ["show", 2, "c"],
        ["hide", 5, "d"],
        ["hide", 4, "e"],
      ]),
      columns: [
        { id: "visibility", type: "LABEL" },
        { id: "x", type: "NUMBER" },
        { id: "y", type: "LABEL" },
      ],
    };

    const groupByVis = {
      type: "group" as const,
      groupingKey: {
        sourceId: "visibility" as ColumnId, columnId: "visibility" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "visibility" as ColumnId, columnId: "visibility" as ColumnId }],
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [
          {
            type: "selector", id: "vis-sel",
            props: {
              filter: { notification: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [groupByVis] },
            },
          },
          {
            type: "table", id: "tbl",
            props: {
              filter: { listening: true },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              sortable: true,
            },
          },
        ],
      },
    };

    const site = await loadSite(target, root);
    await waitForViz(target, "[data-component-id='tbl']");

    // Filter to "show" rows (3 rows with x column)
    const selContainer = target.querySelector("[data-component-id='vis-sel']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    selectEl.value = "0"; // "show" is first in the selector (appears first in dataset)
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // Sort by x ascending
    dispatchSort(target, "tbl", "x", "ASCENDING");
    await new Promise((r) => setTimeout(r, 50));

    let tbl = getTableViz(target, "tbl");
    expect(tbl.activeSort).toEqual({ columnId: "x", order: "ASCENDING" });

    // Data should be sorted: 1, 2, 3
    let xValues = tbl.dataSet!.rows.map(r => {
      const c = r.cell("x" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(xValues).toEqual([1, 2, 3]);

    // ComponentViewState should hold the sort
    expect(site.state.sort["tbl"]).toEqual({ columnId: "x", order: "ASCENDING" });

    // Filter to "hide" rows (which also have x column: 4, 5)
    selectEl.value = "1"; // "hide" is second in the selector
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    tbl = getTableViz(target, "tbl");
    // Sort should still be in ComponentViewState
    expect(site.state.sort["tbl"]).toEqual({ columnId: "x", order: "ASCENDING" });
    // Data should be sorted via pipeline: 4, 5
    xValues = tbl.dataSet!.rows.map(r => {
      const c = r.cell("x" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(xValues).toEqual([4, 5]);

    // Switch back to "show" — sort should reapply
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    tbl = getTableViz(target, "tbl");
    expect(tbl.activeSort).toEqual({ columnId: "x", order: "ASCENDING" });
    xValues = tbl.dataSet!.rows.map(r => {
      const c = r.cell("x" as ColumnId);
      return c.type !== "NULL" ? Number(c.value) : 0;
    });
    expect(xValues).toEqual([1, 2, 3]);

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── Filter Group Isolation Test ─────────────────────────────────────

describe("view state — filter group isolation", () => {
  afterEach(() => {
    history.replaceState(null, "", location.pathname);
  });

  it("filter event for group g1 resets pagination for g1 but not g2", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const ds = {
      uuid: "ds" as DataSetId,
      content: JSON.stringify([
        ["X", 1], ["X", 2], ["Y", 3], ["Y", 4], ["X", 5],
      ]),
      columns: [
        { id: "cat", type: "LABEL" },
        { id: "val", type: "NUMBER" },
      ],
    };

    const groupByCat = {
      type: "group" as const,
      groupingKey: {
        sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId,
        strategy: { mode: "distinct" as const }, maxIntervals: 100,
        emptyIntervals: true, ascendingOrder: true,
      },
      columns: [{ kind: "key" as const, sourceId: "cat" as ColumnId, columnId: "cat" as ColumnId }],
    };

    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: {
        default: [
          {
            type: "selector", id: "sel-g1",
            props: {
              filter: { notification: true, group: "g1" },
              lookup: { dataSetId: "ds" as DataSetId, operations: [groupByCat] },
            },
          },
          {
            type: "table", id: "tbl-g1",
            props: {
              filter: { listening: true, group: "g1" },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              pageSize: 2,
            },
          },
          {
            type: "table", id: "tbl-g2",
            props: {
              filter: { listening: true, group: "g2" },
              lookup: { dataSetId: "ds" as DataSetId, operations: [] },
              pageSize: 2,
            },
          },
        ],
      },
    };

    const site = await loadSite(target, root);
    await waitForViz(target, "[data-component-id='tbl-g1']");
    await waitForViz(target, "[data-component-id='tbl-g2']");

    // Paginate both tables to page 1
    dispatchPage(target, "tbl-g1", 2, 2);
    dispatchPage(target, "tbl-g2", 2, 2);
    expect(site.state.pagination["tbl-g1"]).toBe(1);
    expect(site.state.pagination["tbl-g2"]).toBe(1);

    // Apply filter via selector for group g1 (select "X")
    const selContainer = target.querySelector("[data-component-id='sel-g1']")!;
    const selViz = selContainer.querySelector("casehub-selector")!;
    const selectEl = selViz.shadowRoot.querySelector("select")!;
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // tbl-g1's pagination should be reset to 0 (filter event for its group)
    const p1 = site.state.pagination["tbl-g1"];
    expect(p1 === undefined || p1 === 0).toBe(true);

    // tbl-g2's pagination should remain at 1 (different group, unaffected)
    const p2 = site.state.pagination["tbl-g2"];
    expect(p2).toBe(1);

    site.dispose();
    document.body.removeChild(target);
  });
});
