import type {
    Component,
    LayoutState,
    PanelEntry,
    PermissionContext
} from "@casehubio/pages-component";
import {ALLOW_ALL} from "@casehubio/pages-component";
import type {HostPanelProps} from "@casehubio/pages-component";
import type {LayoutStore} from "./layout-store.js";
import {renderComponent} from "@casehubio/pages-component";
import type {CellValue, Column, ColumnId, DataSetId, TypedDataSet} from "@casehubio/pages-data";
import type {
    DataProviderConfig,
    ExternalDataSetDef,
    ServiceCapabilities
} from "@casehubio/pages-data";
import type {DataSetLookup} from "@casehubio/pages-data";
import type {SortOrder} from "@casehubio/pages-data";
import {createDataSetManager} from "@casehubio/pages-data";
import {
    createDataProviderFactory,
    createPresetRegistry,
    isServiceCapabilities,
    LOCAL_CAPABILITIES
} from "@casehubio/pages-data";
import type {DeepLink, Site, ViewState} from "@casehubio/pages-ui/dist/model/page-types.js";
import {parsePage} from "@casehubio/pages-ui/dist/parser/page-parser.js";
import {load as yamlLoad} from "js-yaml";
import {cellToRaw} from "@casehubio/pages-viz/dist/base/cell-extract.js";
import type {ThemeConfig} from "@casehubio/pages-ui-tokens";
import {applyThemeMode, DEFAULT_THEME, injectTheme} from "@casehubio/pages-ui-tokens";
import type {PagesFilterDetail} from "@casehubio/pages-viz/dist/base/filter-types.js";
import {buildPagePathMap} from "./page-paths.js";
import {buildDataSetScope, resolveDataSetDef} from "./dataset-scope.js";
import type {ActiveSlots} from "./navigation.js";
import {buildPageIndex, computeCurrentPage, walkNavigate} from "./navigation.js";
import {createActivationCallback} from "./activation.js";
import type {ComponentRegistry} from "./registry.js";
import type {VizTarget} from "./data-pipeline.js";
import {createDataPipeline} from "./data-pipeline.js";
import type {FilterState} from "./cross-filter.js";
import {
    clearPageFilters,
    collectAncestorFilterOps,
    createFilterState,
    deriveActiveFilters,
    updateFilter
} from "./cross-filter.js";
import type {ComponentViewState} from "./component-view-state.js";
import {createComponentViewState, updatePage, updateSort, updateTextFilter} from "./component-view-state.js";
import {createDataScopeRegistry, getDataScope, hasDataScope} from "./data-scope-registry.js";
import {createSaveConfigRegistry, getSaveConfig} from "./save-config-registry.js";
import {clearEditState, createEditState, getEditState, isAnyDirty, isDirty, updateEditState} from "./edit-state.js";
import {parseFromUrl, serializeToUrl} from "./url.js";
import type {SaveAdapter} from "./save-adapter.js";
import {createLocalAdapter} from "./adapters/local-adapter.js";
import {createRestAdapter} from "./adapters/rest-adapter.js";
import {ContextManager} from "./context-wiring.js";
import type {PagesActionCompleteDetail} from "./action.js";
import {ActionExecutor} from "./action.js";
import type {PagesActionRequestDetail} from "@casehubio/pages-component";
import type {DevAuthConfig} from "./dev-auth.js";
import {createDevAuthTokenFn} from "./dev-auth.js";

// --- Event detail interfaces for typed CustomEvent access ---

interface DataRequestDetail {
  readonly element: VizTarget;
  readonly lookup: DataSetLookup;
}

interface SlotChangeDetail {
  readonly activeSlot: string;
  readonly containerId: string;
}

interface FieldChangeDetail {
  readonly field: string;
  readonly value: unknown;
  readonly committed?: boolean;
}


interface PageDetail {
  readonly offset: number;
  readonly count: number;
}

interface SortDetail {
  readonly columnId: string;
  readonly order: SortOrder;
}

interface TextFilterDetail {
  readonly text: string;
}

interface RecordNavigateDetail {
  readonly direction: "prev" | "next";
}

interface RecordCreateDetail {
  readonly record?: Record<string, unknown>;
}

interface RecordDeleteDetail {
  readonly idValue: unknown;
}

export interface LiveSite extends Site {
  navigate(path: string): void;
  setTheme(mode: "light" | "dark"): void;
  dispose(): void;
  readonly layout: LayoutState;
}

export interface SiteOptions {
  readonly permissions?: PermissionContext;
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
  readonly providerConfig?: DataProviderConfig;
  readonly adapters?: Readonly<Record<string, SaveAdapter>>;
  readonly layout?: LayoutState;
  readonly layoutStore?: LayoutStore;
  readonly layoutKey?: string;
  readonly layoutSaveDelayMs?: number;
  readonly devAuth?: DevAuthConfig;
  readonly themeConfig?: ThemeConfig;
}

export async function loadSite(
  target: HTMLElement,
  source: string | Component,
  options?: SiteOptions,
): Promise<LiveSite> {
  let root: Component;
  try {
    root = typeof source === "string" ? parsePage(yamlLoad(source)) : source;
  } catch (err: unknown) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
  const permissions = options?.permissions ?? ALLOW_ALL;

  const settings = root.props?.["settings"] as Record<string, unknown> | undefined;
  const isDark = settings?.["mode"] === "dark";
  injectTheme(options?.themeConfig ?? DEFAULT_THEME, target);
  applyThemeMode(target, isDark ? "dark" : "light");

  const pagePathMap = buildPagePathMap(root);
  const dataSetScope = buildDataSetScope(root, pagePathMap);
  const pageIndex = buildPageIndex(root, pagePathMap);

  const registry: ComponentRegistry = new Map();
  const activeSlots: ActiveSlots = new Map();
  const filterState = createFilterState();
  const abortController = new AbortController();
  const lazyPageResolutions: Map<Component, Component> = new Map();
  const contextManager = new ContextManager();
  const manager = createDataSetManager({
    onChanged: (id, dataset) => {
      contextManager.updateDataset(id, dataset);
      pipeline.deliverDataSet(id);
    },
  });
  const dataScopeRegistry = createDataScopeRegistry();
  const saveConfigRegistry = createSaveConfigRegistry();
  const editState = createEditState();
  const saveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  const componentViewState = createComponentViewState();
  const dockState = new Map<string, boolean>();
  const splitRatios = new Map<string, readonly number[]>();
  let layoutSaveTimer: ReturnType<typeof setTimeout> | undefined;
  const actionExecutor = new ActionExecutor(
    options?.fetch ?? globalThis.fetch.bind(globalThis),
    options?.baseUrl ?? ""
  );

  const pipeline = createDataPipeline(manager, dataSetScope, registry, filterState, dataScopeRegistry, componentViewState, contextManager, target);

  let capabilities: ServiceCapabilities = LOCAL_CAPABILITIES;
  if (options?.providerConfig?.capabilities && options?.baseUrl) {
    try {
      const capUrl = `${options.baseUrl}${options.providerConfig.capabilities.endpoint}`;
      const resp = await (options?.fetch ?? globalThis.fetch)(capUrl);
      if (resp.ok) {
        const json: unknown = await resp.json();
        capabilities = isServiceCapabilities(json) ? json : LOCAL_CAPABILITIES;
      }
    } catch {
      // Backend unreachable — local-only mode
    }
  }

  pipeline.setResolverCtx({
    manager,
    providerFactory: createDataProviderFactory(options?.fetch ?? globalThis.fetch.bind(globalThis), options?.baseUrl),
    providerConfig: {
      ...options?.providerConfig,
      ...(options?.providerConfig?.serverQuery ? {
        serverQuery: {
          ...options.providerConfig.serverQuery,
          tokenFn: options.providerConfig.serverQuery.tokenFn ?? createDevAuthTokenFn(),
        },
      } : {}),
      ...(options?.providerConfig?.serverRelay ? {
        serverRelay: {
          ...options.providerConfig.serverRelay,
          tokenFn: options.providerConfig.serverRelay.tokenFn ?? createDevAuthTokenFn(),
        },
      } : {}),
    },
    presetRegistry: createPresetRegistry(),
    capabilities,
  });

  let _navigating = false;
  let currentPage = "";

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (isAnyDirty(editState)) {
      e.preventDefault();
    }
  }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
  }

  function resolveAdapter(
    saveConfig: { adapter: string; adapterConfig?: Readonly<Record<string, unknown>> },
    dataSetId: DataSetId,
    pagePath: string,
  ): SaveAdapter | undefined {
    if (options?.adapters?.[saveConfig.adapter]) {
      return options.adapters[saveConfig.adapter];
    }
    switch (saveConfig.adapter) {
      case "local":
        return createLocalAdapter(manager);
      case "rest": {
        const dataSetDef = resolveDataSetDef(dataSetId, pagePath, dataSetScope);
        if (!dataSetDef?.url) throw new Error(`Dataset "${String(dataSetId)}" has no URL for REST adapter`);
        return createRestAdapter(
          saveConfig.adapterConfig,
          dataSetDef.url,
          options?.fetch ?? globalThis.fetch.bind(globalThis),
        );
      }
      default:
        return undefined;
    }
  }

  function findComponentId(e: Event): string | undefined {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-component-id]");
    return el?.dataset.componentId;
  }

  function deriveUrlSort(
    cvs: ComponentViewState,
    reg: ComponentRegistry,
  ): Readonly<Record<string, { readonly columnId: string; readonly order: SortOrder }>> {
    const result: Record<string, { readonly columnId: string; readonly order: SortOrder }> = {};
    for (const [id, state] of cvs) {
      if (!state.sort) continue;
      const entry = reg.get(id);
      if (!entry?.hasExplicitId) continue;
      result[id] = { columnId: state.sort.columnId, order: state.sort.order };
    }
    return result;
  }

  function deriveUrlPagination(
    cvs: ComponentViewState,
    reg: ComponentRegistry,
  ): Readonly<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const [id, state] of cvs) {
      if (state.page === undefined || state.page === 0) continue;
      const entry = reg.get(id);
      if (!entry?.hasExplicitId) continue;
      result[id] = state.page;
    }
    return result;
  }

  function restoreFromUrl(
    hash: string,
    fs: FilterState,
    cvs: ComponentViewState,
  ): DeepLink {
    const link = parseFromUrl(hash);
    if (link.filters) {
      for (const [col, values] of Object.entries(link.filters)) {
        updateFilter(fs, link.page, undefined, col, [...values], false);
      }
    }
    if (link.sort) {
      for (const [id, s] of Object.entries(link.sort)) {
        updateSort(cvs, id, {
          columnId: s.columnId as ColumnId,
          order: s.order,
        });
      }
    }
    if (link.pagination) {
      for (const [id, page] of Object.entries(link.pagination)) {
        updatePage(cvs, id, page);
      }
    }
    if (link.textFilter) {
      for (const [id, text] of Object.entries(link.textFilter)) {
        updateTextFilter(cvs, id, text);
      }
    }
    if (link.dock) {
      for (const [id, state] of Object.entries(link.dock)) {
        dockState.set(id, state === "open");
        if (state === "closed") {
          const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
          const panelEl = target.querySelector<HTMLElement>(`[data-component-id="${escapedId}"]`);
          const slotContainer = panelEl?.closest<HTMLElement>("[data-slot]");
          if (slotContainer) slotContainer.style.display = "none";
        }
      }
    }
    return link;
  }

  function navigateInternal(path: string): void {
    _navigating = true;
    const segments = path.split("/").filter(Boolean);
    currentPage = walkNavigate(root, segments, target, lazyPageResolutions);
    contextManager.updatePage(currentPage, currentPage);
    _navigating = false;
  }

  function deriveUrlTextFilter(
    cvs: ComponentViewState,
    reg: ComponentRegistry,
  ): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [id, state] of cvs) {
      if (!state.textFilter) continue;
      const entry = reg.get(id);
      if (!entry?.hasExplicitId) continue;
      result[id] = state.textFilter;
    }
    return result;
  }

  function deriveDockState(): Readonly<Record<string, "open" | "closed">> | undefined {
    if (dockState.size === 0) return undefined;
    const result: Record<string, "open" | "closed"> = {};
    for (const [id, visible] of dockState) {
      result[id] = visible ? "open" : "closed";
    }
    return result;
  }

  function syncUrl(method: "pushState" | "replaceState"): void {
    if (typeof history === "undefined") return;

    const filters = deriveActiveFilters(filterState, currentPage);
    const sort = deriveUrlSort(componentViewState, registry);
    const pagination = deriveUrlPagination(componentViewState, registry);
    const textFilter = deriveUrlTextFilter(componentViewState, registry);

    const dock = deriveDockState();
    const link: DeepLink = {
      page: currentPage,
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
      ...(Object.keys(sort).length > 0 ? { sort } : {}),
      ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
      ...(Object.keys(textFilter).length > 0 ? { textFilter } : {}),
      ...(dock ? { dock } : {}),
    };
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

    const adapter = resolveAdapter(saveConfig, scope.dataset, pagePath);
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
      pipeline.refreshDataSet(scope.dataset);
    } else {
      console.error(`Save failed for page "${pagePath}":`, result.error);
      target.dispatchEvent(
        new CustomEvent("pages-save-error", {
          bubbles: true,
          detail: { pagePath, error: result.error ?? "Save failed" },
        }),
      );
      showErrorBanner(target, result.error ?? "Save failed");
    }
  }

  function resetAutoSaveTimer(pagePath: string, delay: number): void {
    const existing = saveTimers.get(pagePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      flushSave(pagePath).catch((err: unknown) => { console.error("Auto-save failed:", err); });
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

  target.addEventListener("pages-data-request", ((e: Event) => {
    const { element, lookup } = (e as CustomEvent<DataRequestDetail>).detail;
    const componentId = findComponentId(e);
    if (componentId) {
      pipeline.handleDataRequest(element, lookup, componentId);
    }
  }), { signal: abortController.signal });

  target.addEventListener("pages-slot-change", ((e: Event) => {
    const { activeSlot, containerId } = (e as CustomEvent<SlotChangeDetail>).detail;
    activeSlots.set(containerId, activeSlot);
    currentPage = computeCurrentPage(root, activeSlots);
    if (!_navigating) {
      syncUrl("pushState");
    }
    // Restore saved split ratios in newly-rendered lazy content
    const containerEl = target.querySelector<HTMLElement>(`[data-component-id="${containerId}"]`);
    if (containerEl) {
      applySavedSplitRatios(containerEl);
    }
  }), { signal: abortController.signal });

  target.addEventListener("pages-field-change", ((e: Event) => {
    const { field, value, committed } = (e as CustomEvent<FieldChangeDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;
    const entry = registry.get(componentId);
    if (!entry) return;

    updateEditState(editState, entry.pagePath, field, value);

    const saveConfig = getSaveConfig(saveConfigRegistry, entry.pagePath);
    if (!saveConfig) return;

    if (saveConfig.trigger === "auto" || saveConfig.trigger === undefined) {
      resetAutoSaveTimer(entry.pagePath, saveConfig.delay ?? 2000);
    } else if (saveConfig.trigger === "field" && committed === true) {
      flushSave(entry.pagePath).catch((err: unknown) => { console.error("Field save failed:", err); });
    }
  }), { signal: abortController.signal });

  target.addEventListener("pages-filter", ((e: Event) => {
    const detail = (e as CustomEvent<PagesFilterDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement) return;

    const ds = entry.vizElement.dataSet as TypedDataSet | undefined;
    if (!ds) return;

    const { columnId, group } = detail;

    // --- Record selection vs cross-filter path ---
    let childScopePath: string | undefined;
    let childScope: ReturnType<typeof getDataScope> | undefined;

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

    // Determine if this is record selection or cross-filter
    let isRecordSelection = false;
    let detectedIdCell: CellValue | undefined;
    if (childScope && childScopePath) {
      if (!detail.reset) {
        // Apply: check via row cell lookup
        try {
          detectedIdCell = detail.row.cell(childScope.idColumn as ColumnId);
          if (detectedIdCell.type !== "NULL") {
            isRecordSelection = true;
          }
        } catch {
          // Column not found → cross-filter
        }
      } else {
        // Reset: check via column schema
        isRecordSelection = ds.columns.some(
          (c: Column) => c.id === childScope.idColumn,
        );
      }
    }

    if (isRecordSelection && childScopePath && childScope) {
      if (!detail.reset && detectedIdCell) {
        // Record selection apply
        if (isDirty(editState, childScopePath)) {
          flushSave(childScopePath).catch((err: unknown) => { console.error("Pre-switch save failed:", err); });
        }
        const childFilters = filterState.get(childScopePath);
        if (childFilters) {
          for (const [, columnMap] of childFilters) columnMap.clear();
        }
        const idValue = String(cellToRaw(detectedIdCell));
        updateFilter(filterState, childScopePath, group, childScope.idColumn, [idValue], false);
      } else {
        // Record selection reset — clear the child scope filter
        updateFilter(filterState, childScopePath, group, childScope.idColumn, [], true);
      }
    } else {
      // Cross-filter path
      if (!detail.reset) {
        updateFilter(filterState, entry.pagePath, group, columnId, [detail.value], false);
      } else {
        updateFilter(filterState, entry.pagePath, group, columnId, [], true);
      }
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
        updatePage(componentViewState, id, 0);
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
        updatePage(componentViewState, id, 0);
        pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
      }
    }

    // Update ContextManager with derived filter state
    const derivedFilters = deriveActiveFilters(filterState, currentPage);
    contextManager.updateFilter(derivedFilters);

    syncUrl("replaceState");
  }), { signal: abortController.signal });

  target.addEventListener("pages-page", ((e: Event) => {
    const { offset, count } = (e as CustomEvent<PageDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    if (count > 0 && offset % count !== 0) {
      console.warn(`pages-page: unaligned offset ${String(offset)} for count ${String(count)}, rounding down`);
    }
    const page = count > 0 ? Math.floor(offset / count) : 0;
    updatePage(componentViewState, componentId, page);
    pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, componentId);
    syncUrl("replaceState");
  }), { signal: abortController.signal });

  target.addEventListener("pages-sort", ((e: Event) => {
    const { columnId, order } = (e as CustomEvent<SortDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    updateSort(componentViewState, componentId, { columnId: columnId as ColumnId, order });
    updatePage(componentViewState, componentId, 0);
    pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, componentId);
    syncUrl("replaceState");
  }), { signal: abortController.signal });

  target.addEventListener("pages-text-filter", ((e: Event) => {
    const { text } = (e as CustomEvent<TextFilterDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    updateTextFilter(componentViewState, componentId, text || undefined);
    updatePage(componentViewState, componentId, 0);
    pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, componentId);
    syncUrl("replaceState");
  }), { signal: abortController.signal });

  target.addEventListener("pages-record-navigate", ((e: Event) => {
    const { direction } = (e as CustomEvent<RecordNavigateDetail>).detail;

    for (const [scopePath] of dataScopeRegistry) {
      if (!isDirty(editState, scopePath)) continue;
      flushSave(scopePath).catch((err: unknown) => { console.error("Pre-nav save failed:", err); });
    }

    for (const [scopePath, scope] of dataScopeRegistry) {
      if (!manager.has(scope.dataset)) continue;

      const lookup: DataSetLookup = { dataSetId: scope.dataset, operations: [] };
      let allRows;
      try {
        allRows = manager.lookup(lookup).dataset.rows;
      } catch { continue; }

      if (allRows.length === 0) continue;

      const pageFilters = filterState.get(scopePath);
      let currentIdValue: string | undefined;
      if (pageFilters) {
        for (const [, columnMap] of pageFilters) {
          const idValues = columnMap.get(scope.idColumn);
          if (idValues?.length) { currentIdValue = idValues[0]; break; }
        }
      }

      const currentIdx = currentIdValue !== undefined
        ? allRows.findIndex(row => {
            const cell = row.cell(scope.idColumn as ColumnId);
            return cell.type !== "NULL" && String(cell.value) === currentIdValue;
          })
        : 0;

      const newIdx = direction === "next"
        ? Math.min(currentIdx + 1, allRows.length - 1)
        : Math.max(currentIdx - 1, 0);

      if (newIdx === currentIdx) return;

      const newRow = allRows[newIdx];
      if (!newRow) return;
      const newIdCell = newRow.cell(scope.idColumn as ColumnId);
      const newIdValue = String(cellToRaw(newIdCell));

      if (pageFilters) {
        for (const [, columnMap] of pageFilters) columnMap.clear();
      }
      updateFilter(filterState, scopePath, undefined, scope.idColumn, [newIdValue], false);

      pipeline.deliverAll();
      break;
    }
  }), { signal: abortController.signal });

  target.addEventListener("pages-record-create", ((e: Event) => {
    const { record: eventRecord } = (e as CustomEvent<RecordCreateDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;
    const entry = registry.get(componentId);
    if (!entry) return;

    const scope = getDataScope(dataScopeRegistry, entry.pagePath);
    if (!scope) return;

    const saveConfig = getSaveConfig(saveConfigRegistry, entry.pagePath);
    if (!saveConfig) return;

    const record: Record<string, unknown> = eventRecord ?? {};

    const adapter = resolveAdapter(saveConfig, scope.dataset, entry.pagePath);
    if (!adapter?.create) return;

    adapter.create(scope.dataset, record)
      .then((result) => {
        if (result.success) {
          pipeline.refreshDataSet(scope.dataset);
        } else {
          target.dispatchEvent(new CustomEvent("pages-save-error", {
            bubbles: true,
            detail: { pagePath: entry.pagePath, error: result.error ?? "Create failed" },
          }));
          showErrorBanner(target, result.error ?? "Create failed");
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showErrorBanner(target, msg);
      });
  }), { signal: abortController.signal });

  target.addEventListener("pages-record-delete", ((e: Event) => {
    const { idValue } = (e as CustomEvent<RecordDeleteDetail>).detail;
    const componentId = findComponentId(e);
    if (!componentId) return;
    const entry = registry.get(componentId);
    if (!entry) return;

    const scope = getDataScope(dataScopeRegistry, entry.pagePath);
    if (!scope) return;

    const saveConfig = getSaveConfig(saveConfigRegistry, entry.pagePath);
    if (!saveConfig) return;

    if (idValue === undefined) return;

    const adapter = resolveAdapter(saveConfig, scope.dataset, entry.pagePath);
    if (!adapter?.delete) return;

    adapter.delete(scope.dataset, scope.idColumn, idValue)
      .then((result) => {
        if (result.success) {
          clearEditState(editState, entry.pagePath);
          pipeline.refreshDataSet(scope.dataset);
        } else {
          target.dispatchEvent(new CustomEvent("pages-save-error", {
            bubbles: true,
            detail: { pagePath: entry.pagePath, error: result.error ?? "Delete failed" },
          }));
          showErrorBanner(target, result.error ?? "Delete failed");
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showErrorBanner(target, msg);
      });
  }), { signal: abortController.signal });

  target.addEventListener("pages-action-request", ((e: Event) => {
    const { config, resolve } = (e as CustomEvent<PagesActionRequestDetail>).detail;

    actionExecutor.execute(config, config.callbacks, contextManager.getContext())
      .then((result) => {
        resolve(result);

        if (result.success && config.callbacks.onSuccess?.refresh) {
          target.dispatchEvent(new CustomEvent<PagesActionCompleteDetail>("pages-action-complete", {
            bubbles: true,
            detail: { refresh: config.callbacks.onSuccess.refresh },
          }));
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ success: false, error: msg });
      });
  }), { signal: abortController.signal });

  target.addEventListener("pages-action-complete", ((e: Event) => {
    const { refresh } = (e as CustomEvent<PagesActionCompleteDetail>).detail;

    // Re-fetch listed datasets
    for (const dsId of refresh) {
      pipeline.refreshDataSet(dsId as DataSetId);
    }
  }), { signal: abortController.signal });

  target.addEventListener("pages-refresh-request", ((e: Event) => {
    const componentId = findComponentId(e);
    if (!componentId) return;
    const entry = registry.get(componentId);
    if (!entry?.originalLookup) return;
    pipeline.refreshDataSet(entry.originalLookup.dataSetId);
  }), { signal: abortController.signal });

  target.addEventListener("pages-dock-toggle", ((e: Event) => {
    const { panelId, visible } = (e as CustomEvent<{ panelId: string; visible: boolean }>).detail;
    dockState.set(panelId, visible);

    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(panelId) : panelId;
    const panelEl = target.querySelector<HTMLElement>(`[data-component-id="${escapedId}"]`);
    if (!panelEl) return;

    const slotContainer = panelEl.closest<HTMLElement>("[data-slot]");
    if (!slotContainer) return;

    if (visible) {
      slotContainer.style.display = slotContainer.dataset.pagesDisplay ?? "";
      delete slotContainer.dataset.pagesDisplay;
      // Show adjacent drag handle
      const adjacentHandle = slotContainer.nextElementSibling as HTMLElement | null;
      if (adjacentHandle?.dataset.splitHandle !== undefined) {
        adjacentHandle.style.display = "";
      }
      const prevHandle = slotContainer.previousElementSibling as HTMLElement | null;
      if (prevHandle?.dataset.splitHandle !== undefined) {
        prevHandle.style.display = "";
      }
      // Restore parent split if it was collapsed
      const parentSplit = slotContainer.closest<HTMLElement>('[data-component-type="split"]');
      if (parentSplit && parentSplit.style.display === "none") {
        parentSplit.style.display = parentSplit.dataset.pagesDisplay ?? "";
        delete parentSplit.dataset.pagesDisplay;
      }
    } else {
      slotContainer.dataset.pagesDisplay = slotContainer.style.display;
      slotContainer.style.display = "none";
      // Hide adjacent drag handle
      const adjacentHandle = slotContainer.nextElementSibling as HTMLElement | null;
      if (adjacentHandle?.dataset.splitHandle !== undefined) {
        adjacentHandle.style.display = "none";
      }
      const prevHandle = slotContainer.previousElementSibling as HTMLElement | null;
      if (prevHandle?.dataset.splitHandle !== undefined && prevHandle.nextElementSibling === slotContainer) {
        prevHandle.style.display = "none";
      }
      // Collapse parent split if all children hidden
      const parentSplit = slotContainer.closest<HTMLElement>('[data-component-type="split"]');
      if (parentSplit) {
        const slotChildren = parentSplit.querySelectorAll<HTMLElement>(":scope > [data-slot]");
        const allHidden = Array.from(slotChildren).every(s => s.style.display === "none");
        if (allHidden) {
          parentSplit.dataset.pagesDisplay = parentSplit.style.display;
          parentSplit.style.display = "none";
        }
      }
    }

    syncUrl("replaceState");
    scheduleLayoutSave();
  }), { signal: abortController.signal });

  target.addEventListener("pages-event", ((e: Event) => {
    const { topic, payload } = (e as CustomEvent<{ topic: string; payload: unknown }>).detail;
    console.debug("[pages-event]", topic, payload);
  }), { signal: abortController.signal });

  target.addEventListener("pages-split-resize", ((e: Event) => {
    const { componentId, ratios } = (e as CustomEvent<{ componentId: string; ratios: number[] }>).detail;
    // Hidden panel correction: if ratio is 0 and we had a non-zero value, keep the old value
    const previous = splitRatios.get(componentId);
    const corrected = ratios.map((r, i) => {
      if (r === 0 && previous && previous[i] !== undefined && previous[i] !== 0) {
        return previous[i];
      }
      return r;
    });
    splitRatios.set(componentId, corrected);
    scheduleLayoutSave();
  }), { signal: abortController.signal });

  // --- Layout helpers ---

  function applySavedSplitRatios(scope: HTMLElement): void {
    for (const [componentId, ratios] of splitRatios) {
      const splitEl = scope.querySelector<HTMLElement>(`[data-component-id="${componentId}"]`);
      if (!splitEl) continue;
      const slots = splitEl.querySelectorAll<HTMLElement>(`:scope > [data-slot]`);
      if (ratios.length !== slots.length) continue;
      slots.forEach((slot, i) => {
        slot.style.flex = String(ratios[i]);
      });
    }
  }

  function scheduleLayoutSave(): void {
    if (!options?.layoutStore || !options?.layoutKey) return;
    if (layoutSaveTimer !== undefined) clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(() => {
      layoutSaveTimer = undefined;
      options.layoutStore!.save(options.layoutKey!, captureLayout()).catch(() => {});
    }, options?.layoutSaveDelayMs ?? 500);
  }

  function captureHostPanels(): Readonly<Record<string, PanelEntry>> {
    const result: Record<string, PanelEntry> = {};
    for (const [id, entry] of registry) {
      if (entry.component.type === "host-panel" && entry.hasExplicitId) {
        const hp = entry.component.props as HostPanelProps | undefined;
        if (hp?.typeName) {
          result[id] = hp.panelProps
            ? { typeName: hp.typeName, props: hp.panelProps }
            : { typeName: hp.typeName };
        }
      }
    }
    return Object.freeze(result);
  }

  function captureLayout(): LayoutState {
    return Object.freeze({
      splits: Object.freeze(Object.fromEntries(splitRatios)),
      docks: Object.freeze(Object.fromEntries(dockState)),
      panels: captureHostPanels(),
    });
  }

  // --- Seed layout state from store or direct injection (BEFORE render) ---

  let seedLayout: LayoutState | null = null;
  if (options?.layoutStore && options?.layoutKey) {
    try {
      seedLayout = await options.layoutStore.load(options.layoutKey);
    } catch (err) {
      console.warn("[pages] Failed to load layout from store:", err);
    }
  }
  if (!seedLayout && options?.layout) {
    seedLayout = options.layout;
  }
  if (seedLayout) {
    for (const [id, ratios] of Object.entries(seedLayout.splits)) {
      splitRatios.set(id, ratios);
    }
    for (const [id, visible] of Object.entries(seedLayout.docks)) {
      dockState.set(id, visible);
    }
  }

  // --- Render (AFTER event listeners and layout seed) ---

  const onNode = createActivationCallback(registry, pagePathMap, {
    fetchFn: options?.fetch ?? globalThis.fetch.bind(globalThis),
    baseUrl: options?.baseUrl,
    abortSignal: abortController.signal,
    permissions,
    pageIndex,
    dataSetScope,
    dataScopeRegistry,
    saveConfigRegistry,
    lazyPageResolutions,
  }, contextManager);
  renderComponent(target, root, { permissions, onNode });

  // Apply saved split ratios to rendered DOM
  applySavedSplitRatios(target);

  // popstate — back/forward browser navigation
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      const link = parseFromUrl(location.hash);

      // DOM navigation only — no URL push (URL is already correct)
      if (link.page !== currentPage) {
        navigateInternal(link.page);
      }

      // Full state replacement — not additive merge
      clearPageFilters(filterState, currentPage);
      componentViewState.clear();
      restoreFromUrl(location.hash, filterState, componentViewState);

      // Re-push all registered components
      pipeline.deliverAll();
    }, { signal: abortController.signal });
  }

  // ViewState
  const state: ViewState = Object.defineProperties({} as ViewState, {
    currentPage: { get: () => currentPage, enumerable: true },
    activeFilters: { get: () => deriveActiveFilters(filterState, currentPage), enumerable: true },
    sort: { get: () => deriveUrlSort(componentViewState, registry), enumerable: true },
    pagination: { get: () => deriveUrlPagination(componentViewState, registry), enumerable: true },
    textFilter: { get: () => deriveUrlTextFilter(componentViewState, registry), enumerable: true },
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

    setTheme(mode: "light" | "dark"): void {
      applyThemeMode(target, mode);
      const echartsThemeName = mode === "dark" ? "dark" : "";
      for (const [, entry] of registry) {
        const vizEl = entry.vizElement;
        if (vizEl && "buildOption" in vizEl && "theme" in vizEl) {
          (vizEl as unknown as { theme: string }).theme = echartsThemeName;
        }
      }
    },

    navigate(path: string): void {
      navigateInternal(path);
      syncUrl("pushState");
    },

    get layout(): LayoutState {
      return captureLayout();
    },

    dispose(): void {
      abortController.abort();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      pipeline.dispose();
      if (layoutSaveTimer !== undefined) {
        clearTimeout(layoutSaveTimer);
        layoutSaveTimer = undefined;
      }
      for (const timer of saveTimers.values()) {
        clearTimeout(timer);
      }
      saveTimers.clear();
      const sentinels = document.querySelectorAll("[data-param-dataset]");
      for (const sentinel of sentinels) {
        sentinel.remove();
      }
      componentViewState.clear();
      registry.clear();
      target.innerHTML = "";
    },
  };

  // Initialization reorder: parse URL and populate state BEFORE navigation
  // This fixes the race where components received unfiltered data because
  // filters were populated after rendering.
  if (typeof location !== "undefined" && location.hash) {
    const deepLink = restoreFromUrl(location.hash, filterState, componentViewState);
    if (deepLink.page) {
      navigateInternal(deepLink.page);
    }
    syncUrl("replaceState");
  }

  return site;
}

function showErrorBanner(container: HTMLElement, message: string): void {
  const existing = container.querySelector("[data-pages-error]");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.setAttribute("data-pages-error", "");
  banner.style.cssText = "padding:8px 16px;background:#fef2f2;border:1px solid #fca5a5;border-radius:4px;color:#991b1b;font-size:14px;margin:8px 0;cursor:pointer;";
  banner.textContent = message;
  banner.addEventListener("click", () => { banner.remove(); });
  container.insertBefore(banner, container.firstChild);

  setTimeout(() => { if (banner.isConnected) banner.remove(); }, 5000);
}
