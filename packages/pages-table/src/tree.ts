import type { TypedRow } from '@casehubio/pages-data/dist/dataset/types.js';

export interface TreeRow {
  readonly row: TypedRow;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
}

export function flattenTree(
  rows: readonly TypedRow[],
  getChildren: (row: TypedRow) => readonly TypedRow[],
  expandedIds: ReadonlySet<string>,
  getRowId: (row: TypedRow) => string,
  depth = 0,
): TreeRow[] {
  const result: TreeRow[] = [];

  for (const row of rows) {
    const id = getRowId(row);
    const children = getChildren(row);
    const hasChildren = children.length > 0;
    const expanded = hasChildren && expandedIds.has(id);

    result.push({ row, depth, hasChildren, expanded });

    if (expanded) {
      result.push(...flattenTree(children, getChildren, expandedIds, getRowId, depth + 1));
    }
  }

  return result;
}
