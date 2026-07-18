import type { TypedDataSet, ColumnId, CellValue } from "./dataset/types.js";
import type { GroupingKey } from "./dataset/group.js";

export interface GroupNode {
  readonly name: string;
  readonly depth: number;
  readonly startRow: number;
  readonly rowCount: number;
  readonly children: readonly GroupNode[];
  readonly aggregates?: ReadonlyMap<ColumnId, unknown>;
}

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

export function extractGroupTree(
  dataset: TypedDataSet,
  keys: readonly GroupingKey[],
  aggregations: readonly { column: ColumnId; fn: { fn: string } }[],
): readonly GroupNode[] {
  if (keys.length === 0 || dataset.rows.length === 0) return [];
  return buildLevel(dataset, keys, 0, 0, dataset.rows.length, aggregations);
}

function buildLevel(
  dataset: TypedDataSet,
  keys: readonly GroupingKey[],
  depth: number,
  startRow: number,
  endRow: number,
  aggregations: readonly { column: ColumnId; fn: { fn: string } }[],
): GroupNode[] {
  if (depth >= keys.length) return [];
  const keyCol = keys[depth]!.columnId;
  const nodes: GroupNode[] = [];
  let currentName = cellToString(dataset.rows[startRow]!.cell(keyCol));
  let segStart = startRow;

  for (let i = startRow + 1; i <= endRow; i++) {
    const name = i < endRow ? cellToString(dataset.rows[i]!.cell(keyCol)) : null;
    if (name !== currentName) {
      const children = buildLevel(dataset, keys, depth + 1, segStart, i, aggregations);
      const aggregates = computeAggregates(dataset, segStart, i, aggregations);
      nodes.push({
        name: currentName,
        depth,
        startRow: segStart,
        rowCount: i - segStart,
        children,
        ...(aggregates.size > 0 ? { aggregates } : {}),
      });
      if (name !== null) {
        currentName = name;
        segStart = i;
      }
    }
  }

  return nodes;
}

function computeAggregates(
  dataset: TypedDataSet,
  startRow: number,
  endRow: number,
  aggregations: readonly { column: ColumnId; fn: { fn: string } }[],
): ReadonlyMap<ColumnId, unknown> {
  if (aggregations.length === 0) return new Map();
  const result = new Map<ColumnId, unknown>();
  for (const agg of aggregations) {
    const values: number[] = [];
    for (let i = startRow; i < endRow; i++) {
      const cell = dataset.rows[i]!.cell(agg.column);
      if (cell.type !== "NULL" && typeof cell.value === "number") {
        values.push(cell.value);
      }
    }
    switch (agg.fn.fn) {
      case "COUNT": result.set(agg.column, endRow - startRow); break;
      case "SUM": result.set(agg.column, values.reduce((a, b) => a + b, 0)); break;
      case "AVERAGE": result.set(agg.column, values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0); break;
      case "MIN": result.set(agg.column, values.length > 0 ? Math.min(...values) : null); break;
      case "MAX": result.set(agg.column, values.length > 0 ? Math.max(...values) : null); break;
      default: result.set(agg.column, null);
    }
  }
  return result;
}
