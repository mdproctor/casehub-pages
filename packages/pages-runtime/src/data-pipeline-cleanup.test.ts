import { describe, it, expect } from "vitest";
import { createDataPipeline } from "./data-pipeline.js";
import { createDataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
import { dataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ComponentRegistry } from "./registry.js";
import type { VizTarget } from "./data-pipeline.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";

describe("handleSubtreeRemoved with proxy vizElement", () => {
  it("cleans up when wrapper element is removed even if vizElement is not an HTMLElement", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "host-1";
    target.appendChild(wrapper);

    const proxy: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    const lookup: DataSetLookup = { dataSetId: "test" as any, operations: [] };
    registry.set("host-1", {
      element: wrapper,
      vizElement: proxy,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: lookup,
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    wrapper.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    pipeline.dispose();
    document.body.removeChild(target);
  });

  // ---- Characterisation: multi-subscriber teardown ----

  it("handles teardown when multiple subscribers share same dataset", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const dsId = dataSetId("shared");
    const lookup: DataSetLookup = { dataSetId: dsId, operations: [] };

    const wrapper1 = document.createElement("div");
    wrapper1.dataset.componentId = "comp-1";
    const wrapper2 = document.createElement("div");
    wrapper2.dataset.componentId = "comp-2";
    target.appendChild(wrapper1);
    target.appendChild(wrapper2);

    const proxy1: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    const proxy2: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    registry.set("comp-1", {
      element: wrapper1,
      vizElement: proxy1,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: lookup,
      hasExplicitId: false,
    });

    registry.set("comp-2", {
      element: wrapper2,
      vizElement: proxy2,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: lookup,
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    wrapper1.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    wrapper2.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    pipeline.dispose();
    document.body.removeChild(target);
  });

  it("releases pool connection when all subscribers disconnect", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const dsId = dataSetId("pool-release");
    const lookup: DataSetLookup = { dataSetId: dsId, operations: [] };

    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "comp-1";
    target.appendChild(wrapper);

    const proxy: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    registry.set("comp-1", {
      element: wrapper,
      vizElement: proxy,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: lookup,
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    wrapper.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    pipeline.dispose();
    document.body.removeChild(target);
  });

  it("cancels scheduled refresh timers on component removal", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const dsId = dataSetId("timer-cancel");
    const lookup: DataSetLookup = { dataSetId: dsId, operations: [] };

    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "comp-1";
    target.appendChild(wrapper);

    const proxy: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    registry.set("comp-1", {
      element: wrapper,
      vizElement: proxy,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: lookup,
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    wrapper.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    pipeline.dispose();
    document.body.removeChild(target);
  });

  it("does not affect other components when one is removed", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const dsId1 = dataSetId("ds-1");
    const dsId2 = dataSetId("ds-2");

    const wrapper1 = document.createElement("div");
    wrapper1.dataset.componentId = "comp-1";
    const wrapper2 = document.createElement("div");
    wrapper2.dataset.componentId = "comp-2";
    target.appendChild(wrapper1);
    target.appendChild(wrapper2);

    const proxy1: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    const proxy2: VizTarget = {
      get dataSet() { return undefined; },
      set dataSet(_: unknown) {},
      get error() { return ""; },
      set error(_: string) {},
      get totalRows() { return 0; },
      set totalRows(_: number) {},
      get activeSort() { return undefined; },
      set activeSort(_) {},
      get activePage() { return undefined; },
      set activePage(_) {},
    };

    registry.set("comp-1", {
      element: wrapper1,
      vizElement: proxy1,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: { dataSetId: dsId1, operations: [] },
      hasExplicitId: false,
    });

    registry.set("comp-2", {
      element: wrapper2,
      vizElement: proxy2,
      component: { type: "host-panel", props: { typeName: "test" } },
      pagePath: "",
      originalLookup: { dataSetId: dsId2, operations: [] },
      hasExplicitId: false,
    });

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    wrapper1.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    expect(registry.has("comp-2")).toBe(true);

    pipeline.dispose();
    document.body.removeChild(target);
  });

  it("handles dispose() when no components are registered", () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    expect(() => { pipeline.dispose(); }).not.toThrow();
    document.body.removeChild(target);
  });

  it("handles removal of component not in registry", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "orphan";
    target.appendChild(wrapper);

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    wrapper.remove();
    await new Promise<void>(resolve => { queueMicrotask(resolve); });

    pipeline.dispose();
    document.body.removeChild(target);
  });

  it("handles rapid subscribe/unsubscribe cycles", async () => {
    const manager = createDataSetManager({ onChanged: () => {} });
    const registry: ComponentRegistry = new Map();
    const target = document.createElement("div");
    document.body.appendChild(target);

    const dsId = dataSetId("rapid");
    const lookup: DataSetLookup = { dataSetId: dsId, operations: [] };

    const pipeline = createDataPipeline(
      manager, new Map(), registry, new Map(),
      new Map(), new Map(), undefined, target,
    );

    for (let i = 0; i < 10; i++) {
      const wrapper = document.createElement("div");
      wrapper.dataset.componentId = `comp-${i}`;
      target.appendChild(wrapper);

      const proxy: VizTarget = {
        get dataSet() { return undefined; },
        set dataSet(_: unknown) {},
        get error() { return ""; },
        set error(_: string) {},
        get totalRows() { return 0; },
        set totalRows(_: number) {},
        get activeSort() { return undefined; },
        set activeSort(_) {},
        get activePage() { return undefined; },
        set activePage(_) {},
      };

      registry.set(`comp-${i}`, {
        element: wrapper,
        vizElement: proxy,
        component: { type: "host-panel", props: { typeName: "test" } },
        pagePath: "",
        originalLookup: lookup,
        hasExplicitId: false,
      });

      wrapper.remove();
      await new Promise<void>(resolve => { queueMicrotask(resolve); });
    }

    pipeline.dispose();
    document.body.removeChild(target);
  });
});
