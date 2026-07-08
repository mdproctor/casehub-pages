import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { TimelineProps } from "@casehubio/pages-component";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";

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
  CustomChart: { type: "mock-custom-chart" },
}));

vi.mock("echarts/components", () => ({
  GridComponent: { type: "mock-grid" },
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DataZoomComponent: { type: "mock-datazoom" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { PagesTimeline } from "./PagesTimeline.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(columns: [string, string][], rows: (string | number | Date | null)[][]): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows.map(row =>
      row.map(cell => {
        if (cell === null) return null;
        if (cell instanceof Date) return cell.toISOString();
        return String(cell);
      })
    ),
  };
  return toTypedDataSet(ds);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesTimeline", () => {
  let el: PagesTimeline;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-timeline");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("produces ECharts option with type: 'custom' series", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"], ["category", "LABEL"]],
        [
          ["Task 1", new Date("2024-01-01"), new Date("2024-01-05"), "Dev"],
          ["Task 2", new Date("2024-01-03"), new Date("2024-01-08"), "Dev"],
        ],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
        categoryColumn: "category" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toBeDefined();
      const series = option.series as Array<Record<string, unknown>>;
      expect(series.length).toBe(1);
      expect(series[0]!.type).toBe("custom");
      expect(series[0]!.renderItem).toBeDefined();
      expect(typeof series[0]!.renderItem).toBe("function");
    });

    it("time x-axis from start/end columns", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"]],
        [["Task 1", new Date("2024-01-01"), new Date("2024-01-05")]],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toBeDefined();
      const xAxis = option.xAxis as Record<string, unknown>;
      expect(xAxis.type).toBe("time");
    });

    it("category y-axis from category column", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"], ["category", "LABEL"]],
        [
          ["Task 1", new Date("2024-01-01"), new Date("2024-01-05"), "Dev"],
          ["Task 2", new Date("2024-01-03"), new Date("2024-01-08"), "QA"],
        ],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
        categoryColumn: "category" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.yAxis).toBeDefined();
      const yAxis = option.yAxis as Record<string, unknown>;
      expect(yAxis.type).toBe("category");
      expect(yAxis.data).toEqual(["Dev", "QA"]);
    });

    it("rows with null endColumn render as milestone markers", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"], ["category", "LABEL"]],
        [
          ["Task 1", new Date("2024-01-01"), new Date("2024-01-05"), "Dev"],
          ["Milestone", new Date("2024-01-03"), null, "Dev"],
          ["Task 2", new Date("2024-01-06"), new Date("2024-01-10"), "Dev"],
        ],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
        categoryColumn: "category" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const seriesData = series[0]!.data as Array<Record<string, unknown>>;

      // Data should include milestone flag for row index 1
      expect(seriesData.length).toBe(3);
      expect(seriesData[1]!.isMilestone).toBe(true);
      expect(seriesData[0]!.isMilestone).toBeUndefined();
      expect(seriesData[2]!.isMilestone).toBeUndefined();
    });

    it("standard ChartSettings (zoom, legend, margin) apply", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"]],
        [["Task 1", new Date("2024-01-01"), new Date("2024-01-05")]],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
        zoom: true,
        legend: { show: true, position: "top" },
        margin: { top: 20, right: 30, bottom: 40, left: 50 },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataZoom).toEqual([{ type: "inside" }, { type: "slider" }]);
      expect(option.legend).toMatchObject({ show: true, top: 0 });
      expect(option.grid).toMatchObject({ top: 20, right: 30, bottom: 40, left: 50 });
    });

    it("works without categoryColumn - all rows on same y-axis category", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"]],
        [
          ["Task 1", new Date("2024-01-01"), new Date("2024-01-05")],
          ["Task 2", new Date("2024-01-03"), new Date("2024-01-08")],
        ],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.yAxis).toBeDefined();
      const yAxis = option.yAxis as Record<string, unknown>;
      expect(yAxis.type).toBe("category");
      // When no categoryColumn, all rows are on a single category
      expect(yAxis.data).toEqual([""]);
    });

    it("extra settings deep merge onto option", () => {
      const ds = makeDataSet(
        [["task", "LABEL"], ["start", "DATE"], ["end", "DATE"]],
        [["Task 1", new Date("2024-01-01"), new Date("2024-01-05")]],
      );
      const props: TimelineProps = {
        lookup: mockLookup("test"),
        startColumn: "start" as ColumnId,
        endColumn: "end" as ColumnId,
        labelColumn: "task" as ColumnId,
        extra: {
          title: { text: "Timeline Chart" },
          tooltip: { formatter: "custom" },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Timeline Chart" });
      expect(option.tooltip).toMatchObject({ formatter: "custom" });
    });
  });
});
