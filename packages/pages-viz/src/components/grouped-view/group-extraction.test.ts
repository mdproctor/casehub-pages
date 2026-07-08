import { describe, it, expect } from "vitest";
import { extractGroupBoundaries } from "./group-extraction.js";
import type { DataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";

function makeGroupedDataset(groups: { key: string; rows: string[][] }[]) {
  const keyCol = "group_key" as ColumnId;
  const allRows: (string | null)[][] = [];
  for (const g of groups) {
    for (const row of g.rows) {
      allRows.push([g.key, ...row]);
    }
  }

  const ds: DataSet = {
    columns: [
      { id: keyCol, name: "Group", type: ColumnType.LABEL },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
      { id: "value" as ColumnId, name: "Value", type: ColumnType.LABEL },
    ],
    data: allRows,
  };

  return { dataset: toTypedDataSet(ds), keyCol, aggCols: [] as ColumnId[] };
}

describe("extractGroupBoundaries", () => {
  it("extracts groups from consecutive key values", () => {
    const { dataset, keyCol, aggCols } = makeGroupedDataset([
      { key: "Critical", rows: [["a", "1"], ["b", "2"]] },
      { key: "Warning", rows: [["c", "3"]] },
    ]);

    const boundaries = extractGroupBoundaries(dataset, keyCol, aggCols);
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]!.name).toBe("Critical");
    expect(boundaries[0]!.startRow).toBe(0);
    expect(boundaries[0]!.rowCount).toBe(2);
    expect(boundaries[1]!.name).toBe("Warning");
    expect(boundaries[1]!.startRow).toBe(2);
    expect(boundaries[1]!.rowCount).toBe(1);
  });

  it("handles single group", () => {
    const { dataset, keyCol, aggCols } = makeGroupedDataset([
      { key: "All", rows: [["a", "1"], ["b", "2"], ["c", "3"]] },
    ]);
    const boundaries = extractGroupBoundaries(dataset, keyCol, aggCols);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]!.rowCount).toBe(3);
  });

  it("handles empty dataset", () => {
    const ds: DataSet = {
      columns: [{ id: "k" as ColumnId, name: "Key", type: ColumnType.LABEL }],
      data: [],
    };
    const boundaries = extractGroupBoundaries(toTypedDataSet(ds), "k" as ColumnId, []);
    expect(boundaries).toHaveLength(0);
  });

  it("extracts aggregate values from aggregate columns", () => {
    const keyCol = "group_key" as ColumnId;
    const aggCol = "total" as ColumnId;
    const ds: DataSet = {
      columns: [
        { id: keyCol, name: "Group", type: ColumnType.LABEL },
        { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
        { id: aggCol, name: "Total", type: ColumnType.NUMBER },
      ],
      data: [
        ["Critical", "a", "100"],
        ["Critical", "b", "100"],
        ["Warning", "c", "50"],
      ],
    };
    const boundaries = extractGroupBoundaries(toTypedDataSet(ds), keyCol, [aggCol]);
    expect(boundaries[0]!.aggregates.get(aggCol)).toBe(100);
    expect(boundaries[1]!.aggregates.get(aggCol)).toBe(50);
  });

  it("handles three groups", () => {
    const { dataset, keyCol, aggCols } = makeGroupedDataset([
      { key: "A", rows: [["a1", "1"]] },
      { key: "B", rows: [["b1", "2"], ["b2", "3"]] },
      { key: "C", rows: [["c1", "4"]] },
    ]);
    const boundaries = extractGroupBoundaries(dataset, keyCol, aggCols);
    expect(boundaries).toHaveLength(3);
    expect(boundaries[0]!.name).toBe("A");
    expect(boundaries[0]!.rowCount).toBe(1);
    expect(boundaries[1]!.name).toBe("B");
    expect(boundaries[1]!.startRow).toBe(1);
    expect(boundaries[1]!.rowCount).toBe(2);
    expect(boundaries[2]!.name).toBe("C");
    expect(boundaries[2]!.startRow).toBe(3);
    expect(boundaries[2]!.rowCount).toBe(1);
  });
});
