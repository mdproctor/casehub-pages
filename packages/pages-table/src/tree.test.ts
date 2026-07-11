import { describe, it, expect } from 'vitest';
import { flattenTree } from './tree.js';
import type { ColumnId, TypedRow } from '@casehubio/pages-data/dist/dataset/types.js';
import { ColumnType } from '@casehubio/pages-data/dist/dataset/types.js';
import { fromRows } from '@casehubio/pages-data/dist/dataset/conversion.js';

const idCol = 'id' as ColumnId;

const allRows = fromRows(
  [
    { id: '1', name: 'Root A' },
    { id: '1.1', name: 'Child A1' },
    { id: '1.2', name: 'Child A2' },
    { id: '1.2.1', name: 'Grandchild' },
    { id: '2', name: 'Root B' },
  ],
  [
    { id: idCol, name: 'ID', type: ColumnType.TEXT, getValue: (r: { id: string; name: string }) => r.id },
    { id: 'name' as ColumnId, name: 'Name', type: ColumnType.TEXT, getValue: (r: { id: string; name: string }) => r.name },
  ],
);

const [rootA, childA1, childA2, grandchild, rootB] = allRows.rows;

const childrenMap = new Map<TypedRow, readonly TypedRow[]>([
  [rootA!, [childA1!, childA2!]],
  [childA2!, [grandchild!]],
]);

const getChildren = (row: TypedRow) => childrenMap.get(row) ?? [];
const getRowId = (row: TypedRow) => row.text(idCol);
const tree = [rootA!, rootB!];

describe('flattenTree', () => {
  it('flattens only root nodes when nothing expanded', () => {
    const result = flattenTree(tree, getChildren, new Set(), getRowId);
    expect(result).toHaveLength(2);
    expect(result[0]!).toEqual({ row: rootA, depth: 0, hasChildren: true, expanded: false });
    expect(result[1]!).toEqual({ row: rootB, depth: 0, hasChildren: false, expanded: false });
  });

  it('expands first level when root is expanded', () => {
    const result = flattenTree(tree, getChildren, new Set(['1']), getRowId);
    expect(result).toHaveLength(4);
    expect(result[0]!.expanded).toBe(true);
    expect(result[1]!).toEqual({ row: childA1, depth: 1, hasChildren: false, expanded: false });
    expect(result[2]!).toEqual({ row: childA2, depth: 1, hasChildren: true, expanded: false });
    expect(result[3]!).toEqual({ row: rootB, depth: 0, hasChildren: false, expanded: false });
  });

  it('expands nested levels', () => {
    const result = flattenTree(tree, getChildren, new Set(['1', '1.2']), getRowId);
    expect(result).toHaveLength(5);
    expect(result[0]!.depth).toBe(0);
    expect(result[2]!.expanded).toBe(true);
    expect(result[3]!).toEqual({ row: grandchild, depth: 2, hasChildren: false, expanded: false });
    expect(result[4]!.depth).toBe(0);
  });

  it('ignores expanded IDs for nodes without children', () => {
    const result = flattenTree(tree, getChildren, new Set(['2']), getRowId);
    expect(result).toHaveLength(2);
    expect(result[1]!.expanded).toBe(false);
  });

  it('handles empty tree', () => {
    const result = flattenTree([], getChildren, new Set(), getRowId);
    expect(result).toHaveLength(0);
  });
});
