import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TypedDataSet, Column, ColumnId, ColumnType, DataSet } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type {
  DataComponentCommon,
  ChartSettings,
} from "@casehubio/pages-component";
import type { PagesFilterApply, PagesFilterReset } from "./filter-types.js";
import { toTypedDataSet } from "@casehubio/pages-data";

// ── Mock ECharts ──────────────────────────────────────────────────────

const mockChart = {
  setOption: vi.fn(),
  dispose: vi.fn(),
  resize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getOption: vi.fn(),
  dispatchAction: vi.fn(),
};

vi.mock("echarts/core", () => ({
  init: vi.fn(() => mockChart),
  use: vi.fn(),
}));

vi.mock("echarts/renderers", () => ({
  CanvasRenderer: { type: "mock-canvas-renderer" },
}));

// Import after mock is set up
const { init: echartsInit, use: echartsUse } = await import("echarts/core");

import { PagesChartElement } from "./PagesChartElement.js";

// Capture use() call count immediately after module load, before any test's
// beforeEach can call clearAllMocks.
const useCallCountAtLoad = (echartsUse as ReturnType<typeof vi.fn>).mock.calls.length;

// ── Test types ────────────────────────────────────────────────────────

interface TestChartProps extends DataComponentCommon, ChartSettings {
  readonly color?: string;
}

// ── Concrete test subclass ────────────────────────────────────────────

import { customElement } from "lit/decorators.js";

@customElement("test-chart-element-lit")
class TestChart extends PagesChartElement<TestChartProps> {
  buildOptionCalls: Array<{ props: TestChartProps; dataset: TypedDataSet }> = [];

  override buildOption(
    props: TestChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    this.buildOptionCalls.push({ props, dataset });
    return { series: [{ type: "bar", data: [1, 2, 3] }] };
  }
}

@customElement("test-async-chart-lit")
class AsyncTestChart extends PagesChartElement<TestChartProps> {
  resolveOption?: (value: Record<string, unknown>) => void;
  rejectOption?: (reason: Error) => void;

  override buildOption(
    _props: TestChartProps,
    _dataset: TypedDataSet,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.resolveOption = resolve;
      this.rejectOption = reject;
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function mockDataSet(columnId = "col1" as ColumnId): TypedDataSet {
  return {
    columns: [
      { id: columnId, name: "Column 1", type: "LABEL" as ColumnType },
    ] as readonly Column[],
    rows: [],
  };
}

function mockTypedDataSet(columnId = "col1" as ColumnId): TypedDataSet {
  const ds: DataSet = {
    columns: [{ id: columnId, name: "Column 1", type: "LABEL" as ColumnType }],
    data: [["Alpha"], ["Beta"], ["Gamma"]],
  };
  return toTypedDataSet(ds);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesChartElement", () => {
  let el: TestChart;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock return for getOption
    mockChart.getOption.mockReturnValue({ series: [{ type: "bar" }] });
    el = document.createElement("test-chart-element-lit") as TestChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("ECharts init lifecycle", () => {
    it("first render calls echarts.init() then chart.setOption()", async () => {
      const props: TestChartProps = { lookup: mockLookup("sales") };
      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(echartsInit).toHaveBeenCalledTimes(1);
      expect(echartsInit).toHaveBeenCalledWith(
        el.shadowRoot!.querySelector("div"),
        "",
        undefined,
      );
      expect(mockChart.setOption).toHaveBeenCalledTimes(1);
      expect(mockChart.setOption).toHaveBeenCalledWith(
        { series: [{ type: "bar", data: [1, 2, 3] }] },
        true,
      );
    });

    it("second render reuses existing chart (no re-init)", async () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(echartsInit).toHaveBeenCalledTimes(1);

      // Trigger second render by updating dataset
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(echartsInit).toHaveBeenCalledTimes(1); // still 1
      expect(mockChart.setOption).toHaveBeenCalledTimes(2);
    });
  });

  describe("theme changes", () => {
    it("theme change disposes and re-inits chart with new theme", async () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(echartsInit).toHaveBeenCalledTimes(1);

      el.theme = "dark";
      await el.updateComplete;

      expect(mockChart.dispose).toHaveBeenCalledTimes(1);
      expect(echartsInit).toHaveBeenCalledTimes(2);
      expect(echartsInit).toHaveBeenLastCalledWith(
        el.shadowRoot!.querySelector("div"),
        "dark",
        undefined,
      );
      // setOption called again with new chart
      expect(mockChart.setOption).toHaveBeenCalledTimes(2);
    });
  });

  describe("disconnectedCallback", () => {
    it("disposes chart on disconnect", async () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(echartsInit).toHaveBeenCalledTimes(1);

      el.remove();

      expect(mockChart.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe("onResize", () => {
    it("calls chart.resize()", async () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      el.onResize();

      expect(mockChart.resize).toHaveBeenCalledTimes(1);
    });

    it("does not throw when no chart exists", () => {
      // No chart created yet — onResize should be safe
      expect(() => { el.onResize(); }).not.toThrow();
    });
  });

  describe("click-to-filter", () => {
    it("click emits PagesFilterApply with value and row", async () => {
      const columnId = "region" as ColumnId;
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        filter: { enabled: true, group: "g1" },
      };
      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;

      const ds = mockTypedDataSet(columnId);
      el.dataSet = ds;
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => filterEvents.push(e as CustomEvent));

      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });

      expect(filterEvents).toHaveLength(1);
      const detail = filterEvents[0]!.detail as PagesFilterApply;
      expect(detail.columnId).toBe(columnId);
      expect(detail.value).toBe("Beta");
      expect(detail.row).toBe(ds.rows[1]);
      expect(detail.reset).toBe(false);
      expect(detail.group).toBe("g1");
    });

    it("click same value twice toggles — second emits PagesFilterReset", async () => {
      const columnId = "region" as ColumnId;
      el.props = { lookup: mockLookup("sales"), filter: { enabled: true } };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet(columnId);
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });
      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });

      expect(events).toHaveLength(2);
      expect((events[0]!.detail as PagesFilterApply).reset).toBe(false);
      expect((events[1]!.detail as PagesFilterReset).reset).toBe(true);
      expect((events[1]!.detail as PagesFilterReset).columnId).toBe(columnId);
    });

    it("click different value switches selection", async () => {
      const columnId = "region" as ColumnId;
      el.props = { lookup: mockLookup("sales"), filter: { enabled: true } };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet(columnId);
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });
      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });

      expect(events).toHaveLength(2);
      expect((events[0]!.detail as PagesFilterApply).value).toBe("Alpha");
      expect((events[1]!.detail as PagesFilterApply).value).toBe("Beta");
    });

    it("skips event when cell value is NULL", async () => {
      const columnId = "region" as ColumnId;
      el.props = { lookup: mockLookup("sales"), filter: { enabled: true } };
      document.body.appendChild(el);
      await el.updateComplete;

      const dsWithNull: DataSet = {
        columns: [{ id: columnId, name: "Region", type: "LABEL" as ColumnType }],
        data: [[null]],
      };
      el.dataSet = toTypedDataSet(dsWithNull);
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "", data: null });

      expect(events).toHaveLength(0);
    });

    it("data re-push preserves selection when value exists in new data", async () => {
      const columnId = "region" as ColumnId;
      el.props = { lookup: mockLookup("sales"), filter: { enabled: true } };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet(columnId);
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      // Select "Beta"
      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });

      // Re-push with same data — selection should be preserved
      el.dataSet = mockTypedDataSet(columnId);
      await el.updateComplete;

      // Click "Beta" again — should toggle OFF (selection was preserved)
      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));
      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });

      expect(events).toHaveLength(1);
      expect((events[0]!.detail as PagesFilterReset).reset).toBe(true);
    });

    it("data re-push clears selection when value is absent from new data", async () => {
      const columnId = "region" as ColumnId;
      el.props = { lookup: mockLookup("sales"), filter: { enabled: true } };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet(columnId); // Alpha, Beta, Gamma
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      // Select "Beta"
      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });

      // Re-push with data that does NOT contain "Beta"
      const dsNoBeta: DataSet = {
        columns: [{ id: columnId, name: "Region", type: "LABEL" as ColumnType }],
        data: [["Alpha"], ["Gamma"]],
      };
      el.dataSet = toTypedDataSet(dsNoBeta);
      await el.updateComplete;

      // Click "Alpha" — should be a fresh select, not a toggle
      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));
      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });

      expect(events).toHaveLength(1);
      expect((events[0]!.detail as PagesFilterApply).reset).toBe(false);
      expect((events[0]!.detail as PagesFilterApply).value).toBe("Alpha");
    });

    it("highlight dispatched on apply, downplay on reset", async () => {
      const columnId = "region" as ColumnId;
      el.props = { lookup: mockLookup("sales"), filter: { enabled: true } };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet(columnId);
      await el.updateComplete;

      // Mock chart.getOption to return series array
      mockChart.getOption.mockReturnValue({ series: [{ type: "bar" }] });

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      // Apply
      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });
      expect(mockChart.dispatchAction).toHaveBeenCalledWith({
        type: "highlight",
        seriesIndex: [0],
        dataIndex: 1,
      });

      // Toggle off
      mockChart.dispatchAction.mockClear();
      clickHandler({ dataIndex: 1, seriesIndex: 0, seriesName: "s0", name: "Beta", data: "Beta" });
      expect(mockChart.dispatchAction).toHaveBeenCalledWith({
        type: "downplay",
        seriesIndex: [0],
        dataIndex: 1,
      });
    });

    it("click with filter disabled emits no event", async () => {
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        filter: { enabled: false },
      };
      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet();
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });

      expect(filterEvents).toHaveLength(0);
    });

    it("click with no filter setting emits no event", async () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockTypedDataSet();
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });

      expect(filterEvents).toHaveLength(0);
    });

    it("click handler uses current dataSet, not stale closure", async () => {
      const col1 = "alpha" as ColumnId;
      const col2 = "beta" as ColumnId;
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        filter: { enabled: true },
      };
      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;

      // First dataset
      el.dataSet = mockTypedDataSet(col1);
      await el.updateComplete;

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number; seriesIndex: number; seriesName: string; name: string; data: unknown }) => void;

      // Replace dataset
      el.dataSet = mockTypedDataSet(col2);
      await el.updateComplete;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      clickHandler({ dataIndex: 0, seriesIndex: 0, seriesName: "s0", name: "Alpha", data: "Alpha" });

      // Should use col2, not col1
      const detail = filterEvents[0]!.detail as PagesFilterApply;
      expect(detail.columnId).toBe(col2);
      expect(detail.value).toBe("Alpha");
    });
  });

  describe("ECharts use()", () => {
    it("use() was called at module load to register renderers", () => {
      // use() is called at module evaluation time (top-level side effect).
      // beforeEach clears mocks, so we captured the call count at import time.
      expect(useCallCountAtLoad).toBeGreaterThanOrEqual(1);
    });
  });

  describe("buildOption", () => {
    it("passes props and dataset to buildOption", async () => {
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        color: "red",
      };
      const ds = mockDataSet();
      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      expect(el.buildOptionCalls).toHaveLength(1);
      expect(el.buildOptionCalls[0]!.props).toBe(props);
      expect(el.buildOptionCalls[0]!.dataset).toBe(ds);
    });
  });

  describe("container sizing from props", () => {
    it("numeric height sets container minHeight and height in px", async () => {
      el.props = { lookup: mockLookup("s"), height: "200px" };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.style.minHeight).toBe("200px");
      expect(el.style.height).toBe("200px");
    });

    it("string height with units is passed through", async () => {
      el.props = { lookup: mockLookup("s"), height: "50vh" };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.style.height).toBe("50vh");
    });

    it("numeric width sets container width in px", async () => {
      el.props = { lookup: mockLookup("s"), width: "400px" };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.style.width).toBe("400px");
    });

    it("chart container has 300px minHeight and 100% width by default", async () => {
      el.props = { lookup: mockLookup("s") };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.style.minHeight).toBe("300px");
      expect(el.style.width).toBe("100%");
    });
  });

  describe("async buildOption", () => {
    let asyncEl: AsyncTestChart;

    beforeEach(() => {
      vi.clearAllMocks();
      mockChart.getOption.mockReturnValue({ series: [{ type: "bar" }] });
      asyncEl = document.createElement("test-async-chart-lit") as AsyncTestChart;
    });

    afterEach(() => {
      if (asyncEl.isConnected) {
        asyncEl.remove();
      }
    });

    it("stale async result is discarded when a newer render has started", async () => {
      asyncEl.props = { lookup: mockLookup("sales") };
      document.body.appendChild(asyncEl);
      await asyncEl.updateComplete;
      asyncEl.dataSet = mockDataSet();
      await asyncEl.updateComplete;

      const firstResolve = asyncEl.resolveOption!;

      // Trigger second render — new dataset
      asyncEl.dataSet = mockDataSet();
      await asyncEl.updateComplete;
      const secondResolve = asyncEl.resolveOption!;

      // Resolve second first (fresh)
      secondResolve({ series: [{ type: "bar", data: [4, 5, 6] }] });
      await Promise.resolve();

      expect(mockChart.setOption).toHaveBeenCalledTimes(1);
      expect(mockChart.setOption).toHaveBeenCalledWith(
        { series: [{ type: "bar", data: [4, 5, 6] }] },
        true,
      );

      // Resolve first (stale) — should be discarded
      mockChart.setOption.mockClear();
      firstResolve({ series: [{ type: "bar", data: [1, 2, 3] }] });
      await Promise.resolve();

      expect(mockChart.setOption).not.toHaveBeenCalled();
    });

    it("rejected buildOption sets error state instead of unhandled rejection", async () => {
      asyncEl.props = { lookup: mockLookup("sales") };
      document.body.appendChild(asyncEl);
      await asyncEl.updateComplete;
      asyncEl.dataSet = mockDataSet();
      await asyncEl.updateComplete;

      const reject = asyncEl.rejectOption!;
      reject(new Error("Expression evaluation failed"));
      await Promise.resolve();
      await Promise.resolve();

      expect(asyncEl.error).toBe("Expression evaluation failed");
    });

    it("stale rejection is silently discarded", async () => {
      asyncEl.props = { lookup: mockLookup("sales") };
      document.body.appendChild(asyncEl);
      await asyncEl.updateComplete;
      asyncEl.dataSet = mockDataSet();
      await asyncEl.updateComplete;

      const firstReject = asyncEl.rejectOption!;

      // Trigger second render
      asyncEl.dataSet = mockDataSet();
      await asyncEl.updateComplete;

      // Reject first (stale) — should not set error
      firstReject(new Error("stale error"));
      await Promise.resolve();
      await Promise.resolve();

      expect(asyncEl.error).toBe("");
    });
  });
});
