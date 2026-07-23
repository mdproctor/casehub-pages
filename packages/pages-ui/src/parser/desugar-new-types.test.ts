import { describe, it, expect } from "vitest";
import { desugarDisplayer } from "./displayer-desugar.js";
import { desugarComponent } from "./component-desugar.js";

describe("desugar-new-types", () => {
  describe("badge displayer", () => {
    it("should desugar BADGE type with settings", () => {
      const result = desugarDisplayer({
        type: "BADGE",
        badge: {
          column: "status",
          colorMap: { OK: "green", ERROR: "red" },
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("badge");
      expect(result.props?.column).toBe("status");
      expect(result.props?.colorMap).toEqual({ OK: "green", ERROR: "red" });
    });
  });

  describe("countdown displayer", () => {
    it("should desugar COUNTDOWN type with settings", () => {
      const result = desugarDisplayer({
        type: "COUNTDOWN",
        countdown: {
          deadlineColumn: "deadline",
          format: "compact",
          warningThreshold: "24h",
          criticalThreshold: "1h",
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("countdown");
      expect(result.props?.deadlineColumn).toBe("deadline");
      expect(result.props?.format).toBe("compact");
      expect(result.props?.warningThreshold).toBe("24h");
      expect(result.props?.criticalThreshold).toBe("1h");
    });
  });

  describe("timeline displayer", () => {
    it("should desugar TIMELINE type with settings", () => {
      const result = desugarDisplayer({
        type: "TIMELINE",
        timeline: {
          startColumn: "start",
          endColumn: "end",
          labelColumn: "task",
          categoryColumn: "project",
        },
        chart: {
          resizable: true,
          zoom: true,
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("timeline");
      expect(result.props?.startColumn).toBe("start");
      expect(result.props?.endColumn).toBe("end");
      expect(result.props?.labelColumn).toBe("task");
      expect(result.props?.categoryColumn).toBe("project");
      expect(result.props?.resizable).toBe(true);
      expect(result.props?.zoom).toBe(true);
    });
  });

  describe("graph displayer", () => {
    it("should desugar GRAPH type with settings", () => {
      const result = desugarDisplayer({
        type: "GRAPH",
        graph: {
          layout: "force",
          sourceColumn: "from",
          targetColumn: "to",
          valueColumn: "weight",
          directed: true,
          nodeLabelColumn: "name",
          nodeColorColumn: "type",
          nodeColorMap: { A: "blue", B: "green" },
          nodeSizeColumn: "size",
        },
        chart: {
          resizable: true,
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("graph");
      expect(result.props?.layout).toBe("force");
      expect(result.props?.sourceColumn).toBe("from");
      expect(result.props?.targetColumn).toBe("to");
      expect(result.props?.valueColumn).toBe("weight");
      expect(result.props?.directed).toBe(true);
      expect(result.props?.nodeLabelColumn).toBe("name");
      expect(result.props?.nodeColorColumn).toBe("type");
      expect(result.props?.nodeColorMap).toEqual({ A: "blue", B: "green" });
      expect(result.props?.nodeSizeColumn).toBe("size");
      expect(result.props?.resizable).toBe(true);
    });
  });

  describe("alert component shorthand", () => {
    it("should desugar alert shorthand", () => {
      const result = desugarComponent({
        alert: {
          severity: "warning",
          content: "Test warning message",
          dismissible: true,
        },
      });

      expect(result.type).toBe("alert");
      expect(result.props?.severity).toBe("warning");
      expect(result.props?.content).toBe("Test warning message");
      expect(result.props?.dismissible).toBe(true);
    });
  });

  describe("action-button component shorthand", () => {
    it("should desugar action-button shorthand", () => {
      const result = desugarComponent({
        "action-button": {
          label: "Submit",
          url: "/api/submit",
          method: "POST",
          body: { key: "value" },
          confirm: "Are you sure?",
          style: "primary",
          disabledWhen: "${busy}",
          onSuccess: { refresh: ["table1"], message: "Done" },
          onError: { message: "Failed" },
        },
      });

      expect(result.type).toBe("action-button");
      expect(result.props?.label).toBe("Submit");
      expect(result.props?.url).toBe("/api/submit");
      expect(result.props?.method).toBe("POST");
      expect(result.props?.body).toEqual({ key: "value" });
      expect(result.props?.confirm).toBe("Are you sure?");
      expect(result.props?.style).toBe("primary");
      expect(result.props?.disabledWhen).toBe("${busy}");
      expect(result.props?.onSuccess).toEqual({ refresh: ["table1"], message: "Done" });
      expect(result.props?.onError).toEqual({ message: "Failed" });
    });
  });

  describe("columns layout component", () => {
    it("should desugar type: columns with span into grid with child items", () => {
      const result = desugarComponent({
        type: "columns",
        properties: { span: "4,4,4" },
        columns: [
          { components: [{ html: "Left" }] },
          { components: [{ html: "Middle" }] },
          { components: [{ html: "Right" }] },
        ],
      });

      expect(result.type).toBe("grid");
      expect(result.items).toBeDefined();
      expect(result.items).toHaveLength(3);
      expect(result.items![0]!.placement.w).toBe(4);
      expect(result.items![1]!.placement.w).toBe(4);
      expect(result.items![2]!.placement.w).toBe(4);
      expect(result.items![0]!.component.type).toBe("html");
      expect(result.items![1]!.component.type).toBe("html");
      expect(result.items![2]!.component.type).toBe("html");
    });

    it("should default span to equal distribution", () => {
      const result = desugarComponent({
        type: "columns",
        columns: [
          { components: [{ html: "Left" }] },
          { components: [{ html: "Right" }] },
        ],
      });

      expect(result.type).toBe("grid");
      expect(result.items).toHaveLength(2);
      expect(result.items![0]!.placement.w).toBe(6);
      expect(result.items![1]!.placement.w).toBe(6);
    });

    it("should handle multiple components per column", () => {
      const result = desugarComponent({
        type: "columns",
        properties: { span: "6,6" },
        columns: [
          { components: [{ html: "Top" }, { html: "Bottom" }] },
          { components: [{ html: "Single" }] },
        ],
      });

      expect(result.type).toBe("grid");
      expect(result.items).toHaveLength(3);
      expect(result.items![0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 1 });
      expect(result.items![1]!.placement).toEqual({ x: 0, y: 1, w: 6, h: 1 });
      expect(result.items![2]!.placement).toEqual({ x: 6, y: 0, w: 6, h: 1 });
    });
  });

  describe("id preservation", () => {
    it("should preserve id on data components", () => {
      const result = desugarComponent({
        type: "bar-chart",
        id: "my-chart",
        properties: {
          lookup: { uuid: "test" },
        },
      });

      expect(result.type).toBe("bar-chart");
      expect(result.id).toBe("my-chart");
    });
  });

  describe("visibleWhen extraction", () => {
    it("should extract visibleWhen from displayer", () => {
      const result = desugarDisplayer({
        type: "TABLE",
        visibleWhen: "${userRole = 'admin'}",
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("data-table");
      expect(result.visibleWhen).toBe("${userRole = 'admin'}");
    });

    it("should extract visibleWhen from component shorthand", () => {
      const result = desugarComponent({
        html: "<p>Test</p>",
        visibleWhen: "${showHtml}",
      });

      expect(result.type).toBe("html");
      expect(result.visibleWhen).toBe("${showHtml}");
    });

    it("should extract visibleWhen from alert", () => {
      const result = desugarComponent({
        alert: { severity: "info", content: "Test" },
        visibleWhen: "${hasWarning}",
      });

      expect(result.type).toBe("alert");
      expect(result.visibleWhen).toBe("${hasWarning}");
    });
  });

  describe("table extended props", () => {
    it("should extract sortable and resizable from table settings", () => {
      const result = desugarDisplayer({
        type: "TABLE",
        table: {
          pageSize: 20,
          sortable: true,
          resizable: true,
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("data-table");
      expect(result.props?.pageSize).toBe(20);
      expect(result.props?.sortable).toBe(true);
      expect(result.props?.resizable).toBe(true);
    });

    it("should extract rowStyle from table settings", () => {
      const result = desugarDisplayer({
        type: "TABLE",
        table: {
          rowStyle: [
            { condition: "${status = 'ERROR'}", className: "error-row" },
            { condition: "${priority > 5}", style: { backgroundColor: "yellow" } },
          ],
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("data-table");
      expect(result.props?.rowStyle).toEqual([
        { condition: "${status = 'ERROR'}", className: "error-row" },
        { condition: "${priority > 5}", style: { backgroundColor: "yellow" } },
      ]);
    });

    it("should extract expandable from table settings", () => {
      const result = desugarDisplayer({
        type: "TABLE",
        table: {
          expandable: {
            idColumn: "id",
            parentColumn: "parentId",
            defaultExpanded: true,
          },
        },
        lookup: { uuid: "test" },
      });

      expect(result.type).toBe("data-table");
      expect(result.props?.expandable).toEqual({
        idColumn: "id",
        parentColumn: "parentId",
        defaultExpanded: true,
      });
    });
  });
});
