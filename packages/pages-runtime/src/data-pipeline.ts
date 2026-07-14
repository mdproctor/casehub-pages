import type {DataSetId, TypedDataSet} from "@casehubio/pages-data";
import type {DataSetManager, LookupOptions} from "@casehubio/pages-data";
import type {DataSetLookup} from "@casehubio/pages-data";
import type {DataSetOp} from "@casehubio/pages-data";
import type {ResolverContext} from "@casehubio/pages-data";
import {resolveExternalDataSet} from "@casehubio/pages-data";
import type {ExternalDataSetDef, ResolveResult} from "@casehubio/pages-data";
import {parseRefreshTime} from "@casehubio/pages-data";
import type {PushSource} from "@casehubio/pages-data";
import {
    createPushPool,
    createSseSource,
    createWebSocketSource,
    evaluateGenerator
} from "@casehubio/pages-data";
import type {DataSetEvent} from "@casehubio/pages-data";
import type {DataSink, DataSource, DataSourceBinding} from "@casehubio/pages-data";
import type {ComponentRegistry} from "./registry.js";
import type {DataSetScope} from "./dataset-scope.js";
import {isBinding, resolveDataSetDef, resolveDataSetEntry} from "./dataset-scope.js";
import type {FilterState} from "./cross-filter.js";
import {collectAncestorFilterOps, getActiveFilterOps} from "./cross-filter.js";
import type {DataScopeRegistry} from "./data-scope-registry.js";
import {getDataScope} from "./data-scope-registry.js";
import {resolveRefBindings} from "./ref-resolution.js";
import type {ComponentViewState} from "./component-view-state.js";
import {getComponentState, updatePage} from "./component-view-state.js";
import type {ContextManager} from "./context-wiring.js";
import {
    allTemplateVarsResolved,
    hasTemplateVars,
    resolveTemplate
} from "@casehubio/pages-component";
import type {VizTarget} from "@casehubio/pages-component";

export type { VizTarget } from "@casehubio/pages-component";

export interface DataPipeline {
  handleDataRequest(
    target: VizTarget,
    lookup: DataSetLookup,
    componentId: string,
  ): void;

  setResolverCtx(ctx: ResolverContext): void;
  dispose(): void;
  refreshDataSet(dataSetId: DataSetId): void;
  deliverDataSet(dataSetId: DataSetId): void;
  deliverAll(): void;
}

function applyTextFilter(ds: TypedDataSet, term: string): TypedDataSet {
  const lower = term.toLowerCase();
  const rows = ds.rows.filter(row =>
    row.cells.some(cell =>
      cell.type !== "NULL" && String(cell.value).toLowerCase().includes(lower),
    ),
  );
  return { columns: ds.columns, rows };
}

export function createDataPipeline(
  manager: DataSetManager,
  scope: DataSetScope,
  registry: ComponentRegistry,
  filterState: FilterState,
  dataScopeRegistry: DataScopeRegistry,
  componentViewState: ComponentViewState,
  contextManager?: ContextManager,
  target?: HTMLElement,
): DataPipeline {
  // --- Legacy resolution state (ExternalDataSetDef path) ---
  const pendingResolutions = new Map<DataSetId, Promise<ResolveResult>>();
  const refreshTimers = new Map<DataSetId, ReturnType<typeof setInterval>>();
  const abortControllers = new Map<DataSetId, AbortController>();
  const parameterisedConsumers = new Set<DataSetId>();
  const wsPool = createPushPool((url, cfg) => createWebSocketSource(url, cfg));
  const ssePool = createPushPool((url, cfg) => createSseSource(url, cfg));
  const pushSubscriptions = new Map<DataSetId, PushSource>();
  const pushSubscribers = new Map<DataSetId, Set<string>>();
  const serverQueryDatasets = new Set<DataSetId>();
  const serverQueryLookups = new Map<DataSetId, DataSetLookup>();

  // --- DataSource path state ---
  const connectedSources = new Map<DataSetId, DataSource>();

  // --- Refresh state ---
  const reFetchCallbacks = new Map<DataSetId, () => void>();
  const pendingRefreshes = new Set<DataSetId>();
  const DEFAULT_TTL_MS = 60_000;

  let observer: MutationObserver | undefined;
  let resolverCtx: ResolverContext | undefined;

  if (target) {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          handleSubtreeRemoved(node);
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function handleSubtreeRemoved(removed: HTMLElement): void {
    const affected: Array<[string, HTMLElement]> = [];
    for (const [componentId, entry] of registry) {
      const el = entry.element;
      if (removed !== el && !removed.contains(el)) continue;
      affected.push([componentId, el]);
    }

    if (affected.length === 0) return;

    queueMicrotask(() => {
      for (const [componentId, el] of affected) {
        if (el.isConnected) continue;
        cleanupComponentSubscriptions(componentId);
      }
    });
  }

  function cleanupComponentSubscriptions(componentId: string): void {
    for (const [dsId, subscribers] of pushSubscribers) {
      if (!subscribers.has(componentId)) continue;
      subscribers.delete(componentId);
      if (subscribers.size === 0) {
        const source = pushSubscriptions.get(dsId);
        if (source) {
          source.unsubscribe(dsId);
          pushSubscriptions.delete(dsId);
        }
        pushSubscribers.delete(dsId);
      }
    }
  }

  // --- DataSource connect/disconnect ---

  function connectSource(dataSetId: DataSetId, source: DataSource): void {
    if (connectedSources.has(dataSetId)) return;

    const sink: DataSink = {
      apply(event: DataSetEvent): void {
        manager.apply(dataSetId, event);
      },
      error(err): void {
        if (!err.permanent) {
          console.warn(`[DataPipeline] Transient source error for ${String(dataSetId)}: ${err.message}`);
          return;
        }
        for (const [, compEntry] of registry) {
          if (compEntry.originalLookup?.dataSetId === dataSetId && compEntry.vizElement) {
            compEntry.vizElement.error = err.message;
          }
        }
      },
    };

    source.connect(sink);
    connectedSources.set(dataSetId, source);
  }

  // --- Legacy push source management (ExternalDataSetDef path) ---

  function acquirePushSource(def: ExternalDataSetDef): PushSource | undefined {
    const url = def.url;
    if (!url) return undefined;
    if (url.startsWith("ws://") || url.startsWith("wss://")) {
      const baseUrl = new URL(url);
      baseUrl.search = "";
      return wsPool.acquire(baseUrl.toString());
    }
    if (url.startsWith("sse://") || url.startsWith("sses://")) {
      const isSecure = url.startsWith("sses://");
      const httpUrl = new URL((isSecure ? "https://" : "http://") + url.slice(isSecure ? 8 : 6));
      httpUrl.search = "";
      const baseKey = (isSecure ? "sses://" : "sse://") + httpUrl.host + httpUrl.pathname;
      return ssePool.acquire(baseKey);
    }
    return undefined;
  }

  function subscribePushSource(
    lookup: DataSetLookup,
    def: ExternalDataSetDef,
    componentId: string,
  ): void {
    const source = acquirePushSource(def);
    if (!source) return;

    // Track this component as a subscriber
    let subscribers = pushSubscribers.get(lookup.dataSetId);
    if (!subscribers) {
      subscribers = new Set();
      pushSubscribers.set(lookup.dataSetId, subscribers);
    }
    subscribers.add(componentId);

    // Only subscribe to the source once per dataset
    if (pushSubscriptions.has(lookup.dataSetId)) return;
    pushSubscriptions.set(lookup.dataSetId, source);

    source.subscribe(
      lookup.dataSetId,
      def,
      (event: DataSetEvent) => {
        manager.apply(lookup.dataSetId, event);
      },
      (error) => {
        if (!error.permanent) {
          console.warn(`[DataPipeline] Transient push error for ${String(lookup.dataSetId)}: ${error.message}`);
          return;
        }
        for (const [, compEntry] of registry) {
          if (compEntry.originalLookup?.dataSetId === lookup.dataSetId && compEntry.vizElement) {
            compEntry.vizElement.error = error.message;
          }
        }
      },
    );
  }

  function findFirstEntry(dataSetId: DataSetId) {
    for (const [, entry] of registry) {
      if (entry.originalLookup?.dataSetId === dataSetId) return entry;
    }
    return undefined;
  }

  function pushData(
    target: VizTarget,
    lookup: DataSetLookup,
    pagePath: string,
    filterGroup: string | undefined,
    componentId: string,
    options?: LookupOptions,
  ): void {
    try {
      // Pipeline bypass: when component has expandable config, deliver all rows.
      // The component handles pagination and text filtering internally.
      {
        const expandableEntry = registry.get(componentId);
        const expandable = (expandableEntry?.component.props as { expandable?: unknown } | undefined)?.expandable;
        if (expandable) {
          const effectiveLookup = serverQueryDatasets.has(lookup.dataSetId)
            ? { ...lookup, operations: [] as readonly DataSetOp[] }
            : lookup;
          const result = manager.lookup(effectiveLookup, options);
          target.activePage = undefined;
          target.totalRows = result.totalRows;
          target.dataSet = result.dataset;
          target.activeSort = undefined;
          return;
        }
      }

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
      const isServerQuery = serverQueryDatasets.has(lookup.dataSetId);
      let sortOps: readonly DataSetOp[] = isServerQuery
        ? []
        : lookup.operations.filter((op) => op.type !== "sort");

      if (compState?.sort) {
        sortOps = [...sortOps, { type: "sort" as const, columns: [compState.sort] }];
        target.activeSort = compState.sort;
      } else if (!isServerQuery) {
        sortOps = lookup.operations;
        target.activeSort = undefined;
      } else {
        target.activeSort = undefined;
      }

      const effectiveOps = [...filterOps, ...sortOps];
      const effectiveLookup: DataSetLookup = { ...lookup, operations: effectiveOps };

      const entry = registry.get(componentId);
      const pageSize = (entry?.component.props as { pageSize?: number } | undefined)?.pageSize;
      const textFilter = compState?.textFilter;
      let requestedPage = compState?.page;

      if (textFilter) {
        // Text filter active: lookup without pagination, filter, then paginate manually
        const fullResult = manager.lookup(effectiveLookup, options);
        const filtered = applyTextFilter(fullResult.dataset, textFilter);
        const totalRows = filtered.rows.length;

        if (pageSize !== undefined && requestedPage !== undefined) {
          if (totalRows > 0 && requestedPage * pageSize >= totalRows) {
            requestedPage = Math.floor((totalRows - 1) / pageSize);
            updatePage(componentViewState, componentId, requestedPage);
          }
          const start = requestedPage * pageSize;
          const pageRows = filtered.rows.slice(start, start + pageSize);
          target.activePage = requestedPage;
          target.totalRows = totalRows;
          target.dataSet = { columns: filtered.columns, rows: pageRows };
        } else {
          target.activePage = undefined;
          target.totalRows = totalRows;
          target.dataSet = filtered;
        }
      } else {
        // No text filter: use manager pagination directly
        let paginationOptions = options;
        if (pageSize !== undefined && requestedPage !== undefined) {
          const rowOffset = requestedPage * pageSize;
          paginationOptions = { ...options, rowOffset, rowCount: pageSize };
        }

        const result = manager.lookup(effectiveLookup, paginationOptions);

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
      }
    } catch (err) {
      target.error = err instanceof Error ? err.message : String(err);
    }
  }

  // --- Handle DataSourceBinding path ---

  function handleBindingRequest(
    target: VizTarget,
    lookup: DataSetLookup,
    componentId: string,
    binding: DataSourceBinding,
  ): void {
    // Source already connected and data in manager — serve immediately
    if (connectedSources.has(lookup.dataSetId) && manager.has(lookup.dataSetId)) {
      const entry = registry.get(componentId);
      if (!entry) return;
      const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
        ?.filter as { group?: string } | undefined;
      pushData(target, lookup, entry.pagePath, filterGroup?.group, componentId);
      return;
    }

    // Connect the source — it will feed into manager.apply() via the sink
    connectSource(lookup.dataSetId, binding.source);
  }

  // --- Handle legacy ExternalDataSetDef path ---

  function handleDefRequest(
    target: VizTarget,
    lookup: DataSetLookup,
    componentId: string,
    def: ExternalDataSetDef,
    _entry: { pagePath: string; component: { type: string; props?: Record<string, unknown> } },
  ): void {
    if (!resolverCtx) {
      target.error = `No resolver context available`;
      return;
    }

    // Push source routing (WebSocket, SSE)
    const pushSource = acquirePushSource(def);
    if (pushSource) {
      subscribePushSource(lookup, def, componentId);
      return;
    }

    // Parameterised URL handling: defer fetch until all template vars resolved
    if (def.url && contextManager && hasTemplateVars(def.url) && !parameterisedConsumers.has(lookup.dataSetId)) {
      parameterisedConsumers.add(lookup.dataSetId);

      const urlTemplate = def.url;
      let lastResolvedUrl = "";

      // Create a sentinel element for the consumer (attached to document for isConnected)
      const sentinel = document.createElement("span");
      sentinel.dataset.paramDataset = String(lookup.dataSetId);
      document.body.appendChild(sentinel);

      const consumer: import("./context-wiring.js").ContextConsumer = {
        element: sentinel,
        templates: new Map([
          [
            "url",
            {
              template: urlTemplate,
              escapeMode: "url" as const,
              lastResolved: "",
              apply: (resolvedUrl: string) => {
                // Check if all variables are actually resolved (not just changed)
                if (!allTemplateVarsResolved(urlTemplate, contextManager.getContext())) {
                  return;
                }

                if (resolvedUrl === lastResolvedUrl) return;
                lastResolvedUrl = resolvedUrl;

                // Abort any in-flight request for this dataset
                const existingController = abortControllers.get(lookup.dataSetId);
                if (existingController) {
                  existingController.abort();
                }

                // Create new AbortController for this request
                const controller = new AbortController();
                abortControllers.set(lookup.dataSetId, controller);

                // Build a new def with the resolved URL
                const resolvedDef: ExternalDataSetDef = { ...def, url: resolvedUrl };

                // Clean up any pending resolution
                pendingResolutions.delete(lookup.dataSetId);

                // Wrap provider to inject AbortSignal and resolved URL
                const wrappedCtx: ResolverContext = {
                  ...resolverCtx!,
                  providerFactory: {
                    create: (d, c) => {
                      const provider = resolverCtx!.providerFactory.create(d, c);
                      if (!provider) return undefined;
                      return {
                        fetch: (req) => provider.fetch({ ...req, url: resolvedUrl, signal: controller.signal }),
                      };
                    },
                  },
                };
                const pending = resolveExternalDataSet(resolvedDef, wrappedCtx);
                pendingResolutions.set(lookup.dataSetId, pending);

                pending
                  .then(() => {
                    pendingResolutions.delete(lookup.dataSetId);
                    abortControllers.delete(lookup.dataSetId);
                  })
                  .catch((err: unknown) => {
                    pendingResolutions.delete(lookup.dataSetId);
                    abortControllers.delete(lookup.dataSetId);
                    if (err instanceof DOMException && err.name === "AbortError") return;
                    target.error = err instanceof Error ? err.message : String(err);
                  });
              },
            },
          ],
        ]),
        suspended: false,
      };

      contextManager.registerConsumer(consumer);

      reFetchCallbacks.set(lookup.dataSetId, () => {
        const existingCtrl = abortControllers.get(lookup.dataSetId);
        if (existingCtrl) existingCtrl.abort();
        lastResolvedUrl = "";
        if (!allTemplateVarsResolved(urlTemplate, contextManager.getContext())) return;
        const resolved = resolveTemplate(urlTemplate, contextManager.getContext(), "url");
        consumer.templates.get("url")!.apply(resolved);
      });

      // Check if URL can be resolved right now
      if (allTemplateVarsResolved(urlTemplate, contextManager.getContext())) {
        const resolvedUrl = resolveTemplate(urlTemplate, contextManager.getContext(), "url");
        consumer.templates.get("url")!.lastResolved = resolvedUrl;
        consumer.templates.get("url")!.apply(resolvedUrl);
      }
      return;
    }

    // If it's a parameterised URL that's already registered, skip (the consumer handles it)
    if (def.url && hasTemplateVars(def.url) && parameterisedConsumers.has(lookup.dataSetId)) {
      return;
    }

    // Join dependency resolution: ensure source datasets are in manager before join
    if (def.join) {
      const sourcePromises: Array<Promise<unknown>> = [];
      for (const sourceId of def.join) {
        if (manager.has(sourceId)) continue;
        let sourcePending = pendingResolutions.get(sourceId);
        if (!sourcePending) {
          const sourceDef = resolveDataSetDef(sourceId, _entry.pagePath, scope);
          if (!sourceDef) {
            target.error = `Join source dataset "${String(sourceId)}" not found in scope`;
            return;
          }
          sourcePending = resolveExternalDataSet(sourceDef, resolverCtx);
          pendingResolutions.set(sourceId, sourcePending);
        }
        sourcePromises.push(sourcePending);
      }
      if (sourcePromises.length > 0) {
        void Promise.all(sourcePromises)
          .then(() => {
            for (const sourceId of def.join!) {
              pendingResolutions.delete(sourceId);
            }
            const joinPending = resolveExternalDataSet(def, resolverCtx!);
            pendingResolutions.set(lookup.dataSetId, joinPending);
            return joinPending;
          })
          .then(() => {
            pendingResolutions.delete(lookup.dataSetId);
          })
          .catch((err: unknown) => {
            pendingResolutions.delete(lookup.dataSetId);
            target.error = err instanceof Error ? err.message : String(err);
          });
        return;
      }
    }

    let pending = pendingResolutions.get(lookup.dataSetId);
    if (!pending) {
      if (def.serverQuery) {
        serverQueryDatasets.add(lookup.dataSetId);
        serverQueryLookups.set(lookup.dataSetId, lookup);
      }
      pending = resolveExternalDataSet(def, resolverCtx, def.serverQuery ? lookup : undefined);
      pendingResolutions.set(lookup.dataSetId, pending);
    }

    pending
      .then(() => {
        pendingResolutions.delete(lookup.dataSetId);
        scheduleRefresh(def, lookup.dataSetId);
      })
      .catch((err: unknown) => {
        pendingResolutions.delete(lookup.dataSetId);
        target.error = err instanceof Error ? err.message : String(err);
      });
  }

  return {
    setResolverCtx(ctx: ResolverContext): void {
      resolverCtx = ctx;
      if (target) {
        wsPool.configure({ ...ctx.providerConfig.webSocket, eventTarget: target });
        ssePool.configure({ ...ctx.providerConfig.sse, eventTarget: target });
      } else {
        if (ctx.providerConfig.webSocket) {
          wsPool.configure(ctx.providerConfig.webSocket);
        }
        if (ctx.providerConfig.sse) {
          ssePool.configure(ctx.providerConfig.sse);
        }
      }
    },

    dispose(): void {
      if (observer) {
        observer.disconnect();
        observer = undefined;
      }
      for (const timer of refreshTimers.values()) {
        clearInterval(timer);
      }
      refreshTimers.clear();
      for (const [dsId, source] of pushSubscriptions) {
        source.unsubscribe(dsId);
      }
      pushSubscriptions.clear();
      pushSubscribers.clear();
      wsPool.releaseAll();
      ssePool.releaseAll();
      for (const controller of abortControllers.values()) {
        controller.abort();
      }
      abortControllers.clear();
      pendingResolutions.clear();
      serverQueryDatasets.clear();
      serverQueryLookups.clear();

      // Disconnect all DataSource instances
      for (const [, source] of connectedSources) {
        source.disconnect();
      }
      connectedSources.clear();
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

      // Dataset already in manager — serve from cache
      if (manager.has(lookup.dataSetId)) {
        pushData(target, lookup, entry.pagePath, filterGroup?.group, componentId);

        // Schedule refresh for datasets already in the manager (from a prior request)
        const def = resolveDataSetDef(lookup.dataSetId, entry.pagePath, scope);
        if (def) {
          if (pushSubscriptions.has(lookup.dataSetId)) {
            // Existing push subscription — just track this component
            let subscribers = pushSubscribers.get(lookup.dataSetId);
            if (!subscribers) {
              subscribers = new Set();
              pushSubscribers.set(lookup.dataSetId, subscribers);
            }
            subscribers.add(componentId);
          } else if (acquirePushSource(def)) {
            // Push dataset whose subscription was cleaned up by MutationObserver — re-subscribe
            subscribePushSource(lookup, def, componentId);
          }
          scheduleRefresh(def, lookup.dataSetId);
        }

        if (!pendingRefreshes.has(lookup.dataSetId) && !pushSubscriptions.has(lookup.dataSetId)) {
          const age = manager.age(lookup.dataSetId);
          const ttl = def?.refreshTime ? parseRefreshTime(def.refreshTime) : DEFAULT_TTL_MS;
          if (age !== undefined && age > ttl) {
            pendingRefreshes.add(lookup.dataSetId);
            this.refreshDataSet(lookup.dataSetId);
          }
        }

        return;
      }

      // Resolve dataset entry from scope
      const scopeEntry = resolveDataSetEntry(lookup.dataSetId, entry.pagePath, scope);
      if (!scopeEntry) {
        target.error = `Dataset "${String(lookup.dataSetId)}" not found in scope for page "${entry.pagePath}"`;
        return;
      }

      // Route by entry type
      if (isBinding(scopeEntry)) {
        handleBindingRequest(target, lookup, componentId, scopeEntry);
      } else {
        handleDefRequest(target, lookup, componentId, scopeEntry, entry);
      }
    },

    refreshDataSet(dataSetId: DataSetId): void {
      if (pushSubscriptions.has(dataSetId)) return;

      const connectedSource = connectedSources.get(dataSetId);
      if (connectedSource) {
        connectedSource.disconnect();
        connectedSources.delete(dataSetId);
        connectSource(dataSetId, connectedSource);
        pendingRefreshes.delete(dataSetId);
        return;
      }

      const reFetch = reFetchCallbacks.get(dataSetId);
      if (reFetch) {
        reFetch();
        pendingRefreshes.delete(dataSetId);
        return;
      }

      if (!resolverCtx) return;
      const firstEntry = findFirstEntry(dataSetId);
      if (!firstEntry) return;
      const def = resolveDataSetDef(dataSetId, firstEntry.pagePath, scope);
      if (!def) return;

      const existingController = abortControllers.get(dataSetId);
      if (existingController) existingController.abort();
      const controller = new AbortController();
      abortControllers.set(dataSetId, controller);

      const lookup = serverQueryLookups.get(dataSetId)
        ?? firstEntry.originalLookup
        ?? { dataSetId, operations: [] as readonly DataSetOp[] };

      const wrappedCtx: ResolverContext = {
        ...resolverCtx,
        providerFactory: {
          create: (d, c) => {
            const provider = resolverCtx!.providerFactory.create(d, c);
            if (!provider) return undefined;
            return {
              fetch: (req) => provider.fetch({ ...req, signal: controller.signal }),
            };
          },
        },
      };

      resolveExternalDataSet(def, wrappedCtx, lookup)
        .then(() => {
          abortControllers.delete(dataSetId);
        })
        .catch((err: unknown) => {
          abortControllers.delete(dataSetId);
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.warn(`[DataPipeline] Re-fetch failed for ${String(dataSetId)}:`, err);
        })
        .finally(() => {
          pendingRefreshes.delete(dataSetId);
        });
    },

    deliverDataSet(dataSetId: DataSetId): void {
      for (const [compId, entry] of registry) {
        if (entry.originalLookup?.dataSetId === dataSetId && entry.vizElement) {
          const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
            ?.filter as { group?: string } | undefined;
          pushData(entry.vizElement, entry.originalLookup, entry.pagePath, filterGroup?.group, compId);
        }
      }
    },

    deliverAll(): void {
      for (const [compId, entry] of registry) {
        if (entry.vizElement && entry.originalLookup) {
          const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
            ?.filter as { group?: string } | undefined;
          pushData(entry.vizElement, entry.originalLookup, entry.pagePath, filterGroup?.group, compId);
        }
      }
    },
  };

  function scheduleRefresh(def: ExternalDataSetDef, dataSetId: DataSetId): void {
    if (!def.refreshTime || refreshTimers.has(dataSetId)) return;

    // Server-query refresh: re-send the stored lookup to the backend
    if (def.serverQuery) {
      const interval = parseRefreshTime(def.refreshTime);
      const timerId = setInterval(() => {
        if (!resolverCtx) return;
        const storedLookup = serverQueryLookups.get(dataSetId);
        if (!storedLookup) return;
        resolveExternalDataSet(def, resolverCtx, storedLookup)
          .catch((err: unknown) => {
            console.warn(`[DataPipeline] Server-query refresh failed for ${String(dataSetId)}:`, err);
          });
      }, interval);
      refreshTimers.set(dataSetId, timerId);
      return;
    }

    // Guard: Push source datasets use server push, not polling
    if (def.url?.startsWith("ws://") || def.url?.startsWith("wss://")
        || def.url?.startsWith("sse://") || def.url?.startsWith("sses://")) return;

    const interval = parseRefreshTime(def.refreshTime);

    // Content + expression + accumulate: generator path
    if (def.content !== undefined && def.expression !== undefined && def.accumulate) {
      const timerId = setInterval(async () => {
        if (!resolverCtx) return;
        try {
          const generated = await evaluateGenerator(
            def.expression!,
            def.columns,
            resolverCtx.presetRegistry,
          );
          const event: DataSetEvent =
            def.cacheMaxRows !== undefined
              ? { type: "append", rows: generated.rows, maxRows: def.cacheMaxRows }
              : { type: "append", rows: generated.rows };
          manager.apply(dataSetId, event);
        } catch (e) {
          console.warn(`Expression generator failed for ${String(dataSetId)}:`, e);
        }
      }, interval);
      refreshTimers.set(dataSetId, timerId);
      return;
    }

    // Existing URL refresh path
    const timerId = setInterval(() => {
      if (!resolverCtx) return;
      resolveExternalDataSet(def, resolverCtx).catch(() => {});
    }, interval);
    refreshTimers.set(dataSetId, timerId);
  }
}
