import { describe, it, expect, vi } from "vitest";
import type { Component, PermissionContext } from "@casehub/component/dist/model/types.js";
import { ALLOW_ALL } from "@casehub/component/dist/model/types.js";
import { createActivationCallback } from "./activation.js";
import type { ComponentRegistry } from "./registry.js";
import type { PagePathMap } from "./page-paths.js";
import type { PageIndex } from "./navigation.js";
import type { DataSetScope } from "./dataset-scope.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehub/data/dist/dataset/external/types.js";

const DATA_TYPES = [
  "bar-chart",
  "line-chart",
  "area-chart",
  "pie-chart",
  "scatter-chart",
  "bubble-chart",
  "timeseries",
  "table",
  "metric",
  "meter",
  "selector",
  "map",
  "iframe-plugin",
];

describe("createActivationCallback", () => {
  function setup(component: Component) {
    const registry: ComponentRegistry = new Map();
    const pagePathMap: PagePathMap = new Map([[component, "TestPage"]]);
    const callback = createActivationCallback(registry, pagePathMap);
    const el = document.createElement("div");
    el.dataset.componentId = "test-id";
    el.dataset.componentType = component.type;
    callback(el, component);
    return { registry, el };
  }

  for (const type of DATA_TYPES) {
    it(`creates casehub-${type} element for ${type}`, () => {
      const component: Component = { type, props: { lookup: { dataSetId: "ds", operations: [] } } };
      const { el } = setup(component);
      const child = el.firstElementChild;
      expect(child).toBeTruthy();
      expect(child!.localName).toBe(`casehub-${type}`);
    });
  }

  it("registers data component in ComponentRegistry", () => {
    const component: Component = {
      type: "bar-chart",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };
    const { registry } = setup(component);
    expect(registry.get("test-id")).toBeTruthy();
    expect(registry.get("test-id")!.pagePath).toBe("TestPage");
    expect(registry.get("test-id")!.originalLookup).toEqual({ dataSetId: "ds", operations: [] });
  });

  it("creates iframe-plugin element", () => {
    const component: Component = { type: "iframe-plugin", props: { componentId: "custom" } };
    const { el, registry } = setup(component);
    expect(el.firstElementChild!.localName).toBe("casehub-iframe-plugin");
    expect(registry.has("test-id")).toBe(true);
  });

  it("renders title as heading element", () => {
    const component: Component = { type: "title", props: { text: "Hello", size: "h2" } };
    const { el } = setup(component);
    const heading = el.querySelector("h2");
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toBe("Hello");
  });

  it("renders html content", () => {
    const component: Component = { type: "html", props: { content: "<b>bold</b>" } };
    const { el } = setup(component);
    expect(el.querySelector("b")?.textContent).toBe("bold");
  });

  it("renders markdown as parsed HTML", () => {
    const component: Component = { type: "markdown", props: { content: "# Hello" } };
    const { el } = setup(component);
    expect(el.querySelector(".casehub-markdown h1")?.textContent).toBe("Hello");
  });

  it("does not activate layout types", () => {
    const component: Component = { type: "grid", props: { columns: 12 } };
    const { registry } = setup(component);
    expect(registry.size).toBe(0);
  });

  it("does not activate unknown types", () => {
    const component: Component = { type: "custom-widget" };
    const { registry } = setup(component);
    expect(registry.size).toBe(0);
  });

  it("does not activate page types", () => {
    const component: Component = { type: "page", props: { name: "Test" } };
    const { registry } = setup(component);
    expect(registry.size).toBe(0);
  });

  it("skips if no componentId", () => {
    const registry: ComponentRegistry = new Map();
    const component: Component = { type: "bar-chart" };
    const pagePathMap: PagePathMap = new Map([[component, ""]]);
    const callback = createActivationCallback(registry, pagePathMap);
    const el = document.createElement("div");
    // NO dataset.componentId set
    callback(el, component);
    expect(registry.size).toBe(0);
  });
});

function lazySetup() {
  const registry: ComponentRegistry = new Map();
  const pagePathMap: PagePathMap = new Map();
  const pageIndex: PageIndex = new Map();
  const dataSetScope: DataSetScope = new Map();
  const lazyPageResolutions = new Map<Component, Component>();
  const abortController = new AbortController();

  const fetchFn = vi.fn<typeof globalThis.fetch>();

  const callback = createActivationCallback(registry, pagePathMap, {
    fetchFn: fetchFn as unknown as typeof globalThis.fetch,
    baseUrl: "http://example.com/",
    abortSignal: abortController.signal,
    permissions: ALLOW_ALL,
    pageIndex,
    dataSetScope,
    lazyPageResolutions,
  });

  return { registry, pagePathMap, pageIndex, dataSetScope, lazyPageResolutions, fetchFn, callback, abortController };
}

describe("lazy-page activation", () => {
  it("fetches href and renders content (Path C — async)", async () => {
    const { callback, fetchFn, lazyPageResolutions, pagePathMap } = lazySetup();

    const lazyComponent: Component = {
      type: "lazy-page",
      props: { name: "Lazy", href: "lazy.yaml" },
    };
    pagePathMap.set(lazyComponent, "Section");

    const yamlContent = "pages:\n  - name: Content\n    components:\n      - type: markdown\n        props:\n          content: '# Test'";
    fetchFn.mockResolvedValueOnce(new Response(yamlContent));

    const el = document.createElement("div");
    el.dataset.componentId = "lazy-1";
    el.dataset.componentType = "lazy-page";
    document.body.appendChild(el);

    callback(el, lazyComponent);

    // Await the async fetch
    await vi.waitFor(() => {
      expect(lazyPageResolutions.has(lazyComponent)).toBe(true);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(el.children.length).toBeGreaterThan(0);

    document.body.removeChild(el);
  });

  it("re-renders from lazyPageResolutions on re-activation (Path A — sync)", async () => {
    const { callback, fetchFn, lazyPageResolutions, pagePathMap } = lazySetup();

    const lazyComponent: Component = {
      type: "lazy-page",
      props: { name: "Lazy", href: "lazy.yaml" },
    };
    pagePathMap.set(lazyComponent, "Section");

    const yamlContent = "pages:\n  - name: Content\n    components:\n      - type: markdown\n        props:\n          content: '# Test'";
    fetchFn.mockResolvedValueOnce(new Response(yamlContent));

    // First activation
    const el1 = document.createElement("div");
    el1.dataset.componentId = "lazy-1";
    el1.dataset.componentType = "lazy-page";
    document.body.appendChild(el1);
    callback(el1, lazyComponent);

    await vi.waitFor(() => {
      expect(lazyPageResolutions.has(lazyComponent)).toBe(true);
    });
    expect(el1.children.length).toBeGreaterThan(0);

    // Simulate slot swap: DOM destroyed
    el1.innerHTML = "";
    document.body.removeChild(el1);

    // Re-activation (new element, same Component)
    const el2 = document.createElement("div");
    el2.dataset.componentId = "lazy-1";
    el2.dataset.componentType = "lazy-page";
    document.body.appendChild(el2);
    callback(el2, lazyComponent);

    // Path A is synchronous — content rendered immediately
    expect(el2.children.length).toBeGreaterThan(0);
    expect(fetchFn).toHaveBeenCalledTimes(1); // no second fetch

    document.body.removeChild(el2);
  });

  it("extends pagePathMap for fetched content", async () => {
    const { callback, fetchFn, lazyPageResolutions, pagePathMap } = lazySetup();

    const lazyComponent: Component = {
      type: "lazy-page",
      props: { name: "Lazy", href: "lazy.yaml" },
    };
    pagePathMap.set(lazyComponent, "Section");

    const yamlContent = "pages:\n  - name: LazyRoot\n    components:\n      - type: markdown\n        props:\n          content: '# Lazy Content'";
    fetchFn.mockResolvedValueOnce(new Response(yamlContent));

    const el = document.createElement("div");
    el.dataset.componentId = "lazy-1";
    el.dataset.componentType = "lazy-page";
    document.body.appendChild(el);
    callback(el, lazyComponent);

    await vi.waitFor(() => {
      expect(lazyPageResolutions.has(lazyComponent)).toBe(true);
    });

    const resolvedRoot = lazyPageResolutions.get(lazyComponent)!;
    expect(pagePathMap.get(resolvedRoot)).toBe("Section");
    expect(resolvedRoot.props?.["name"]).toBe("LazyRoot");

    // Verify child components were also mapped (walk went deeper than root)
    expect(pagePathMap.size).toBeGreaterThan(2);

    document.body.removeChild(el);
  });

  it("passes abort signal to fetch", async () => {
    const { callback, fetchFn, abortController, pagePathMap } = lazySetup();

    const lazyComponent: Component = {
      type: "lazy-page",
      props: { name: "Lazy", href: "lazy.yaml" },
    };
    pagePathMap.set(lazyComponent, "Section");

    fetchFn.mockImplementation(() => new Promise(() => {})); // never resolves

    const el = document.createElement("div");
    el.dataset.componentId = "lazy-1";
    el.dataset.componentType = "lazy-page";
    callback(el, lazyComponent);

    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: abortController.signal }),
    );
  });

  it("renders error on fetch failure", async () => {
    const { callback, fetchFn, pagePathMap } = lazySetup();

    const lazyComponent: Component = {
      type: "lazy-page",
      props: { name: "Lazy", href: "lazy.yaml" },
    };
    pagePathMap.set(lazyComponent, "Section");

    fetchFn.mockRejectedValueOnce(new Error("Network error"));

    const el = document.createElement("div");
    el.dataset.componentId = "lazy-1";
    el.dataset.componentType = "lazy-page";
    document.body.appendChild(el);
    callback(el, lazyComponent);

    await vi.waitFor(() => {
      expect(el.textContent).toContain("Network error");
    });

    document.body.removeChild(el);
  });
});
