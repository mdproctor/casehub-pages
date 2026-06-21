import type { Component, PermissionContext } from "@casehub/pages-component/dist/model/types.js";
import { ALLOW_ALL } from "@casehub/pages-component/dist/model/types.js";
import { renderComponent } from "@casehub/pages-component/dist/renderer/render.js";
import type { DataSetId, ColumnId } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataProviderConfig, ExternalDataSetDef } from "@casehub/pages-data/dist/dataset/external/types.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";
import type { DataSetOp } from "@casehub/pages-data/dist/dataset/ops.js";
import { createDataSetManager } from "@casehub/pages-data/dist/dataset/manager.js";
import { createDataProviderFactory, createPresetRegistry } from "@casehub/pages-data/dist/dataset/external/index.js";
import type { Site, ViewState, DeepLink } from "@casehub/pages-ui/dist/model/page-types.js";
import { parsePage } from "@casehub/pages-ui/dist/parser/page-parser.js";
import { load as yamlLoad } from "js-yaml";
import { cellToRaw } from "@casehub/pages-viz/dist/base/cell-extract.js";
import { buildPagePathMap } from "./page-paths.js";
import { buildDataSetScope, resolveDataSetDef } from "./dataset-scope.js";
import { buildPageIndex, computeCurrentPage, walkNavigate } from "./navigation.js";
import type { ActiveSlots } from "./navigation.js";
import { createActivationCallback } from "./activation.js";
import type { ComponentRegistry } from "./registry.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { VizTarget } from "./data-pipeline.js";
import { createFilterState, updateFilter, deriveActiveFilters, getActiveFilterOps, collectAncestorFilterOps } from "./cross-filter.js";
import { createDataScopeRegistry, hasDataScope, getDataScope } from "./data-scope-registry.js";
import { createSaveConfigRegistry, getSaveConfig } from "./save-config-registry.js";
import { createEditState, updateEditState, clearEditState, isDirty, getEditState } from "./edit-state.js";
import { serializeToUrl, parseFromUrl } from "./url.js";
import type { SaveAdapter } from "./save-adapter.js";
import { createLocalAdapter } from "./adapters/local-adapter.js";
import { createRestAdapter } from "./adapters/rest-adapter.js";
import type { RestAdapterConfig } from "./adapters/rest-adapter.js";

export interface LiveSite extends Site {
  navigate(path: string): void;
  dispose(): void;
}

export interface SiteOptions {
  readonly permissions?: PermissionContext;
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
  readonly providerConfig?: DataProviderConfig;
  readonly adapters?: Readonly<Record<string, SaveAdapter>>;
}

export async function loadSite(
  target: HTMLElement,
  source: string | Component,
  options?: SiteOptions,
): Promise<LiveSite> {
  const root = typeof source === "string" ? parsePage(yamlLoad(source)) : source;
  const permissions = options?.permissions ?? ALLOW_ALL;

  const pagePathMap = buildPagePathMap(root);
  const dataSetScope = buildDataSetScope(root, pagePathMap);
  const pageIndex = buildPageIndex(root, pagePathMap);

  const registry: ComponentRegistry = new Map();
  const activeSlots: ActiveSlots = new Map();
  const filterState = createFilterState();
  const abortController = new AbortController();
  const lazyPageResolutions: Map<Component, Component> = new Map();
  const manager = createDataSetManager();
  const dataScopeRegistry = createDataScopeRegistry();
  const saveConfigRegistry = createSaveConfigRegistry();
  const editState = createEditState();
  const saveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  const pipeline = createDataPipeline(manager, dataSetScope, registry, filterState, dataScopeRegistry);
  pipeline.setResolverCtx({
    manager,
    providerFactory: createDataProviderFactory(options?.fetch ?? globalThis.fetch?.bind(globalThis), options?.baseUrl),
    providerConfig: options?.providerConfig ?? {},
    presetRegistry: createPresetRegistry(),
  });

  let _navigating = false;
  let currentPage = "";

  function findComponentId(e: Event): string | undefined {
    const el = (e.target as HTMLElement).closest("[data-component-id]");
    return el?.dataset.componentId;
  }

  function syncUrl(method: "pushState" | "replaceState"): void {
    if (typeof history === "undefined") return;
    const filters = deriveActiveFilters(filterState, currentPage);
    const hasFilters = Object.keys(filters).length > 0;
    const link: DeepLink = { page: currentPage, ...(hasFilters ? { filters } : {}) };
    history[method](null, "", serializeToUrl(link));
  }

  async function flushSave(pagePath: string): Promise<void> {
    cancelAutoSaveTimer(pagePath);

    const scope = getDataScope(dataScopeRegistry, pagePath);
    if (!scope) return;

    const pageState = getEditState(editState, pagePath);
    if (!pageState || pageState.size === 0) return;

    const saveConfig = getSaveConfig(saveConfigRegistry, pagePath);
    if (!saveConfig) return;

    // Get current record's idValue from filtered dataset
    const filterGroup = undefined; // SaveConfig doesn't track filter group
    const filterOps = collectAncestorFilterOps(filterState, pagePath, filterGroup);
    const lookup: DataSetLookup = {
      dataSetId: scope.dataset,
      operations: filterOps,
    };

    if (!manager.has(scope.dataset)) return;

    let idValue: unknown;
    try {
      const result = manager.lookup(lookup);
      const firstRow = result.dataset.rows[0];
      if (!firstRow) return;
      const idCell = firstRow.cell(scope.idColumn as ColumnId);
      idValue = idCell.type === "NULL" ? undefined : idCell.value;
    } catch {
      return;
    }

    if (idValue === undefined) return;

    // Resolve adapter
    const BUILT_IN_ADAPTERS = new Map<string, (config: unknown) => SaveAdapter>([
      ["local", () => createLocalAdapter(manager)],
      ["rest", (config) => {
        const dataSetDef = resolveDataSetDef(scope.dataset, pagePath, dataSetScope);
        if (!dataSetDef?.url) {
          throw new Error(`Dataset "${String(scope.dataset)}" has no URL for REST adapter`);
        }
        return createRestAdapter(
          config as RestAdapterConfig | undefined,
          dataSetDef.url,
          options?.fetch ?? globalThis.fetch?.bind(globalThis),
        );
      }],
    ]);

    let adapter: SaveAdapter | undefined;
    if (options?.adapters?.[saveConfig.adapter]) {
      adapter = options.adapters[saveConfig.adapter];
    } else {
      const factory = BUILT_IN_ADAPTERS.get(saveConfig.adapter);
      if (factory) {
        adapter = factory(saveConfig.adapterConfig);
      }
    }

    if (!adapter) {
      console.error(`Save adapter "${saveConfig.adapter}" not found`);
      return;
    }

    // Construct full record from EditState
    const changedFields = [...pageState.keys()];
    const record = Object.fromEntries(pageState);

    const result = await adapter.save(scope.dataset, record, changedFields, scope.idColumn, idValue);

    if (result.success) {
      clearEditState(editState, pagePath);

      // Post-save sync: re-push all components referencing this dataset
      for (const [id, entry] of registry) {
        if (entry.originalLookup?.dataSetId === scope.dataset && entry.vizElement) {
          pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, id);
        }
      }
    } else {
      console.error(`Save failed for page "${pagePath}":`, result.error);
    }
  }

  function resetAutoSaveTimer(pagePath: string, delay: number): void {
    const existing = saveTimers.get(pagePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      flushSave(pagePath).catch((err) => { console.error("Auto-save failed:", err); });
    }, delay);
    saveTimers.set(pagePath, timer);
  }

  function cancelAutoSaveTimer(pagePath: string): void {
    const timer = saveTimers.get(pagePath);
    if (timer) {
      clearTimeout(timer);
      saveTimers.delete(pagePath);
    }
  }

  // --- Event delegation ---

  target.addEventListener("casehub-data-request", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const vizTarget = detail.element as VizTarget;
    const lookup = detail.lookup as DataSetLookup;
    if (!vizTarget || !lookup) return;
    const componentId = findComponentId(e);
    if (componentId) {
      pipeline.handleDataRequest(vizTarget, lookup, componentId);
    }
  }), { signal: abortController.signal });

  target.addEventListener("casehub-slot-change", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { activeSlot, containerId } = detail;
    if (typeof activeSlot === "string" && typeof containerId === "string") {
      activeSlots.set(containerId, activeSlot);
      currentPage = computeCurrentPage(root, activeSlots);
    }
    if (!_navigating) {
      syncUrl("pushState");
    }
  }), { signal: abortController.signal });

  target.addEventListener("casehub-field-change", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const componentId = findComponentId(e);
    if (!componentId) return;
    const entry = registry.get(componentId);
    if (!entry) return;

    updateEditState(editState, entry.pagePath, detail.field, detail.value);

    const saveConfig = getSaveConfig(saveConfigRegistry, entry.pagePath);
    if (!saveConfig) return;

    if (saveConfig.trigger === "auto" || saveConfig.trigger === undefined) {
      resetAutoSaveTimer(entry.pagePath, saveConfig.delay ?? 2000);
    } else if (saveConfig.trigger === "field" && detail.committed) {
      flushSave(entry.pagePath).catch((err) => { console.error("Field save failed:", err); });
    }
  }), { signal: abortController.signal });

  target.addEventListener("casehub-filter", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { columnId, rowIndex, row: eventRow, reset, group } = detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement) return;

    const ds = entry.vizElement.dataSet;
    if (!ds) return;

    // Prefer row reference from event (table), fall back to rowIndex lookup (charts)
    const row = eventRow ?? ds.rows[rowIndex];
    if (!row) return;

    const cell = row.cell(columnId);
    const value = String(cellToRaw(cell));

    // Table clicks with a child DataScope are record selection — store the
    // filter at the child's pagePath using idColumn so the table stays unfiltered.
    // Selector/chart cross-filters are NOT record selection — they use normal filtering.
    const isTableClick = entry.component.type === "table";
    let childScopePath: string | undefined;
    let childScope: ReturnType<typeof getDataScope> | undefined;

    if (isTableClick) {
      // Check same-page DataScope first
      const samePage = getDataScope(dataScopeRegistry, entry.pagePath);
      if (samePage) {
        childScopePath = entry.pagePath;
        childScope = samePage;
      }
      // Then check child pages
      if (!childScope) {
        const prefix = entry.pagePath === "" ? "" : entry.pagePath + "/";
        for (const [path, scope] of dataScopeRegistry) {
          if (path.startsWith(prefix)) {
            childScopePath = path;
            childScope = scope;
            break;
          }
        }
      }
    }

    if (childScope && childScopePath) {
      // Flush pending edits BEFORE changing the selection filter —
      // flushSave reads the current filter to find the record ID.
      if (isDirty(editState, childScopePath)) {
        flushSave(childScopePath).catch((err) => { console.error("Pre-switch save failed:", err); });
      }
      // Record selection: store filter at the child DataScope's pagePath
      const childFilters = filterState.get(childScopePath);
      if (childFilters) {
        for (const [, columnMap] of childFilters) columnMap.clear();
      }
      const idCell = row.cell(childScope.idColumn);
      const idValue = String(cellToRaw(idCell));
      updateFilter(filterState, childScopePath, group, childScope.idColumn, [idValue], reset);
    } else {
      // Normal cross-filter: store at emitting component's pagePath
      updateFilter(filterState, entry.pagePath, group, columnId, [value], reset);
    }

    // Re-push same-page components (except self unless selfApply)
    for (const [id, candidate] of registry) {
      if (candidate.pagePath !== entry.pagePath) continue;
      const filterProps = (candidate.component.props as Record<string, unknown> | undefined)
        ?.filter as { listening?: boolean; selfApply?: boolean; group?: string } | undefined;

      if (filterProps?.listening === false) continue;
      if (id === componentId && !filterProps?.selfApply) continue;
      if (group !== undefined && filterProps?.group !== undefined && filterProps.group !== group) continue;

      if (candidate.vizElement && candidate.originalLookup) {
        pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
      }
    }

    // Re-push child dataScope pages
    const parentPrefix = entry.pagePath === "" ? "" : entry.pagePath + "/";
    for (const [id, candidate] of registry) {
      if (candidate.pagePath === entry.pagePath) continue;
      if (!candidate.pagePath.startsWith(parentPrefix)) continue;
      if (!hasDataScope(dataScopeRegistry, candidate.pagePath)) continue;

      if (candidate.vizElement && candidate.originalLookup) {
        pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
      }
    }

    syncUrl("replaceState");
  }), { signal: abortController.signal });

  target.addEventListener("casehub-page", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { offset, count } = detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
      ?.filter as { group?: string } | undefined;
    const filterOps = getActiveFilterOps(filterState, entry.pagePath, filterGroup?.group);
    const effectiveOps: DataSetOp[] = [...filterOps, ...entry.originalLookup.operations];
    const effectiveLookup: DataSetLookup = { ...entry.originalLookup, operations: effectiveOps };

    try {
      const result = manager.lookup(effectiveLookup, { rowOffset: offset, rowCount: count });
      (entry.vizElement as unknown as VizTarget).dataSet = result.dataset;
      (entry.vizElement as unknown as VizTarget).totalRows = result.totalRows;
    } catch (err) {
      (entry.vizElement as unknown as VizTarget).error = err instanceof Error ? err.message : String(err);
    }
  }), { signal: abortController.signal });

  target.addEventListener("casehub-sort", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { columnId, order } = detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
      ?.filter as { group?: string } | undefined;
    const filterOps = getActiveFilterOps(filterState, entry.pagePath, filterGroup?.group);
    const existingOps = entry.originalLookup.operations.filter((op: DataSetOp) => op.type !== "sort");
    const sortOp: DataSetOp = { type: "sort" as const, columns: [{ columnId: columnId as unknown as ColumnId, order }] };
    const effectiveOps: DataSetOp[] = [...filterOps, ...existingOps, sortOp];
    const effectiveLookup: DataSetLookup = { ...entry.originalLookup, operations: effectiveOps };

    try {
      const result = manager.lookup(effectiveLookup);
      (entry.vizElement as unknown as VizTarget).dataSet = result.dataset;
      (entry.vizElement as unknown as VizTarget).totalRows = result.totalRows;
    } catch (err) {
      (entry.vizElement as unknown as VizTarget).error = err instanceof Error ? err.message : String(err);
    }
  }), { signal: abortController.signal });

  // --- Render (AFTER event listeners — connectedCallback fires during render) ---

  const onNode = createActivationCallback(registry, pagePathMap, {
    fetchFn: options?.fetch ?? globalThis.fetch?.bind(globalThis),
    baseUrl: options?.baseUrl,
    abortSignal: abortController.signal,
    permissions,
    pageIndex,
    dataSetScope,
    dataScopeRegistry,
    saveConfigRegistry,
    lazyPageResolutions,
  });
  renderComponent(target, root, { permissions, onNode });

  // popstate — back/forward browser navigation
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      const deepLink = parseFromUrl(location.hash);
      if (deepLink.page !== currentPage) {
        site.navigate(deepLink.page);
      }
    }, { signal: abortController.signal });
  }

  // ViewState
  const state: ViewState = Object.defineProperties({}, {
    currentPage: { get: () => currentPage, enumerable: true },
    activeFilters: { get: () => deriveActiveFilters(filterState, currentPage), enumerable: true },
  });

  const site: LiveSite = {
    root,

    page(path: string): Component | null {
      return pageIndex.get(path) ?? null;
    },

    dataset(id: DataSetId, fromPage?: string): ExternalDataSetDef | null {
      return resolveDataSetDef(id, fromPage ?? currentPage, dataSetScope) ?? null;
    },

    state,

    navigate(path: string): void {
      _navigating = true;
      const segments = path.split("/").filter(Boolean);
      currentPage = walkNavigate(root, segments, target, lazyPageResolutions);
      _navigating = false;

      if (typeof history !== "undefined") {
        const filters = deriveActiveFilters(filterState, currentPage);
        const hasFilters = Object.keys(filters).length > 0;
        const link: DeepLink = { page: currentPage, ...(hasFilters ? { filters } : {}) };
        history.pushState(null, "", serializeToUrl(link));
      }
    },

    dispose(): void {
      abortController.abort();
      for (const timer of pipeline.refreshTimers.values()) {
        clearInterval(timer);
      }
      pipeline.refreshTimers.clear();
      for (const timer of saveTimers.values()) {
        clearTimeout(timer);
      }
      saveTimers.clear();
      registry.clear();
      target.innerHTML = "";
    },
  };

  // Apply initial URL state
  if (typeof location !== "undefined" && location.hash) {
    const deepLink = parseFromUrl(location.hash);
    if (deepLink.page) {
      site.navigate(deepLink.page);
    }
    if (deepLink.filters) {
      for (const [col, values] of Object.entries(deepLink.filters)) {
        updateFilter(filterState, currentPage, undefined, col, [...values], false);
      }
    }
  }

  return site;
}
