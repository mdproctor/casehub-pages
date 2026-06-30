import type { Component, PermissionContext } from "@casehubio/pages-component/dist/model/types.js";
import { ALLOW_ALL } from "@casehubio/pages-component/dist/model/types.js";
import { renderComponent } from "@casehubio/pages-component/dist/renderer/render.js";
import type { DataSetId, ColumnId, CellValue } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataProviderConfig, ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { SortOrder } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";
import { createDataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
import { createDataProviderFactory, createPresetRegistry } from "@casehubio/pages-data/dist/dataset/external/index.js";
import type { Site, ViewState, DeepLink } from "@casehubio/pages-ui/dist/model/page-types.js";
import { parsePage } from "@casehubio/pages-ui/dist/parser/page-parser.js";
import { load as yamlLoad } from "js-yaml";
import { cellToRaw } from "@casehubio/pages-viz/dist/base/cell-extract.js";
import { applyTheme, LIGHT_THEME, DARK_THEME } from "@casehubio/pages-viz/dist/base/theme.js";
import type { PagesTheme } from "@casehubio/pages-viz/dist/base/theme.js";
import type { PagesFilterDetail } from "@casehubio/pages-viz/dist/base/filter-types.js";
import { buildPagePathMap } from "./page-paths.js";
import { buildDataSetScope, resolveDataSetDef } from "./dataset-scope.js";
import { buildPageIndex, computeCurrentPage, walkNavigate } from "./navigation.js";
import type { ActiveSlots } from "./navigation.js";
import { createActivationCallback } from "./activation.js";
import type { ComponentRegistry } from "./registry.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { VizTarget } from "./data-pipeline.js";
import { createFilterState, updateFilter, deriveActiveFilters, getActiveFilterOps, collectAncestorFilterOps, clearPageFilters } from "./cross-filter.js";
import type { FilterState } from "./cross-filter.js";
import { createComponentViewState, updateSort, updatePage, updateTextFilter, getComponentState } from "./component-view-state.js";
import type { ComponentViewState } from "./component-view-state.js";
import { createDataScopeRegistry, hasDataScope, getDataScope } from "./data-scope-registry.js";
import { createSaveConfigRegistry, getSaveConfig } from "./save-config-registry.js";
import { createEditState, updateEditState, clearEditState, isDirty, isAnyDirty, getEditState } from "./edit-state.js";
import { serializeToUrl, parseFromUrl } from "./url.js";
import type { SaveAdapter } from "./save-adapter.js";
import { createLocalAdapter } from "./adapters/local-adapter.js";
import { createRestAdapter } from "./adapters/rest-adapter.js";
import { ContextManager } from "./context-wiring.js";
import { ActionExecutor } from "./action.js";
import type { PagesActionCompleteDetail } from "./action.js";
import type { PagesActionRequestDetail } from "@casehubio/pages-component/dist/model/action-types.js";
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
  setTheme(theme: "light" | "dark" | PagesTheme): void;
  dispose(): void;
}

export interface SiteOptions {
  readonly permissions?: PermissionContext;
  readonly fetch?: typeof globalThis.fetch;
  readonly baseUrl?: string;
  readonly providerConfig?: DataProviderConfig;
  readonly adapters?: Readonly<Record<string, SaveAdapter>>;
}

export function loadSite(
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
  applyTheme(target, isDark ? DARK_THEME : LIGHT_THEME);

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
    },
  });
  const dataScopeRegistry = createDataScopeRegistry();
  const saveConfigRegistry = createSaveConfigRegistry();
  const editState = createEditState();
  const saveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  const componentViewState = createComponentViewState();
  const dockState = new Map<string, boolean>();
  const actionExecutor = new ActionExecutor(
    options?.fetch ?? globalThis.fetch.bind(globalThis),
    options?.baseUrl ?? ""
  );

  const pipeline = createDataPipeline(manager, dataSetScope, registry, filterState, dataScopeRegistry, componentViewState, contextManager, target);
  pipeline.setResolverCtx({
    manager,
    providerFactory: createDataProviderFactory(options?.fetch ?? globalThis.fetch.bind(globalThis), options?.baseUrl),
    providerConfig: options?.providerConfig ?? {},
    presetRegistry: createPresetRegistry(),
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
      for (const [id, entry] of registry) {
        if (entry.originalLookup?.dataSetId === scope.dataset && entry.vizElement) {
          pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, id);
        }
      }
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

    const ds = entry.vizElement.dataSet;
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
          c => c.id === childScope.idColumn,
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

      for (const [id, candidate] of registry) {
        if (candidate.vizElement && candidate.originalLookup) {
          pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
        }
      }
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
          for (const [id, candidate] of registry) {
            if (candidate.originalLookup?.dataSetId === scope.dataset && candidate.vizElement) {
              pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
            }
          }
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
          for (const [id, candidate] of registry) {
            if (candidate.originalLookup?.dataSetId === scope.dataset && candidate.vizElement) {
              pipeline.handleDataRequest(candidate.vizElement, candidate.originalLookup, id);
            }
          }
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
    for (const dataSetId of refresh) {
      for (const [id, entry] of registry) {
        if (entry.originalLookup?.dataSetId === dataSetId && entry.vizElement) {
          pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, id);
        }
      }
    }
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
      slotContainer.style.display = "";
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
        parentSplit.style.display = "";
      }
    } else {
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
          parentSplit.style.display = "none";
        }
      }
    }

    syncUrl("replaceState");
  }), { signal: abortController.signal });

  target.addEventListener("pages-event", ((e: Event) => {
    const { topic, payload } = (e as CustomEvent<{ topic: string; payload: unknown }>).detail;
    console.debug("[pages-event]", topic, payload);
  }), { signal: abortController.signal });

  // --- Render (AFTER event listeners — connectedCallback fires during render) ---

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
      for (const [id, entry] of registry) {
        if (entry.vizElement && entry.originalLookup) {
          pipeline.handleDataRequest(entry.vizElement, entry.originalLookup, id);
        }
      }
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

    setTheme(theme: "light" | "dark" | PagesTheme): void {
      applyTheme(target, theme);
      const echartsThemeName = theme === "dark" ? "dark" : "";
      for (const [, entry] of registry) {
        const vizEl = entry.vizElement;
        if (vizEl && "buildOption" in vizEl) {
          (vizEl as { theme: string }).theme = echartsThemeName;
        }
      }
    },

    navigate(path: string): void {
      navigateInternal(path);
      syncUrl("pushState");
    },

    dispose(): void {
      abortController.abort();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", onBeforeUnload);
      }
      pipeline.dispose();
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

  return Promise.resolve(site);
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
