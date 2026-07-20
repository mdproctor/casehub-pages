import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { GraphProps } from "@casehubio/pages-component";
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
  GraphChart: { type: "mock-graph-chart" },
}));

vi.mock("echarts/components", () => ({
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { PagesGraph } from "./PagesGraph.js";

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
    data: rows.map(row =>
      row.map(cell => {
        if (cell === null) return null;
        return String(cell);
      })
    ),
  };
  return toTypedDataSet(ds);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesGraph", () => {
  let el: PagesGraph;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-graph");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("produces ECharts option with type: 'graph' series", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [
          ["A", "B"],
          ["B", "C"],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toBeDefined();
      const series = option.series as Array<Record<string, unknown>>;
      expect(series.length).toBe(1);
      expect(series[0]!.type).toBe("graph");
    });

    it("derives nodes from distinct source/target values", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [
          ["A", "B"],
          ["B", "C"],
          ["A", "C"],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const data = series[0]!.data as Array<Record<string, unknown>>;

      // Should have 3 distinct nodes: A, B, C
      expect(data.length).toBe(3);
      expect(data.map(d => d.name).sort()).toEqual(["A", "B", "C"]);
    });

    it("builds links from edge rows", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [
          ["A", "B"],
          ["B", "C"],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const links = series[0]!.links as Array<Record<string, unknown>>;

      expect(links.length).toBe(2);
      expect(links[0]).toMatchObject({ source: "A", target: "B" });
      expect(links[1]).toMatchObject({ source: "B", target: "C" });
    });

    it("layout prop maps to ECharts layout type", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [["A", "B"]],
      );

      const forceProps: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        layout: "force",
      };

      el.props = forceProps;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      let option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      let series = option.series as Array<Record<string, unknown>>;
      expect(series[0]!.layout).toBe("force");
      expect(series[0]!.force).toMatchObject({ repulsion: 100 });

      // Reset for circular test
      el.remove();
      vi.clearAllMocks();
      el = document.createElement("pages-graph");

      const circularProps: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        layout: "circular",
      };

      el.props = circularProps;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      series = option.series as Array<Record<string, unknown>>;
      expect(series[0]!.layout).toBe("circular");
      expect(series[0]!.force).toBeUndefined();
    });

    it("directed: true adds arrow markers on links", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [["A", "B"]],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        directed: true,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      expect(series[0]!.edgeSymbol).toEqual(["none", "arrow"]);
    });

    it("nodeLabelColumn provides display names", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"], ["label", "LABEL"]],
        [
          ["A", "B", "Node A"],
          ["B", "C", "Node B"],
          ["C", "A", "Node C"],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        nodeLabelColumn: "label" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const data = series[0]!.data as Array<Record<string, unknown>>;

      // Node A appears first as source in row 0 → label "Node A"
      const nodeA = data.find(d => d.name === "A");
      expect(nodeA?.label).toMatchObject({ show: true, formatter: "Node A" });
    });

    it("nodeColorColumn + nodeColorMap provides per-node coloring", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"], ["category", "LABEL"]],
        [
          ["A", "B", "type1"],
          ["B", "C", "type2"],
          ["C", "A", "type1"],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        nodeColorColumn: "category" as ColumnId,
        nodeColorMap: {
          type1: "#ff0000",
          type2: "#00ff00",
        },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const data = series[0]!.data as Array<Record<string, unknown>>;

      // Node A appears first as source in row 0 with category "type1"
      const nodeA = data.find(d => d.name === "A");
      expect(nodeA?.itemStyle).toMatchObject({ color: "#ff0000" });

      // Node B appears first as target in row 0, then as source in row 1 with category "type2"
      const nodeB = data.find(d => d.name === "B");
      expect(nodeB?.itemStyle).toMatchObject({ color: "#00ff00" });
    });

    it("nodeSizeColumn provides proportional sizing", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"], ["size", "NUMBER"]],
        [
          ["A", "B", 10],
          ["B", "C", 20],
          ["C", "A", 15],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        nodeSizeColumn: "size" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const data = series[0]!.data as Array<Record<string, unknown>>;

      // Node A appears first as source in row 0 with size 10
      const nodeA = data.find(d => d.name === "A");
      expect(nodeA?.symbolSize).toBe(10);

      // Node B appears first as target in row 0, then as source in row 1 with size 20
      const nodeB = data.find(d => d.name === "B");
      expect(nodeB?.symbolSize).toBe(20);
    });

    it("valueColumn provides link weights", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"], ["weight", "NUMBER"]],
        [
          ["A", "B", 5],
          ["B", "C", 10],
        ],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        valueColumn: "weight" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const links = series[0]!.links as Array<Record<string, unknown>>;

      expect(links[0]!.value).toBe(5);
      expect(links[1]!.value).toBe(10);
    });

    it("standard ChartSettings (legend, margin) apply", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [["A", "B"]],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        legend: { show: true, position: "top" },
        margin: { top: 20, right: 30, bottom: 40, left: 50 },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: true, top: 0 });
      expect(option.grid).toMatchObject({ top: 20, right: 30, bottom: 40, left: 50 });
    });

    it("extra settings deep merge onto option", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [["A", "B"]],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
        extra: {
          title: { text: "Network Graph" },
          tooltip: { formatter: "custom" },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Network Graph" });
      expect(option.tooltip).toMatchObject({ formatter: "custom" });
    });

    it("defaults to force layout when layout not specified", async () => {
      const ds = makeDataSet(
        [["source", "LABEL"], ["target", "LABEL"]],
        [["A", "B"]],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
        sourceColumn: "source" as ColumnId,
        targetColumn: "target" as ColumnId,
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      expect(series[0]!.layout).toBe("force");
      expect(series[0]!.force).toMatchObject({ repulsion: 100 });
    });

    it("defaults sourceColumn/targetColumn to first two columns when not specified", async () => {
      const ds = makeDataSet(
        [["from", "LABEL"], ["to", "LABEL"]],
        [["A", "B"]],
      );
      const props: GraphProps = {
        lookup: mockLookup("test"),
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = option.series as Array<Record<string, unknown>>;
      const links = series[0]!.links as Array<Record<string, unknown>>;

      expect(links.length).toBe(1);
      expect(links[0]).toMatchObject({ source: "A", target: "B" });
    });
  });
});
