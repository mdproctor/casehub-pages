import type { TypedDataSet, TypedRow, ColumnId } from '@casehubio/pages-data/dist/dataset/types.js';
import { cellToRaw } from './cell-utils.js';

export interface TreeNode {
  readonly row: TypedRow;
  readonly id: string;
  readonly parentId: string | null;
  readonly children: TreeNode[];
  readonly depth: number;
  siblingIndex: number;
  siblingCount: number;
}

export interface ExpandableConfig {
  readonly idColumn: ColumnId;
  readonly parentColumn: ColumnId;
  readonly defaultExpanded?: boolean | number;
}

export function buildTreeIndex(
  dataset: TypedDataSet,
  config: ExpandableConfig,
): { roots: TreeNode[]; nodeMap: Map<string, TreeNode> } {
  const nodeMap = new Map<string, TreeNode>();
  const childMap = new Map<string, TreeNode[]>();

  for (const row of dataset.rows) {
    const idCell = row.cell(config.idColumn);
    const parentCell = row.cell(config.parentColumn);
    const id = idCell.type !== 'NULL' ? String(idCell.value) : '';
    const rawParent = parentCell.type !== 'NULL' ? String(parentCell.value) : null;
    const parentId = rawParent === '' ? null : rawParent;

    const node: TreeNode = {
      row,
      id,
      parentId,
      children: [],
      depth: 0,
      siblingIndex: 0,
      siblingCount: 0,
    };
    nodeMap.set(id, node);

    const parentKey = parentId ?? '__root__';
    let siblings = childMap.get(parentKey);
    if (!siblings) {
      siblings = [];
      childMap.set(parentKey, siblings);
    }
    siblings.push(node);
  }

  const roots: TreeNode[] = [];
  for (const [, node] of nodeMap) {
    const kids = childMap.get(node.id);
    if (kids) {
      (node as { children: TreeNode[] }).children = kids;
    }
    if (node.parentId === null || !nodeMap.has(node.parentId)) {
      roots.push(node);
    }
  }

  function setDepths(nodes: TreeNode[], depth: number): void {
    for (const n of nodes) {
      (n as { depth: number }).depth = depth;
      setDepths(n.children, depth + 1);
    }
  }
  setDepths(roots, 0);

  function setSiblingMeta(siblings: TreeNode[]): void {
    for (let i = 0; i < siblings.length; i++) {
      siblings[i]!.siblingIndex = i + 1;
      siblings[i]!.siblingCount = siblings.length;
      setSiblingMeta(siblings[i]!.children);
    }
  }
  setSiblingMeta(roots);

  return { roots, nodeMap };
}

export function computeDefaultExpandState(
  roots: readonly TreeNode[],
  defaultExpanded: boolean | number | undefined,
): Map<string, boolean> {
  const state = new Map<string, boolean>();
  if (defaultExpanded === undefined || defaultExpanded === false) {
    return state;
  }

  function walk(nodes: readonly TreeNode[], depth: number): void {
    for (const node of nodes) {
      if (node.children.length === 0) continue;
      if (defaultExpanded === true || (typeof defaultExpanded === 'number' && depth < defaultExpanded)) {
        state.set(node.id, true);
        walk(node.children, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return state;
}

export function collectVisibleNodes(
  nodes: readonly TreeNode[],
  expandState: Map<string, boolean>,
): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0 && expandState.get(node.id) === true) {
      result.push(...collectVisibleNodes(node.children, expandState));
    }
  }
  return result;
}

export function paginateTreeByRoots(
  roots: readonly TreeNode[],
  expandState: Map<string, boolean>,
  page: number,
  pageSize: number,
): { pageNodes: TreeNode[]; rootCount: number } {
  const rootCount = roots.length;
  const start = page * pageSize;
  const end = Math.min(start + pageSize, rootCount);
  const pagedRoots = roots.slice(start, end);
  const pageNodes = collectVisibleNodes(pagedRoots, expandState);
  return { pageNodes, rootCount };
}

export function findMatchingNodes(
  nodes: readonly TreeNode[],
  term: string,
): Set<string> {
  const matching = new Set<string>();
  const lower = term.toLowerCase();

  function walk(node: TreeNode): boolean {
    const rowMatches = node.row.cells.some(
      cell => cell.type !== 'NULL' && String(cell.value).toLowerCase().includes(lower),
    );
    let childMatches = false;
    for (const child of node.children) {
      if (walk(child)) childMatches = true;
    }
    if (rowMatches || childMatches) {
      matching.add(node.id);
      return true;
    }
    return false;
  }

  for (const root of nodes) {
    walk(root);
  }
  return matching;
}

export function rowMatchesText(node: TreeNode, term: string): boolean {
  const lower = term.toLowerCase();
  return node.row.cells.some(
    cell => cell.type !== 'NULL' && String(cell.value).toLowerCase().includes(lower),
  );
}

export function sortTreeLevel(
  nodes: TreeNode[],
  dataset: TypedDataSet,
  sortColumnId: ColumnId,
  sortOrder: 'ASCENDING' | 'DESCENDING',
): void {
  const colIdx = dataset.columns.findIndex(c => c.id === sortColumnId);
  if (colIdx < 0) return;

  const compare = (a: TreeNode, b: TreeNode): number => {
    const aCell = a.row.cells[colIdx];
    const bCell = b.row.cells[colIdx];
    const aVal = aCell && aCell.type !== 'NULL' ? cellToRaw(aCell) : null;
    const bVal = bCell && bCell.type !== 'NULL' ? cellToRaw(bCell) : null;

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    let cmp: number;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }
    return sortOrder === 'DESCENDING' ? -cmp : cmp;
  };

  nodes.sort(compare);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i]!.siblingIndex = i + 1;
    nodes[i]!.siblingCount = nodes.length;
  }
  for (const n of nodes) {
    sortTreeLevel(n.children, dataset, sortColumnId, sortOrder);
  }
}
