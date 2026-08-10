import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { TreemapChartProps } from "@casehubio/pages-component";
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
  TreemapChart: { type: "mock-treemap-chart" },
}));

vi.mock("echarts/components", () => ({
  TooltipComponent: { type: "mock-tooltip" },
  TitleComponent: { type: "mock-title" },
  VisualMapComponent: { type: "mock-visualmap" },
}));

// Import after mocks
import { PagesTreemapChart } from "./PagesTreemapChart.js";

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

async function renderChart(el: PagesTreemapChart, props: TreemapChartProps, ds: TypedDataSet): Promise<Record<string, unknown>> {
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

describe("PagesTreemapChart", () => {
  let el: PagesTreemapChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-treemap-chart");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption — flat data (name, value)", () => {
    it("builds flat treemap from 2-column dataset", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["Alpha", 30], ["Beta", 20], ["Gamma", 50]],
      );
      const props: TreemapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      const series = (option.series as Record<string, unknown>[])[0]!;
      expect(series.type).toBe("treemap");
      const data = series.data as Record<string, unknown>[];
      expect(data).toEqual([
        { name: "Alpha", value: 30 },
        { name: "Beta", value: 20 },
        { name: "Gamma", value: 50 },
      ]);
    });
  });

  describe("buildOption — hierarchical data (name, value, parent)", () => {
    it("builds nested treemap from 3-column dataset with parentColumn", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"], ["parent", "LABEL"]],
        [
          ["Root", 0, ""],
          ["A", 30, "Root"],
          ["B", 20, "Root"],
          ["A1", 15, "A"],
          ["A2", 15, "A"],
        ],
      );
      const props: TreemapChartProps = {
        lookup: mockLookup("test"),
        parentColumn: "parent" as ColumnId,
      };
      const option = await renderChart(el, props, ds);

      const series = (option.series as Record<string, unknown>[])[0]!;
      const data = series.data as Record<string, unknown>[];
      expect(data).toHaveLength(1);

      const root = data[0]!;
      expect(root.name).toBe("Root");
      const rootChildren = root.children as Record<string, unknown>[];
      expect(rootChildren).toHaveLength(2);

      const nodeA = rootChildren.find(c => c.name === "A")!;
      const nodeAChildren = nodeA.children as Record<string, unknown>[];
      expect(nodeAChildren).toHaveLength(2);
      expect(nodeAChildren[0]).toMatchObject({ name: "A1", value: 15 });
    });
  });

  describe("buildOption — color column", () => {
    it("adds colorColumn value to treemap data items", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["size", "NUMBER"], ["health", "NUMBER"]],
        [["Alpha", 30, 0.9], ["Beta", 20, 0.4]],
      );
      const props: TreemapChartProps = {
        lookup: mockLookup("test"),
        colorColumn: "health" as ColumnId,
      };
      const option = await renderChart(el, props, ds);

      const series = (option.series as Record<string, unknown>[])[0]!;
      const data = series.data as Record<string, unknown>[];
      expect(data[0]).toMatchObject({ name: "Alpha", value: 30, colorValue: 0.9 });
      expect(data[1]).toMatchObject({ name: "Beta", value: 20, colorValue: 0.4 });

      expect(option.visualMap).toBeDefined();
    });
  });

  describe("buildOption — settings", () => {
    it("sets tooltip trigger to item", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: TreemapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      expect(option.tooltip).toMatchObject({ trigger: "item" });
    });

    it("applies ChartSettings (title)", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: TreemapChartProps = {
        lookup: mockLookup("test"),
        title: "Domain Composition",
      };
      const option = await renderChart(el, props, ds);

      expect(option.title).toEqual({ text: "Domain Composition" });
    });

    it("deep merges extra settings", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: TreemapChartProps = {
        lookup: mockLookup("test"),
        extra: { series: [{ leafDepth: 1 }] },
      };
      const option = await renderChart(el, props, ds);

      expect(option.series).toBeDefined();
    });

    it("handles null values gracefully", async () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["Alpha", 30], ["Beta", null], ["Gamma", 50]],
      );
      const props: TreemapChartProps = { lookup: mockLookup("test") };
      const option = await renderChart(el, props, ds);

      const series = (option.series as Record<string, unknown>[])[0]!;
      const data = series.data as Record<string, unknown>[];
      expect(data).toEqual([
        { name: "Alpha", value: 30 },
        { name: "Beta", value: 0 },
        { name: "Gamma", value: 50 },
      ]);
    });
  });
});
