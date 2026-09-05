import { describe, it, expect } from "vitest";
import {
  barChartPropsSchema, lineChartPropsSchema, areaChartPropsSchema,
  pieChartPropsSchema, scatterChartPropsSchema, bubbleChartPropsSchema,
  timeseriesPropsSchema, heatmapChartPropsSchema, treemapChartPropsSchema,
  densityHeatmapPropsSchema, metricGridPropsSchema,
  dataTablePropsSchema, gridTablePropsSchema,
  metricPropsSchema, meterPropsSchema, selectorPropsSchema,
  mapPropsSchema, badgePropsSchema, countdownPropsSchema,
  timelinePropsSchema, graphPropsSchema, eventTimelinePropsSchema,
  groupedViewPropsSchema,
  gridPropsSchema, columnsPropsSchema, rowsPropsSchema, stackPropsSchema,
  tabsPropsSchema, pillsPropsSchema, sidebarPropsSchema, treePropsSchema,
  menuPropsSchema, accordionPropsSchema, carouselPropsSchema,
  splitPropsSchema, dockBarPropsSchema, hostPanelPropsSchema,
  floatingWorkspacePropsSchema,
  panelPropsSchema, htmlPropsSchema, markdownPropsSchema, titlePropsSchema,
  lazyPagePropsSchema, pagePropsSchema,
  textInputPropsSchema, numberInputPropsSchema, dropdownPropsSchema,
  checkboxPropsSchema, datePickerPropsSchema, textareaPropsSchema,
  schemaFormPropsSchema, actionButtonPropsSchema,
  formScopePropsSchema, submitButtonPropsSchema,
  iframePluginPropsSchema,
} from "./component-schemas.js";

describe("component schemas", () => {
  describe("chart data components", () => {
    it("barChartPropsSchema parses valid props", () => {
      const result = barChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "column-stacked",
        zoom: true,
        legend: { show: true, position: "bottom" },
      });
      expect(result.subtype).toBe("column-stacked");
    });

    it("barChartPropsSchema rejects invalid subtype", () => {
      expect(() => barChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "invalid",
      })).toThrow();
    });

    it("lineChartPropsSchema accepts smooth subtype", () => {
      const result = lineChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "smooth",
      });
      expect(result.subtype).toBe("smooth");
    });

    it("areaChartPropsSchema accepts area-stacked", () => {
      const result = areaChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "area-stacked",
      });
      expect(result.subtype).toBe("area-stacked");
    });

    it("pieChartPropsSchema accepts donut", () => {
      const result = pieChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "donut",
      });
      expect(result.subtype).toBe("donut");
    });

    it("scatterChartPropsSchema requires lookup", () => {
      expect(() => scatterChartPropsSchema.parse({})).toThrow();
    });

    it("bubbleChartPropsSchema parses radius fields", () => {
      const result = bubbleChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        minRadius: 2,
        maxRadius: 20,
      });
      expect(result.minRadius).toBe(2);
    });

    it("heatmapChartPropsSchema parses color fields", () => {
      const result = heatmapChartPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        minColor: "#00f",
        maxColor: "#f00",
      });
      expect(result.minColor).toBe("#00f");
    });

    it("densityHeatmapPropsSchema parses aggregation", () => {
      const result = densityHeatmapPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        aggregation: "mean",
        radius: 10,
      });
      expect(result.aggregation).toBe("mean");
    });

    it("metricGridPropsSchema parses direction", () => {
      const result = metricGridPropsSchema.parse({ direction: "grid" });
      expect(result.direction).toBe("grid");
    });
  });

  describe("non-chart data components", () => {
    it("dataTablePropsSchema parses selection", () => {
      const result = dataTablePropsSchema.parse({
        lookup: { uuid: "ds-1" },
        pageSize: 25,
        sortable: true,
        selection: "multi",
        selectionKey: "id",
      });
      expect(result.selection).toBe("multi");
    });

    it("metricPropsSchema parses card subtype and trend", () => {
      const result = metricPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "card2",
        trend: "up",
      });
      expect(result.subtype).toBe("card2");
      expect(result.trend).toBe("up");
    });

    it("meterPropsSchema parses thresholds", () => {
      const result = meterPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        end: 100,
        warning: 70,
        critical: 90,
      });
      expect(result.warning).toBe(70);
    });

    it("selectorPropsSchema parses subtype", () => {
      const result = selectorPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        subtype: "slider",
      });
      expect(result.subtype).toBe("slider");
    });

    it("graphPropsSchema parses layout and directed", () => {
      const result = graphPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        layout: "force",
        directed: true,
        sourceColumn: "from",
        targetColumn: "to",
      });
      expect(result.layout).toBe("force");
    });

    it("eventTimelinePropsSchema parses layout", () => {
      const result = eventTimelinePropsSchema.parse({
        lookup: { uuid: "ds-1" },
        layout: "compact",
        pageSize: 10,
      });
      expect(result.layout).toBe("compact");
    });

    it("countdownPropsSchema parses format", () => {
      const result = countdownPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        format: "days-only",
      });
      expect(result.format).toBe("days-only");
    });
  });

  describe("layout components", () => {
    it("gridPropsSchema requires columns", () => {
      const result = gridPropsSchema.parse({ columns: 12 });
      expect(result.columns).toBe(12);
    });

    it("columnsPropsSchema requires distribution", () => {
      const result = columnsPropsSchema.parse({ distribution: [1, 2, 1] });
      expect(result.distribution).toEqual([1, 2, 1]);
    });

    it("empty layout schemas accept empty object", () => {
      expect(() => rowsPropsSchema.parse({})).not.toThrow();
      expect(() => stackPropsSchema.parse({})).not.toThrow();
      expect(() => tabsPropsSchema.parse({})).not.toThrow();
      expect(() => pillsPropsSchema.parse({})).not.toThrow();
      expect(() => sidebarPropsSchema.parse({})).not.toThrow();
      expect(() => treePropsSchema.parse({})).not.toThrow();
      expect(() => menuPropsSchema.parse({})).not.toThrow();
      expect(() => accordionPropsSchema.parse({})).not.toThrow();
      expect(() => carouselPropsSchema.parse({})).not.toThrow();
    });

    it("splitPropsSchema parses direction and ratio", () => {
      const result = splitPropsSchema.parse({
        direction: "horizontal",
        ratio: [1, 2],
      });
      expect(result.direction).toBe("horizontal");
    });

    it("splitPropsSchema rejects invalid direction", () => {
      expect(() => splitPropsSchema.parse({ direction: "diagonal" })).toThrow();
    });

    it("dockBarPropsSchema parses items", () => {
      const result = dockBarPropsSchema.parse({
        orientation: "vertical",
        items: [{ icon: "menu", label: "Nav", panelId: "nav" }],
        exclusive: true,
      });
      expect(result.items).toHaveLength(1);
    });

    it("hostPanelPropsSchema parses typeName", () => {
      const result = hostPanelPropsSchema.parse({
        typeName: "my-panel",
        selectionSource: "table-1",
      });
      expect(result.typeName).toBe("my-panel");
    });
  });

  describe("content components", () => {
    it("htmlPropsSchema requires content", () => {
      const result = htmlPropsSchema.parse({ content: "<h1>Hi</h1>" });
      expect(result.content).toBe("<h1>Hi</h1>");
    });

    it("markdownPropsSchema requires content", () => {
      const result = markdownPropsSchema.parse({ content: "# Title" });
      expect(result.content).toBe("# Title");
    });

    it("titlePropsSchema requires text", () => {
      const result = titlePropsSchema.parse({ text: "Hello", size: "h2" });
      expect(result.text).toBe("Hello");
    });

    it("panelPropsSchema requires title", () => {
      const result = panelPropsSchema.parse({ title: "Admin" });
      expect(result.title).toBe("Admin");
    });

    it("lazyPagePropsSchema requires name and href", () => {
      const result = lazyPagePropsSchema.parse({ name: "Settings", href: "/settings.json" });
      expect(result.name).toBe("Settings");
    });

    it("pagePropsSchema parses settings", () => {
      const result = pagePropsSchema.parse({
        name: "Dashboard",
        settings: { mode: "dark" },
      });
      expect(result.settings?.mode).toBe("dark");
    });
  });

  describe("form components", () => {
    it("textInputPropsSchema parses field and placeholder", () => {
      const result = textInputPropsSchema.parse({
        field: "name",
        placeholder: "Enter name",
      });
      expect(result.field).toBe("name");
    });

    it("numberInputPropsSchema parses min/max/step", () => {
      const result = numberInputPropsSchema.parse({
        field: "age",
        min: 0,
        max: 120,
        step: 1,
      });
      expect(result.min).toBe(0);
    });

    it("dropdownPropsSchema parses fixed options", () => {
      const result = dropdownPropsSchema.parse({
        field: "status",
        options: { values: ["active", "inactive"] },
      });
      expect(result.field).toBe("status");
    });

    it("dropdownPropsSchema parses dataset options", () => {
      const result = dropdownPropsSchema.parse({
        field: "region",
        options: { dataset: "ds-1", labelColumn: "name", valueColumn: "id" },
      });
      expect(result.field).toBe("region");
    });

    it("checkboxPropsSchema requires field", () => {
      const result = checkboxPropsSchema.parse({ field: "agreed" });
      expect(result.field).toBe("agreed");
    });

    it("datePickerPropsSchema parses min/max", () => {
      const result = datePickerPropsSchema.parse({
        field: "dob",
        min: "1900-01-01",
        max: "2025-12-31",
      });
      expect(result.min).toBe("1900-01-01");
    });

    it("textareaPropsSchema parses rows", () => {
      const result = textareaPropsSchema.parse({
        field: "notes",
        rows: 5,
      });
      expect(result.rows).toBe(5);
    });
  });

  describe("other components", () => {
    it("actionButtonPropsSchema parses style enum", () => {
      const result = actionButtonPropsSchema.parse({
        label: "Delete",
        url: "/api/delete",
        style: "danger",
        method: "DELETE",
      });
      expect(result.style).toBe("danger");
    });

    it("submitButtonPropsSchema parses label and style", () => {
      const result = submitButtonPropsSchema.parse({
        label: "Save",
        style: "primary",
      });
      expect(result.label).toBe("Save");
    });

    it("schemaFormPropsSchema parses mode", () => {
      const result = schemaFormPropsSchema.parse({
        mode: "edit",
        validateOnBlur: true,
      });
      expect(result.mode).toBe("edit");
    });

    it("formScopePropsSchema parses mode", () => {
      const result = formScopePropsSchema.parse({ mode: "display" });
      expect(result.mode).toBe("display");
    });

    it("iframePluginPropsSchema parses componentId", () => {
      const result = iframePluginPropsSchema.parse({
        componentId: "my-iframe",
        title: "Plugin",
      });
      expect(result.componentId).toBe("my-iframe");
    });

    it("groupedViewPropsSchema parses preset", () => {
      const result = groupedViewPropsSchema.parse({
        lookup: { uuid: "ds-1" },
        groupBy: { sourceId: "region", columnId: "region", strategy: { mode: "distinct" } },
        preset: "sectioned",
      });
      expect(result.preset).toBe("sectioned");
    });
  });

  describe("all schemas are importable", () => {
    const allSchemas = [
      barChartPropsSchema, lineChartPropsSchema, areaChartPropsSchema,
      pieChartPropsSchema, scatterChartPropsSchema, bubbleChartPropsSchema,
      timeseriesPropsSchema, heatmapChartPropsSchema, treemapChartPropsSchema,
      densityHeatmapPropsSchema, metricGridPropsSchema,
      dataTablePropsSchema, gridTablePropsSchema,
      metricPropsSchema, meterPropsSchema, selectorPropsSchema,
      mapPropsSchema, badgePropsSchema, countdownPropsSchema,
      timelinePropsSchema, graphPropsSchema, eventTimelinePropsSchema,
      groupedViewPropsSchema,
      gridPropsSchema, columnsPropsSchema, rowsPropsSchema, stackPropsSchema,
      tabsPropsSchema, pillsPropsSchema, sidebarPropsSchema, treePropsSchema,
      menuPropsSchema, accordionPropsSchema, carouselPropsSchema,
      splitPropsSchema, dockBarPropsSchema, hostPanelPropsSchema,
      floatingWorkspacePropsSchema,
      panelPropsSchema, htmlPropsSchema, markdownPropsSchema, titlePropsSchema,
      lazyPagePropsSchema, pagePropsSchema,
      textInputPropsSchema, numberInputPropsSchema, dropdownPropsSchema,
      checkboxPropsSchema, datePickerPropsSchema, textareaPropsSchema,
      schemaFormPropsSchema, actionButtonPropsSchema,
      formScopePropsSchema, submitButtonPropsSchema,
      iframePluginPropsSchema,
    ];

    it("exports 55 component schemas", () => {
      expect(allSchemas).toHaveLength(55);
    });

    it("every schema is defined", () => {
      for (const schema of allSchemas) {
        expect(schema).toBeDefined();
      }
    });
  });
});
