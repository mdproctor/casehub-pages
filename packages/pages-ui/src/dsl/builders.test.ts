import { describe, it, expect } from "vitest";
import type { Component } from "../model/types.js";
import type { PageSettings } from "../model/page-types.js";
import { dataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import { getProps } from "../model/type-guards.js";
import {
  page,
  grid,
  at,
  columns,
  rows,
  stack,
  tabs,
  pills,
  sidebar,
  tree,
  menu,
  accordion,
  carousel,
  appGrid,
  panel,
  html,
  markdown,
  title,
  withId,
  withAccess,
  withStyle,
  dataset,
  inlineDataset,
  textInput,
  numberInput,
  dropdown,
  checkbox,
  datePicker,
  textarea,
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
      { name: "appGrid", builder: appGrid, expectedType: "app-grid" },
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

  describe("dataset()", () => {
    it("creates an ExternalDataSetDef with url", () => {
      const ds = dataset("sales", "http://api.example.com/sales");

      expect(ds.uuid).toBe("sales");
      expect(ds.url).toBe("http://api.example.com/sales");
    });

    it("accepts optional overrides", () => {
      const ds = dataset("sales", "http://api.example.com/sales", {
        dataPath: "data.items",
        refreshTime: "5s",
        cacheEnabled: true,
      });

      expect(ds.uuid).toBe("sales");
      expect(ds.url).toBe("http://api.example.com/sales");
      expect(ds.dataPath).toBe("data.items");
      expect(ds.refreshTime).toBe("5s");
      expect(ds.cacheEnabled).toBe(true);
    });

    it("returns a frozen object", () => {
      const ds = dataset("test", "http://example.com");
      expect(Object.isFrozen(ds)).toBe(true);
    });
  });

  describe("inlineDataset()", () => {
    it("creates an ExternalDataSetDef with content", () => {
      const ds = inlineDataset("local", '[{"a":1}]');

      expect(ds.uuid).toBe("local");
      expect(ds.content).toBe('[{"a":1}]');
      expect(ds.url).toBeUndefined();
    });

    it("accepts optional overrides", () => {
      const ds = inlineDataset("local", '{"data":[1,2]}', {
        dataPath: "data",
        expression: "$[0]",
      });

      expect(ds.dataPath).toBe("data");
      expect(ds.expression).toBe("$[0]");
    });

    it("returns a frozen object", () => {
      const ds = inlineDataset("test", "[]");
      expect(Object.isFrozen(ds)).toBe(true);
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
    it("textInput creates text-input component", () => {
      const c = textInput({ field: "name", label: "Name" });
      expect(c.type).toBe("text-input");
      expect(c.props).toEqual({ field: "name", label: "Name" });
      expect(Object.isFrozen(c)).toBe(true);
    });

    it("numberInput creates number-input component", () => {
      const c = numberInput({ field: "age", min: 0, max: 120 });
      expect(c.type).toBe("number-input");
      expect(c.props).toEqual({ field: "age", min: 0, max: 120 });
    });

    it("dropdown creates dropdown component with fixed options", () => {
      const c = dropdown({ field: "dept", options: { values: ["A", "B"] } });
      expect(c.type).toBe("dropdown");
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
});
