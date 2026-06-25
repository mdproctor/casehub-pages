import { describe, it, expect, afterEach } from "vitest";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import type { DataSetId, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
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
