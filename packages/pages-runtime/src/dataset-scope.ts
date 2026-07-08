import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import type { DataSourceBinding } from "@casehubio/pages-data/dist/datasource/types.js";
import type { PagePathMap } from "./page-paths.js";

/**
 * A dataset entry in scope is either a legacy ExternalDataSetDef (from YAML)
 * or a DataSourceBinding (from the programmatic API).
 */
export type DataSetEntry = ExternalDataSetDef | DataSourceBinding;

export type DataSetScope = Map<string, Map<DataSetId, DataSetEntry>>;

/**
 * Type guard: returns true if the entry is a DataSourceBinding (has `source`),
 * false if it is a legacy ExternalDataSetDef (has `uuid`).
 */
export function isBinding(entry: DataSetEntry): entry is DataSourceBinding {
  return "source" in entry && typeof (entry).source === "object";
}

/**
 * Type guard: returns true if the entry is a legacy ExternalDataSetDef.
 */
export function isDef(entry: DataSetEntry): entry is ExternalDataSetDef {
  return !isBinding(entry);
}

/**
 * Get the dataset ID from either entry type.
 */
function entryId(entry: DataSetEntry): DataSetId {
  return isBinding(entry) ? entry.id : entry.uuid;
}

export function buildDataSetScope(
  root: Component,
  paths: PagePathMap,
): DataSetScope {
  const scope: DataSetScope = new Map();
  walkScope(root, new Map(), paths, scope);
  return scope;
}

export function extendDataSetScope(
  root: Component,
  inherited: Map<DataSetId, DataSetEntry>,
  paths: PagePathMap,
  scope: DataSetScope,
): void {
  walkScope(root, inherited, paths, scope);
}

function walkScope(
  component: Component,
  inherited: Map<DataSetId, DataSetEntry>,
  paths: PagePathMap,
  scope: DataSetScope,
): void {
  let current = inherited;

  if (component.type === "page") {
    const pagePath = paths.get(component) ?? "";
    const datasets = (component.props as Record<string, unknown> | undefined)?.datasets as
      | readonly DataSetEntry[]
      | undefined;

    current = new Map(inherited);
    if (datasets) {
      for (const ds of datasets) {
        const id = entryId(ds);
        current.set(id, ds);
      }
    }
    scope.set(pagePath, current);
  }

  if (component.items) {
    for (const item of component.items) {
      walkScope(item.component, current, paths, scope);
    }
  }

  if (component.slots) {
    for (const children of Object.values(component.slots)) {
      for (const child of children) {
        walkScope(child, current, paths, scope);
      }
    }
  }
}

export function resolveDataSetDef(
  dataSetId: DataSetId,
  pagePath: string,
  scope: DataSetScope,
): ExternalDataSetDef | undefined {
  const entry = resolveDataSetEntry(dataSetId, pagePath, scope);
  return entry && isDef(entry) ? entry : undefined;
}

export function resolveDataSetEntry(
  dataSetId: DataSetId,
  pagePath: string,
  scope: DataSetScope,
): DataSetEntry | undefined {
  let path = pagePath;
  for (;;) {
    const pageScope = scope.get(path);
    if (pageScope) {
      const entry = pageScope.get(dataSetId);
      if (entry) return entry;
    }
    if (path === "") return undefined;
    const lastSlash = path.lastIndexOf("/");
    path = lastSlash === -1 ? "" : path.substring(0, lastSlash);
  }
}
