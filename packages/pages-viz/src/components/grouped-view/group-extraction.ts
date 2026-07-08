import type { TypedDataSet, ColumnId, CellValue } from "@casehubio/pages-data/dist/dataset/types.js";

export interface GroupBoundary {
  readonly name: string;
  readonly startRow: number;
  readonly rowCount: number;
  readonly aggregates: ReadonlyMap<ColumnId, unknown>;
}

function cellToString(cell: CellValue): string {
  return cell.type === "NULL" ? "" : String(cell.value);
}

export function extractGroupBoundaries(
  dataset: TypedDataSet,
  keyColumnId: ColumnId,
  aggregateColumnIds: readonly ColumnId[],
): readonly GroupBoundary[] {
  const rowCount = dataset.rows.length;
  if (rowCount === 0) return [];

  const boundaries: GroupBoundary[] = [];
  let currentName = cellToString(dataset.rows[0]!.cell(keyColumnId));
  let startRow = 0;

  for (let i = 1; i <= rowCount; i++) {
    const name = i < rowCount ? cellToString(dataset.rows[i]!.cell(keyColumnId)) : null;
    if (name !== currentName) {
      const aggregates = new Map<ColumnId, unknown>();
      const firstRow = dataset.rows[startRow]!;
      for (const aggId of aggregateColumnIds) {
        const cell = firstRow.cell(aggId);
        aggregates.set(aggId, cell.type === "NULL" ? null : cell.value);
      }
      boundaries.push({ name: currentName, startRow, rowCount: i - startRow, aggregates });
      if (name !== null) {
        currentName = name;
        startRow = i;
      }
    }
  }

  return boundaries;
}
