import type { DataSetOp } from "@casehubio/pages-data/dist/dataset/ops.js";
import type { ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";

export type FilterState = Map<string, Map<string | undefined, Map<string, string[]>>>;

export function createFilterState(): FilterState {
  return new Map();
}

export function getActiveFilterOps(
  filterState: FilterState,
  pagePath: string,
  group: string | undefined,
): DataSetOp[] {
  const pageFilters = filterState.get(pagePath);
  if (!pageFilters) return [];

  const ops: DataSetOp[] = [];

  // Collect filters from the specific group
  if (group !== undefined) {
    const groupFilters = pageFilters.get(group);
    if (groupFilters) {
      collectFilterOps(groupFilters, ops);
    }
  }

  // Always include ungrouped filters (they apply to everyone)
  const ungrouped = pageFilters.get(undefined);
  if (ungrouped) {
    collectFilterOps(ungrouped, ops);
  }

  return ops;
}

export function updateFilter(
  filterState: FilterState,
  pagePath: string,
  group: string | undefined,
  columnId: string,
  values: string[],
  reset: boolean,
): void {
  let pageFilters = filterState.get(pagePath);
  if (!pageFilters) {
    pageFilters = new Map();
    filterState.set(pagePath, pageFilters);
  }
  let groupFilters = pageFilters.get(group);
  if (!groupFilters) {
    groupFilters = new Map();
    pageFilters.set(group, groupFilters);
  }

  if (reset) {
    groupFilters.delete(columnId);
  } else {
    groupFilters.set(columnId, values);
  }
}

export function deriveActiveFilters(
  filterState: FilterState,
  pagePath: string,
): Readonly<Record<string, readonly string[]>> {
  const pageFilters = filterState.get(pagePath);
  if (!pageFilters) return {};

  const merged: Record<string, string[]> = {};
  for (const columnMap of pageFilters.values()) {
    for (const [col, values] of columnMap) {
      if (!merged[col]) {
        merged[col] = [...values];
      } else {
        for (const v of values) {
          if (!merged[col].includes(v)) {
            merged[col].push(v);
          }
        }
      }
    }
  }
  return merged;
}

export function collectAncestorFilterOps(
  filterState: FilterState,
  pagePath: string,
  group: string | undefined,
): DataSetOp[] {
  const ops: DataSetOp[] = [];
  let path: string | undefined = pagePath;
  while (path !== undefined) {
    ops.push(...getActiveFilterOps(filterState, path, group));
    const lastSlash = path.lastIndexOf("/");
    path = lastSlash > 0 ? path.substring(0, lastSlash) : (path === "" ? undefined : "");
  }
  return ops;
}

export function clearPageFilters(
  filterState: FilterState,
  pagePath: string,
): void {
  const pageFilters = filterState.get(pagePath);
  if (pageFilters) {
    for (const [, columnMap] of pageFilters) columnMap.clear();
  }
}

function collectFilterOps(
  filters: Map<string, string[]>,
  ops: DataSetOp[],
): void {
  for (const [columnId, values] of filters) {
    for (const value of values) {
      ops.push({
        type: "filter" as const,
        expressions: [{
          type: "unresolved" as const,
          columnId: columnId as ColumnId,
          fn: "EQUALS_TO" as const,
          args: [value],
        }],
      });
    }
  }
}
