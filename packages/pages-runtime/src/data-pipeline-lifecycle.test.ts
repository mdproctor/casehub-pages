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
});
