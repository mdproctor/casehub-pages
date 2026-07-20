import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { MapProps } from "@casehubio/pages-component";
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
  getMap: vi.fn(() => ({ geoJSON: {} })),
  registerMap: vi.fn(),
}));

vi.mock("echarts/renderers", () => ({
  CanvasRenderer: { type: "mock-canvas-renderer" },
}));

vi.mock("echarts/charts", () => ({
  MapChart: { type: "mock-map-chart" },
  ScatterChart: { type: "mock-scatter-chart" },
}));

vi.mock("echarts/components", () => ({
  GeoComponent: { type: "mock-geo" },
  VisualMapComponent: { type: "mock-visualmap" },
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { PagesMap } from "./PagesMap.js";

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

describe("PagesMap", () => {
  let el: PagesMap;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-map");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption - regions (choropleth)", () => {
    it("default subtype (regions) builds map series with visualMap", async () => {
      const ds = makeDataSet(
        [["country", "LABEL"], ["value", "NUMBER"]],
        [["USA", 100], ["China", 200], ["Germany", 150]],
      );
      const props: MapProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      const series = option.series as Record<string, unknown>[];
      expect(series).toHaveLength(1);
      expect(series[0]).toMatchObject({
        type: "map",
        map: "world",
      });

      const data = series[0]!.data as Array<{ name: string; value: number }>;
      expect(data).toEqual([
        { name: "USA", value: 100 },
        { name: "China", value: 200 },
        { name: "Germany", value: 150 },
      ]);

      expect(option.visualMap).toMatchObject({
        min: 100,
        max: 200,
        calculable: true,
      });

      const visualMap = option.visualMap as Record<string, unknown>;
      expect(visualMap.inRange).toMatchObject({
        color: ["#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"],
      });

      expect(option.tooltip).toEqual({ trigger: "item" });
    });

    it("custom mapName is respected", async () => {
      const ds = makeDataSet(
        [["state", "LABEL"], ["value", "NUMBER"]],
        [["California", 100]],
      );
      const props: MapProps = { lookup: mockLookup("test"), mapName: "USA" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      const series = option.series as Record<string, unknown>[];
      expect(series[0]).toMatchObject({
        type: "map",
        map: "USA",
      });
    });

    it("custom colorScheme is applied", async () => {
      const ds = makeDataSet(
        [["region", "LABEL"], ["value", "NUMBER"]],
        [["North", 50], ["South", 100]],
      );
      const props: MapProps = {
        lookup: mockLookup("test"),
        colorScheme: "#ff0000,#00ff00,#0000ff",
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      const visualMap = option.visualMap as Record<string, unknown>;
      const inRange = visualMap.inRange as Record<string, unknown>;
      expect(inRange.color).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
    });

    it("handles empty data array without crashing", async () => {
      const ds = makeDataSet(
        [["country", "LABEL"], ["value", "NUMBER"]],
        [],
      );
      const props: MapProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.visualMap).toMatchObject({
        min: 0,
        max: 0,
        calculable: true,
      });
    });
  });

  describe("buildOption - markers (scatter on geo)", () => {
    it("subtype=markers builds scatter series on geo", async () => {
      const ds = makeDataSet(
        [["city", "LABEL"], ["lng", "NUMBER"], ["lat", "NUMBER"]],
        [["New York", -74.006, 40.7128], ["London", -0.1276, 51.5074]],
      );
      const props: MapProps = { lookup: mockLookup("test"), subtype: "markers" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.geo).toMatchObject({
        map: "world",
        roam: true,
      });

      const series = option.series as Record<string, unknown>[];
      expect(series).toHaveLength(1);
      expect(series[0]).toMatchObject({
        type: "scatter",
        coordinateSystem: "geo",
      });

      const data = series[0]!.data as Array<{ name: string; value: number[] }>;
      expect(data).toEqual([
        { name: "New York", value: [-74.006, 40.7128, undefined] },
        { name: "London", value: [-0.1276, 51.5074, undefined] },
      ]);

      expect(option.tooltip).toEqual({ trigger: "item" });
    });

    it("markers with 4th column (value) includes it in data", async () => {
      const ds = makeDataSet(
        [["city", "LABEL"], ["lng", "NUMBER"], ["lat", "NUMBER"], ["population", "NUMBER"]],
        [["Tokyo", 139.6917, 35.6895, 13960000]],
      );
      const props: MapProps = { lookup: mockLookup("test"), subtype: "markers" };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;
      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      const series = option.series as Record<string, unknown>[];
      const data = series[0]!.data as Array<{ name: string; value: number[] }>;
      expect(data).toEqual([
        { name: "Tokyo", value: [139.6917, 35.6895, 13960000] },
      ]);

      // Should have symbolSize callback when 4th column exists
      expect(series[0]!.symbolSize).toBeDefined();
      expect(typeof series[0]!.symbolSize).toBe("function");
    });
  });

  describe("applyChartSettings", () => {
    it("applies legend settings", async () => {
      const ds = makeDataSet(
        [["country", "LABEL"], ["value", "NUMBER"]],
        [["USA", 100]],
      );
      const props: MapProps = {
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
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", async () => {
      const ds = makeDataSet(
        [["country", "LABEL"], ["value", "NUMBER"]],
        [["USA", 100]],
      );
      const props: MapProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "World Map" },
          tooltip: { formatter: "{b}: {c}" },
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

      expect(option.title).toEqual({ text: "World Map" });
      // tooltip should be deep-merged
      expect(option.tooltip).toMatchObject({ trigger: "item", formatter: "{b}: {c}" });
    });
  });
});
