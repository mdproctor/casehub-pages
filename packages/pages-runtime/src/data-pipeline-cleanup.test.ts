import { describe, it, expect } from "vitest";
import { createDataPipeline } from "./data-pipeline.js";
import { createDataSetManager } from "@casehubio/pages-data/dist/dataset/manager.js";
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
    await new Promise<void>(resolve => queueMicrotask(resolve));

    pipeline.dispose();
    document.body.removeChild(target);
  });
});
