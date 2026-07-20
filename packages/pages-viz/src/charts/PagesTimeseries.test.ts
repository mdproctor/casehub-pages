import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { TimeseriesProps } from "@casehubio/pages-component";
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
import { PagesTimeseries } from "./PagesTimeseries.js";

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

describe("PagesTimeseries", () => {
  let el: PagesTimeseries;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-timeseries");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("xAxis type is time", async () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100], ["2024-01-02", 150]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "time" });
    });

    it("yAxis type is value", async () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.yAxis).toEqual({ type: "value" });
    });

    it("multiple data columns generate multiple line series", async () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["sales", "NUMBER"], ["profit", "NUMBER"], ["cost", "NUMBER"]],
        [["2024-01-01", 100, 50, 70]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 } },
        { type: "line", encode: { x: 0, y: 2 } },
        { type: "line", encode: { x: 0, y: 3 } },
      ]);
    });

    it("tooltip trigger is axis", async () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.tooltip).toEqual({ trigger: "axis" });
    });

    it("dataset source format matches expected structure", async () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100], ["2024-01-02", 150]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      // DATE columns are converted to Date objects by toTypedDataSet
      expect(option.dataset).toEqual({
        source: [
          ["timestamp", "value"],
          [new Date("2024-01-01"), 100],
          [new Date("2024-01-02"), 150],
        ],
      });
    });
  });

  describe("applyChartSettings", () => {
    it("applies legend settings", async () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
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
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
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
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
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
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Time Series Report" },
          tooltip: { axisPointer: { type: "cross" } },
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

      expect(option.title).toEqual({ text: "Time Series Report" });
      // tooltip should be deep-merged
      expect(option.tooltip).toMatchObject({ trigger: "axis", axisPointer: { type: "cross" } });
    });
  });

  describe("time axis column detection", () => {
    it("LABEL column 0 with 3+ columns → uses column 1 as time axis", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["timestamp", "NUMBER"], ["value", "NUMBER"]],
        [["test", 1718546000000, 23], ["test", 1718546001000, 97]],
      );
      el.props = { lookup: mockLookup("ts") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Record<string, unknown>[];

      expect(series).toHaveLength(1);
      expect(series[0]!.encode).toEqual({ x: 1, y: 2 });
    });

    it("NUMBER column 0 → uses column 0 as time axis (default)", async () => {
      const ds = makeDataSet(
        [["timestamp", "NUMBER"], ["value", "NUMBER"]],
        [[1718546000000, 23], [1718546001000, 97]],
      );
      el.props = { lookup: mockLookup("ts") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Record<string, unknown>[];

      expect(series).toHaveLength(1);
      expect(series[0]!.encode).toEqual({ x: 0, y: 1 });
    });
  });
});
