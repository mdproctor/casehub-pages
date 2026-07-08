import { describe, it, expect } from "vitest";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import type { DataSetId, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import "@casehubio/pages-viz";
import type { PagesElement } from "@casehubio/pages-viz";
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
          type: "metric",
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

  it("applies dark mode CSS class when global.mode is dark", async () => {
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
    expect(target.classList.contains("pages-theme-dark")).toBe(true);
    expect(target.classList.contains("pages-theme-light")).toBe(false);
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
    expect(target.classList.contains("pages-theme-dark")).toBe(true);
    darkSite.dispose();

    const lightSite = await loadSite(target, lightYaml);
    expect(target.classList.contains("pages-theme-light")).toBe(true);
    expect(target.classList.contains("pages-theme-dark")).toBe(false);
    lightSite.dispose();
    document.body.removeChild(target);
  });
});

describe("loadSite — lazy rendering and registry eviction", () => {
  it("registry eviction loop executes without errors on slot changes", async () => {
    // Test: verify the pages-slot-change handler with the eviction loop
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
      `pages-${componentType}`,
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
            type: "metric",
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
    const selectorViz = selectorContainer.querySelector("pages-selector");
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

    // The metric should now show filtered data
    const chartViz = target.querySelector<PagesElement<any>>(
      "[data-component-id='chart-1'] pages-metric",
    );

    expect(chartViz!.dataSet).toBeTruthy();
    // After filtering to "Computers", metric should show only Scanner + Printer (2 rows)
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
                    type: "metric", id: "filter-tbl",
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

    // Metric should have 3 rows (X, Y, Z) before filtering
    const tblViz = target.querySelector<PagesElement<any>>(
      "[data-component-id='filter-tbl'] pages-metric",
    )!;
    expect(tblViz.dataSet!.rows.length).toBe(3);

    // Select "A" in the selector dropdown
    const selViz = selContainer.querySelector("pages-selector")!;
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

    const sidebar = target.querySelector(".pages-sidebar");
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

    const treeNav = target.querySelector(".pages-tree-nav");
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

// ── Dock Toggle Integration ────────────────────────────────────────

describe("dock toggle integration", () => {
  it("pages-dock-toggle hides targeted panel", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const tree: Component = {
      type: "rows",
      slots: {
        default: [
          {
            type: "split",
            props: { direction: "horizontal", ratio: [50, 50] },
            slots: {
              "0": [{ type: "html", props: { content: "Center" } }],
              "1": [{ type: "html", id: "side", props: { content: "Side" } }],
            },
          },
        ],
      },
    };

    const site = await loadSite(target, tree);

    const sideEl = target.querySelector('[data-component-id="side"]')!;
    expect(sideEl).toBeTruthy();
    const slotContainer = sideEl.closest("[data-slot]") as HTMLElement;
    expect(slotContainer.style.display).not.toBe("none");

    target.dispatchEvent(new CustomEvent("pages-dock-toggle", {
      bubbles: true,
      composed: true,
      detail: { panelId: "side", visible: false },
    }));

    expect(slotContainer.style.display).toBe("none");

    site.dispose();
    document.body.removeChild(target);
  });
});

// ── pages-event inter-panel communication ───────────────────────────

describe("pages-event inter-panel communication", () => {
  it("pages-event bubbles to document from within loadSite target", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);

    const tree: Component = {
      type: "rows",
      slots: { default: [{ type: "html", props: { content: "Panel" } }] },
    };
    const site = await loadSite(target, tree);

    const received: Array<{ topic: string; payload: unknown }> = [];
    document.addEventListener("pages-event", ((e: Event) => {
      received.push((e as CustomEvent).detail);
    }));

    const inner = target.querySelector("[data-component-type='html']")!;
    inner.dispatchEvent(new CustomEvent("pages-event", {
      bubbles: true,
      composed: true,
      detail: { topic: "test-topic", payload: { value: 42 } },
    }));

    expect(received).toHaveLength(1);
    expect(received[0]!.topic).toBe("test-topic");

    site.dispose();
    document.body.removeChild(target);
  });
});

