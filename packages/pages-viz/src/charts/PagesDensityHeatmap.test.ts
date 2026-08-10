import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { DensityHeatmapProps } from "@casehubio/pages-component";
import { toTypedDataSet } from "@casehubio/pages-data";

// ── Mock @drdreo/heatmap ─────────────────────────────────────────────

const mockHeatmap = {
  setData: vi.fn(),
  destroy: vi.fn(),
};

vi.mock("@drdreo/heatmap", () => ({
  createHeatmap: vi.fn(() => mockHeatmap),
  withTooltip: vi.fn(() => ({ type: "tooltip" })),
  withLegend: vi.fn(() => ({ type: "legend" })),
}));

import { createHeatmap, withTooltip, withLegend } from "@drdreo/heatmap";

// Import after mocks
import { PagesDensityHeatmap } from "./PagesDensityHeatmap.js";

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

function mockContainerSize(el: PagesDensityHeatmap): void {
  const shadow = el.shadowRoot;
  if (!shadow) return;
  const container = shadow.querySelector("div");
  if (!container) return;
  Object.defineProperty(container, "offsetWidth", { value: 500, configurable: true });
  Object.defineProperty(container, "offsetHeight", { value: 400, configurable: true });
}

async function renderChart(el: PagesDensityHeatmap, props: DensityHeatmapProps, ds: TypedDataSet): Promise<void> {
  el.props = props;
  document.body.appendChild(el);
  await el.updateComplete;
  el.dataSet = ds;
  await el.updateComplete;
  mockContainerSize(el);
  el.requestUpdate();
  await el.updateComplete;
  await new Promise(r => { setTimeout(r, 0); });
  await el.updateComplete;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesDensityHeatmap", () => {
  let el: PagesDensityHeatmap;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("pages-density-heatmap");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("data mapping", () => {
    it("creates heatmap with normalized coordinates", async () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[0, 0, 5], [100, 100, 8], [50, 50, 3]],
      );
      await renderChart(el, { lookup: mockLookup("test") }, ds);

      expect(createHeatmap).toHaveBeenCalled();
      const config = vi.mocked(createHeatmap).mock.calls[0]![0] as unknown as Record<string, unknown>;
      const data = config.data as { x: number; y: number; value: number }[];
      expect(data).toHaveLength(3);
      expect(data[0]!.x).toBe(30);
      expect(data[0]!.y).toBe(30);
      expect(data[1]!.x).toBe(470);
      expect(data[1]!.y).toBe(370);
      expect(data[2]!.value).toBe(3);
    });

    it("uses explicit column mappings when provided", async () => {
      const ds = makeDataSet(
        [["lat", "NUMBER"], ["lng", "NUMBER"], ["intensity", "NUMBER"]],
        [[0, 0, 100], [10, 10, 50]],
      );
      const props: DensityHeatmapProps = {
        lookup: mockLookup("test"),
        xColumn: "lat" as ColumnId,
        yColumn: "lng" as ColumnId,
        valueColumn: "intensity" as ColumnId,
      };
      await renderChart(el, props, ds);

      const config = vi.mocked(createHeatmap).mock.calls[0]![0] as unknown as Record<string, unknown>;
      const data = config.data as { x: number; y: number; value: number }[];
      expect(data[0]!.value).toBe(100);
      expect(data[1]!.value).toBe(50);
    });

    it("skips rows with null values", async () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5], [null, 40, 8], [50, 60, null]],
      );
      await renderChart(el, { lookup: mockLookup("test") }, ds);

      const config = vi.mocked(createHeatmap).mock.calls[0]![0] as unknown as Record<string, unknown>;
      const data = config.data as { x: number; y: number; value: number }[];
      expect(data).toHaveLength(1);
      expect(data[0]!.value).toBe(5);
    });
  });

  describe("configuration", () => {
    it("passes gradient to createHeatmap config", async () => {
      const gradient = [
        { offset: 0, color: "blue" },
        { offset: 1, color: "red" },
      ];
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5]],
      );
      await renderChart(el, { lookup: mockLookup("test"), gradient }, ds);

      const config = vi.mocked(createHeatmap).mock.calls[0]![0] as unknown as Record<string, unknown>;
      expect(config.gradient).toEqual(gradient);
    });

    it("passes aggregation mode to config", async () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5]],
      );
      await renderChart(el, { lookup: mockLookup("test"), aggregation: "sum" }, ds);

      const config = vi.mocked(createHeatmap).mock.calls[0]![0] as unknown as Record<string, unknown>;
      expect(config.aggregationMode).toBe("sum");
    });

    it("enables tooltip feature when showTooltip is true", async () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5]],
      );
      await renderChart(el, { lookup: mockLookup("test"), showTooltip: true }, ds);

      expect(withTooltip).toHaveBeenCalled();
    });

    it("enables legend feature when showLegend is true", async () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5]],
      );
      await renderChart(el, { lookup: mockLookup("test"), showLegend: true }, ds);

      expect(withLegend).toHaveBeenCalled();
    });
  });

  describe("lifecycle", () => {
    it("calls setData on data update (not recreate)", async () => {
      const ds1 = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5]],
      );
      const ds2 = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[30, 40, 8]],
      );
      await renderChart(el, { lookup: mockLookup("test") }, ds1);

      vi.mocked(createHeatmap).mockClear();
      el.dataSet = ds2;
      await el.updateComplete;
      await new Promise(r => { setTimeout(r, 0); });
      await el.updateComplete;

      expect(createHeatmap).not.toHaveBeenCalled();
      expect(mockHeatmap.setData).toHaveBeenCalled();
    });

    it("destroys heatmap on disconnect", async () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["value", "NUMBER"]],
        [[10, 20, 5]],
      );
      await renderChart(el, { lookup: mockLookup("test") }, ds);

      el.remove();
      expect(mockHeatmap.destroy).toHaveBeenCalled();
    });
  });
});
