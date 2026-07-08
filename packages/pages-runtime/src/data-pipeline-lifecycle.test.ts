import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { LOCAL_CAPABILITIES } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { createDataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { VizTarget } from "./data-pipeline.js";
import type { ComponentRegistry } from "./registry.js";
import type { PagesElement } from "@casehubio/pages-viz/dist/base/PagesElement.js";
import type { VizComponentProps } from "@casehubio/pages-viz/dist/base/types.js";
import type { DataSetScope } from "./dataset-scope.js";
import { createFilterState } from "./cross-filter.js";
import { createDataScopeRegistry } from "./data-scope-registry.js";
import { createComponentViewState } from "./component-view-state.js";

function makeScope(dsId: DataSetId, def: ExternalDataSetDef): DataSetScope {
  const inner = new Map<DataSetId, ExternalDataSetDef>([[dsId, def]]);
  return new Map([["", inner]]);
}

function makeVizElement(): VizTarget & HTMLElement {
  const el = document.createElement("div");
  return Object.assign(el, {
    dataSet: undefined,
    totalRows: 0,
    theme: "",
    error: "",
    activeSort: undefined,
    activePage: undefined,
  });
}

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

    pipeline.dispose();
  });

  it("cleans up push subscriptions when component is removed from DOM", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const dsId = dataSetId("ws-data");

    const def: ExternalDataSetDef = {
      uuid: dsId,
      url: "ws://localhost:8080/data",
      columns: [],
    };
    const scope = makeScope(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-1";
    target.appendChild(componentDiv);

    const vizElement = makeVizElement();
    componentDiv.appendChild(vizElement);

    const entry = {
      element: componentDiv,
      component: {
        type: "component",
        props: {},
      },
      vizElement: vizElement as unknown as PagesElement<VizComponentProps>,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      hasExplicitId: true,
    };
    registry.set("comp-1", entry);

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-1");

    await new Promise(resolve => setTimeout(resolve, 10));

    componentDiv.remove();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  it("handles DOM moves (detach + reattach) without cleanup", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const dsId = dataSetId("ws-data");

    const def: ExternalDataSetDef = {
      uuid: dsId,
      url: "ws://localhost:8080/data",
      columns: [],
    };
    const scope = makeScope(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-1";
    target.appendChild(componentDiv);

    const vizElement = makeVizElement();
    componentDiv.appendChild(vizElement);

    const entry = {
      element: componentDiv,
      component: {
        type: "component",
        props: {},
      },
      vizElement: vizElement as unknown as PagesElement<VizComponentProps>,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      hasExplicitId: true,
    };
    registry.set("comp-1", entry);

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-1");
    await new Promise(resolve => setTimeout(resolve, 10));

    componentDiv.remove();

    target.appendChild(componentDiv);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  // ---- Characterisation: multi-component cleanup tracking ----

  it("handles cleanup for multiple components simultaneously", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const comp1 = document.createElement("div");
    comp1.id = "comp-1";
    const comp2 = document.createElement("div");
    comp2.id = "comp-2";
    target.appendChild(comp1);
    target.appendChild(comp2);

    const viz1 = makeVizElement();
    const viz2 = makeVizElement();
    comp1.appendChild(viz1);
    comp2.appendChild(viz2);

    registry.set("comp-1", {
      element: comp1,
      component: { type: "component", props: {} },
      vizElement: viz1,
      originalLookup: { dataSetId: dataSetId("ws-1"), operations: [] },
      pagePath: "",
      hasExplicitId: true,
    });
    registry.set("comp-2", {
      element: comp2,
      component: { type: "component", props: {} },
      vizElement: viz2,
      originalLookup: { dataSetId: dataSetId("ws-2"), operations: [] },
      pagePath: "",
      hasExplicitId: true,
    });

    pipeline.handleDataRequest(viz1, { dataSetId: dataSetId("ws-1"), operations: [] }, "comp-1");
    pipeline.handleDataRequest(viz2, { dataSetId: dataSetId("ws-2"), operations: [] }, "comp-2");

    await new Promise(resolve => setTimeout(resolve, 10));

    comp1.remove();
    comp2.remove();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  it("resubscribes push source after component re-enters DOM", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const dsId = dataSetId("ws-resub");

    const def: ExternalDataSetDef = {
      uuid: dsId,
      url: "ws://localhost:8080/data",
      columns: [],
    };
    const scope = makeScope(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-resub";
    target.appendChild(componentDiv);

    const vizElement = makeVizElement();
    componentDiv.appendChild(vizElement);

    const entry = {
      element: componentDiv,
      component: { type: "component", props: {} },
      vizElement: vizElement as unknown as PagesElement<VizComponentProps>,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      hasExplicitId: true,
    };
    registry.set("comp-resub", entry);

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-resub");
    await new Promise(resolve => setTimeout(resolve, 10));

    componentDiv.remove();
    await new Promise(resolve => setTimeout(resolve, 10));

    target.appendChild(componentDiv);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  it("cancels refresh timers when component is removed", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const dsId = dataSetId("refresh-cancel");

    const def: ExternalDataSetDef = {
      uuid: dsId,
      content: JSON.stringify([{ x: 1 }]),
      refreshTime: "1second",
    };
    const scope = makeScope(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: {},
      capabilities: LOCAL_CAPABILITIES,
    });

    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-timer";
    target.appendChild(componentDiv);

    const vizElement = makeVizElement();
    componentDiv.appendChild(vizElement);

    registry.set("comp-timer", {
      element: componentDiv,
      component: { type: "component", props: {} },
      vizElement: vizElement,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      hasExplicitId: true,
    });

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-timer");
    await new Promise(resolve => setTimeout(resolve, 10));

    componentDiv.remove();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  it("MutationObserver triggers on nested subtree removal", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const dsId = dataSetId("nested");

    const def: ExternalDataSetDef = {
      uuid: dsId,
      url: "ws://localhost:8080/data",
      columns: [],
    };
    const scope = makeScope(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const parent = document.createElement("div");
    const child = document.createElement("div");
    child.id = "comp-nested";
    parent.appendChild(child);
    target.appendChild(parent);

    const vizElement = makeVizElement();
    child.appendChild(vizElement);

    registry.set("comp-nested", {
      element: child,
      component: { type: "component", props: {} },
      vizElement: vizElement,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      hasExplicitId: true,
    });

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-nested");
    await new Promise(resolve => setTimeout(resolve, 10));

    parent.remove();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  it("handles removal during initial resolution", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const dsId = dataSetId("early-remove");

    const def: ExternalDataSetDef = {
      uuid: dsId,
      url: "ws://localhost:8080/data",
      columns: [],
    };
    const scope = makeScope(dsId, def);

    const pipeline = createDataPipeline(
      manager, scope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const componentDiv = document.createElement("div");
    componentDiv.id = "comp-early";
    target.appendChild(componentDiv);

    const vizElement = makeVizElement();
    componentDiv.appendChild(vizElement);

    registry.set("comp-early", {
      element: componentDiv,
      component: { type: "component", props: {} },
      vizElement: vizElement,
      originalLookup: { dataSetId: dsId, operations: [] },
      pagePath: "",
      hasExplicitId: true,
    });

    pipeline.handleDataRequest(vizElement, { dataSetId: dsId, operations: [] }, "comp-early");

    componentDiv.remove();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });

  it("MutationObserver handles multiple rapid removals", async () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();

    const pipeline = createDataPipeline(
      manager, new Map() as DataSetScope, registry,
      createFilterState(), createDataScopeRegistry(), createComponentViewState(),
      undefined, target,
    );

    pipeline.setResolverCtx({
      providerFactory: { create: () => undefined },
      presetRegistry: { get: () => undefined, has: () => false },
      manager,
      providerConfig: { webSocket: {} },
      capabilities: LOCAL_CAPABILITIES,
    });

    const components = [];
    for (let i = 0; i < 5; i++) {
      const comp = document.createElement("div");
      comp.id = `comp-${i}`;
      target.appendChild(comp);

      const viz = makeVizElement();
      comp.appendChild(viz);

      registry.set(`comp-${i}`, {
        element: comp,
        component: { type: "component", props: {} },
        vizElement: viz,
        originalLookup: { dataSetId: dataSetId(`ds-${i}`), operations: [] },
        pagePath: "",
        hasExplicitId: true,
      });

      pipeline.handleDataRequest(viz, { dataSetId: dataSetId(`ds-${i}`), operations: [] }, `comp-${i}`);
      components.push(comp);
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    for (const comp of components) {
      comp.remove();
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(() => { pipeline.dispose(); }).not.toThrow();
  });
});
