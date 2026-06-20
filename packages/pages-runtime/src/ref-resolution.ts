import type { DataSetOp } from "@casehub/pages-data/dist/dataset/ops.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";
import type { DataSetManager } from "@casehub/pages-data/dist/dataset/manager.js";
import type { DataSetId, ColumnId } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataScope, DataScopeRef } from "@casehub/pages-ui";
import type { FilterState } from "./cross-filter.js";
import { collectAncestorFilterOps } from "./cross-filter.js";
import type { DataScopeRegistry } from "./data-scope-registry.js";

function isRef(v: string | DataScopeRef): v is DataScopeRef {
  return typeof v === "object" && "$ref" in v;
}

export function resolveRefBindings(
  dataScope: DataScope,
  dataScopeRegistry: DataScopeRegistry,
  filterState: FilterState,
  manager: DataSetManager,
  pagePath: string,
  visited?: Set<string>,
): DataSetOp[] {
  if (!dataScope.filter) return [];

  const ops: DataSetOp[] = [];
  const _visited = visited ?? new Set<string>();

  for (const [childCol, binding] of Object.entries(dataScope.filter)) {
    if (!isRef(binding)) {
      ops.push({
        type: "filter" as const,
        expressions: [{
          type: "unresolved" as const,
          columnId: childCol as ColumnId,
          fn: "EQUALS_TO" as const,
          args: [binding],
        }],
      });
      continue;
    }

    const [refDatasetId, refColumnId] = binding.$ref.split(".");
    if (!refDatasetId || !refColumnId) continue;

    const parentPath = findParentWithDataset(dataScopeRegistry, pagePath, refDatasetId as DataSetId);
    if (!parentPath || _visited.has(parentPath)) continue;

    _visited.add(parentPath);

    const parentScope = dataScopeRegistry.get(parentPath);
    if (!parentScope) continue;
    const parentFilterOps = collectAncestorFilterOps(filterState, parentPath, undefined);
    const parentLookup: DataSetLookup = {
      dataSetId: parentScope.dataset,
      operations: parentFilterOps,
    };

    if (!manager.has(parentScope.dataset)) continue;

    try {
      const result = manager.lookup(parentLookup);
      const firstRow = result.dataset.rows[0];
      if (!firstRow) continue;

      const cell = firstRow.cell(refColumnId as ColumnId);
      const value = cell.type === "NULL" ? "" : String(
        cell.type === "NUMBER" ? cell.value :
        cell.type === "DATE" ? cell.value.toISOString() :
        cell.value
      );

      ops.push({
        type: "filter" as const,
        expressions: [{
          type: "unresolved" as const,
          columnId: childCol as ColumnId,
          fn: "EQUALS_TO" as const,
          args: [value],
        }],
      });
    } catch {
      // Parent lookup failed — skip this binding
    }
  }

  return ops;
}

function findParentWithDataset(
  registry: DataScopeRegistry,
  pagePath: string,
  datasetId: DataSetId,
): string | undefined {
  let path = pagePath;
  while (path.includes("/")) {
    path = path.substring(0, path.lastIndexOf("/"));
    const scope = registry.get(path);
    if (scope && scope.dataset === datasetId) return path;
  }
  if (path !== pagePath) {
    const scope = registry.get(path);
    if (scope && scope.dataset === datasetId) return path;
  }
  return undefined;
}
