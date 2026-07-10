import { describe, it, expect } from 'vitest';
import { flattenTree } from './tree.js';

interface Node {
  id: string;
  name: string;
  children: Node[];
}

const tree: Node[] = [
  {
    id: '1', name: 'Root A', children: [
      { id: '1.1', name: 'Child A1', children: [] },
      {
        id: '1.2', name: 'Child A2', children: [
          { id: '1.2.1', name: 'Grandchild', children: [] },
        ],
      },
    ],
  },
  { id: '2', name: 'Root B', children: [] },
];

const getChildren = (n: Node) => n.children;
const getRowId = (n: Node) => n.id;

describe('flattenTree', () => {
  it('flattens only root nodes when nothing expanded', () => {
    const result = flattenTree(tree, getChildren, new Set(), getRowId);
    expect(result).toHaveLength(2);
    expect(result[0]!).toEqual({ row: tree[0], depth: 0, hasChildren: true, expanded: false });
    expect(result[1]!).toEqual({ row: tree[1], depth: 0, hasChildren: false, expanded: false });
  });

  it('expands first level when root is expanded', () => {
    const result = flattenTree(tree, getChildren, new Set(['1']), getRowId);
    expect(result).toHaveLength(4);
    expect(result[0]!.expanded).toBe(true);
    expect(result[1]!).toEqual({ row: tree[0]!.children[0], depth: 1, hasChildren: false, expanded: false });
    expect(result[2]!).toEqual({ row: tree[0]!.children[1], depth: 1, hasChildren: true, expanded: false });
    expect(result[3]!).toEqual({ row: tree[1], depth: 0, hasChildren: false, expanded: false });
  });

  it('expands nested levels', () => {
    const result = flattenTree(tree, getChildren, new Set(['1', '1.2']), getRowId);
    expect(result).toHaveLength(5);
    expect(result[0]!.depth).toBe(0);
    expect(result[1]!.depth).toBe(1);
    expect(result[2]!.depth).toBe(1);
    expect(result[2]!.expanded).toBe(true);
    expect(result[3]!).toEqual({
      row: tree[0]!.children[1]!.children[0],
      depth: 2,
      hasChildren: false,
      expanded: false,
    });
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
