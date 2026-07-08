import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import { ContextManager } from "./context-wiring.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { DataPipeline, VizTarget } from "./data-pipeline.js";
import type { ComponentRegistry } from "./registry.js";
import type { DataSetScope } from "./dataset-scope.js";
import type { DataScopeRegistry } from "./data-scope-registry.js";
import type { ComponentViewState } from "./component-view-state.js";
import { createComponentViewState } from "./component-view-state.js";
import { createFilterState } from "./cross-filter.js";
import { createDataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
import type { DataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
import {
  dataSetId,
} from "@casehubio/pages-data/dist/dataset/types.js";
import type {
  DataSetId,
} from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { LOCAL_CAPABILITIES } from "@casehubio/pages-data/dist/dataset/external/types.js";
import type { ResolverContext } from "@casehubio/pages-data/dist/dataset/external/resolver.js";
import { createDataScopeRegistry } from "./data-scope-registry.js";

describe("parameterised dataset URLs", () => {
  let manager: DataSetManager;
  let registry: ComponentRegistry;
  let scope: DataSetScope;
  let filterState: ReturnType<typeof createFilterState>;
  let dataScopeRegistry: DataScopeRegistry;
  let componentViewState: ComponentViewState;
  let contextManager: ContextManager;
  let mockFetchFn: ReturnType<typeof vi.fn>;
  let pipeline: DataPipeline;

  const dsId = dataSetId("trials");

  function createDef(url: string): ExternalDataSetDef {
    return {
      uuid: dsId,
      url,
    };
  }

  function makeResolverCtx(): ResolverContext {
    return {
      manager,
      providerFactory: {
        create: () => ({
          fetch: mockFetchFn,
        }),
      },
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
      capabilities: LOCAL_CAPABILITIES,
    };
  }

  function makeTarget(): VizTarget {
    return {
      dataSet: undefined,
      totalRows: 0,
      error: "",
      activeSort: undefined,
      activePage: undefined,
    };
  }

  function registerComponent(componentId: string, dsLookupId: DataSetId, pagePath = ""): void {
    const component: Component = {
      type: "metric",
      props: { lookup: { dataSetId: dsLookupId, operations: [] } },
    };
    const el = document.createElement("div");
    el.dataset.componentId = componentId;
    const vizEl = document.createElement("pages-metric");
    registry.set(componentId, {
      element: el,
      vizElement: vizEl,
      originalLookup: { dataSetId: dsLookupId, operations: [] },
      component,
      pagePath,
      hasExplicitId: false,
    });
  }

  beforeEach(() => {
    manager = createDataSetManager();
    registry = new Map();
    scope = new Map();
    filterState = createFilterState();
    dataScopeRegistry = createDataScopeRegistry();
    componentViewState = createComponentViewState();
    contextManager = new ContextManager();
    mockFetchFn = vi.fn();

    // Default: fetch returns a simple dataset
    mockFetchFn.mockResolvedValue({
      data: [{ id: 1, name: "Test" }],
      contentType: "application/json",
    });
  });

  it("defers fetch when URL has unresolved template variables", () => {
    const def = createDef("/api/trials/#{filter.trialId}/patients");
    scope.set("", new Map([[dsId, def]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);
    const target = makeTarget();

    // No filter set → URL can't resolve → no fetch
    pipeline.handleDataRequest(target, { dataSetId: dsId, operations: [] }, "comp1");

    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it("triggers fetch when filter resolves all URL variables", () => {
    const def = createDef("/api/trials/#{filter.trialId}/patients");
    scope.set("", new Map([[dsId, def]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);
    const target = makeTarget();

    // Request with unresolved URL — deferred
    pipeline.handleDataRequest(target, { dataSetId: dsId, operations: [] }, "comp1");
    expect(mockFetchFn).not.toHaveBeenCalled();

    // Now set the filter to resolve the URL
    contextManager.updateFilter({ trialId: ["TRIAL-001"] });

    // The URL consumer should have been triggered, resolving the URL and dispatching fetch
    expect(mockFetchFn).toHaveBeenCalled();
    const callArgs = mockFetchFn.mock.calls[0] as unknown[] | undefined;
    expect(callArgs?.[0]).toEqual(expect.objectContaining({ url: "/api/trials/TRIAL-001/patients" }));
  });

  it("aborts in-flight request when filter changes", async () => {
    const def = createDef("/api/trials/#{filter.trialId}/patients");
    scope.set("", new Map([[dsId, def]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);

    // First: set up a pending fetch that never resolves
    let firstAbortSignal: AbortSignal | undefined;
    mockFetchFn.mockImplementation((request: { url: string; signal?: AbortSignal }) => {
      if (!firstAbortSignal) {
        firstAbortSignal = request.signal;
      }
      return new Promise(() => {}); // never resolves
    });

    pipeline.handleDataRequest(makeTarget(), { dataSetId: dsId, operations: [] }, "comp1");

    // Set first filter → triggers first fetch
    contextManager.updateFilter({ trialId: ["TRIAL-001"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    expect(firstAbortSignal).toBeDefined();

    // Change filter → should abort first request and start second
    contextManager.updateFilter({ trialId: ["TRIAL-002"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(2);

    // First abort signal should have been aborted
    expect(firstAbortSignal!.aborted).toBe(true);
  });

  it("does not re-fetch when resolved URL is unchanged", () => {
    const def = createDef("/api/trials/#{filter.trialId}/patients");
    scope.set("", new Map([[dsId, def]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);
    pipeline.handleDataRequest(makeTarget(), { dataSetId: dsId, operations: [] }, "comp1");

    // Set filter → first fetch
    contextManager.updateFilter({ trialId: ["TRIAL-001"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);

    // Update with same trialId but different unrelated filter → URL unchanged → no re-fetch
    contextManager.updateFilter({ trialId: ["TRIAL-001"], ward: ["ICU"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it("URL-encodes filter values in parameterised URLs", () => {
    const def = createDef("/api/trials/#{filter.search}/patients");
    scope.set("", new Map([[dsId, def]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);
    pipeline.handleDataRequest(makeTarget(), { dataSetId: dsId, operations: [] }, "comp1");

    // Set filter with space → should be URL-encoded
    contextManager.updateFilter({ search: ["hello world"] });

    expect(mockFetchFn).toHaveBeenCalled();
    const callArgs = mockFetchFn.mock.calls[0] as unknown[] | undefined;
    expect(callArgs?.[0]).toEqual(expect.objectContaining({ url: "/api/trials/hello%20world/patients" }));
  });

  it("tracks multiple parameterised datasets independently", () => {
    const dsId2 = dataSetId("patients");
    const def1 = createDef("/api/trials/#{filter.trialId}");
    const def2: ExternalDataSetDef = { uuid: dsId2, url: "/api/wards/#{filter.ward}" };

    scope.set("", new Map([[dsId, def1], [dsId2, def2]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);
    registerComponent("comp2", dsId2);

    pipeline.handleDataRequest(makeTarget(), { dataSetId: dsId, operations: [] }, "comp1");
    pipeline.handleDataRequest(makeTarget(), { dataSetId: dsId2, operations: [] }, "comp2");

    // Only set trialId → only first dataset fetches
    contextManager.updateFilter({ trialId: ["TRIAL-001"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    expect((mockFetchFn.mock.calls[0] as unknown[])?.[0]).toEqual(expect.objectContaining({ url: "/api/trials/TRIAL-001" }));

    // Set ward too → second dataset fetches
    contextManager.updateFilter({ trialId: ["TRIAL-001"], ward: ["ICU"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(2);
    expect((mockFetchFn.mock.calls[1] as unknown[])?.[0]).toEqual(expect.objectContaining({ url: "/api/wards/ICU" }));
  });

  it("suppresses fetch when filter is cleared (variables become unresolved)", () => {
    const def = createDef("/api/trials/#{filter.trialId}/patients");
    scope.set("", new Map([[dsId, def]]));

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    registerComponent("comp1", dsId);
    pipeline.handleDataRequest(makeTarget(), { dataSetId: dsId, operations: [] }, "comp1");

    // Set filter → fetch
    contextManager.updateFilter({ trialId: ["TRIAL-001"] });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);

    // Clear filter → URL unresolved → no new fetch
    contextManager.updateFilter({});
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it("non-parameterised URLs work normally", async () => {
    const def = createDef("/api/static/patients");
    scope.set("", new Map([[dsId, def]]));

    const target = makeTarget();
    const component: Component = {
      type: "metric",
      props: { lookup: { dataSetId: dsId, operations: [] } },
    };
    registry.set("comp1", {
      element: document.createElement("div"),
      vizElement: target,
      originalLookup: { dataSetId: dsId, operations: [] },
      component,
      pagePath: "",
      hasExplicitId: false,
    });

    // Re-create manager with onChanged wiring
    manager = createDataSetManager({
      onChanged: (id) => {
        pipeline.refreshDataSet(id);
      },
    });

    pipeline = createDataPipeline(manager, scope, registry, filterState, dataScopeRegistry, componentViewState, contextManager);
    pipeline.setResolverCtx(makeResolverCtx());

    // Non-parameterised URL → normal fetch path (immediate)
    pipeline.handleDataRequest(target, { dataSetId: dsId, operations: [] }, "comp1");

    // Wait for resolution to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should have received data
    expect(target.dataSet).toBeDefined();
  });
});
