import { describe, it, expect } from "vitest";
import { typedRowToRecord } from "./selection-bridge.js";
import { columnId, ColumnType } from "@casehubio/pages-data";
import type { TypedRow, CellValue, Column } from "@casehubio/pages-data";

function createTypedRow(
  cols: Array<{ id: string; type: string; value: unknown }>,
): TypedRow {
  const cells: CellValue[] = cols.map((col) =>
    col.value === null
      ? ({ type: "NULL" } as CellValue)
      : ({ type: col.type, value: col.value } as CellValue),
  );
  return {
    cells,
    cell(colId) {
      const idx = cols.findIndex((c) => c.id === (colId as string));
      return idx >= 0 ? cells[idx]! : ({ type: "NULL" } as CellValue);
    },
    number(colId) {
      const cell = this.cell(colId);
      return cell.type === ColumnType.NUMBER ? (cell.value as number) : 0;
    },
    text(colId) {
      const cell = this.cell(colId);
      return cell.type === ColumnType.TEXT ? (cell.value as string) : "";
    },
    date(colId) {
      const cell = this.cell(colId);
      return cell.type === ColumnType.DATE ? (cell.value as Date) : new Date(0);
    },
  };
}

describe("typedRowToRecord", () => {
  it("extracts cell values by column ID", () => {
    const columns: Column[] = [
      { id: columnId("id"), name: "ID", type: ColumnType.NUMBER },
      { id: columnId("name"), name: "Name", type: ColumnType.TEXT },
    ];
    const row = createTypedRow([
      { id: "id", type: ColumnType.NUMBER, value: 42 },
      { id: "name", type: ColumnType.TEXT, value: "Event A" },
    ]);

    const result = typedRowToRecord(row, columns);
    expect(result).toEqual({ id: 42, name: "Event A" });
  });

  it("converts NULL cells to null", () => {
    const columns: Column[] = [
      { id: columnId("grade"), name: "Grade", type: ColumnType.TEXT },
    ];
    const row = createTypedRow([
      { id: "grade", type: "NULL", value: null },
    ]);

    const result = typedRowToRecord(row, columns);
    expect(result).toEqual({ grade: null });
  });

  it("converts Date cells to ISO string", () => {
    const columns: Column[] = [
      { id: columnId("onset"), name: "Onset", type: ColumnType.DATE },
    ];
    const d = new Date("2026-01-15T00:00:00.000Z");
    const row = createTypedRow([
      { id: "onset", type: ColumnType.DATE, value: d },
    ]);

    const result = typedRowToRecord(row, columns);
    expect(result).toEqual({ onset: "2026-01-15T00:00:00.000Z" });
  });
});
