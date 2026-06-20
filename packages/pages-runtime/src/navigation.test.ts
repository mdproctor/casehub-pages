import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/pages-component/dist/model/types.js";
import { buildPageIndex, computeCurrentPage, walkNavigate, extendPageIndex } from "./navigation.js";
import { buildPagePathMap, extendPagePathMap, type PagePathMap } from "./page-paths.js";
import { activateSlot } from "@casehub/pages-component/dist/renderer/activate-slot.js";
import { wireInteractivity } from "@casehub/pages-component/dist/renderer/interactive.js";

function renderInteractive(
  target: HTMLElement,
  component: Component,
): HTMLElement {
  const el = document.createElement("div");
  el.dataset.componentType = component.type;
  el.dataset.componentId = component.id!;
  target.appendChild(el);

  if (component.slots) {
    const slotNames = Object.keys(component.slots);
    const panels = new Map<string, HTMLElement>();
    for (const name of slotNames) {
      const panel = document.createElement("div");
      panel.dataset.slot = name;
      el.appendChild(panel);
      panels.set(name, panel);
    }
    wireInteractivity(el, component.type, slotNames, panels);
  }
  return el;
}

describe("buildPageIndex", () => {
  it("maps page paths to components", () => {
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [sales] },
    };
    const paths = buildPagePathMap(root);
    const index = buildPageIndex(root, paths);
    expect(index.get("")).toBe(root);
    expect(index.get("Sales")).toBe(sales);
  });

  it("includes nested pages", () => {
    const detail: Component = { type: "page", props: { name: "Detail" } };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { Detail: [detail] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [sales] },
    };
    const paths = buildPagePathMap(root);
    const index = buildPageIndex(root, paths);
    expect(index.size).toBe(3);
    expect(index.get("Sales/Detail")).toBe(detail);
  });

  it("skips non-page components", () => {
    const chart: Component = { type: "bar-chart" };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { default: [chart] },
    };
    const paths = buildPagePathMap(root);
    const index = buildPageIndex(root, paths);
    expect(index.size).toBe(1);
  });
});

describe("computeCurrentPage", () => {
  it("returns empty string with no active slots", () => {
    const root: Component = { type: "page", props: { name: "App" } };
    const activeSlots = new Map<string, string>();
    const result = computeCurrentPage(root, activeSlots);
    expect(result).toBe("");
  });

  it("returns single segment for one-level navigation", () => {
    const overview: Component = { type: "page", props: { name: "Overview" } };
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: {
        default: [{
          type: "sidebar",
          id: "nav-1",
          slots: {
            Overview: [overview],
            Sales: [sales],
          },
        }],
      },
    };
    const activeSlots = new Map([["nav-1", "Sales"]]);
    const result = computeCurrentPage(root, activeSlots);
    expect(result).toBe("Sales");
  });

  it("returns multi-segment path for nested navigation", () => {
    const revenue: Component = { type: "page", props: { name: "Revenue" } };
    const costs: Component = { type: "page", props: { name: "Costs" } };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs-1",
          slots: {
            Revenue: [revenue],
            Costs: [costs],
          },
        }],
      },
    };
    const overview: Component = { type: "page", props: { name: "Overview" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: {
        default: [{
          type: "sidebar",
          id: "nav-1",
          slots: {
            Overview: [overview],
            Sales: [sales],
          },
        }],
      },
    };
    const activeSlots = new Map([["nav-1", "Sales"], ["tabs-1", "Revenue"]]);
    const result = computeCurrentPage(root, activeSlots);
    expect(result).toBe("Sales/Revenue");
  });
});

describe("walkNavigate", () => {
  it("activates single-level path", () => {
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const overview: Component = { type: "page", props: { name: "Overview" } };
    const nav: Component = {
      type: "sidebar",
      id: "nav-1",
      slots: { Overview: [overview], Sales: [sales] },
    };
    const root: Component = {
      type: "page",
      slots: { default: [nav] },
    };

    const target = document.createElement("div");
    renderInteractive(target, nav);

    const result = walkNavigate(root, ["Sales"], target, new Map());
    expect(result).toBe("Sales");
  });

  it("activates multi-level nested path", () => {
    const revenue: Component = { type: "page", props: { name: "Revenue" } };
    const costs: Component = { type: "page", props: { name: "Costs" } };
    const tabs: Component = {
      type: "tabs",
      id: "tabs-1",
      slots: { Revenue: [revenue], Costs: [costs] },
    };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { default: [tabs] },
    };
    const overview: Component = { type: "page", props: { name: "Overview" } };
    const nav: Component = {
      type: "sidebar",
      id: "nav-1",
      slots: { Overview: [overview], Sales: [sales] },
    };
    const root: Component = {
      type: "page",
      slots: { default: [nav] },
    };

    const target = document.createElement("div");
    const navEl = renderInteractive(target, nav);
    // Render nested tabs inside the Sales panel
    const salesPanel = navEl.querySelector("[data-slot='Sales']")!;
    renderInteractive(salesPanel as HTMLElement, tabs);

    const result = walkNavigate(root, ["Sales", "Revenue"], target, new Map());
    expect(result).toBe("Sales/Revenue");
  });

  it("returns partial path on missing segment", () => {
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const nav: Component = {
      type: "sidebar",
      id: "nav-1",
      slots: { Sales: [sales] },
    };
    const root: Component = {
      type: "page",
      slots: { default: [nav] },
    };

    const target = document.createElement("div");
    renderInteractive(target, nav);

    const result = walkNavigate(root, ["Sales", "Nonexistent"], target, new Map());
    expect(result).toBe("Sales");
  });

  it("returns empty string when first segment has no match", () => {
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const nav: Component = {
      type: "sidebar",
      id: "nav-1",
      slots: { Sales: [sales] },
    };
    const root: Component = {
      type: "page",
      slots: { default: [nav] },
    };

    const target = document.createElement("div");
    renderInteractive(target, nav);

    const result = walkNavigate(root, ["Missing"], target, new Map());
    expect(result).toBe("");
  });

  it("works with tree, menu, and tiles types", () => {
    for (const type of ["tree", "menu", "tiles"]) {
      const page: Component = { type: "page", props: { name: "Child" } };
      const container: Component = {
        type,
        id: `${type}-1`,
        slots: { Child: [page] },
      };
      const root: Component = {
        type: "page",
        slots: { default: [container] },
      };

      const target = document.createElement("div");
      renderInteractive(target, container);

      const result = walkNavigate(root, ["Child"], target, new Map());
      expect(result).toBe("Child");
    }
  });

  it("recurses through non-interactive page wrappers to find container", () => {
    const detail: Component = { type: "page", props: { name: "Detail" } };
    const tabs: Component = {
      type: "tabs",
      id: "tabs-1",
      slots: { Detail: [detail] },
    };
    const wrapper: Component = {
      type: "page",
      props: { name: "Wrapper" },
      slots: { default: [tabs] },
    };
    const root: Component = {
      type: "page",
      slots: { default: [wrapper] },
    };

    const target = document.createElement("div");
    // Render tabs inside the wrapper
    const wrapperEl = document.createElement("div");
    wrapperEl.dataset.componentType = "page";
    target.appendChild(wrapperEl);
    // Render the tabs inside the wrapper
    const tabsEl = document.createElement("div");
    tabsEl.dataset.componentType = "tabs";
    tabsEl.dataset.componentId = "tabs-1";
    wrapperEl.appendChild(tabsEl);
    const slotNames = ["Detail"];
    const panels = new Map<string, HTMLElement>();
    for (const name of slotNames) {
      const panel = document.createElement("div");
      panel.dataset.slot = name;
      tabsEl.appendChild(panel);
      panels.set(name, panel);
    }
    wireInteractivity(tabsEl, "tabs", slotNames, panels);

    const result = walkNavigate(root, ["Detail"], target, new Map());
    expect(result).toBe("Detail");
  });

  it("follows lazyPageResolutions overlay", () => {
    const innerPage: Component = { type: "page", props: { name: "Detail" } };
    const innerTabs: Component = {
      type: "tabs",
      id: "inner-tabs",
      slots: { Detail: [innerPage] },
    };
    const resolvedRoot: Component = {
      type: "page",
      slots: { default: [innerTabs] },
    };
    const lazyPage: Component = {
      type: "lazy-page",
      props: { name: "LazySection", href: "/lazy.yaml" },
    };
    const nav: Component = {
      type: "sidebar",
      id: "nav-1",
      slots: { LazySection: [lazyPage] },
    };
    const root: Component = {
      type: "page",
      slots: { default: [nav] },
    };

    const lazyResolutions = new Map<Component, Component>();
    lazyResolutions.set(lazyPage, resolvedRoot);

    const target = document.createElement("div");
    const navEl = renderInteractive(target, nav);
    // Simulate resolved lazy-page content rendered inside the LazySection panel
    const lazyPanel = navEl.querySelector("[data-slot='LazySection']")!;
    renderInteractive(lazyPanel as HTMLElement, innerTabs);

    const result = walkNavigate(root, ["LazySection", "Detail"], target, lazyResolutions);
    expect(result).toBe("LazySection/Detail");
  });
});

describe("extendPageIndex", () => {
  it("extends existing index with subtree pages", () => {
    const existingRoot: Component = { type: "page", props: { name: "App" } };
    const existingPaths = buildPagePathMap(existingRoot);
    const index = buildPageIndex(existingRoot, existingPaths);
    expect(index.get("")).toBe(existingRoot);

    const detail: Component = { type: "page", props: { name: "Detail" } };
    const fetchedRoot: Component = {
      type: "page",
      slots: { Detail: [detail] },
    };

    const newPaths: PagePathMap = new Map();
    extendPagePathMap(fetchedRoot, "Sales", newPaths);
    extendPageIndex(fetchedRoot, newPaths, index);

    expect(index.get("Sales")).toBe(fetchedRoot);
    expect(index.get("Sales/Detail")).toBe(detail);
    expect(index.get("")).toBe(existingRoot);
  });
});
