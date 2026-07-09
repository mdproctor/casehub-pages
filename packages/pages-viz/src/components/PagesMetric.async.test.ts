import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { MetricProps } from "@casehubio/pages-component";
import type { ColumnSettings } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";

// ── Controllable mock ────────────────────────────────────────────────

let applyCellResolvers: Array<(v: string | number | Date | null) => void> = [];
let applyCellRejecters: Array<(e: Error) => void> = [];

vi.mock("../base/cell-extract.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../base/cell-extract.js")>();
  return {
    ...original,
    applyCellExpression: vi.fn(
      () =>
        new Promise<string | number | Date | null>((resolve, reject) => {
          applyCellResolvers.push(resolve);
          applyCellRejecters.push(reject);
        }),
    ),
  };
});

import { PagesMetric } from "./PagesMetric.js";

// ── Helpers ──────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(
  columns: [string, string][],
  rows: (string | number | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows.map(row => row.map(cell => (cell === null ? null : String(cell)))),
  };
  return toTypedDataSet(ds);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("PagesMetric async expressions", () => {
  let el: PagesMetric;

  beforeEach(() => {
    vi.clearAllMocks();
    applyCellResolvers = [];
    applyCellRejecters = [];
    el = document.createElement("pages-metric");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("stale async expression result is discarded on rapid dataset update", async () => {
    const ds1 = makeDataSet([["val", "NUMBER"]], [[10]]);
    const ds2 = makeDataSet([["val", "NUMBER"]], [[20]]);
    const props: MetricProps = {
      lookup: mockLookup("test"),
      columns: [{ id: "val", expression: "$value * 2" } as ColumnSettings],
    };

    el.props = props;
    document.body.appendChild(el);

    // First dataset — triggers async expression
    el.dataSet = ds1;
    expect(applyCellResolvers).toHaveLength(1);

    // Second dataset — triggers another async expression
    el.dataSet = ds2;
    expect(applyCellResolvers).toHaveLength(2);

    // Resolve second (fresh) first
    applyCellResolvers[1]!("40");
    await Promise.resolve();

    const value = el.shadowRoot.querySelector(".card .value");
    expect(value?.textContent).toBe("40");

    // Resolve first (stale) — should NOT overwrite
    applyCellResolvers[0]!("20");
    await Promise.resolve();

    expect(value?.textContent).toBe("40");
  });

  it("rejected expression sets error state", async () => {
    const ds = makeDataSet([["val", "NUMBER"]], [[10]]);
    const props: MetricProps = {
      lookup: mockLookup("test"),
      columns: [{ id: "val", expression: "$value * 2" } as ColumnSettings],
    };

    el.props = props;
    document.body.appendChild(el);
    el.dataSet = ds;

    expect(applyCellRejecters).toHaveLength(1);
    applyCellRejecters[0]!(new Error("callback boom"));
    await Promise.resolve();
    await Promise.resolve();

    const errorEl = el.shadowRoot.querySelector("[data-pages-error]");
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain("callback boom");
  });
});
