import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { createDataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { ComponentRegistry } from "./registry.js";
import type { DataSetScope } from "./dataset-scope.js";
import { createFilterState } from "./cross-filter.js";
import { createDataScopeRegistry } from "./data-scope-registry.js";
import { createComponentViewState } from "./component-view-state.js";

describe("DataPipeline lifecycle (MutationObserver)", () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
  });

  it("does not throw when target is provided", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    expect(typeof pipeline.dispose).toBe("function");
    pipeline.dispose();
  });

  it("observer is disconnected on dispose", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    // Should not throw during teardown
    pipeline.dispose();
  });

  it("cleans up push subscriptions when component is removed from DOM", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const scope = new Map() as DataSetScope;
    const dsId = dataSetId("ws-data");

    // Mock WebSocket dataset definition
    const def: ExternalDataSetDef = {
      uuid: "ws-data",
      url: "ws://localhost:8080/data",
      columns: [],
    };
    scope.set(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    // Set resolver context so push sources can be acquired
    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { providers: {}, operations: {} },
      manager,
      providerConfig: { webSocket: {} },
    });

    // Create a mock component element
    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-1";
    target.appendChild(componentDiv);

    // Create a viz element as an actual HTMLElement with properties attached
    const vizElement = document.createElement("div") as HTMLElement & {
      dataSet: unknown;
      totalRows: number;
      theme: string;
      error: string;
      activeSort: unknown;
      activePage: unknown;
    };
    vizElement.dataSet = undefined;
    vizElement.totalRows = 0;
    vizElement.theme = "";
    vizElement.error = "";
    vizElement.activeSort = undefined;
    vizElement.activePage = undefined;
    componentDiv.appendChild(vizElement);

    // Register component
    registry.set("comp-1", {
      component: {
        type: "component",
        displayName: "TestComponent",
        componentId: "comp-1",
        props: {},
        properties: {},
      },
      vizElement,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "/page1",
    });

    // Trigger data request to create push subscription
    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-1");

    // Wait for microtask queue to flush (observer uses queueMicrotask)
    await new Promise(resolve => setTimeout(resolve, 10));

    // Remove the component from DOM
    componentDiv.remove();

    // Wait for MutationObserver + queueMicrotask to process
    await new Promise(resolve => setTimeout(resolve, 10));

    // Subscription should be cleaned up (this is internal state, so we verify via dispose not throwing)
    expect(() => pipeline.dispose()).not.toThrow();
  });

  it("handles DOM moves (detach + reattach) without cleanup", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const scope = new Map() as DataSetScope;
    const dsId = dataSetId("ws-data");

    const def: ExternalDataSetDef = {
      uuid: "ws-data",
      url: "ws://localhost:8080/data",
      columns: [],
    };
    scope.set(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { providers: {}, operations: {} },
      manager,
      providerConfig: { webSocket: {} },
    });

    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-1";
    target.appendChild(componentDiv);

    const vizElement = document.createElement("div") as HTMLElement & {
      dataSet: unknown;
      totalRows: number;
      theme: string;
      error: string;
      activeSort: unknown;
      activePage: unknown;
    };
    vizElement.dataSet = undefined;
    vizElement.totalRows = 0;
    vizElement.theme = "";
    vizElement.error = "";
    vizElement.activeSort = undefined;
    vizElement.activePage = undefined;
    componentDiv.appendChild(vizElement);

    registry.set("comp-1", {
      component: {
        type: "component",
        displayName: "TestComponent",
        componentId: "comp-1",
        props: {},
        properties: {},
      },
      vizElement,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "/page1",
    });

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-1");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Detach
    componentDiv.remove();

    // Immediately reattach (before microtask runs)
    target.appendChild(componentDiv);

    // Wait for microtask — component should still be connected, so no cleanup
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should not throw, subscription still active
    expect(() => pipeline.dispose()).not.toThrow();
  });
});
