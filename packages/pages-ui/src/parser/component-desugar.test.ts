import { describe, it, expect } from "vitest";
import { desugarComponent } from "./component-desugar.js";

describe("desugarComponent", () => {
  describe("content shorthands", () => {
    it("html shorthand", () => {
      const result = desugarComponent({ html: "<h1>Hi</h1>" });
      expect(result.type).toBe("html");
      expect(result.props).toEqual({ content: "<h1>Hi</h1>" });
    });

    it("markdown shorthand", () => {
      const result = desugarComponent({ markdown: "# Title" });
      expect(result.type).toBe("markdown");
      expect(result.props).toEqual({ content: "# Title" });
    });

    it("title shorthand (without type key)", () => {
      const result = desugarComponent({ title: "Hello" });
      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "Hello" });
    });

    it("title shorthand with properties → style", () => {
      const result = desugarComponent({
        title: "Welcome",
        properties: { "font-size": "24px", color: "blue" },
      });
      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "Welcome" });
      expect(result.style).toEqual({ "font-size": "24px", color: "blue" });
    });
  });

  describe("navigation references", () => {
    it("screen shorthand → page-ref (transient)", () => {
      const result = desugarComponent({ screen: "Layout" });
      expect(result.type).toBe("page-ref");
      expect(result.props).toEqual({ name: "Layout" });
    });

    it("panel shorthand with page name", () => {
      const result = desugarComponent({ panel: "Layout" });
      expect(result.type).toBe("panel");
      expect(result.props).toEqual({ name: "Layout" });
    });

    it("div shorthand → slot-target (transient)", () => {
      const result = desugarComponent({ div: "my_div" });
      expect(result.type).toBe("slot-target");
      expect(result.props).toEqual({ id: "my_div" });
    });
  });

  describe("properties → style for content components", () => {
    it("html with properties", () => {
      const result = desugarComponent({
        html: "<p>text</p>",
        properties: { margin: "10px", "font-size": "large" },
      });
      expect(result.type).toBe("html");
      expect(result.style).toEqual({ margin: "10px", "font-size": "large" });
    });

    it("markdown with properties", () => {
      const result = desugarComponent({
        markdown: "## Heading",
        properties: { padding: "20px" },
      });
      expect(result.type).toBe("markdown");
      expect(result.style).toEqual({ padding: "20px" });
    });

    it("no properties → no style", () => {
      const result = desugarComponent({ html: "<div>test</div>" });
      expect(result.style).toBeUndefined();
    });
  });

  describe("displayer components", () => {
    it("displayer object → dispatches to displayer desugar", () => {
      const result = desugarComponent({
        displayer: { type: "BARCHART", lookup: { uuid: "sales" } },
      });
      expect(result.type).toBe("bar-chart");
      expect(result.props).toHaveProperty("lookup");
    });

    it("displayer with outer properties → style on component", () => {
      const result = desugarComponent({
        properties: { float: "left", width: "50%" },
        displayer: {
          type: "METERCHART",
          lookup: { uuid: "data" },
          meter: { end: "100" },
        },
      });
      expect(result.type).toBe("meter");
      expect(result.props).toHaveProperty("lookup");
      expect(result.props).toHaveProperty("end");
      expect(result.style).toEqual({ float: "left", width: "50%" });
    });

    it("displayer with type only", () => {
      const result = desugarComponent({
        displayer: { type: "TABLE" },
      });
      expect(result.type).toBe("data-table");
    });
  });

  describe("navigation components", () => {
    it("type: TABS with navGroupId", () => {
      const result = desugarComponent({
        type: "TABS",
        properties: {
          width: "100%",
          navGroupId: "Metrics",
          targetDivId: "Metrics_Div",
        },
      });
      expect(result.type).toBe("tabs");
      expect(result.props).toEqual({
        width: "100%",
        navGroupId: "Metrics",
        targetDivId: "Metrics_Div",
      });
    });

    it("type: PILLS", () => {
      const result = desugarComponent({
        type: "PILLS",
        properties: { navGroupId: "nav1" },
      });
      expect(result.type).toBe("pills");
      expect(result.props).toEqual({ navGroupId: "nav1" });
    });

    it("type: TREE", () => {
      const result = desugarComponent({
        type: "TREE",
        properties: {
          width: "180px",
          navGroupId: "Displayers",
          targetDivId: "nav_div",
        },
      });
      expect(result.type).toBe("tree");
      expect(result.props).toEqual({
        width: "180px",
        navGroupId: "Displayers",
        targetDivId: "nav_div",
      });
    });

    it("type: MENU", () => {
      const result = desugarComponent({
        type: "MENU",
        properties: { navGroupId: "main" },
      });
      expect(result.type).toBe("menu");
      expect(result.props).toEqual({ navGroupId: "main" });
    });

    it("type: CAROUSEL", () => {
      const result = desugarComponent({
        type: "CAROUSEL",
        properties: { navGroupId: "Displayers" },
      });
      expect(result.type).toBe("carousel");
      expect(result.props).toEqual({ navGroupId: "Displayers" });
    });

    it("type: TILES", () => {
      const result = desugarComponent({
        type: "TILES",
        properties: { navGroupId: "apps" },
      });
      expect(result.type).toBe("tiles");
      expect(result.props).toEqual({ navGroupId: "apps" });
    });

    it("type: SIDEBAR", () => {
      const result = desugarComponent({
        type: "SIDEBAR",
        properties: { navGroupId: "main" },
      });
      expect(result.type).toBe("sidebar");
      expect(result.props).toEqual({ navGroupId: "main" });
    });

    it("type: ACCORDION", () => {
      const result = desugarComponent({
        type: "ACCORDION",
        properties: { navGroupId: "g1" },
      });
      expect(result.type).toBe("accordion");
      expect(result.props).toEqual({ navGroupId: "g1" });
    });

    it("navigation type without properties", () => {
      const result = desugarComponent({ type: "TABS" });
      expect(result.type).toBe("tabs");
      expect(result.props).toBeUndefined();
    });
  });

  describe("workbench primitives", () => {
    it("split shorthand with direction and children", () => {
      const result = desugarComponent({
        split: {
          direction: "horizontal",
          children: [
            { html: "A" },
            { html: "B" },
          ],
          ratio: [60, 40],
        },
      });
      expect(result.type).toBe("split");
      expect(result.props).toEqual({ direction: "horizontal", ratio: [60, 40] });
      expect(result.slots?.["0"]).toHaveLength(1);
      expect(result.slots?.["0"]?.[0]?.type).toBe("html");
      expect(result.slots?.["1"]).toHaveLength(1);
      expect(result.slots?.["1"]?.[0]?.type).toBe("html");
    });

    it("split defaults direction to horizontal", () => {
      const result = desugarComponent({
        split: {
          children: [{ html: "A" }],
        },
      });
      expect(result.type).toBe("split");
      expect(result.props).toEqual({ direction: "horizontal" });
    });

    it("dock-bar shorthand", () => {
      const result = desugarComponent({
        "dock-bar": {
          orientation: "vertical",
          items: [
            { icon: "📁", label: "Explorer", panelId: "explorer" },
          ],
        },
      });
      expect(result.type).toBe("dock-bar");
      expect(result.props).toEqual({
        orientation: "vertical",
        items: [{ icon: "📁", label: "Explorer", panelId: "explorer" }],
      });
    });

    it("dock-bar defaults orientation to vertical", () => {
      const result = desugarComponent({
        "dock-bar": { items: [] },
      });
      expect(result.type).toBe("dock-bar");
      expect(result.props).toEqual({ orientation: "vertical", items: [] });
    });

    it("host-panel shorthand with props", () => {
      const result = desugarComponent({
        "host-panel": {
          type: "diff-viewer",
          props: { pathA: "a.md", pathB: "b.md" },
        },
      });
      expect(result.type).toBe("host-panel");
      expect(result.props).toEqual({
        typeName: "diff-viewer",
        panelProps: { pathA: "a.md", pathB: "b.md" },
      });
    });

    it("host-panel without props", () => {
      const result = desugarComponent({
        "host-panel": { type: "gauge" },
      });
      expect(result.type).toBe("host-panel");
      expect(result.props).toEqual({ typeName: "gauge" });
    });

    it("host-panel defaults typeName to empty string", () => {
      const result = desugarComponent({
        "host-panel": {},
      });
      expect(result.type).toBe("host-panel");
      expect(result.props).toEqual({ typeName: "" });
    });
  });

  describe("external components", () => {
    it("type: EXTERNAL → iframe-plugin", () => {
      const result = desugarComponent({
        type: "EXTERNAL",
        properties: {
          componentId: "uniforms",
          height: "500px",
          "uniforms.url": "http://acme.com",
        },
      });
      expect(result.type).toBe("iframe-plugin");
      expect(result.props).toEqual({
        componentId: "uniforms",
        settings: { "uniforms.url": "http://acme.com" },
      });
    });

    it("EXTERNAL with only componentId", () => {
      const result = desugarComponent({
        type: "EXTERNAL",
        properties: { componentId: "myComponent", width: "100%" },
      });
      expect(result.type).toBe("iframe-plugin");
      expect(result.props).toEqual({
        componentId: "myComponent",
      });
      expect(result.props).not.toHaveProperty("settings");
    });

    it("EXTERNAL with no properties", () => {
      const result = desugarComponent({
        type: "EXTERNAL",
      });
      expect(result.type).toBe("iframe-plugin");
      expect(result.props).toEqual({
        componentId: undefined,
      });
    });
  });

  describe("type: Displayer", () => {
    it("type: Displayer delegates to displayer desugar", () => {
      const result = desugarComponent({
        type: "Displayer",
        subtype: "COLUMN",
        lookup: { uuid: "data" },
      });
      // desugarDisplayer with type: Displayer should map to table (default)
      // but we're passing it the raw object, so it depends on implementation
      expect(result.type).toBe("data-table");
    });

    it("type: displayer (lowercase)", () => {
      const result = desugarComponent({
        type: "displayer",
        lookup: { uuid: "data" },
      });
      expect(result.type).toBe("data-table");
    });
  });

  describe("unknown components", () => {
    it("unknown type → generic wrapper", () => {
      const result = desugarComponent({
        type: "CUSTOM",
        someKey: "value",
      });
      expect(result.type).toBe("unknown");
      expect(result.props).toEqual({
        type: "CUSTOM",
        someKey: "value",
      });
    });

    it("empty object → unknown", () => {
      const result = desugarComponent({});
      expect(result.type).toBe("unknown");
      expect(result.props).toEqual({});
    });
  });

  describe("edge cases", () => {
    it("component with both title and type (type wins, title ignored)", () => {
      const result = desugarComponent({
        title: "My Title",
        type: "TABS",
        properties: { navGroupId: "nav1" },
      });
      // title shorthand check is bypassed when type exists
      expect(result.type).toBe("tabs");
    });

    it("properties with non-string values convert to strings for style", () => {
      const result = desugarComponent({
        html: "<p>text</p>",
        properties: { width: 100, height: 50, visible: true },
      });
      expect(result.style).toEqual({
        width: "100",
        height: "50",
        visible: "true",
      });
    });

    it("properties with null/undefined values are skipped", () => {
      const result = desugarComponent({
        html: "<p>text</p>",
        properties: { margin: "10px", padding: null, border: undefined },
      });
      expect(result.style).toEqual({ margin: "10px" });
    });
  });

  describe("displayer defaults merging", () => {
    it("handles null displayer with global defaults", () => {
      const defaults = { chart: { resizable: true }, lookup: { uuid: "global" } };
      const result = desugarComponent({ displayer: null }, defaults);
      expect(result.type).toBe("data-table"); // defaults to table
      expect(result.props?.["resizable"]).toBe(true);
    });

    it("handles empty displayer with global defaults", () => {
      const defaults = { type: "BARCHART", lookup: { uuid: "ds" } };
      const result = desugarComponent({ displayer: {} }, defaults);
      expect(result.type).toBe("bar-chart");
    });

    it("merges displayer defaults with component-level overrides", () => {
      const defaults = { chart: { resizable: true, height: 200 }, lookup: { uuid: "ds" } };
      const result = desugarComponent(
        { displayer: { type: "LINECHART", chart: { height: 400 } } },
        defaults,
      );
      expect(result.type).toBe("line-chart");
      expect(result.props?.["resizable"]).toBe(true);
      expect(result.props?.["height"]).toBe(400); // override wins
    });

    it("component without displayer ignores defaults", () => {
      const defaults = { type: "BARCHART" };
      const result = desugarComponent({ html: "<p>Hello</p>" }, defaults);
      expect(result.type).toBe("html");
    });
  });

  describe("modern type: + properties: format", () => {
    it("type: bar-chart with properties routes through displayer desugar", () => {
      const result = desugarComponent({
        type: "bar-chart",
        properties: {
          title: "Revenue",
          lookup: { uuid: "sales" },
        },
      });
      expect(result.type).toBe("bar-chart");
      expect(result.props?.["title"]).toBe("Revenue");
    });

    it("type: table with properties normalizes lookup uuid to dataSetId", () => {
      const result = desugarComponent({
        type: "table",
        properties: {
          lookup: { uuid: "employees" },
        },
      });
      expect(result.type).toBe("data-table");
      const lookup = result.props?.["lookup"] as { dataSetId: string } | undefined;
      expect(lookup?.dataSetId).toBe("employees");
    });

    it("type: metric with lookup and filter", () => {
      const result = desugarComponent({
        type: "metric",
        properties: {
          title: "Total",
          lookup: {
            uuid: "data",
            filter: [{ column: "status", function: "EQUALS_TO", args: ["active"] }],
          },
        },
      });
      expect(result.type).toBe("metric");
      expect(result.props?.["title"]).toBe("Total");
      const lookup = result.props?.["lookup"] as { dataSetId: string; operations: unknown[] };
      expect(lookup.dataSetId).toBe("data");
      expect(lookup.operations.length).toBeGreaterThan(0);
    });

    it("type: selector with subtype", () => {
      const result = desugarComponent({
        type: "selector",
        properties: {
          subtype: "labels",
          lookup: { uuid: "data" },
        },
      });
      expect(result.type).toBe("selector");
      expect(result.props?.["subtype"]).toBe("labels");
    });

    it("legacy uppercase type: BARCHART maps to bar-chart", () => {
      const result = desugarComponent({
        type: "BARCHART",
        properties: {
          lookup: { uuid: "data" },
        },
      });
      expect(result.type).toBe("bar-chart");
    });

    it("preserves visibleWhen on modern data components", () => {
      const result = desugarComponent({
        type: "bar-chart",
        properties: { lookup: { uuid: "data" } },
        visibleWhen: "#{filter.active}",
      });
      expect(result.visibleWhen).toBe("#{filter.active}");
    });

    it("type: grouped-view routes through grouped-view desugar", () => {
      const result = desugarComponent({
        type: "grouped-view",
        properties: {
          groupBy: { column: "dept" },
          preset: "sectioned",
          lookup: { uuid: "team" },
        },
      });
      expect(result.type).toBe("grouped-view");
      const groupBy = (result.props as Record<string, unknown>)?.groupBy as Record<string, unknown>;
      expect(groupBy.columnId).toBe("dept");
      expect(groupBy.strategy).toEqual({ mode: "distinct" });
    });
  });

  describe("case-insensitive navigation types", () => {
    it("lowercase type: tabs", () => {
      const result = desugarComponent({
        type: "tabs",
        properties: { navGroupId: "MainNav" },
      });
      expect(result.type).toBe("tabs");
      expect(result.props).toEqual({ navGroupId: "MainNav" });
    });

    it("lowercase type: sidebar", () => {
      const result = desugarComponent({
        type: "sidebar",
        properties: { navGroupId: "SideNav" },
      });
      expect(result.type).toBe("sidebar");
    });

    it("lowercase type: accordion", () => {
      const result = desugarComponent({
        type: "accordion",
        properties: { targetPage: true },
      });
      expect(result.type).toBe("accordion");
    });

    it("lowercase type: pills", () => {
      const result = desugarComponent({ type: "pills" });
      expect(result.type).toBe("pills");
    });

    it("lowercase type: carousel", () => {
      const result = desugarComponent({ type: "carousel" });
      expect(result.type).toBe("carousel");
    });
  });

  describe("inline slot building for navigation types", () => {
    it("type: tabs with inline tabs content builds slots", () => {
      const result = desugarComponent({
        type: "tabs",
        properties: { targetPage: true },
        tabs: {
          "Tab A": { components: [{ html: "Content A" }] },
          "Tab B": { components: [{ html: "Content B" }] },
        },
      });
      expect(result.type).toBe("tabs");
      expect(result.slots).toBeDefined();
      expect(result.slots?.["Tab A"]).toHaveLength(1);
      expect(result.slots?.["Tab A"]?.[0]?.type).toBe("html");
      expect(result.slots?.["Tab B"]).toHaveLength(1);
      expect(result.slots?.["Tab B"]?.[0]?.type).toBe("html");
    });

    it("type: accordion with inline sections builds slots", () => {
      const result = desugarComponent({
        type: "accordion",
        sections: {
          "Section 1": { components: [{ markdown: "# S1" }] },
          "Section 2": { components: [{ markdown: "# S2" }] },
        },
      });
      expect(result.type).toBe("accordion");
      expect(result.slots?.["Section 1"]).toHaveLength(1);
      expect(result.slots?.["Section 2"]).toHaveLength(1);
    });

    it("type: tabs preserves visibleWhen alongside slots", () => {
      const result = desugarComponent({
        type: "tabs",
        visibleWhen: "#{active}",
        tabs: {
          Only: { components: [{ html: "X" }] },
        },
      });
      expect(result.visibleWhen).toBe("#{active}");
      expect(result.slots?.["Only"]).toHaveLength(1);
    });

    it("nav type without slots omits slots property", () => {
      const result = desugarComponent({
        type: "tabs",
        properties: { navGroupId: "Nav1" },
      });
      expect(result.slots).toBeUndefined();
    });

    it("recursively desugars child components in slots", () => {
      const result = desugarComponent({
        type: "tabs",
        tabs: {
          Charts: {
            components: [
              { type: "bar-chart", properties: { lookup: { uuid: "d" } } },
            ],
          },
        },
      });
      const child = result.slots?.["Charts"]?.[0];
      expect(child?.type).toBe("bar-chart");
    });
  });

  describe("modern content type handlers", () => {
    it("type: html with properties.content", () => {
      const result = desugarComponent({
        type: "html",
        properties: { content: "<p>Hello</p>" },
      });
      expect(result.type).toBe("html");
      expect(result.props).toEqual({ content: "<p>Hello</p>" });
    });

    it("type: HTML with legacy HTML_CODE still works", () => {
      const result = desugarComponent({
        type: "HTML",
        properties: { HTML_CODE: "Legacy content" },
      });
      expect(result.type).toBe("html");
      expect(result.props).toEqual({ content: "Legacy content" });
    });

    it("type: html prefers HTML_CODE over content for backward compat", () => {
      const result = desugarComponent({
        type: "html",
        properties: { HTML_CODE: "Legacy", content: "Modern" },
      });
      expect(result.props?.["content"]).toBe("Legacy");
    });

    it("type: html extracts CSS properties to style", () => {
      const result = desugarComponent({
        type: "html",
        properties: { content: "<p>text</p>", "font-size": "large" },
      });
      expect(result.props).toEqual({ content: "<p>text</p>" });
      expect(result.style).toEqual({ "font-size": "large" });
    });

    it("type: markdown with properties.content", () => {
      const result = desugarComponent({
        type: "markdown",
        properties: { content: "# Heading" },
      });
      expect(result.type).toBe("markdown");
      expect(result.props).toEqual({ content: "# Heading" });
    });

    it("type: title with properties.text and size", () => {
      const result = desugarComponent({
        type: "title",
        properties: { text: "My Title", size: "h2" },
      });
      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title", size: "h2" });
    });

    it("type: title with no text defaults to empty", () => {
      const result = desugarComponent({
        type: "title",
        properties: {},
      });
      expect(result.type).toBe("title");
      expect(result.props?.["text"]).toBe("");
    });
  });

  describe("container styling for data components", () => {
    it("extracts style key for data components", () => {
      const result = desugarComponent({
        type: "table",
        style: {
          border: "1px solid #ccc",
          borderRadius: "8px",
        },
        properties: {
          lookup: { uuid: "data" },
        },
      });
      expect(result.style).toEqual({
        border: "1px solid #ccc",
        borderRadius: "8px",
      });
      expect(result.props?.["lookup"]).toBeDefined();
    });

    it("data component without style key has no style", () => {
      const result = desugarComponent({
        type: "table",
        properties: {
          lookup: { uuid: "data" },
        },
      });
      expect(result.style).toBeUndefined();
    });

    it("style key works for grouped-view", () => {
      const result = desugarComponent({
        type: "grouped-view",
        style: {
          padding: "16px",
        },
        properties: {
          groupBy: { column: "dept" },
          lookup: { uuid: "data" },
        },
      });
      expect(result.style).toEqual({ padding: "16px" });
    });
  });
});
