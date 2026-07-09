import {describe, expect, it, vi} from "vitest";
import {createDataSetManager} from "./manager.js";
import {toTypedDataSet} from "./conversion.js";
import {createLookup} from "./lookup.js";
import type {Column} from "./types.js";
import {columnId, ColumnType, dataSetId} from "./types.js";
import type {FilterOp, ResolvedFilterOp} from "./filter.js";
import type {GroupOp} from "./group.js";
import type {SortOp} from "./sort.js";
import {parseTimeFrame} from "./timeframe.js";
import {DataSetError} from "./errors.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: columnId(id), name, type };
}

function testDataSet(rows: (string | null)[][]) {
  return toTypedDataSet({
    columns: [
      col("name", "Name", ColumnType.LABEL),
      col("amount", "Amount", ColumnType.NUMBER),
    ],
    data: rows,
  });
}

const ID_A = dataSetId("dataset-a");
const ID_UNKNOWN = dataSetId("does-not-exist");

describe("DataSetManager — registry", () => {
  it("snapshot + get returns the same dataset", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds });
    expect(mgr.get(ID_A)).toBe(ds);
  });

  it("snapshot overwrites existing dataset with same ID", () => {
    const mgr = createDataSetManager();
    const ds1 = testDataSet([["Alice", "100"]]);
    const ds2 = testDataSet([["Bob", "200"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds1 });
    mgr.apply(ID_A, { type: "snapshot", dataset: ds2 });
    expect(mgr.get(ID_A)).toBe(ds2);
  });

  it("get returns undefined for unknown ID", () => {
    const mgr = createDataSetManager();
    expect(mgr.get(ID_UNKNOWN)).toBeUndefined();
  });

  it("has returns true for registered ID", () => {
    const mgr = createDataSetManager();
    mgr.apply(ID_A, { type: "snapshot", dataset: testDataSet([["Alice", "100"]]) });
    expect(mgr.has(ID_A)).toBe(true);
  });

  it("has returns false for unknown ID", () => {
    const mgr = createDataSetManager();
    expect(mgr.has(ID_UNKNOWN)).toBe(false);
  });

  it("remove returns true and deletes registered dataset", () => {
    const mgr = createDataSetManager();
    mgr.apply(ID_A, { type: "snapshot", dataset: testDataSet([["Alice", "100"]]) });
    expect(mgr.remove(ID_A)).toBe(true);
    expect(mgr.get(ID_A)).toBeUndefined();
  });

  it("remove returns false for unknown ID", () => {
    const mgr = createDataSetManager();
    expect(mgr.remove(ID_UNKNOWN)).toBe(false);
  });
});

function salesDataSet() {
  return toTypedDataSet({
    columns: [
      col("dept", "Department", ColumnType.LABEL),
      col("revenue", "Revenue", ColumnType.NUMBER),
      col("date", "Date", ColumnType.DATE),
    ],
    data: [
      ["Sales", "100", "2024-01-15T00:00:00.000Z"],
      ["Engineering", "200", "2024-04-01T00:00:00.000Z"],
      ["Sales", "150", "2024-07-01T00:00:00.000Z"],
      ["Marketing", "50", "2023-06-01T00:00:00.000Z"],
      ["Engineering", "300", "2024-10-01T00:00:00.000Z"],
    ],
  });
}

const SALES_ID = dataSetId("sales");

describe("DataSetManager — lookup pipeline", () => {
  it("no operations returns full dataset unchanged", () => {
    const mgr = createDataSetManager();
    const ds = salesDataSet();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: ds });
    const result = mgr.lookup(createLookup(SALES_ID, []));
    expect(result.dataset).toBe(ds);
    expect(result.totalRows).toBe(5);
  });

  it("resolved filter ops applied correctly", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "numeric",
        columnId: columnId("revenue"),
        filter: { fn: "GREATER_THAN", value: 100 },
      }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [filter]));
    expect(result.dataset.rows).toHaveLength(3);
    expect(result.totalRows).toBe(3);
  });

  it("unresolved filter ops resolved against column schema then applied", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const filter: FilterOp = {
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: columnId("revenue"),
        fn: "GREATER_THAN",
        args: ["100"],
      }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [filter]));
    expect(result.dataset.rows).toHaveLength(3);
    expect(result.totalRows).toBe(3);
  });

  it("group ops applied correctly", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const group: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: columnId("dept"),
        columnId: columnId("dept"),
        strategy: { mode: "distinct" },
        maxIntervals: 15,
        emptyIntervals: false,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: columnId("dept"), columnId: columnId("dept") },
        { kind: "aggregate", sourceId: columnId("revenue"), columnId: columnId("total"), fn: { fn: "SUM" } },
      ],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [group]));
    expect(result.dataset.rows).toHaveLength(3);
    expect(result.totalRows).toBe(3);
  });

  it("sort ops applied correctly", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: columnId("revenue"), order: "DESCENDING" }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [sort]));
    expect(result.dataset.rows[0]!.number(columnId("revenue"))).toBe(300);
    expect(result.dataset.rows[4]!.number(columnId("revenue"))).toBe(50);
    expect(result.totalRows).toBe(5);
  });

  it("filter + group + sort full pipeline", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "numeric",
        columnId: columnId("revenue"),
        filter: { fn: "GREATER_OR_EQUALS_TO", value: 100 },
      }],
    };
    const group: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: columnId("dept"),
        columnId: columnId("dept"),
        strategy: { mode: "distinct" },
        maxIntervals: 15,
        emptyIntervals: false,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: columnId("dept"), columnId: columnId("dept") },
        { kind: "aggregate", sourceId: columnId("revenue"), columnId: columnId("total"), fn: { fn: "SUM" } },
      ],
    };
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: columnId("total"), order: "DESCENDING" }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [filter, group, sort]));
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("dept"))).toBe("Engineering");
    expect(result.dataset.rows[0]!.number(columnId("total"))).toBe(500);
    expect(result.dataset.rows[1]!.text(columnId("dept"))).toBe("Sales");
    expect(result.dataset.rows[1]!.number(columnId("total"))).toBe(250);
    expect(result.totalRows).toBe(2);
  });

  it("TIME_FRAME filter with explicit referenceDate — deterministic", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const timeFrame = parseTimeFrame("begin[year] till end[year]");
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "date",
        columnId: columnId("date"),
        filter: { fn: "TIME_FRAME", timeFrame },
      }],
    };
    const refDate = new Date(Date.UTC(2024, 5, 1));
    const result = mgr.lookup(
      createLookup(SALES_ID, [filter]),
      { referenceDate: refDate },
    );
    expect(result.dataset.rows).toHaveLength(4);
    expect(result.totalRows).toBe(4);
  });
});

describe("DataSetManager — pagination", () => {
  function setupManager() {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    return mgr;
  }

  it("no options returns all rows", () => {
    const result = setupManager().lookup(createLookup(SALES_ID, []));
    expect(result.dataset.rows).toHaveLength(5);
    expect(result.totalRows).toBe(5);
  });

  it("explicit defaults return all rows", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 0, rowCount: -1 },
    );
    expect(result.dataset.rows).toHaveLength(5);
    expect(result.totalRows).toBe(5);
  });

  it("rowOffset + rowCount slices correctly", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 1, rowCount: 2 },
    );
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.number(columnId("revenue"))).toBe(200);
    expect(result.dataset.rows[1]!.number(columnId("revenue"))).toBe(150);
    expect(result.totalRows).toBe(5); // totalRows is before pagination
  });

  it("rowCount: 0 returns zero rows", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 0, rowCount: 0 },
    );
    expect(result.dataset.rows).toHaveLength(0);
    expect(result.totalRows).toBe(5); // totalRows is before pagination
  });

  it("rowOffset beyond dataset length returns zero rows", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 100, rowCount: 10 },
    );
    expect(result.dataset.rows).toHaveLength(0);
    expect(result.totalRows).toBe(5); // totalRows is before pagination
  });

  it("rowCount: -1 with offset returns all rows from offset", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 3, rowCount: -1 },
    );
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.totalRows).toBe(5); // totalRows is before pagination
  });

  it("pagination applies after ops", () => {
    const mgr = setupManager();
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: columnId("revenue"), order: "ASCENDING" }],
    };
    const result = mgr.lookup(
      createLookup(SALES_ID, [sort]),
      { rowOffset: 0, rowCount: 2 },
    );
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.number(columnId("revenue"))).toBe(50);
    expect(result.dataset.rows[1]!.number(columnId("revenue"))).toBe(100);
    expect(result.totalRows).toBe(5); // totalRows is after ops but before pagination
  });
});

describe("DataSetManager — error paths", () => {
  it("unknown dataset ID throws UNKNOWN_PROVIDER", () => {
    const mgr = createDataSetManager();
    expect(() => mgr.lookup(createLookup(ID_UNKNOWN, []))).toThrow(DataSetError);
    expect(() => mgr.lookup(createLookup(ID_UNKNOWN, []))).toThrow("UNKNOWN_PROVIDER");
  });

  it("filter referencing unknown column throws UNKNOWN_COLUMN", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const filter: FilterOp = {
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: columnId("nonexistent"),
        fn: "EQUALS_TO",
        args: ["x"],
      }],
    };
    expect(() => mgr.lookup(createLookup(SALES_ID, [filter]))).toThrow("UNKNOWN_COLUMN");
  });

  it("invalid function/type combo throws RESOLUTION_FAILED", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const filter: FilterOp = {
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: columnId("revenue"),
        fn: "LIKE_TO",
        args: ["%test%"],
      }],
    };
    expect(() => mgr.lookup(createLookup(SALES_ID, [filter]))).toThrow("RESOLUTION_FAILED");
  });

  it("negative rowOffset throws INVALID_OPERATION", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    expect(() => mgr.lookup(
      createLookup(SALES_ID, []),
      { rowOffset: -1 },
    )).toThrow("INVALID_OPERATION");
  });

  it("raw-object DataSetLookup with invalid op order throws INVALID_OPERATION", () => {
    const mgr = createDataSetManager();
    mgr.apply(SALES_ID, { type: "snapshot", dataset: salesDataSet() });
    const sort: SortOp = { type: "sort", columns: [{ columnId: columnId("revenue"), order: "ASCENDING" }] };
    const group: GroupOp = { type: "group", groupingKey: null, columns: [] };
    const rawLookup = { dataSetId: SALES_ID, operations: [sort, group] } as const;
    expect(() => mgr.lookup(rawLookup)).toThrow("INVALID_OPERATION");
  });
});

describe("DataSetManager — append (legacy accumulate behavior)", () => {
  it("append on empty registry is a no-op (requires explicit snapshot first)", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "append", rows: ds.rows });
    expect(mgr.has(ID_A)).toBe(false);
  });

  it("append adds new rows at END (old accumulate prepended)", () => {
    const mgr = createDataSetManager();
    const old = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: old });
    const fresh = testDataSet([["Bob", "200"]]);
    mgr.apply(ID_A, { type: "append", rows: fresh.rows });
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(stored.rows[1]!.text(columnId("name"))).toBe("Bob");
  });

  it("append trims oldest rows from START when maxRows exceeded", () => {
    const mgr = createDataSetManager();
    const old = testDataSet([["Alice", "100"], ["Bob", "200"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: old });
    const fresh = testDataSet([["Charlie", "300"]]);
    mgr.apply(ID_A, { type: "append", rows: fresh.rows, maxRows: 2 });
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0]!.text(columnId("name"))).toBe("Bob");
    expect(stored.rows[1]!.text(columnId("name"))).toBe("Charlie");
  });

  it("append with zero new rows preserves existing dataset", () => {
    const mgr = createDataSetManager();
    const existing = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: existing });
    const empty = testDataSet([]);
    mgr.apply(ID_A, { type: "append", rows: empty.rows });
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.text(columnId("name"))).toBe("Alice");
  });

  it("append with no maxRows appends all rows at END", () => {
    const mgr = createDataSetManager();
    const old = testDataSet([["Alice", "100"], ["Bob", "200"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: old });
    const fresh = testDataSet([["Charlie", "300"], ["Diana", "400"]]);
    mgr.apply(ID_A, { type: "append", rows: fresh.rows });
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(4);
    expect(stored.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(stored.rows[1]!.text(columnId("name"))).toBe("Bob");
    expect(stored.rows[2]!.text(columnId("name"))).toBe("Charlie");
    expect(stored.rows[3]!.text(columnId("name"))).toBe("Diana");
  });

  it("append validates row cells against existing column schema", () => {
    const mgr = createDataSetManager();
    mgr.apply(ID_A, { type: "snapshot", dataset: testDataSet([["Alice", "100"]]) });

    // Different schema — LABEL column instead of NUMBER for amount
    const differentSchema = toTypedDataSet({
      columns: [
        col("name", "Name", ColumnType.LABEL),
        col("amount", "Amount", ColumnType.LABEL),
      ],
      data: [["Bob", "text"]],
    });

    // Append inherits existing columns; row cell validation happens during append
    mgr.apply(ID_A, { type: "append", rows: differentSchema.rows });

    // Cell-level validation allows this (rows conform to existing schema structure)
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(stored.rows[1]!.text(columnId("name"))).toBe("Bob");
  });
});

describe("apply()", () => {
  it("snapshot replaces entire dataset", () => {
    const mgr = createDataSetManager();
    const ds1 = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Sales", "100", "2024-01-01T00:00:00.000Z"]],
    });
    const ds2 = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Engineering", "200", "2024-02-01T00:00:00.000Z"]],
    });

    mgr.apply(ID_A, { type: "snapshot", dataset: ds1 });
    expect(mgr.get(ID_A)?.rows).toHaveLength(1);

    mgr.apply(ID_A, { type: "snapshot", dataset: ds2 });
    expect(mgr.get(ID_A)?.rows).toHaveLength(1);
    expect(mgr.get(ID_A)?.rows[0]!.text(columnId("dept"))).toBe("Engineering");
  });

  it("append adds rows to END of existing dataset", () => {
    const mgr = createDataSetManager();
    const seed = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Sales", "100", "2024-01-01T00:00:00.000Z"]],
    });
    mgr.apply(ID_A, { type: "snapshot", dataset: seed });

    const newRow = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Engineering", "200", "2024-02-01T00:00:00.000Z"]],
    }).rows[0]!;
    mgr.apply(ID_A, { type: "append", rows: [newRow] });

    const result = mgr.get(ID_A)!;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.text(columnId("dept"))).toBe("Sales");
    expect(result.rows[1]!.text(columnId("dept"))).toBe("Engineering");
  });

  it("append trims from START when maxRows exceeded", () => {
    const mgr = createDataSetManager();
    const seed = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [
        ["Sales", "100", "2024-01-01T00:00:00.000Z"],
        ["Engineering", "200", "2024-02-01T00:00:00.000Z"],
      ],
    });
    mgr.apply(ID_A, { type: "snapshot", dataset: seed });

    const newRow = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Marketing", "50", "2024-03-01T00:00:00.000Z"]],
    }).rows[0]!;
    mgr.apply(ID_A, { type: "append", rows: [newRow], maxRows: 2 });

    const result = mgr.get(ID_A)!;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.text(columnId("dept"))).toBe("Engineering");
    expect(result.rows[1]!.text(columnId("dept"))).toBe("Marketing");
  });

  it("append to non-existent dataset is a no-op", () => {
    const mgr = createDataSetManager();
    const row = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Sales", "100", "2024-01-01T00:00:00.000Z"]],
    }).rows[0]!;
    mgr.apply(ID_A, { type: "append", rows: [row] });
    expect(mgr.has(ID_A)).toBe(false);
  });

  it("replace updates all matching rows by key", () => {
    const mgr = createDataSetManager();
    const seed = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [
        ["Sales", "100", "2024-01-01T00:00:00.000Z"],
        ["Engineering", "200", "2024-02-01T00:00:00.000Z"],
      ],
    });
    mgr.apply(ID_A, { type: "snapshot", dataset: seed });

    const replacement = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Sales", "999", "2024-06-01T00:00:00.000Z"]],
    }).rows[0]!;
    mgr.apply(ID_A, {
      type: "replace",
      keyColumn: columnId("dept"),
      key: "Sales",
      row: replacement,
    });

    const result = mgr.get(ID_A)!;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.number(columnId("revenue"))).toBe(999);
    expect(result.rows[1]!.text(columnId("dept"))).toBe("Engineering");
  });

  it("replace is a no-op when no rows match", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Sales", "100", "2024-01-01T00:00:00.000Z"]],
    });
    mgr.apply(ID_A, { type: "snapshot", dataset: seed });
    callback.mockClear();

    const replacement = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Unknown", "0", "2024-01-01T00:00:00.000Z"]],
    }).rows[0]!;
    mgr.apply(ID_A, {
      type: "replace",
      keyColumn: columnId("dept"),
      key: "Unknown",
      row: replacement,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("remove filters out all matching rows by key", () => {
    const mgr = createDataSetManager();
    const seed = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [
        ["Sales", "100", "2024-01-01T00:00:00.000Z"],
        ["Engineering", "200", "2024-02-01T00:00:00.000Z"],
        ["Sales", "150", "2024-03-01T00:00:00.000Z"],
      ],
    });
    mgr.apply(ID_A, { type: "snapshot", dataset: seed });

    mgr.apply(ID_A, {
      type: "remove",
      keyColumn: columnId("dept"),
      key: "Sales",
    });

    const result = mgr.get(ID_A)!;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text(columnId("dept"))).toBe("Engineering");
  });

  it("remove is a no-op when no rows match", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [["Sales", "100", "2024-01-01T00:00:00.000Z"]],
    });
    mgr.apply(ID_A, { type: "snapshot", dataset: seed });
    callback.mockClear();

    mgr.apply(ID_A, {
      type: "remove",
      keyColumn: columnId("dept"),
      key: "Unknown",
    });

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("DataSetManager — append validation", () => {
  it("rejects append when row cell count does not match column count", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds });

    // Create a row with 3 cells instead of 2
    const badRow = toTypedDataSet({
      columns: [
        col("name", "Name", ColumnType.LABEL),
        col("amount", "Amount", ColumnType.NUMBER),
        col("extra", "Extra", ColumnType.TEXT),
      ],
      data: [["Bob", "200", "surplus"]],
    });

    mgr.apply(ID_A, { type: "append", rows: badRow.rows });

    // Dataset should still have only the original row
    const result = mgr.get(ID_A);
    expect(result?.rows).toHaveLength(1);
  });

  it("accepts append when row cell count matches column count", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds });

    const goodRow = testDataSet([["Bob", "200"]]);
    mgr.apply(ID_A, { type: "append", rows: goodRow.rows });

    const result = mgr.get(ID_A);
    expect(result?.rows).toHaveLength(2);
  });

  it("rejects entire append if any row has wrong cell count", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds });

    const goodRow = testDataSet([["Bob", "200"]]).rows[0]!;
    const badRow = toTypedDataSet({
      columns: [
        col("name", "Name", ColumnType.LABEL),
        col("amount", "Amount", ColumnType.NUMBER),
        col("extra", "Extra", ColumnType.TEXT),
      ],
      data: [["Carol", "300", "surplus"]],
    }).rows[0]!;

    mgr.apply(ID_A, { type: "append", rows: [goodRow, badRow] });

    // Neither row should be appended — reject-all semantics
    const result = mgr.get(ID_A);
    expect(result?.rows).toHaveLength(1);
  });

  it("does not fire onChanged when append is rejected", () => {
    const onChange = vi.fn();
    const mgr = createDataSetManager({ onChanged: onChange });
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds });
    onChange.mockClear();

    const badRow = toTypedDataSet({
      columns: [
        col("name", "Name", ColumnType.LABEL),
        col("amount", "Amount", ColumnType.NUMBER),
        col("extra", "Extra", ColumnType.TEXT),
      ],
      data: [["Bob", "200", "surplus"]],
    });

    mgr.apply(ID_A, { type: "append", rows: badRow.rows });
    expect(onChange).not.toHaveBeenCalled();
  });
});
