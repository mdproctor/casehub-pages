import { describe, it, expect } from "vitest";
import { toTypedDataSet, toWireDataSet, fromRows } from "./conversion.js";
import type { DataSet, Column} from "./types.js";
import { ColumnType, columnId} from "./types.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: columnId(id), name, type };
}

describe("toTypedDataSet", () => {
  it("parses a simple dataset with TEXT and NUMBER columns", () => {
    const ds: DataSet = {
      columns: [
        col("name", "Name", ColumnType.TEXT),
        col("revenue", "Revenue", ColumnType.NUMBER),
      ],
      data: [
        ["Acme", "100"],
        ["Beta", "250.5"],
      ],
    };

    const result = toTypedDataSet(ds);

    expect(result.columns).toEqual(ds.columns);
    expect(result.rows).toHaveLength(2);

    expect(result.rows[0]!.text(columnId("name"))).toBe("Acme");
    expect(result.rows[0]!.number(columnId("revenue"))).toBe(100);
    expect(result.rows[1]!.text(columnId("name"))).toBe("Beta");
    expect(result.rows[1]!.number(columnId("revenue"))).toBe(250.5);
  });

  it("parses DATE columns as UTC Dates", () => {
    const ds: DataSet = {
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [["2024-06-15T10:30:00.000Z"]],
    };

    const result = toTypedDataSet(ds);
    const date = result.rows[0]!.date(columnId("date"));

    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  it("parses LABEL columns as strings", () => {
    const ds: DataSet = {
      columns: [col("region", "Region", ColumnType.LABEL)],
      data: [["US"], ["EU"]],
    };

    const result = toTypedDataSet(ds);

    expect(result.rows[0]!.text(columnId("region"))).toBe("US");
    expect(result.rows[0]!.cell(columnId("region")).type).toBe(ColumnType.LABEL);
  });

  it("throws DataSetError for unparseable NUMBER", () => {
    const ds: DataSet = {
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["not-a-number"]],
    };

    expect(() => toTypedDataSet(ds)).toThrow("SCHEMA_MISMATCH");
  });

  it("throws DataSetError for unparseable DATE", () => {
    const ds: DataSet = {
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [["invalid-date"]],
    };

    expect(() => toTypedDataSet(ds)).toThrow("SCHEMA_MISMATCH");
  });

  it("handles empty dataset", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [],
    };

    const result = toTypedDataSet(ds);
    expect(result.rows).toHaveLength(0);
    expect(result.columns).toHaveLength(1);
  });

  it("cell() throws for unknown column ID", () => {
    const ds: DataSet = {
      columns: [col("name", "Name", ColumnType.TEXT)],
      data: [["Acme"]],
    };

    const result = toTypedDataSet(ds);
    expect(() => result.rows[0]!.cell(columnId("unknown"))).toThrow();
  });

  it("number() throws when called on a TEXT column", () => {
    const ds: DataSet = {
      columns: [col("name", "Name", ColumnType.TEXT)],
      data: [["Acme"]],
    };

    const result = toTypedDataSet(ds);
    expect(() => result.rows[0]!.number(columnId("name"))).toThrow();
  });

  it("returns immutable rows", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.NUMBER)],
      data: [["1"]],
    };

    const result = toTypedDataSet(ds);
    expect(Object.isFrozen(result.rows[0]!.cells)).toBe(true);
  });

  it("produces NULL cell for undefined raw value (short row)", () => {
    const ds: DataSet = {
      columns: [
        col("a", "A", ColumnType.TEXT),
        col("b", "B", ColumnType.NUMBER),
      ],
      data: [["hello"]],
    };
    const result = toTypedDataSet(ds);
    const cell = result.rows[0]!.cell(columnId("b"));
    expect(cell.type).toBe("NULL");
  });

  it("produces NULL cell for explicit null in data array", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[null]],
    };
    const result = toTypedDataSet(ds);
    expect(result.rows[0]!.cell(columnId("x")).type).toBe("NULL");
  });

  it("preserves empty string as valid TEXT value, not null", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[""]],
    };
    const result = toTypedDataSet(ds);
    const cell = result.rows[0]!.cell(columnId("x"));
    expect(cell.type).toBe(ColumnType.TEXT);
    expect((cell as { value: string }).value).toBe("");
  });

  it("text() throws on NULL cell", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[null]],
    };
    const result = toTypedDataSet(ds);
    expect(() => result.rows[0]!.text(columnId("x"))).toThrow();
  });
});

describe("toWireDataSet", () => {
  it("serializes TypedDataSet back to string[][] wire format", () => {
    const ds: DataSet = {
      columns: [
        col("name", "Name", ColumnType.TEXT),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [
        ["Acme", "100", "2024-06-15T10:30:00.000Z"],
      ],
    };

    const typed = toTypedDataSet(ds);
    const wire = toWireDataSet(typed);

    expect(wire.columns).toEqual(ds.columns);
    expect(wire.data).toHaveLength(1);
    expect(wire.data[0]![0]).toBe("Acme");
    expect(wire.data[0]![1]).toBe("100");
    expect(wire.data[0]![2]).toBe("2024-06-15T10:30:00.000Z");
  });

  it("round-trips through toTypedDataSet → toWireDataSet", () => {
    const ds: DataSet = {
      columns: [
        col("label", "Label", ColumnType.LABEL),
        col("count", "Count", ColumnType.NUMBER),
      ],
      data: [
        ["A", "1"],
        ["B", "2"],
      ],
    };

    const wire = toWireDataSet(toTypedDataSet(ds));
    expect(wire.data).toEqual(ds.data);
  });

  it("serializes NULL cell as null in wire format", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[null]],
    };
    const typed = toTypedDataSet(ds);
    const wire = toWireDataSet(typed);
    expect(wire.data[0]![0]).toBeNull();
  });

  it("round-trips null cells through toTypedDataSet → toWireDataSet", () => {
    const ds: DataSet = {
      columns: [
        col("a", "A", ColumnType.TEXT),
        col("b", "B", ColumnType.NUMBER),
      ],
      data: [["hello", null], [null, "42"]],
    };
    const wire = toWireDataSet(toTypedDataSet(ds));
    expect(wire.data[0]![0]).toBe("hello");
    expect(wire.data[0]![1]).toBeNull();
    expect(wire.data[1]![0]).toBeNull();
    expect(wire.data[1]![1]).toBe("42");
  });
});

describe("fromRows", () => {
  it("converts domain objects to TypedDataSet with typed accessors", () => {
    interface Capability { tag: string; score: number; }
    const rows: Capability[] = [
      { tag: "authentication", score: 0.95 },
      { tag: "authorization", score: 0.72 },
    ];
    const dataset = fromRows(rows, [
      { id: columnId("tag"), name: "Capability", type: ColumnType.TEXT, getValue: (c: Capability) => c.tag },
      { id: columnId("score"), name: "Score", type: ColumnType.NUMBER, getValue: (c: Capability) => c.score },
    ]);
    expect(dataset.columns).toHaveLength(2);
    expect(dataset.columns[0]!.id).toBe(columnId("tag"));
    expect(dataset.columns[0]!.name).toBe("Capability");
    expect(dataset.columns[0]!.type).toBe(ColumnType.TEXT);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]!.text(columnId("tag"))).toBe("authentication");
    expect(dataset.rows[0]!.number(columnId("score"))).toBe(0.95);
    expect(dataset.rows[1]!.text(columnId("tag"))).toBe("authorization");
  });

  it("handles null/undefined values as NULL cells", () => {
    const rows = [{ name: null as string | null }];
    const dataset = fromRows(rows, [
      { id: columnId("name"), type: ColumnType.TEXT, getValue: (r: { name: string | null }) => r.name },
    ]);
    const cell = dataset.rows[0]!.cell(columnId("name"));
    expect(cell.type).toBe("NULL");
  });

  it("handles undefined getValue result as NULL", () => {
    const rows = [{ x: undefined as string | undefined }];
    const dataset = fromRows(rows, [
      { id: columnId("x"), type: ColumnType.TEXT, getValue: (r: { x: string | undefined }) => r.x },
    ]);
    expect(dataset.rows[0]!.cell(columnId("x")).type).toBe("NULL");
  });

  it("handles Date values", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    const rows = [{ created: now }];
    const dataset = fromRows(rows, [
      { id: columnId("created"), type: ColumnType.DATE, getValue: (r: { created: Date }) => r.created },
    ]);
    expect(dataset.rows[0]!.date(columnId("created")).getTime()).toBe(now.getTime());
  });

  it("coerces string to number for NUMBER columns", () => {
    const rows = [{ val: "42.5" }];
    const dataset = fromRows(rows, [
      { id: columnId("val"), type: ColumnType.NUMBER, getValue: (r: { val: string }) => r.val },
    ]);
    expect(dataset.rows[0]!.number(columnId("val"))).toBe(42.5);
  });

  it("coerces string to Date for DATE columns", () => {
    const rows = [{ d: "2026-07-11" }];
    const dataset = fromRows(rows, [
      { id: columnId("d"), type: ColumnType.DATE, getValue: (r: { d: string }) => r.d },
    ]);
    expect(dataset.rows[0]!.date(columnId("d"))).toBeInstanceOf(Date);
  });

  it("produces empty dataset for empty input", () => {
    const dataset = fromRows([], [
      { id: columnId("x"), type: ColumnType.TEXT, getValue: () => "" },
    ]);
    expect(dataset.columns).toHaveLength(1);
    expect(dataset.rows).toHaveLength(0);
  });

  it("uses column id as name when name not provided", () => {
    const dataset = fromRows([{ a: 1 }], [
      { id: columnId("a"), type: ColumnType.NUMBER, getValue: (r: { a: number }) => r.a },
    ]);
    expect(dataset.columns[0]!.name).toBe("a");
  });
});
