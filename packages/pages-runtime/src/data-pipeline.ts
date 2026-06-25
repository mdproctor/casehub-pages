import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetManager, LookupOptions } from "@casehubio/pages-data/dist/dataset/manager.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { DataSetOp } from "@casehubio/pages-data/dist/dataset/ops.js";
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { ResolverContext } from "@casehubio/pages-data/dist/dataset/external/resolver.js";
import type { ResolveResult, ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { parseRefreshTime } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { resolveExternalDataSet } from "@casehubio/pages-data/dist/dataset/external/resolver.js";
import type { ComponentRegistry } from "./registry.js";
import type { DataSetScope } from "./dataset-scope.js";
import { resolveDataSetDef } from "./dataset-scope.js";
import type { FilterState } from "./cross-filter.js";
import { getActiveFilterOps, collectAncestorFilterOps } from "./cross-filter.js";
import type { DataScopeRegistry } from "./data-scope-registry.js";
import { getDataScope } from "./data-scope-registry.js";
import { resolveRefBindings } from "./ref-resolution.js";
import type { ComponentViewState } from "./component-view-state.js";
import { getComponentState, updatePage } from "./component-view-state.js";

export interface VizTarget {
  dataSet: unknown;
  totalRows: number;
  theme: string;
  error: string;
  activeSort: SortColumn | undefined;
  activePage: number | undefined;
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
  componentViewState: ComponentViewState,
): DataPipeline {
  const pendingResolutions = new Map<DataSetId, Promise<ResolveResult>>();
  const refreshTimers = new Map<DataSetId, ReturnType<typeof setInterval>>();
  let resolverCtx: ResolverContext | undefined;

  function pushData(
    target: VizTarget,
    lookup: DataSetLookup,
    pagePath: string,
    filterGroup: string | undefined,
    componentId: string,
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

      // Apply centralized sort from ComponentViewState
      const compState = getComponentState(componentViewState, componentId);
      let sortOps: readonly DataSetOp[] = lookup.operations.filter((op) => op.type !== "sort");

      if (compState?.sort) {
        sortOps = [...sortOps, { type: "sort" as const, columns: [compState.sort] }];
        target.activeSort = compState.sort;
      } else {
        // Preserve original lookup sort
        sortOps = lookup.operations;
        target.activeSort = undefined;
      }

      const effectiveOps = [...filterOps, ...sortOps];
      const effectiveLookup: DataSetLookup = { ...lookup, operations: effectiveOps };

      // Apply pagination from ComponentViewState
      const entry = registry.get(componentId);
      const pageSize = (entry?.component.props as { pageSize?: number } | undefined)?.pageSize;
      let paginationOptions = options;
      let requestedPage = compState?.page;

      if (pageSize !== undefined && requestedPage !== undefined) {
        const rowOffset = requestedPage * pageSize;
        paginationOptions = { ...options, rowOffset, rowCount: pageSize };
      }

      const result = manager.lookup(effectiveLookup, paginationOptions);

      // Clamp page if result is empty but totalRows > 0
      if (pageSize !== undefined && requestedPage !== undefined) {
        if (result.totalRows > 0 && (!result.dataset || (result.dataset as unknown as { rows: unknown[] }).rows.length === 0)) {
          const lastPage = Math.floor((result.totalRows - 1) / pageSize);
          requestedPage = lastPage;
          updatePage(componentViewState, componentId, lastPage);
          const clampedOffset = lastPage * pageSize;
          const clampedResult = manager.lookup(effectiveLookup, { ...options, rowOffset: clampedOffset, rowCount: pageSize });
          target.activePage = lastPage;
          target.totalRows = clampedResult.totalRows;
          target.dataSet = clampedResult.dataset;
        } else {
          target.activePage = requestedPage;
          target.totalRows = result.totalRows;
          target.dataSet = result.dataset;
        }
      } else {
        target.activePage = undefined;
        target.totalRows = result.totalRows;
        target.dataSet = result.dataset;
      }
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
        pushData(target, lookup, entry.pagePath, filterGroup?.group, componentId);

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
          pushData(target, lookup, entry.pagePath, filterGroup?.group, componentId);
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
          for (const [compId, entry] of registry) {
            if (entry.originalLookup?.dataSetId === dataSetId && entry.vizElement) {
              const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
                ?.filter as { group?: string } | undefined;
              pushData(
                entry.vizElement,
                entry.originalLookup,
                entry.pagePath,
                filterGroup?.group,
                compId,
              );
            }
          }
        })
        .catch(() => {});
    }, interval);
    refreshTimers.set(dataSetId, timerId);
  }
}
