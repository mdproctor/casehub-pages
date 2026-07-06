import { describe, it, expect } from "vitest";
import type { Component, GridItem, LayoutState, PanelEntry } from "./types.js";
import { ALLOW_ALL } from "./types.js";
import type { TypedComponent } from "./index.js";
import type { BarChartProps } from "./displayer-types.js";
import { dataSetId } from "@casehubio/pages-data";

describe("Component", () => {
  it("represents a leaf component", () => {
    const c: Component = {
      type: "html",
      props: { content: "<h1>Hello</h1>" },
    };
    expect(c.type).toBe("html");
    expect(c.props).toEqual({ content: "<h1>Hello</h1>" });
  });

  it("represents a component with slots", () => {
    const child: Component = { type: "html", props: { content: "child" } };
    const parent: Component = {
      type: "tabs",
      slots: { "Tab 1": [child] },
    };
    expect(parent.slots!["Tab 1"]![0]).toBe(child);
  });

  it("represents a grid with items", () => {
    const chart: Component = { type: "bar-chart", props: {} };
    const item: GridItem = {
      placement: { x: 0, y: 0, w: 6, h: 2 },
      component: chart,
    };
    const grid: Component = {
      type: "grid",
      props: { columns: 12 },
      items: [item],
    };
    expect(grid.items![0]!.placement.w).toBe(6);
    expect(grid.items![0]!.component).toBe(chart);
  });

  it("supports optional id, style, and access", () => {
    const c: Component = {
      type: "panel",
      id: "admin-panel",
      props: { title: "Admin" },
      style: { margin: "10px", "background-color": "blue" },
      access: { roles: ["admin"] },
    };
    expect(c.id).toBe("admin-panel");
    expect(c.style!["margin"]).toBe("10px");
    expect(c.access!.roles).toEqual(["admin"]);
  });
});

describe("ALLOW_ALL", () => {
  it("grants all roles and permissions", () => {
    expect(ALLOW_ALL.hasRole("anything")).toBe(true);
    expect(ALLOW_ALL.hasPermission("anything")).toBe(true);
  });
});

describe("Component<T, P>", () => {
  it("accepts typed props without cast", () => {
    const c: Component<"bar-chart", BarChartProps> = {
      type: "bar-chart",
      props: { lookup: { dataSetId: dataSetId("ds"), operations: [] } },
    };
    expect(c.type).toBe("bar-chart");
    expect(c.props!.lookup.dataSetId).toBe("ds");
  });

  it("default generic accepts any type string", () => {
    const c: Component = { type: "anything" };
    expect(c.type).toBe("anything");
  });

  it("TypedComponent narrows both type and props", () => {
    const c: TypedComponent<"grid"> = {
      type: "grid",
      props: { columns: 12 },
    };
    expect(c.props?.columns).toBe(12);
  });

  it("rejects primitive P type parameter", () => {
    // @ts-expect-error — P must be an object type, not a primitive
    const _bad: Component<"foo", number> = { type: "foo" };
    expect(_bad.type).toBe("foo");
  });
});

describe("LayoutState type", () => {
  it("accepts valid layout state", () => {
    const state: LayoutState = {
      splits: { "main-split": [60, 40] },
      docks: { "debug-panel": false },
      panels: { "editor": { typeName: "diff-viewer", props: { pathA: "a.md" } } },
    };
    expect(state.splits["main-split"]).toEqual([60, 40]);
    expect(state.docks["debug-panel"]).toBe(false);
    expect(state.panels["editor"]!.typeName).toBe("diff-viewer");
  });

  it("accepts empty layout state", () => {
    const state: LayoutState = { splits: {}, docks: {}, panels: {} };
    expect(Object.keys(state.splits)).toHaveLength(0);
  });

  it("accepts panel entry without props", () => {
    const entry: PanelEntry = { typeName: "terminal" };
    expect(entry.props).toBeUndefined();
  });
});
