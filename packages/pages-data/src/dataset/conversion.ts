import type { CellValue, Column, ColumnId, DataSet, TypedDataSet, TypedRow } from "./types.js";
import { ColumnType } from "./types.js";
import { DataSetError } from "./errors.js";

function parseCell(value: string, column: Column, rowIndex: number): CellValue {
  switch (column.type) {
    case ColumnType.TEXT:
      return { type: ColumnType.TEXT, value };

    case ColumnType.LABEL:
      return { type: ColumnType.LABEL, value };

    case ColumnType.NUMBER: {
      const n = parseFloat(value);
      if (Number.isNaN(n)) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Cannot parse "${value}" as NUMBER in column "${column.id}" at row ${String(rowIndex)}`,
        );
      }
      return { type: ColumnType.NUMBER, value: n };
    }

    case ColumnType.DATE: {
      const epoch = Number(value);
      const d = Number.isNaN(epoch) ? new Date(value) : new Date(epoch);
      if (Number.isNaN(d.getTime())) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Cannot parse "${value}" as DATE in column "${column.id}" at row ${String(rowIndex)}`,
        );
      }
      return { type: ColumnType.DATE, value: d };
    }
  }
}

export function createTypedRow(cells: readonly CellValue[], columns: readonly Column[]): TypedRow {
  const frozenCells = Object.freeze([...cells]);

  const columnIndex = new Map<ColumnId, number>();
  const columnIndexLower = new Map<string, number>();
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    if (!column) {
      throw new DataSetError("INVALID_OPERATION", `Column at index ${String(i)} is undefined`);
    }
    columnIndex.set(column.id, i);
    if (typeof column.id === "string") {
      columnIndexLower.set(column.id.toLowerCase(), i);
    }
  }

  const row: TypedRow = {
    cells: frozenCells,

    cell(columnId: ColumnId): CellValue {
      const idx = columnIndex.get(columnId)
        ?? (typeof columnId === "string" ? columnIndexLower.get(columnId.toLowerCase()) : undefined);
      if (idx === undefined) {
        console.warn(`[pages-data] Cell skipped: column "${columnId}" not found in dataset`);
        return { type: "NULL" as const };
      }
      const cell = frozenCells[idx];
      if (cell === undefined) {
        throw new DataSetError("INVALID_OPERATION", `Cell at index ${String(idx)} is undefined`);
      }
      return cell;
    },

    number(columnId: ColumnId): number {
      const cv = row.cell(columnId);
      if (cv.type !== ColumnType.NUMBER) {
        throw new DataSetError(
          "TYPE_MISMATCH",
          `Column "${columnId}" is ${cv.type}, not NUMBER`,
        );
      }
      return cv.value;
    },

    text(columnId: ColumnId): string {
      const cv = row.cell(columnId);
      if (cv.type !== ColumnType.TEXT && cv.type !== ColumnType.LABEL) {
        throw new DataSetError(
          "TYPE_MISMATCH",
          `Column "${columnId}" is ${cv.type}, not TEXT or LABEL`,
        );
      }
      return cv.value;
    },

    date(columnId: ColumnId): Date {
      const cv = row.cell(columnId);
      if (cv.type !== ColumnType.DATE) {
        throw new DataSetError(
          "TYPE_MISMATCH",
          `Column "${columnId}" is ${cv.type}, not DATE`,
        );
      }
      return cv.value;
    },
  };

  return Object.freeze(row);
}

export function toTypedDataSet(ds: DataSet): TypedDataSet {
  const rows: TypedRow[] = [];

  for (let rowIdx = 0; rowIdx < ds.data.length; rowIdx++) {
    const rawRow = ds.data[rowIdx];
    if (!rawRow) {
      throw new DataSetError("INVALID_OPERATION", `Row at index ${String(rowIdx)} is undefined`);
    }
    const cells: CellValue[] = [];

    for (let colIdx = 0; colIdx < ds.columns.length; colIdx++) {
      const column = ds.columns[colIdx];
      if (!column) {
        throw new DataSetError("INVALID_OPERATION", `Column at index ${String(colIdx)} is undefined`);
      }
      const rawValue = rawRow[colIdx];
      if (rawValue === undefined || rawValue === null) {
        cells.push({ type: "NULL" as const });
      } else {
        cells.push(parseCell(rawValue, column, rowIdx));
      }
    }

    rows.push(createTypedRow(cells, ds.columns));
  }

  return { columns: ds.columns, rows };
}

function cellToString(cell: CellValue): string | null {
  switch (cell.type) {
    case ColumnType.TEXT:
    case ColumnType.LABEL:
      return cell.value;
    case ColumnType.NUMBER:
      return String(cell.value);
    case ColumnType.DATE:
      return cell.value.toISOString();
    case "NULL":
      return null;
  }
}

export function toWireDataSet(ds: TypedDataSet): DataSet {
  const data: (string | null)[][] = [];

  for (const row of ds.rows) {
    const rawRow: (string | null)[] = [];
    for (const cell of row.cells) {
      rawRow.push(cellToString(cell));
    }
    data.push(rawRow);
  }

  return { columns: ds.columns, data };
}

export function fromRows<R>(
  rows: readonly R[],
  columns: readonly {
    readonly id: ColumnId;
    readonly name?: string;
    readonly type: ColumnType;
    readonly getValue: (row: R) => unknown;
  }[],
): TypedDataSet {
  const cols: Column[] = columns.map(c => ({
    id: c.id,
    name: c.name ?? String(c.id),
    type: c.type,
  }));

  const typedRows: TypedRow[] = rows.map((row) => {
    const cells: CellValue[] = columns.map((col) => {
      const raw = col.getValue(row);
      if (raw === null || raw === undefined) {
        return { type: "NULL" as const };
      }
      switch (col.type) {
        case ColumnType.NUMBER:
          return { type: ColumnType.NUMBER, value: typeof raw === "number" ? raw : parseFloat(String(raw)) };
        case ColumnType.DATE:
          return { type: ColumnType.DATE, value: raw instanceof Date ? raw : new Date(String(raw)) };
        case ColumnType.LABEL:
          return { type: ColumnType.LABEL, value: String(raw) };
        case ColumnType.TEXT:
        default:
          return { type: ColumnType.TEXT, value: String(raw) };
      }
    });
    return createTypedRow(cells, cols);
  });

  return { columns: cols, rows: typedRows };
}
