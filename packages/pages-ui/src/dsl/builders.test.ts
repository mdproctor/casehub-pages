import { describe, it, expect } from "vitest";
import type { Component } from "../model/types.js";
import type { PageSettings } from "../model/page-types.js";
import { dataSetId } from "@casehubio/pages-data";
import { getProps } from "../model/type-guards.js";
import type { DataSource, DataSink } from "@casehubio/pages-data";
import {
  page,
  grid,
  at,
  columns,
  rows,
  metricGrid,
  stack,
  tabs,
  pills,
  sidebar,
  tree,
  menu,
  accordion,
  carousel,
  tiles,
  panel,
  html,
  markdown,
  title,
  withId,
  withAccess,
  withStyle,
  bind,
  textInput,
  numberInput,
  dropdown,
  checkbox,
  datePicker,
  textarea,
  split,
  dockBar,
  hostPanel,
  deferred,
  dockWorkbench,
  floatingWorkspace,
  serverPaginated,
  heatmapChart,
  treemapChart,
  densityHeatmap,
  badge,
  countdown,
  timeline,
  graph,
  eventTimeline,
  dataTable,
  masterDetail,
  type PageOptions,
} from "./builders.js";

describe("builders", () => {
  describe("page()", () => {
    it("creates a page with name and children in slots.content", () => {
      const child1 = html("content1");
      const child2 = html("content2");
      const result = page("MyPage", child1, child2);

      expect(result.type).toBe("page");
      expect(result.props).toEqual({ name: "MyPage" });
      expect(result.slots?.content).toEqual([child1, child2]);
    });

    it("accepts PageOptions as last arg", () => {
      const child = html("content");
      const settings: PageSettings = { mode: "dark" };
      const options: PageOptions = {
        datasets: [],
        settings,
        properties: { key: "value" },
      };
      const result = page("MyPage", child, options);

      expect(result.type).toBe("page");
      expect(result.props).toEqual({
        name: "MyPage",
        datasets: [],
        settings,
        properties: { key: "value" },
      });
      expect(result.slots?.content).toEqual([child]);
    });

    it("rejects '/' in name", () => {
      expect(() => page("My/Page")).toThrow(
        "Page name cannot contain '/': My/Page"
      );
    });

    it("rejects duplicate child page names at same level", () => {
      const child1 = page("DupName", html("a"));
      const child2 = page("DupName", html("b"));

      expect(() => page("Parent", child1, child2)).toThrow(
        "Duplicate child page name: DupName"
      );
    });

    it("allows duplicate page names if not siblings", () => {
      const grandchild = page("DupName", html("a"));
      const child = page("Child", grandchild);
      const sibling = page("DupName", html("b"));

      // This is fine — DupName appears at different levels
      const result = page("Parent", child, sibling);
      expect(result.slots?.content).toHaveLength(2);
    });

    it("freezes returned component", () => {
      const result = page("Test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("grid()", () => {
    it("creates grid with items and placements", () => {
      const comp1 = html("a");
      const comp2 = html("b");
      const item1 = at(0, 0, 1, 1, comp1);
      const item2 = at(1, 0, 1, 1, comp2);

      const result = grid(2, item1, item2);

      expect(result.type).toBe("grid");
      expect(result.props).toEqual({ columns: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.items?.[0]!.placement).toEqual({ x: 0, y: 0, w: 1, h: 1 });
      expect(result.items?.[1]!.placement).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    });

    it("generates deterministic ID for grid container", () => {
      const comp1 = html("a");
      const comp2 = html("b");
      const item1 = at(0, 0, 1, 1, comp1);
      const item2 = at(6, 3, 2, 1, comp2);

      const result = grid(8, item1, item2);

      // Grid gets an ID
      expect(result.id).toMatch(/^grid_\d+$/);

      // Items without withId() do not get auto-assigned IDs
      expect(result.items?.[0]!.component.id).toBeUndefined();
      expect(result.items?.[1]!.component.id).toBeUndefined();
    });

    it("does not override existing component IDs", () => {
      const comp = withId("custom-id", html("a"));
      const item = at(0, 0, 1, 1, comp);

      const result = grid(1, item);

      expect(result.items?.[0]!.component.id).toBe("custom-id");
    });

    it("generates sequential grid IDs across calls", () => {
      const grid1 = grid(1, at(0, 0, 1, 1, html("a")));
      const grid2 = grid(1, at(0, 0, 1, 1, html("b")));

      // IDs should increment
      expect(grid1.id).toBeTruthy();
      expect(grid2.id).toBeTruthy();
      expect(grid1.id).not.toBe(grid2.id);
    });

    it("freezes returned component", () => {
      const result = grid(1);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("at()", () => {
    it("creates GridItem with placement", () => {
      const comp = html("test");
      const result = at(1, 2, 3, 4, comp);

      expect(result.placement).toEqual({ x: 1, y: 2, w: 3, h: 4 });
      expect(result.component).toBe(comp);
    });

    it("freezes returned GridItem and placement", () => {
      const result = at(0, 0, 1, 1, html("a"));
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.placement)).toBe(true);
    });
  });

  describe("columns()", () => {
    it("creates columns with distribution and slot contents", () => {
      const col1 = [html("a"), html("b")];
      const col2 = [html("c")];

      const result = columns([60, 40], col1, col2);

      expect(result.type).toBe("columns");
      expect(result.props).toEqual({ distribution: [60, 40] });
      expect(result.slots).toEqual({
        "col-0": col1,
        "col-1": col2,
      });
    });

    it("throws if distribution length !== slotContents length", () => {
      expect(() => columns([50, 50], [html("a")])).toThrow(
        "Distribution length (2) must match slotContents length (1)"
      );
    });

    it("freezes returned component and slots", () => {
      const result = columns([100], [html("a")]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.slots)).toBe(true);
    });
  });

  describe("rows()", () => {
    it("creates rows component with children", () => {
      const child1 = html("a");
      const child2 = html("b");
      const result = rows(child1, child2);

      expect(result.type).toBe("rows");
      expect(result.slots).toEqual({ default: [child1, child2] });
    });

    it("freezes returned component", () => {
      const result = rows();
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("metricGrid()", () => {
    it("creates metric-grid component with children in default slot", () => {
      const child1 = html("a");
      const child2 = html("b");
      const result = metricGrid(child1, child2);

      expect(result.type).toBe("metric-grid");
      expect(result.slots).toEqual({ default: [child1, child2] });
    });

    it("freezes returned component", () => {
      const result = metricGrid();
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("accepts MetricGridOptions as first argument", () => {
      const child = html("a");
      const result = metricGrid({ direction: "row" }, child);

      expect(result.type).toBe("metric-grid");
      expect(result.props).toEqual({ direction: "row" });
      expect(result.slots).toEqual({ default: [child] });
    });

    it("treats first argument without direction as a child component", () => {
      const child = html("a");
      const result = metricGrid(child);

      expect(result.type).toBe("metric-grid");
      expect(result.props).toEqual({});
      expect(result.slots).toEqual({ default: [child] });
    });
  });

  describe("stack()", () => {
    it("creates a stack component with children in slots.default", () => {
      const child = html("test");
      const result = stack(child);

      expect(result.type).toBe("stack");
      expect(result.slots).toEqual({ default: [child] });
    });
  });

  describe("navigation components", () => {
    const testCases: Array<{
      name: string;
      builder: (...entries: [string, ...Component[]][]) => Component;
      expectedType: string;
    }> = [
      { name: "tabs", builder: tabs, expectedType: "tabs" },
      { name: "pills", builder: pills, expectedType: "pills" },
      { name: "sidebar", builder: sidebar, expectedType: "sidebar" },
      { name: "tree", builder: tree, expectedType: "tree" },
      { name: "menu", builder: menu, expectedType: "menu" },
      { name: "accordion", builder: accordion, expectedType: "accordion" },
      { name: "carousel", builder: carousel, expectedType: "carousel" },
      { name: "tiles", builder: tiles, expectedType: "tiles" },
    ];

    testCases.forEach(({ name, builder, expectedType }) => {
      describe(`${name}()`, () => {
        it("creates component with named slots", () => {
          const entry1: [string, ...Component[]] = [
            "Tab1",
            html("a"),
            html("b"),
          ];
          const entry2: [string, ...Component[]] = ["Tab2", html("c")];

          const result = builder(entry1, entry2);

          expect(result.type).toBe(expectedType);
          expect(result.slots).toEqual({
            Tab1: [html("a"), html("b")],
            Tab2: [html("c")],
          });
        });

        it("freezes returned component and slots", () => {
          const result = builder(["Label", html("test")]);
          expect(Object.isFrozen(result)).toBe(true);
          expect(Object.isFrozen(result.slots)).toBe(true);
        });
      });
    });
  });

  describe("panel()", () => {
    it("creates panel with title and children", () => {
      const child1 = html("a");
      const child2 = html("b");
      const result = panel("My Panel", child1, child2);

      expect(result.type).toBe("panel");
      expect(result.props).toEqual({ title: "My Panel" });
      expect(result.slots).toEqual({ default: [child1, child2] });
    });

    it("freezes returned component", () => {
      const result = panel("Test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("html()", () => {
    it("creates html component", () => {
      const result = html("<div>Hello</div>");

      expect(result.type).toBe("html");
      expect(result.props).toEqual({ content: "<div>Hello</div>" });
    });

    it("freezes returned component", () => {
      const result = html("test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("markdown()", () => {
    it("creates markdown component", () => {
      const result = markdown("# Hello");

      expect(result.type).toBe("markdown");
      expect(result.props).toEqual({ content: "# Hello" });
    });

    it("freezes returned component", () => {
      const result = markdown("test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("title()", () => {
    it("creates title component with text only", () => {
      const result = title("My Title");

      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title" });
    });

    it("creates title component with size", () => {
      const result = title("My Title", "large");

      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title", size: "large" });
    });

    it("omits size if undefined", () => {
      const result = title("My Title", undefined);

      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title" });
      expect(result.props).not.toHaveProperty("size");
    });

    it("freezes returned component", () => {
      const result = title("test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("withId()", () => {
    it("adds id to component", () => {
      const comp = html("test");
      const result = withId("custom-id", comp);

      expect(result.id).toBe("custom-id");
      expect(result.type).toBe("html");
    });

    it("does not mutate original component", () => {
      const comp = html("test");
      const original = { ...comp };
      withId("custom-id", comp);

      expect(comp).toEqual(original);
      expect(comp.id).toBeUndefined();
    });

    it("freezes returned component", () => {
      const result = withId("test", html("a"));
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("withAccess()", () => {
    it("adds access control to component", () => {
      const comp = html("test");
      const access = { roles: ["admin"], permissions: ["read"] };
      const result = withAccess(access, comp);

      expect(result.access).toEqual(access);
      expect(result.type).toBe("html");
    });

    it("does not mutate original component", () => {
      const comp = html("test");
      const original = { ...comp };
      const access = { roles: ["admin"] };
      withAccess(access, comp);

      expect(comp).toEqual(original);
      expect(comp.access).toBeUndefined();
    });

    it("freezes returned component", () => {
      const result = withAccess({ roles: ["admin"] }, html("a"));
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("withStyle()", () => {
    it("adds style to component", () => {
      const comp = html("test");
      const style = { color: "red", fontSize: "16px" };
      const result = withStyle(style, comp);

      expect(result.style).toEqual(style);
      expect(result.type).toBe("html");
    });

    it("does not mutate original component", () => {
      const comp = html("test");
      const original = { ...comp };
      const style = { color: "red" };
      withStyle(style, comp);

      expect(comp).toEqual(original);
      expect(comp.style).toBeUndefined();
    });

    it("freezes returned component and style", () => {
      const result = withStyle({ color: "red" }, html("a"));
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.style)).toBe(true);
    });
  });

  describe("grid() ID determinism", () => {
    it("produces different grid IDs across calls (incremental counter)", () => {
      const grid1 = grid(2, at(0, 0, 6, 1, html("a")), at(6, 0, 6, 1, html("b")));
      const grid2 = grid(2, at(0, 0, 6, 1, html("a")), at(6, 0, 6, 1, html("b")));

      // Each grid call gets a unique ID from the counter
      expect(grid1.id).toBeTruthy();
      expect(grid2.id).toBeTruthy();
      expect(grid1.id).not.toBe(grid2.id);

      // Items without withId() don't get auto-assigned IDs
      expect(grid1.items?.[0]?.component.id).toBeUndefined();
      expect(grid1.items?.[1]?.component.id).toBeUndefined();
      expect(grid2.items?.[0]?.component.id).toBeUndefined();
      expect(grid2.items?.[1]?.component.id).toBeUndefined();
    });
  });

  describe("grid — component IDs", () => {
    it("grid items without withId have component.id undefined", () => {
      const g = grid(12,
        at(0, 0, 6, 1, { type: "bar-chart", props: { lookup: { dataSetId: "x", operations: [] } } }),
      );
      const item = g.items![0]!;
      expect(item.component.id).toBeUndefined();
    });

    it("grid items with withId preserve their ID", () => {
      const g = grid(12,
        at(0, 0, 6, 1, withId("my-chart", { type: "bar-chart", props: { lookup: { dataSetId: "x", operations: [] } } })),
      );
      const item = g.items![0]!;
      expect(item.component.id).toBe("my-chart");
    });

    it("grid container itself gets auto-ID", () => {
      const g = grid(12, at(0, 0, 6, 1, { type: "bar-chart" }));
      expect(g.id).toBeDefined();
      expect(g.id).toMatch(/^grid_/);
    });
  });

  describe("bind()", () => {
    function stubSource(): DataSource {
      return {
        connect(_sink: DataSink): void { /* no-op */ },
        disconnect(): void { /* no-op */ },
      };
    }

    it("creates a DataSourceBinding with id and source", () => {
      const source = stubSource();
      const binding = bind("patients", source);

      expect(binding.id).toBe("patients");
      expect(binding.source).toBe(source);
      expect(binding.keyColumn).toBeUndefined();
    });

    it("includes keyColumn when provided", () => {
      const source = stubSource();
      const binding = bind("patients", source, { keyColumn: "patient_id" });

      expect(binding.id).toBe("patients");
      expect(binding.source).toBe(source);
      expect(binding.keyColumn).toBe("patient_id");
    });

    it("omits keyColumn when not provided", () => {
      const source = stubSource();
      const binding = bind("patients", source);

      expect(binding).not.toHaveProperty("keyColumn");
    });

    it("returns a frozen object", () => {
      const source = stubSource();
      const binding = bind("patients", source);

      expect(Object.isFrozen(binding)).toBe(true);
    });

    it("works in page() PageOptions datasets", () => {
      const source = stubSource();
      const p = page("Test",
        html("content"),
        {
          datasets: [bind("ds1", source)],
        },
      );

      expect(p.type).toBe("page");
      expect(p.props).toHaveProperty("datasets");
      const datasets = (p.props as Record<string, unknown>).datasets as unknown[];
      expect(datasets).toHaveLength(1);
      expect((datasets[0] as { id: string }).id).toBe("ds1");
    });
  });

  describe("integration scenarios", () => {
    it("builds complex nested structure", () => {
      const dashboard = page(
        "Dashboard",
        tabs(
          [
            "Overview",
            grid(
              2,
              at(0, 0, 1, 1, panel("Metrics", html("metrics"))),
              at(1, 0, 1, 1, panel("Chart", markdown("# Chart")))
            ),
          ],
          [
            "Details",
            columns(
              [70, 30],
              [title("Main Content"), html("main")],
              [title("Sidebar"), html("side")]
            ),
          ]
        )
      );

      expect(dashboard.type).toBe("page");
      expect(dashboard.slots?.content).toHaveLength(1);
      expect(dashboard.slots?.content?.[0]!.type).toBe("tabs");
    });

    it("applies decorators in chain", () => {
      const comp = html("test");
      const decorated = withStyle(
        { color: "red" },
        withAccess({ roles: ["admin"] }, withId("my-id", comp))
      );

      expect(decorated.id).toBe("my-id");
      expect(decorated.access).toEqual({ roles: ["admin"] });
      expect(decorated.style).toEqual({ color: "red" });
      expect(comp).not.toBe(decorated); // Original unchanged
    });
  });

  describe("form input builders", () => {
    it("textInput creates input component", () => {
      const c = textInput({ field: "name", label: "Name" });
      expect(c.type).toBe("input");
      expect(c.props).toEqual({ field: "name", label: "Name" });
      expect(Object.isFrozen(c)).toBe(true);
    });

    it("numberInput creates number-input component", () => {
      const c = numberInput({ field: "age", min: 0, max: 120 });
      expect(c.type).toBe("number-input");
      expect(c.props).toEqual({ field: "age", min: 0, max: 120 });
    });

    it("dropdown creates select component with fixed options", () => {
      const c = dropdown({ field: "dept", options: { values: ["A", "B"] } });
      expect(c.type).toBe("select");
      expect(c.props).toEqual({ field: "dept", options: { values: ["A", "B"] } });
    });

    it("checkbox creates checkbox component", () => {
      const c = checkbox({ field: "active" });
      expect(c.type).toBe("checkbox");
    });

    it("datePicker creates date-picker component", () => {
      const c = datePicker({ field: "start", min: "2024-01-01" });
      expect(c.type).toBe("date-picker");
    });

    it("textarea creates textarea component", () => {
      const c = textarea({ field: "notes", rows: 5 });
      expect(c.type).toBe("textarea");
    });
  });

  describe("page() with dataScope and save", () => {
    it("accepts dataScope and save in PageOptions", () => {
      const ds = dataSetId("employees");
      const p = page("Form",
        textInput({ field: "name" }),
        {
          dataScope: { dataset: ds, idColumn: "id" },
          save: { trigger: "auto", delay: 2000, adapter: "local" },
        },
      );
      expect(p.type).toBe("page");
      const props = getProps(p, "page");
      expect(props.dataScope!.dataset).toBe(ds);
      expect(props.save!.trigger).toBe("auto");
      expect(p.slots!.content).toHaveLength(1);
    });

    it("detects PageOptions with only dataScope (no datasets/settings/properties)", () => {
      const ds = dataSetId("emps");
      const p = page("Form",
        textInput({ field: "name" }),
        { dataScope: { dataset: ds, idColumn: "id" }, save: { adapter: "local" } },
      );
      const props = getProps(p, "page");
      expect(props.dataScope).toBeDefined();
      expect(p.slots!.content).toHaveLength(1);
    });
  });

  describe("typed builder outputs", () => {
    it("grid() returns typed component with accessible props", () => {
      const g = grid(12);
      // This should compile without 'as any' — g.props is GridProps
      expect(g.props?.columns).toBe(12);
      expect(g.type).toBe("grid");
    });

    it("columns() returns typed component with accessible props", () => {
      const c = columns([60, 40], [html("a")], [html("b")]);
      // This should compile without 'as any' — c.props is ColumnsProps
      expect(c.props?.distribution).toEqual([60, 40]);
      expect(c.type).toBe("columns");
    });
  });

  describe("split builder", () => {
    it("creates a split component with numbered slots", () => {
      const child1: Component = { type: "html", props: { content: "A" } };
      const child2: Component = { type: "html", props: { content: "B" } };
      const result = split("horizontal", [child1, child2], { ratio: [60, 40] });
      expect(result.type).toBe("split");
      expect(result.props).toEqual({ direction: "horizontal", ratio: [60, 40] });
      expect(result.slots?.["0"]).toEqual([child1]);
      expect(result.slots?.["1"]).toEqual([child2]);
    });

    it("defaults minSizes to undefined", () => {
      const result = split("vertical", [{ type: "html", props: { content: "A" } }]);
      expect(result.props).toEqual({ direction: "vertical" });
    });
  });

  describe("dockBar builder", () => {
    it("creates a dock-bar component", () => {
      const result = dockBar("vertical", [
        { icon: "📁", label: "Explorer", panelId: "explorer" },
      ]);
      expect(result.type).toBe("dock-bar");
      expect(result.props).toEqual({
        orientation: "vertical",
        items: [{ icon: "📁", label: "Explorer", panelId: "explorer" }],
      });
    });
  });

  describe("hostPanel builder", () => {
    it("creates a host-panel component", () => {
      const result = hostPanel("diff-viewer", { pathA: "a.md" });
      expect(result.type).toBe("host-panel");
      expect(result.props).toEqual({ typeName: "diff-viewer", panelProps: { pathA: "a.md" } });
    });

    it("works without props", () => {
      const result = hostPanel("gauge");
      expect(result.props).toEqual({ typeName: "gauge" });
    });
  });

  describe("removed exports", () => {
    it("appGrid is no longer exported", async () => {
      const module = await import("./index.js");
      expect("appGrid" in module).toBe(false);
    });

    it("dataset is no longer exported (replaced by bind)", async () => {
      const module = await import("./index.js");
      expect("dataset" in module).toBe(false);
    });

    it("inlineDataset is no longer exported (replaced by bind + inlineSource)", async () => {
      const module = await import("./index.js");
      expect("inlineDataset" in module).toBe(false);
    });
  });
});

describe("deferred builder", () => {
  it("wraps child in deferred type with default slot", () => {
    const child = html("content");
    const result = deferred(child);
    expect(result.type).toBe("deferred");
    expect(result.slots?.default).toHaveLength(1);
    expect(result.slots?.default?.[0]).toEqual(child);
  });
});

describe("dockWorkbench builder", () => {
  function findById(c: Component, id: string): Component | undefined {
    if (c.id === id) return c;
    for (const children of Object.values(c.slots ?? {})) {
      for (const child of children) {
        const found = findById(child, id);
        if (found) return found;
      }
    }
    if (c.items) {
      for (const item of c.items) {
        const found = findById(item.component, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  function collectTypes(c: Component): string[] {
    const types = [c.type];
    for (const children of Object.values(c.slots ?? {})) {
      for (const child of children) types.push(...collectTypes(child));
    }
    if (c.items) {
      for (const item of c.items) types.push(...collectTypes(item.component));
    }
    return types;
  }

  it("generates zone-aware tree for left + centre + bottom config", () => {
    const result = dockWorkbench({
      storageKey: "test-wb",
      centre: html("centre"),
      left: [
        { key: "inbox", label: "Inbox", icon: "📥", defaultOpen: true, content: hostPanel("inbox-panel") },
        { key: "cases", label: "Cases", icon: "📋", content: hostPanel("cases-panel") },
      ],
      bottom: [
        { key: "chat", label: "Chat", icon: "💬", content: hostPanel("chat-panel") },
      ],
    });

    const inbox = findById(result, "inbox");
    expect(inbox).toBeTruthy();
    expect(inbox!.style?.display).toBe("none");
    expect(inbox!.type).toBe("deferred");

    const cases = findById(result, "cases");
    expect(cases).toBeTruthy();
    expect(cases!.style?.display).toBe("none");

    // Zone containers have __zone: IDs
    expect(findById(result, "__zone:left-top")).toBeTruthy();
    expect(findById(result, "__zone:bottom-left")).toBeTruthy();

    const types = collectTypes(result);
    // Side stripe dock-bar for left (includes bottom-zone buttons)
    expect(types.filter(t => t === "dock-bar").length).toBe(1);
    expect(types.filter(t => t === "split").length).toBeGreaterThanOrEqual(1);

    // Config is attached for auto-detection in loadSite
    expect((result.props as Record<string, unknown>).__dockConfig).toBeTruthy();
  });

  it("generates simple tree for centre-only config", () => {
    const result = dockWorkbench({
      centre: html("just centre"),
    });
    // Centre-only wraps with flex styling but keeps the html type
    expect(result.type).toBe("html");
  });

  function findSplit(c: Component, direction: "horizontal" | "vertical"): Component | undefined {
    if (c.type === "split" && (c.props as { direction?: string })?.direction === direction) return c;
    for (const children of Object.values(c.slots ?? {})) {
      for (const child of children) {
        const found = findSplit(child, direction);
        if (found) return found;
      }
    }
    if (c.items) {
      for (const item of c.items) {
        const found = findSplit(item.component, direction);
        if (found) return found;
      }
    }
    return undefined;
  }

  it("horizontal split gives centre more flex than side panels (left + centre + right)", () => {
    const result = dockWorkbench({
      centre: html("centre"),
      left: [{ key: "explorer", label: "Explorer", icon: "📁", content: html("left") }],
      right: [{ key: "props", label: "Properties", icon: "⚙", content: html("right") }],
    });

    const hSplit = findSplit(result, "horizontal");
    expect(hSplit).toBeTruthy();
    const ratio = (hSplit!.props as { ratio?: number[] }).ratio;
    expect(ratio).toBeDefined();
    expect(ratio).toHaveLength(3);
    expect(ratio![1]).toBeGreaterThan(ratio![0]!);
    expect(ratio![1]).toBeGreaterThan(ratio![2]!);
  });

  it("horizontal split gives centre more flex than side panel (left + centre only)", () => {
    const result = dockWorkbench({
      centre: html("centre"),
      left: [{ key: "explorer", label: "Explorer", icon: "📁", content: html("left") }],
    });

    const hSplit = findSplit(result, "horizontal");
    expect(hSplit).toBeTruthy();
    const ratio = (hSplit!.props as { ratio?: number[] }).ratio;
    expect(ratio).toBeDefined();
    expect(ratio).toHaveLength(2);
    expect(ratio![1]).toBeGreaterThan(ratio![0]!);
  });

  it("omits right dock bar when no right panels", () => {
    const result = dockWorkbench({
      centre: html("c"),
      left: [{ key: "a", label: "A", icon: "a", content: html("a") }],
    });
    const barCount = collectTypes(result).filter(t => t === "dock-bar").length;
    expect(barCount).toBe(1);
  });

  describe("serverPaginated()", () => {
    it("returns config with defaults", () => {
      const config = serverPaginated();
      expect(config.offsetParam).toBe("offset");
      expect(config.limitParam).toBe("limit");
      expect(config.defaultPageSize).toBe(25);
      expect(config.maxCachedPages).toBe(5);
      expect(config.sortParam).toBeUndefined();
      expect(config.orderParam).toBeUndefined();
      expect(config.filterParam).toBeUndefined();
    });

    it("accepts custom param names", () => {
      const config = serverPaginated({
        offsetParam: "skip",
        limitParam: "take",
        sortParam: "sortBy",
        orderParam: "dir",
        defaultPageSize: 50,
        maxCachedPages: 10,
      });
      expect(config.offsetParam).toBe("skip");
      expect(config.limitParam).toBe("take");
      expect(config.sortParam).toBe("sortBy");
      expect(config.orderParam).toBe("dir");
      expect(config.defaultPageSize).toBe(50);
      expect(config.maxCachedPages).toBe(10);
    });
  });

  describe("floatingWorkspace", () => {
    it("creates floating-workspace component with centre", () => {
      const result = floatingWorkspace({
        centre: { type: "html" as const, props: { content: "<div>main</div>" } },
      });
      expect(result.type).toBe("floating-workspace");
      expect(result.props?.centre).toBeDefined();
      expect(result.props?.organisers).toBe(true);
    });

    it("includes frames in props", () => {
      const result = floatingWorkspace({
        centre: { type: "html" as const, props: { content: "" } },
        frames: [{ key: "f1", tabs: [{ key: "t1", label: "Tab", content: { type: "html" as const, props: { content: "x" } } }] }],
      });
      expect(result.props?.frames).toHaveLength(1);
      expect(result.props?.frames?.[0]?.key).toBe("f1");
    });

    it("respects organisers: false", () => {
      const result = floatingWorkspace({
        centre: { type: "html" as const, props: { content: "" } },
        organisers: false,
      });
      expect(result.props?.organisers).toBe(false);
    });

    it("passes viewMode through on frame config", () => {
      const result = floatingWorkspace({
        centre: { type: "html" as const, props: { content: "" } },
        frames: [{
          key: "f1",
          viewMode: "accordion" as const,
          tabs: [{ key: "t1", label: "Tab", content: { type: "html" as const, props: { content: "x" } } }],
        }],
      });
      expect(result.props!.frames![0]!.viewMode).toBe("accordion");
    });
  });

  describe("heatmapChart()", () => {
    it("creates heatmap-chart component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, minColor: "#313695" };
      const result = heatmapChart(props as any);
      expect(result.type).toBe("heatmap-chart");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = heatmapChart({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("treemapChart()", () => {
    it("creates treemap-chart component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, parentColumn: "parent" };
      const result = treemapChart(props as any);
      expect(result.type).toBe("treemap-chart");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = treemapChart({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("densityHeatmap()", () => {
    it("creates density-heatmap component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, radius: 25 };
      const result = densityHeatmap(props as any);
      expect(result.type).toBe("density-heatmap");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = densityHeatmap({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("badge()", () => {
    it("creates badge component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, column: "status" };
      const result = badge(props as any);
      expect(result.type).toBe("badge");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = badge({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("countdown()", () => {
    it("creates countdown component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, format: "compact" };
      const result = countdown(props as any);
      expect(result.type).toBe("countdown");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = countdown({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("timeline()", () => {
    it("creates timeline component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, startColumn: "begin" };
      const result = timeline(props as any);
      expect(result.type).toBe("timeline");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = timeline({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("graph()", () => {
    it("creates graph component with spread props", () => {
      const props = { lookup: { dataSetId: "test", operations: [] }, layout: "force" };
      const result = graph(props as any);
      expect(result.type).toBe("graph");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = graph({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("eventTimeline()", () => {
    it("creates event-timeline component with spread props", () => {
      const props = { lookup: { dataSetId: "events", operations: [] }, layout: "vertical" };
      const result = eventTimeline(props as any);
      expect(result.type).toBe("event-timeline");
      expect(result.props).toEqual(props);
      expect(result.props).not.toBe(props);
    });

    it("freezes returned component", () => {
      const result = eventTimeline({ lookup: { dataSetId: "t", operations: [] } } as any);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("masterDetail()", () => {
    it("creates a split with wired selection and selectionSource", () => {
      const master = dataTable({ lookup: { dataSetId: dataSetId("strategies"), operations: [] } });
      const detail = hostPanel("strategy-detail");
      const result = masterDetail({ master, detail });

      expect(result.type).toBe("split");
      const masterSlot = result.slots!["0"]![0]!;
      expect((masterSlot.props as any).selection).toBe("single");
      const detailSlot = result.slots!["1"]![0]!;
      expect((detailSlot.props as any).selectionSource).toBe("strategies");
    });

    it("respects custom direction and ratio", () => {
      const master = dataTable({ lookup: { dataSetId: dataSetId("s"), operations: [] } });
      const detail = hostPanel("d");
      const result = masterDetail({ master, detail, direction: "vertical", ratio: [30, 70] });

      expect(result.props!.direction).toBe("vertical");
    });

    it("defaults to horizontal direction", () => {
      const master = dataTable({ lookup: { dataSetId: dataSetId("s"), operations: [] } });
      const detail = hostPanel("d");
      const result = masterDetail({ master, detail });

      expect(result.props!.direction).toBe("horizontal");
    });

    it("freezes returned component", () => {
      const master = dataTable({ lookup: { dataSetId: dataSetId("s"), operations: [] } });
      const detail = hostPanel("d");
      const result = masterDetail({ master, detail });
      expect(Object.isFrozen(result)).toBe(true);
    });
  });
});
