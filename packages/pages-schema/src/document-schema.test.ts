import { describe, it, expect } from "vitest";
import { componentSchema, dashboardSchema } from "./document-schema.js";

describe("componentSchema", () => {
  it("validates a bar-chart component", () => {
    const result = componentSchema.parse({
      type: "bar-chart",
      properties: {
        lookup: { uuid: "ds-1" },
        subtype: "column",
      },
    });
    expect(result.type).toBe("bar-chart");
  });

  it("validates a data-table with id and style", () => {
    const result = componentSchema.parse({
      type: "data-table",
      id: "my-table",
      style: { "margin-top": "1rem" },
      properties: {
        lookup: { uuid: "ds-1" },
        pageSize: 25,
      },
    });
    expect(result.id).toBe("my-table");
  });

  it("validates a simple layout component", () => {
    const result = componentSchema.parse({
      type: "rows",
    });
    expect(result.type).toBe("rows");
  });

  it("validates a title component", () => {
    const result = componentSchema.parse({
      type: "title",
      properties: { text: "Hello", size: "h2" },
    });
    expect(result.type).toBe("title");
  });

  it("validates a form input component", () => {
    const result = componentSchema.parse({
      type: "input",
      properties: { field: "name", placeholder: "Enter name" },
    });
    expect(result.type).toBe("input");
  });

  it("validates component with visibleWhen", () => {
    const result = componentSchema.parse({
      type: "metric",
      visibleWhen: "showMetrics == true",
      properties: { lookup: { uuid: "ds-1" } },
    });
    expect(result.visibleWhen).toBe("showMetrics == true");
  });

  it("rejects unknown component type", () => {
    expect(() => componentSchema.parse({
      type: "nonexistent-widget",
    })).toThrow();
  });

  it("validates all 55 type literals", () => {
    const types = [
      "grid", "columns", "rows", "stack", "tabs", "pills", "sidebar",
      "tree", "menu", "accordion", "carousel", "split", "dock-bar",
      "host-panel", "floating-workspace", "panel", "html", "markdown",
      "title", "lazy-page", "page", "bar-chart", "line-chart",
      "area-chart", "pie-chart", "scatter-chart", "bubble-chart",
      "timeseries", "heatmap-chart", "treemap-chart", "density-heatmap",
      "metric-grid", "data-table", "grid-table", "metric", "meter",
      "selector", "map", "badge", "countdown", "timeline", "graph",
      "event-timeline", "grouped-view", "iframe-plugin", "input",
      "number-input", "select", "checkbox", "date-picker", "textarea",
      "schema-form", "action-button", "form-scope", "submit-button",
    ];
    for (const type of types) {
      expect(() => componentSchema.parse({ type }), `type "${type}" should be valid`).not.toThrow();
    }
    expect(types).toHaveLength(55);
  });
});

describe("dashboardSchema", () => {
  it("validates a complete dashboard", () => {
    const result = dashboardSchema.parse({
      pages: [{
        name: "Overview",
        components: [
          { type: "title", properties: { text: "Dashboard" } },
          { type: "bar-chart", properties: { lookup: { uuid: "ds-1" } } },
        ],
      }],
      datasets: [{ uuid: "ds-1", url: "https://api.example.com/data" }],
      properties: { theme: "dark" },
    });
    expect(result.pages).toHaveLength(1);
  });

  it("validates empty dashboard", () => {
    expect(() => dashboardSchema.parse({})).not.toThrow();
  });

  it("validates dashboard with navTree", () => {
    const result = dashboardSchema.parse({
      navTree: {
        root_items: [
          { type: "GROUP", id: "admin", children: [{ type: "ITEM", page: "users" }] },
        ],
      },
    });
    expect(result.navTree?.root_items).toHaveLength(1);
  });
});
