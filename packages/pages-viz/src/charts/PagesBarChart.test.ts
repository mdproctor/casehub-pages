import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { BarChartProps } from "@casehubio/pages-component";
import { toTypedDataSet } from "@casehubio/pages-data";

// ── Mock ECharts ──────────────────────────────────────────────────────

const mockChart = {
  setOption: vi.fn(),
  dispose: vi.fn(),
  resize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("echarts/core", () => ({
  init: vi.fn(() => mockChart),
  use: vi.fn(),
}));

vi.mock("echarts/renderers", () => ({
  CanvasRenderer: { type: "mock-canvas-renderer" },
}));

vi.mock("echarts/charts", () => ({
  BarChart: { type: "mock-bar-chart" },
}));

vi.mock("echarts/components", () => ({
  GridComponent: { type: "mock-grid" },
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DataZoomComponent: { type: "mock-datazoom" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { PagesBarChart } from "./PagesBarChart.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(columns: [string, string][], rows: (string | number | null)[][]): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows.map(row => row.map(cell => cell === null ? null : String(cell))),
  };
  return toTypedDataSet(ds);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesBarChart", () => {
  let el: PagesBarChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-bar-chart");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("default subtype (column) builds vertical bar chart", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", 150]],
      );
      const props: BarChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;

      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["month", "sales"],
          ["Jan", 100],
          ["Feb", 150],
        ],
      });
      expect(option.xAxis).toEqual({ type: "category" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 } },
      ]);
      expect(option.tooltip).toEqual({ trigger: "axis" });
    });

    it("subtype=column builds vertical bar chart", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "column" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "category" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 } },
      ]);
    });

    it("subtype=bar builds horizontal bar chart", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "bar" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "value" });
      expect(option.yAxis).toEqual({ type: "category" });
      expect(option.series).toEqual([
        { type: "bar", encode: { y: 0, x: 1 } },
      ]);
    });

    it("subtype=column-stacked builds vertical stacked bar chart", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"], ["returns", "NUMBER"]],
        [["Jan", 100, 20]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "column-stacked" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "category" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 }, stack: "total" },
        { type: "bar", encode: { x: 0, y: 2 }, stack: "total" },
      ]);
    });

    it("subtype=bar-stacked builds horizontal stacked bar chart", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["a", "NUMBER"], ["b", "NUMBER"]],
        [["X", 10, 5]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "bar-stacked" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "value" });
      expect(option.yAxis).toEqual({ type: "category" });
      expect(option.series).toEqual([
        { type: "bar", encode: { y: 0, x: 1 }, stack: "total" },
        { type: "bar", encode: { y: 0, x: 2 }, stack: "total" },
      ]);
    });

    it("multiple data columns generate multiple series", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"], ["profit", "NUMBER"], ["cost", "NUMBER"]],
        [["Jan", 100, 50, 70]],
      );
      const props: BarChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 } },
        { type: "bar", encode: { x: 0, y: 2 } },
        { type: "bar", encode: { x: 0, y: 3 } },
      ]);
    });

    it("null values in dataset pass through to source", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", null], ["Mar", 150]],
      );
      const props: BarChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["month", "sales"],
          ["Jan", 100],
          ["Feb", null],
          ["Mar", 150],
        ],
      });
    });
  });

  describe("applyChartSettings", () => {
    it("applies legend settings", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        legend: { show: true, position: "top" },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: true, top: 0 });
    });

    it("applies margin settings via grid", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        margin: { top: 20, right: 30, bottom: 40, left: 50 },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.grid).toMatchObject({ top: 20, right: 30, bottom: 40, left: 50 });
    });

    it("applies zoom settings", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        zoom: true,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataZoom).toEqual([{ type: "inside" }, { type: "slider" }]);
    });
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Sales Report" },
          tooltip: { axisPointer: { type: "shadow" } },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Sales Report" });
      // tooltip should be deep-merged
      expect(option.tooltip).toMatchObject({ trigger: "axis", axisPointer: { type: "shadow" } });
    });
  });
});
