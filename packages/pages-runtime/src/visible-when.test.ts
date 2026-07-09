import {beforeEach, describe, expect, it} from "vitest";
import type {Component} from "@casehubio/pages-component/dist/model/types.js";
import {createActivationCallback} from "./activation.js";
import {ContextManager} from "./context-wiring.js";
import type {ComponentRegistry} from "./registry.js";
import type {PagePathMap} from "./page-paths.js";

describe("visibleWhen conditional visibility", () => {
  let registry: ComponentRegistry;
  let pagePathMap: PagePathMap;
  let contextManager: ContextManager;

  beforeEach(() => {
    registry = new Map();
    pagePathMap = new Map();
    contextManager = new ContextManager();
  });

  function activate(component: Component): HTMLDivElement {
    const el = document.createElement("div");
    el.dataset.componentId = "test-id";
    el.dataset.componentType = component.type;
    pagePathMap.set(component, "TestPage");

    const callback = createActivationCallback(registry, pagePathMap, undefined, contextManager);
    callback(el, component);

    return el;
  }

  it("component with visibleWhen is initially hidden when expression is falsy", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };

    const el = activate(component);

    // Initially filter is empty, so expression is falsy
    expect(el.hidden).toBe(true);
  });

  it("component with visibleWhen becomes visible when expression becomes truthy", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };

    const el = activate(component);
    document.body.appendChild(el);
    expect(el.hidden).toBe(true);

    // Update filter to make expression truthy
    contextManager.updateFilter({ ward: ["ICU"] });

    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });

  it("component with visibleWhen hides again when expression becomes falsy", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };

    const el = activate(component);
    document.body.appendChild(el);

    // Make visible
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    // Clear filter
    contextManager.updateFilter({});
    expect(el.hidden).toBe(true);

    document.body.removeChild(el);
  });

  it("suspended component becomes hidden", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: {
        lookup: { dataSetId: "ds", operations: [] },
        refresh: { interval: 1000 },
      },
    };

    const el = activate(component);
    document.body.appendChild(el);

    const vizEl = el.firstElementChild as any;
    expect(vizEl).toBeTruthy();

    // Make visible
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    // Hide again - component should suspend
    contextManager.updateFilter({});
    expect(el.hidden).toBe(true);

    document.body.removeChild(el);
  });

  it("resumed component becomes visible", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: {
        lookup: { dataSetId: "ds", operations: [] },
        refresh: { interval: 1000 },
      },
    };

    const el = activate(component);
    document.body.appendChild(el);

    const _vizEl = el.firstElementChild as any;

    // Initially hidden (suspended)
    expect(el.hidden).toBe(true);

    // Make visible - should resume
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });

  it("static visible: false hides component at activation", () => {
    const component: Component = {
      type: "bar-chart",
      props: {
        lookup: { dataSetId: "ds", operations: [] },
        visible: false,
      },
    };

    const el = activate(component);

    expect(el.hidden).toBe(true);
  });

  it("visibleWhen takes precedence over static visible: false", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: {
        lookup: { dataSetId: "ds", operations: [] },
        visible: false,
      },
    };

    const el = activate(component);
    document.body.appendChild(el);

    // Initially hidden due to falsy visibleWhen
    expect(el.hidden).toBe(true);

    // Make visible via visibleWhen - should override static visible
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });

  it("component without visibleWhen respects static visible: false", () => {
    const component: Component = {
      type: "bar-chart",
      props: {
        lookup: { dataSetId: "ds", operations: [] },
        visible: false,
      },
    };

    const el = activate(component);

    expect(el.hidden).toBe(true);

    // Filter changes should not affect static visibility
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(true);
  });

  it("component without visibleWhen or visible is shown by default", () => {
    const component: Component = {
      type: "bar-chart",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };

    const el = activate(component);

    expect(el.hidden).toBe(false);
  });

  it("non-data components support visibleWhen", () => {
    const component: Component = {
      type: "title",
      visibleWhen: "#{filter.ward}",
      props: { text: "Hello", size: "h2" },
    };

    const el = activate(component);
    document.body.appendChild(el);

    expect(el.hidden).toBe(true);

    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });

  it("markdown components support visibleWhen", () => {
    const component: Component = {
      type: "markdown",
      visibleWhen: "#{filter.ward}",
      props: { content: "# Test" },
    };

    const el = activate(component);
    document.body.appendChild(el);

    expect(el.hidden).toBe(true);

    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });

  it("html components support visibleWhen", () => {
    const component: Component = {
      type: "html",
      visibleWhen: "#{filter.ward}",
      props: { content: "<b>test</b>" },
    };

    const el = activate(component);
    document.body.appendChild(el);

    expect(el.hidden).toBe(true);

    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });

  it("consumer is deregistered when element is removed from DOM", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };

    const el = activate(component);
    document.body.appendChild(el);

    // Consumer should be registered
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    // Remove from DOM
    document.body.removeChild(el);

    // Next evaluation should prune the stale consumer
    contextManager.updateFilter({});

    // Element should not be affected after removal (stays as it was)
    expect(el.hidden).toBe(false);
  });

  it("suspended component becomes visible when context changes", () => {
    const component: Component = {
      type: "bar-chart",
      visibleWhen: "#{filter.ward}",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };

    const el = activate(component);
    document.body.appendChild(el);

    const vizEl = el.firstElementChild as any;
    expect(vizEl).toBeTruthy();

    // Initially hidden (suspended)
    expect(el.hidden).toBe(true);

    // Make visible - should resume
    contextManager.updateFilter({ ward: ["ICU"] });
    expect(el.hidden).toBe(false);

    document.body.removeChild(el);
  });
});
