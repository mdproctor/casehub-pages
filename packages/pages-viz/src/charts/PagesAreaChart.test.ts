import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { AreaChartProps } from "@casehubio/pages-component";
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
  LineChart: { type: "mock-line-chart" },
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
import { PagesAreaChart } from "./PagesAreaChart.js";

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

describe("PagesAreaChart", () => {
  let el: PagesAreaChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-area-chart");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("default subtype (area) builds area chart", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", 150]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test") };

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
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {} },
      ]);
      expect(option.tooltip).toEqual({ trigger: "axis" });
    });

    it("subtype=area builds area chart", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test"), subtype: "area" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {} },
      ]);
    });

    it("subtype=area-stacked builds stacked area chart", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["a", "NUMBER"], ["b", "NUMBER"]],
        [["X", 10, 5]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test"), subtype: "area-stacked" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {}, stack: "total" },
        { type: "line", encode: { x: 0, y: 2 }, areaStyle: {}, stack: "total" },
      ]);
    });

    it("multiple data columns generate multiple series", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"], ["profit", "NUMBER"], ["cost", "NUMBER"]],
        [["Jan", 100, 50, 70]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {} },
        { type: "line", encode: { x: 0, y: 2 }, areaStyle: {} },
        { type: "line", encode: { x: 0, y: 3 }, areaStyle: {} },
      ]);
    });

    it("null values in dataset pass through to source", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", null], ["Mar", 150]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test") };

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
      const props: AreaChartProps = {
        lookup: mockLookup("test"),
        legend: { show: false },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: false });
    });

    it("applies xAxis and yAxis settings", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: AreaChartProps = {
        lookup: mockLookup("test"),
        xAxis: { title: "Month", showLabels: true },
        yAxis: { title: "Sales", showLabels: false },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toMatchObject({ type: "category", name: "Month", axisLabel: { show: true } });
      expect(option.yAxis).toMatchObject({ type: "value", name: "Sales", axisLabel: { show: false } });
    });
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", async () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: AreaChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Area Chart" },
          color: ["#ff0000"],
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

      expect(option.title).toEqual({ text: "Area Chart" });
      expect(option.color).toEqual(["#ff0000"]);
    });
  });
});
