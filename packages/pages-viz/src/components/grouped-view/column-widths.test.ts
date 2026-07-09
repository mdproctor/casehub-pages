import { describe, it, expect } from "vitest";
import { computeColumnWidths } from "./column-widths.js";
import type { DataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";

function makeDataset(headers: string[], rows: string[][]) {
  const ds: DataSet = {
    columns: headers.map((h) => ({ id: h as ColumnId, name: h, type: ColumnType.LABEL })),
    data: rows,
  };
  return toTypedDataSet(ds);
}

describe("computeColumnWidths", () => {
  it("returns equal widths when Canvas is unavailable", () => {
    const dataset = makeDataset(["A", "B", "C"], [["x", "y", "z"]]);
    const widths = computeColumnWidths(dataset, ["A", "B", "C"] as ColumnId[], "14px sans-serif");
    expect(widths).toHaveLength(3);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[1]).toBe(widths[2]);
  });

  it("returns one width per column", () => {
    const dataset = makeDataset(["Name", "Value"], [["short", "1"], ["a much longer name", "2"]]);
    const widths = computeColumnWidths(dataset, ["Name", "Value"] as ColumnId[], "14px sans-serif");
    expect(widths).toHaveLength(2);
    widths.forEach((w) => { expect(w).toBeGreaterThan(0); });
  });

  it("handles empty dataset", () => {
    const dataset = makeDataset(["A", "B"], []);
    const widths = computeColumnWidths(dataset, ["A", "B"] as ColumnId[], "14px sans-serif");
    expect(widths).toHaveLength(2);
    widths.forEach((w) => { expect(w).toBeGreaterThan(0); });
  });

  it("respects sampleSize limit", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [String(i), "val"]);
    const dataset = makeDataset(["ID", "Val"], rows);
    const widths = computeColumnWidths(dataset, ["ID", "Val"] as ColumnId[], "14px sans-serif", 10);
    expect(widths).toHaveLength(2);
  });
});
