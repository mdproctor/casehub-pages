import type { CellValue, Column, TypedRow } from "@casehubio/pages-data";

export function typedRowToRecord(
  row: TypedRow,
  columns: readonly Column[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const col of columns) {
    const cell: CellValue = row.cell(col.id);
    if (cell.type === "NULL") {
      record[col.id as string] = null;
    } else if (cell.type === "DATE") {
      record[col.id as string] = (cell.value as Date).toISOString();
    } else {
      record[col.id as string] = cell.value;
    }
  }
  return record;
}
