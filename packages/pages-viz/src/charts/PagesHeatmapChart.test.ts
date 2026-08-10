import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { HeatmapChartProps } from "@casehubio/pages-component";
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
  HeatmapChart: { type: "mock-heatmap-chart" },
}));

vi.mock("echarts/components", () => ({
  GridComponent: { type: "mock-grid" },
  TooltipComponent: { type: "mock-tooltip" },
  VisualMapComponent: { type: "mock-visualmap" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { PagesHeatmapChart } from "./PagesHeatmapChart.js";

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

async function renderChart(el: PagesHeatmapChart, props: HeatmapChartProps, ds: TypedDataSet): Promise<Record<string, unknown>> {
  el.props = props;
  document.body.appendChild(el);
  await el.updateComplete;
  el.dataSet = ds;
  await el.updateComplete;
  await new Promise(r => { setTimeout(r, 0); });
  await el.updateComplete;
  return mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesHeatmapChart", () => {
  let el: PagesHeatmapChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-heatmap-chart");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("builds heatmap from 3-column dataset (x, y, value)", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 10], ["A", "Q", 20], ["B", "P", 30], ["B", "Q", 40]],
      );
      const props: HeatmapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      expect(option.xAxis).toMatchObject({ type: "category", data: ["A", "B"] });
      expect(option.yAxis).toMatchObject({ type: "category", data: ["P", "Q"] });
      expect(option.grid).toMatchObject({ right: 80 });
      expect(option.series).toEqual([
        expect.objectContaining({
          type: "heatmap",
          data: [[0, 0, 10], [0, 1, 20], [1, 0, 30], [1, 1, 40]],
        }),
      ]);
    });

    it("configures visualMap with data range", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 5], ["A", "Q", 15], ["B", "P", 25]],
      );
      const props: HeatmapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      const vm = option.visualMap as Record<string, unknown>;
      expect(vm).toMatchObject({
        min: 5,
        max: 25,
        calculable: true,
        orient: "vertical",
        right: 0,
      });
    });

    it("applies custom minColor and maxColor", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 1], ["B", "Q", 9]],
      );
      const props: HeatmapChartProps = {
        lookup: mockLookup("test"),
        minColor: "#eee",
        maxColor: "#f00",
      };
      const option = await renderChart(el, props, ds);

      const vm = option.visualMap as Record<string, unknown>;
      expect(vm).toMatchObject({
        inRange: { color: ["#eee", "#f00"] },
      });
    });

    it("handles null values in dataset", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 10], ["A", "Q", null], ["B", "P", 30]],
      );
      const props: HeatmapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      const series = (option.series as Record<string, unknown>[])[0]!;
      const data = series.data as (number | null)[][];
      expect(data).toContainEqual([0, 1, null]);
    });

    it("sets tooltip trigger to item", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 10]],
      );
      const props: HeatmapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      expect(option.tooltip).toMatchObject({ trigger: "item" });
    });

    it("applies ChartSettings (title, margin)", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 10]],
      );
      const props: HeatmapChartProps = {
        lookup: mockLookup("test"),
        title: "My Heatmap",
        margin: { top: 20, left: 30 },
      };
      const option = await renderChart(el, props, ds);

      expect(option.title).toEqual({ text: "My Heatmap" });
      expect(option.grid).toMatchObject({ top: 20, left: 30 });
    });

    it("deep merges extra settings", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 10]],
      );
      const props: HeatmapChartProps = {
        lookup: mockLookup("test"),
        extra: { tooltip: { formatter: "{c}" } },
      };
      const option = await renderChart(el, props, ds);

      expect(option.tooltip).toMatchObject({ trigger: "item", formatter: "{c}" });
    });

    it("handles single-row dataset", async () => {
      const ds = makeDataSet(
        [["x", "LABEL"], ["y", "LABEL"], ["value", "NUMBER"]],
        [["A", "P", 42]],
      );
      const props: HeatmapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      expect(option.xAxis).toMatchObject({ data: ["A"] });
      expect(option.yAxis).toMatchObject({ data: ["P"] });
      const series = (option.series as Record<string, unknown>[])[0]!;
      expect(series.data).toEqual([[0, 0, 42]]);
    });
  });
});
