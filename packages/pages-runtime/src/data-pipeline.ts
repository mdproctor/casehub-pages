import type { DataSetId } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataSetManager, LookupOptions } from "@casehub/pages-data/dist/dataset/manager.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";
import type { ResolverContext } from "@casehub/pages-data/dist/dataset/external/resolver.js";
import type { ResolveResult, ExternalDataSetDef } from "@casehub/pages-data/dist/dataset/external/types.js";
import { parseRefreshTime } from "@casehub/pages-data/dist/dataset/external/types.js";
import { resolveExternalDataSet } from "@casehub/pages-data/dist/dataset/external/resolver.js";
import type { ComponentRegistry } from "./registry.js";
import type { DataSetScope } from "./dataset-scope.js";
import { resolveDataSetDef } from "./dataset-scope.js";
import type { FilterState } from "./cross-filter.js";
import { getActiveFilterOps, collectAncestorFilterOps } from "./cross-filter.js";
import type { DataScopeRegistry } from "./data-scope-registry.js";
import { getDataScope } from "./data-scope-registry.js";
import { resolveRefBindings } from "./ref-resolution.js";

export interface VizTarget {
  dataSet: unknown;
  totalRows: number;
  theme: string;
  error: string;
}

export interface DataPipeline {
  handleDataRequest(
    target: VizTarget,
    lookup: DataSetLookup,
    componentId: string,
  ): void;

  setResolverCtx(ctx: ResolverContext): void;
  readonly pendingResolutions: Map<DataSetId, Promise<ResolveResult>>;
  readonly refreshTimers: Map<DataSetId, ReturnType<typeof setInterval>>;
}

export function createDataPipeline(
  manager: DataSetManager,
  scope: DataSetScope,
  registry: ComponentRegistry,
  filterState: FilterState,
  dataScopeRegistry: DataScopeRegistry,
): DataPipeline {
  const pendingResolutions = new Map<DataSetId, Promise<ResolveResult>>();
  const refreshTimers = new Map<DataSetId, ReturnType<typeof setInterval>>();
  let resolverCtx: ResolverContext | undefined;

  function pushData(
    target: VizTarget,
    lookup: DataSetLookup,
    pagePath: string,
    filterGroup: string | undefined,
    options?: LookupOptions,
  ): void {
    try {
      const dataScope = getDataScope(dataScopeRegistry, pagePath);
      let filterOps;

      if (dataScope?.filter) {
        // $ref mode: resolved bindings + own-page interactive filters
        filterOps = [
          ...resolveRefBindings(dataScope, dataScopeRegistry, filterState, manager, pagePath),
          ...getActiveFilterOps(filterState, pagePath, filterGroup),
        ];
      } else if (dataScope) {
        // Same-dataset mode: walk up ancestors
        filterOps = collectAncestorFilterOps(filterState, pagePath, filterGroup);
      } else {
        // No dataScope: existing same-page behavior
        filterOps = getActiveFilterOps(filterState, pagePath, filterGroup);
      }

      const effectiveOps = [...filterOps, ...lookup.operations];
      const effectiveLookup: DataSetLookup = { ...lookup, operations: effectiveOps };
      const result = manager.lookup(effectiveLookup, options);
      target.dataSet = result.dataset;
      target.totalRows = result.totalRows;
    } catch (err) {
      target.error = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    pendingResolutions,
    refreshTimers,

    setResolverCtx(ctx: ResolverContext): void {
      resolverCtx = ctx;
    },

    handleDataRequest(
      target: VizTarget,
      lookup: DataSetLookup,
      componentId: string,
    ): void {
      const entry = registry.get(componentId);
      if (!entry) return;

      const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
        ?.filter as { group?: string } | undefined;

      if (manager.has(lookup.dataSetId)) {
        pushData(target, lookup, entry.pagePath, filterGroup?.group);

        // Schedule refresh for datasets already in the manager (from a prior request)
        const def = resolveDataSetDef(lookup.dataSetId, entry.pagePath, scope);
        if (def) scheduleRefresh(def, lookup.dataSetId);
        return;
      }

      const def = resolveDataSetDef(lookup.dataSetId, entry.pagePath, scope);
      if (!def) {
        target.error = `Dataset "${String(lookup.dataSetId)}" not found in scope for page "${entry.pagePath}"`;
        return;
      }

      if (!resolverCtx) {
        target.error = `No resolver context available`;
        return;
      }

      let pending = pendingResolutions.get(lookup.dataSetId);
      if (!pending) {
        pending = resolveExternalDataSet(def, resolverCtx);
        pendingResolutions.set(lookup.dataSetId, pending);
      }

      pending
        .then(() => {
          pendingResolutions.delete(lookup.dataSetId);
          pushData(target, lookup, entry.pagePath, filterGroup?.group);
          scheduleRefresh(def, lookup.dataSetId);
        })
        .catch((err: unknown) => {
          pendingResolutions.delete(lookup.dataSetId);
          target.error = err instanceof Error ? err.message : String(err);
        });
    },
  };

  function scheduleRefresh(def: ExternalDataSetDef, dataSetId: DataSetId): void {
    if (!def.refreshTime || refreshTimers.has(dataSetId)) return;
    const interval = parseRefreshTime(def.refreshTime);
    const timerId = setInterval(() => {
      if (!resolverCtx) return;
      resolveExternalDataSet(def, resolverCtx)
        .then(() => {
          for (const [id, entry] of registry) {
            if (entry.originalLookup?.dataSetId === dataSetId && entry.vizElement) {
              const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
                ?.filter as { group?: string } | undefined;
              pushData(
                entry.vizElement,
                entry.originalLookup,
                entry.pagePath,
                filterGroup?.group,
              );
            }
          }
        })
        .catch(() => {});
    }, interval);
    refreshTimers.set(dataSetId, timerId);
  }
}
