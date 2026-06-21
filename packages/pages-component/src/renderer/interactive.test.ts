import { describe, it, expect } from "vitest";
import { wireInteractivity } from "./interactive.js";
import type { Component } from "../model/types.js";
import { slotSwapRegistry } from "./slot-swap.js";
import type { LazyConfig } from "./interactive.js";
import { isLayoutType, applyLayoutCSS } from "./layout.js";

function makeSlotContainers(slotNames: string[]): {
  container: HTMLDivElement;
  panels: Map<string, HTMLDivElement>;
} {
  const container = document.createElement("div");
  const panels = new Map<string, HTMLDivElement>();
  for (const name of slotNames) {
    const panel = document.createElement("div");
    panel.dataset.slot = name;
    container.appendChild(panel);
    panels.set(name, panel);
  }
  return { container, panels };
}

describe("wireInteractivity — tabs", () => {
  it("creates tab bar with buttons for each slot", () => {
    const { container, panels } = makeSlotContainers(["Sales", "Costs"]);
    wireInteractivity(container, "tabs", ["Sales", "Costs"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar).toBeTruthy();
    const buttons = bar.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toBe("Sales");
    expect(buttons[1]!.textContent).toBe("Costs");
  });

  it("first tab visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B", "C"]);
    wireInteractivity(container, "tabs", ["A", "B", "C"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
    expect(panels.get("C")!.style.display).toBe("none");
  });

  it("clicking a tab shows target, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tabs", ["A", "B"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    const buttons = bar.querySelectorAll("button");
    buttons[1]!.click();
    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — pills", () => {
  it("has casehub-pills CSS class on bar", () => {
    const { container, panels } = makeSlotContainers(["X", "Y"]);
    wireInteractivity(container, "pills", ["X", "Y"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar.classList.contains("casehub-pills")).toBe(true);
  });
});

describe("wireInteractivity — accordion", () => {
  it("creates disclosure headers for each slot", () => {
    const { container, panels } = makeSlotContainers(["Section A", "Section B"]);
    wireInteractivity(container, "accordion", ["Section A", "Section B"], panels);
    const headers = container.querySelectorAll("[data-accordion-header]");
    expect(headers).toHaveLength(2);
    expect(headers[0]!.textContent).toBe("Section A");
    expect(headers[1]!.textContent).toBe("Section B");
  });

  it("all sections expanded by default", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "accordion", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });

  it("clicking header toggles section", () => {
    const { container, panels } = makeSlotContainers(["A"]);
    wireInteractivity(container, "accordion", ["A"], panels);
    const header = container.querySelector("[data-accordion-header]") as HTMLElement;
    header.click();
    expect(panels.get("A")!.style.display).toBe("none");
    header.click();
    expect(panels.get("A")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — carousel", () => {
  it("first child visible, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2", "S3"]);
    wireInteractivity(container, "carousel", ["S1", "S2", "S3"], panels);
    expect(panels.get("S1")!.style.display).not.toBe("none");
    expect(panels.get("S2")!.style.display).toBe("none");
    expect(panels.get("S3")!.style.display).toBe("none");
  });

  it("next button cycles forward", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2"]);
    wireInteractivity(container, "carousel", ["S1", "S2"], panels);
    const next = container.querySelector("[data-carousel-next]") as HTMLElement;
    next.click();
    expect(panels.get("S1")!.style.display).toBe("none");
    expect(panels.get("S2")!.style.display).not.toBe("none");
  });

  it("prev button cycles backward (wraps)", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2"]);
    wireInteractivity(container, "carousel", ["S1", "S2"], panels);
    const prev = container.querySelector("[data-carousel-prev]") as HTMLElement;
    prev.click();
    expect(panels.get("S1")!.style.display).toBe("none");
    expect(panels.get("S2")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — stack", () => {
  it("first child visible, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "stack", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("no controls created for stack", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "stack", ["A", "B"], panels);
    expect(container.querySelector("[data-tab-bar]")).toBeNull();
    expect(container.querySelector("[data-carousel-prev]")).toBeNull();
  });
});

describe("wireInteractivity — casehub-slot-change events", () => {
  it("tabs emit casehub-slot-change on click", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    container.dataset.componentId = "nav-1";
    wireInteractivity(container, "tabs", ["A", "B"], panels);
    const events: Array<{ activeSlot: string; containerId: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const bar = container.querySelector("[data-tab-bar]")!;
    (bar.querySelectorAll("button")[1] as HTMLElement).click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("B");
    expect(events[0]!.containerId).toBe("nav-1");
  });

  it("accordion emits casehub-slot-change on expand", () => {
    const { container, panels } = makeSlotContainers(["X", "Y"]);
    container.dataset.componentId = "acc-1";
    wireInteractivity(container, "accordion", ["X", "Y"], panels);
    const events: Array<{ activeSlot: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const headers = container.querySelectorAll("[data-accordion-header]");
    // First click collapses Y (no event), second click expands Y (fires event)
    (headers[1] as HTMLElement).click();
    (headers[1] as HTMLElement).click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("Y");
  });

  it("carousel emits casehub-slot-change on next", () => {
    const { container, panels } = makeSlotContainers(["P1", "P2"]);
    container.dataset.componentId = "car-1";
    wireInteractivity(container, "carousel", ["P1", "P2"], panels);
    const events: Array<{ activeSlot: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const nextBtn = container.querySelector("[data-carousel-next]") as HTMLElement;
    nextBtn.click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("P2");
  });
});

describe("wireInteractivity — sidebar", () => {
  it("creates sidebar nav with buttons for each slot", () => {
    const { container, panels } = makeSlotContainers(["Overview", "Sales"]);
    wireInteractivity(container, "sidebar", ["Overview", "Sales"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.classList.contains("casehub-sidebar")).toBe(true);
    const buttons = bar.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toBe("Overview");
  });

  it("first slot visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "sidebar", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("clicking sidebar item shows target, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "sidebar", ["A", "B"], panels);
    const buttons = container.querySelector("[data-tab-bar]")!.querySelectorAll("button");
    (buttons[1] as HTMLElement).click();
    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });

  it("emits casehub-slot-change on click", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    container.dataset.componentId = "side-1";
    wireInteractivity(container, "sidebar", ["A", "B"], panels);
    const events: Array<{ activeSlot: string; containerId: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const buttons = container.querySelector("[data-tab-bar]")!.querySelectorAll("button");
    (buttons[1] as HTMLElement).click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("B");
    expect(events[0]!.containerId).toBe("side-1");
  });
});

function makeLazyConfig(
  slots: Record<string, Component[]>,
): LazyConfig {
  const renderCalls: Array<{ slotName: string }> = [];
  return {
    slotChildren: slots,
    renderSlot: (parent, children, slotName) => {
      renderCalls.push({ slotName });
      for (const child of children) {
        const el = document.createElement("div");
        el.dataset.componentType = child.type;
        parent.appendChild(el);
      }
    },
    _renderCalls: renderCalls,
  } as LazyConfig & { _renderCalls: typeof renderCalls };
}

describe("wireInteractivity — lazy tab swap", () => {
  it("tab click clears old slot and renders new slot", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    const lazy = makeLazyConfig({
      A: [{ type: "html" }],
      B: [{ type: "table" }],
    });
    wireInteractivity(container, "tabs", ["A", "B"], panels, document, lazy);

    // Initial: A rendered, B empty
    expect(panels.get("A")!.children.length).toBeGreaterThan(0);
    expect(panels.get("B")!.children).toHaveLength(0);

    // Click B
    const bar = container.querySelector("[data-tab-bar]")!;
    (bar.querySelectorAll("button")[1] as HTMLElement).click();

    // A cleared, B rendered
    expect(panels.get("A")!.children).toHaveLength(0);
    expect(panels.get("B")!.children.length).toBeGreaterThan(0);
    expect(panels.get("B")!.querySelector("[data-component-type='table']")).toBeTruthy();
  });

  it("re-clicking active tab is a no-op", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    const lazy = makeLazyConfig({
      A: [{ type: "html" }],
      B: [{ type: "table" }],
    });
    wireInteractivity(container, "tabs", ["A", "B"], panels, document, lazy);
    const childCount = panels.get("A")!.children.length;

    const events: unknown[] = [];
    container.addEventListener("casehub-slot-change", (e) => events.push(e));

    // Click A (already active)
    const bar = container.querySelector("[data-tab-bar]")!;
    (bar.querySelectorAll("button")[0] as HTMLElement).click();

    // No change, no event
    expect(panels.get("A")!.children.length).toBe(childCount);
    expect(events).toHaveLength(0);
  });

  it("switching back re-renders fresh", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    const lazy = makeLazyConfig({
      A: [{ type: "html" }],
      B: [{ type: "table" }],
    });
    wireInteractivity(container, "tabs", ["A", "B"], panels, document, lazy);

    const bar = container.querySelector("[data-tab-bar]")!;
    const buttons = bar.querySelectorAll("button");

    // Switch to B then back to A
    (buttons[1] as HTMLElement).click();
    (buttons[0] as HTMLElement).click();

    // A re-rendered
    expect(panels.get("A")!.children.length).toBeGreaterThan(0);
    expect(panels.get("B")!.children).toHaveLength(0);
  });

  it("swap function registered in slotSwapRegistry", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    const lazy = makeLazyConfig({
      A: [{ type: "html" }],
      B: [{ type: "table" }],
    });
    wireInteractivity(container, "tabs", ["A", "B"], panels, document, lazy);
    expect(slotSwapRegistry.get(container)).toBeDefined();
  });
});

describe("wireInteractivity — lazy sidebar swap", () => {
  it("sidebar click clears old slot and renders new slot", () => {
    const { container, panels } = makeSlotContainers(["Nav", "Content"]);
    const lazy = makeLazyConfig({
      Nav: [{ type: "html" }],
      Content: [{ type: "table" }],
    });
    wireInteractivity(container, "sidebar", ["Nav", "Content"], panels, document, lazy);

    expect(panels.get("Nav")!.children.length).toBeGreaterThan(0);
    expect(panels.get("Content")!.children).toHaveLength(0);

    const bar = container.querySelector("[data-tab-bar]")!;
    (bar.querySelectorAll("button")[1] as HTMLElement).click();

    expect(panels.get("Nav")!.children).toHaveLength(0);
    expect(panels.get("Content")!.querySelector("[data-component-type='table']")).toBeTruthy();
  });
});

describe("wireInteractivity — lazy carousel swap", () => {
  it("next button clears old and renders new via swap", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2"]);
    const lazy = makeLazyConfig({
      S1: [{ type: "html" }],
      S2: [{ type: "table" }],
    });
    wireInteractivity(container, "carousel", ["S1", "S2"], panels, document, lazy);

    expect(panels.get("S1")!.children.length).toBeGreaterThan(0);

    const next = container.querySelector("[data-carousel-next]") as HTMLElement;
    next.click();

    expect(panels.get("S1")!.children).toHaveLength(0);
    expect(panels.get("S2")!.querySelector("[data-component-type='table']")).toBeTruthy();
  });

  it("prev button wraps and renders via swap", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2"]);
    const lazy = makeLazyConfig({
      S1: [{ type: "html" }],
      S2: [{ type: "table" }],
    });
    wireInteractivity(container, "carousel", ["S1", "S2"], panels, document, lazy);

    const prev = container.querySelector("[data-carousel-prev]") as HTMLElement;
    prev.click();

    expect(panels.get("S1")!.children).toHaveLength(0);
    expect(panels.get("S2")!.querySelector("[data-component-type='table']")).toBeTruthy();
  });
});

describe("wireInteractivity — lazy stack", () => {
  it("renders only first slot, registers swap, no click handlers", () => {
    const { container, panels } = makeSlotContainers(["L1", "L2"]);
    const lazy = makeLazyConfig({
      L1: [{ type: "html" }],
      L2: [{ type: "table" }],
    });
    wireInteractivity(container, "stack", ["L1", "L2"], panels, document, lazy);

    expect(panels.get("L1")!.children.length).toBeGreaterThan(0);
    expect(panels.get("L2")!.children).toHaveLength(0);
    expect(slotSwapRegistry.get(container)).toBeDefined();
    expect(container.querySelector("[data-tab-bar]")).toBeNull();
    expect(container.querySelector("[data-carousel-prev]")).toBeNull();
  });

  it("programmatic swap via registry clears old and renders new", () => {
    const { container, panels } = makeSlotContainers(["L1", "L2"]);
    const lazy = makeLazyConfig({
      L1: [{ type: "html" }],
      L2: [{ type: "table" }],
    });
    wireInteractivity(container, "stack", ["L1", "L2"], panels, document, lazy);

    const swap = slotSwapRegistry.get(container)!;
    swap("L2");

    expect(panels.get("L1")!.children).toHaveLength(0);
    expect(panels.get("L2")!.querySelector("[data-component-type='table']")).toBeTruthy();
    expect(panels.get("L1")!.style.display).toBe("none");
    expect(panels.get("L2")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — tabs CSS", () => {
  it("has casehub-tabs CSS class on bar", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tabs", ["A", "B"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar.classList.contains("casehub-tabs")).toBe(true);
  });
});

describe("wireInteractivity — menu CSS", () => {
  it("has casehub-menu CSS class on bar", () => {
    const { container, panels } = makeSlotContainers(["File", "Edit"]);
    wireInteractivity(container, "menu", ["File", "Edit"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar.classList.contains("casehub-menu")).toBe(true);
  });

  it("first item visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "menu", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });
});

describe("layout — tree and tiles", () => {
  it("isLayoutType('tree') returns true", () => {
    expect(isLayoutType("tree")).toBe(true);
  });

  it("isLayoutType('tiles') returns false", () => {
    expect(isLayoutType("tiles")).toBe(false);
  });

  it("applyLayoutCSS for tree sets grid: auto 1fr", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, { type: "tree" });
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
  });
});

describe("wireInteractivity — tiles", () => {
  it("builds grid of card divs", () => {
    const { container, panels } = makeSlotContainers(["Dashboard", "Reports"]);
    wireInteractivity(container, "tiles", ["Dashboard", "Reports"], panels);

    const grid = container.querySelector(".casehub-tiles-grid") as HTMLElement;
    expect(grid).toBeTruthy();

    const cards = grid.querySelectorAll(".tile-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toBe("Dashboard");
    expect(cards[1]!.textContent).toBe("Reports");
  });

  it("first panel visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tiles", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("card click shows target panel, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tiles", ["A", "B"], panels);

    const cards = container.querySelectorAll(".tile-card");
    (cards[1] as HTMLElement).click();

    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });

  it("card click dispatches casehub-slot-change", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    container.dataset.componentId = "tiles-1";
    wireInteractivity(container, "tiles", ["A", "B"], panels);

    const events: Array<{ activeSlot: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);

    const cards = container.querySelectorAll(".tile-card");
    (cards[1] as HTMLElement).click();

    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("B");
  });

  it("active card gets data-active attribute", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tiles", ["A", "B"], panels);

    const cards = container.querySelectorAll(".tile-card");
    expect((cards[0] as HTMLElement).dataset.active).toBeDefined();
    expect((cards[1] as HTMLElement).dataset.active).toBeUndefined();

    (cards[1] as HTMLElement).click();
    expect((cards[0] as HTMLElement).dataset.active).toBeUndefined();
    expect((cards[1] as HTMLElement).dataset.active).toBeDefined();
  });

  it("lazy swap: tile click clears old slot and renders new slot", () => {
    const { container, panels } = makeSlotContainers(["X", "Y"]);
    const lazy = makeLazyConfig({
      X: [{ type: "html" }],
      Y: [{ type: "table" }],
    });
    wireInteractivity(container, "tiles", ["X", "Y"], panels, document, lazy);

    expect(panels.get("X")!.children.length).toBeGreaterThan(0);
    expect(panels.get("Y")!.children).toHaveLength(0);

    const cards = container.querySelectorAll(".tile-card");
    (cards[1] as HTMLElement).click();

    expect(panels.get("X")!.children).toHaveLength(0);
    expect(panels.get("Y")!.querySelector("[data-component-type='table']")).toBeTruthy();
  });
});

describe("wireInteractivity — tree", () => {
  it("builds nested ul/li from /-separated slot names", () => {
    const { container, panels } = makeSlotContainers([
      "Dashboard", "Settings/Profile", "Settings/Security", "Reports",
    ]);
    wireInteractivity(container, "tree", [
      "Dashboard", "Settings/Profile", "Settings/Security", "Reports",
    ], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    expect(nav).toBeTruthy();

    const topItems = nav.querySelectorAll(":scope > ul > li");
    expect(topItems).toHaveLength(3); // Dashboard, Settings (group), Reports
  });

  it("displays last segment as leaf label, group id as parent label", () => {
    const { container, panels } = makeSlotContainers([
      "Settings/Profile", "Settings/Security",
    ]);
    wireInteractivity(container, "tree", [
      "Settings/Profile", "Settings/Security",
    ], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    const groupLabel = nav.querySelector(".tree-group-label");
    expect(groupLabel!.textContent).toContain("Settings");

    const leaves = nav.querySelectorAll(".tree-leaf");
    expect(leaves).toHaveLength(2);
    expect(leaves[0]!.textContent).toBe("Profile");
    expect(leaves[1]!.textContent).toBe("Security");
  });

  it("flat slot names render as flat ul (no nesting)", () => {
    const { container, panels } = makeSlotContainers(["A", "B", "C"]);
    wireInteractivity(container, "tree", ["A", "B", "C"], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    const leaves = nav.querySelectorAll(".tree-leaf");
    expect(leaves).toHaveLength(3);

    // No group labels
    expect(nav.querySelector(".tree-group-label")).toBeNull();
  });

  it("first leaf visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tree", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("leaf click shows target panel, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "Settings/B"]);
    wireInteractivity(container, "tree", ["A", "Settings/B"], panels);

    const leaves = container.querySelectorAll(".tree-leaf");
    (leaves[1] as HTMLElement).click();

    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("Settings/B")!.style.display).not.toBe("none");
  });

  it("leaf click dispatches casehub-slot-change with full hierarchical key", () => {
    const { container, panels } = makeSlotContainers(["A", "Settings/B"]);
    container.dataset.componentId = "tree-1";
    wireInteractivity(container, "tree", ["A", "Settings/B"], panels);

    const events: Array<{ activeSlot: string; containerId: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);

    const leaves = container.querySelectorAll(".tree-leaf");
    (leaves[1] as HTMLElement).click();

    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("Settings/B");
    expect(events[0]!.containerId).toBe("tree-1");
  });

  it("expand/collapse toggles group children visibility", () => {
    const { container, panels } = makeSlotContainers([
      "Settings/Profile", "Settings/Security",
    ]);
    wireInteractivity(container, "tree", [
      "Settings/Profile", "Settings/Security",
    ], panels);

    const groupLabel = container.querySelector(".tree-group-label") as HTMLElement;
    const children = container.querySelector(".tree-children") as HTMLElement;

    // Top-level groups start expanded
    expect(children.style.display).not.toBe("none");

    // Click to collapse
    groupLabel.click();
    expect(children.style.display).toBe("none");

    // Click to expand
    groupLabel.click();
    expect(children.style.display).not.toBe("none");
  });

  it("self-contained: tree nav and panels are children of the container", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tree", ["A", "B"], panels);

    const nav = container.querySelector(".casehub-tree-nav");
    expect(nav!.parentElement).toBe(container);
    expect(panels.get("A")!.parentElement).toBe(container);
  });

  it("programmatic swap auto-expands collapsed parent groups", () => {
    const { container, panels } = makeSlotContainers([
      "Dashboard", "Settings/Profile",
    ]);
    wireInteractivity(container, "tree", [
      "Dashboard", "Settings/Profile",
    ], panels);

    // Collapse the Settings group
    const groupLabel = container.querySelector(".tree-group-label") as HTMLElement;
    groupLabel.click();
    const children = container.querySelector(".tree-children") as HTMLElement;
    expect(children.style.display).toBe("none");

    // Programmatic swap to a leaf inside the collapsed group
    const swap = slotSwapRegistry.get(container)!;
    swap("Settings/Profile");

    // Group should be auto-expanded
    expect(children.style.display).not.toBe("none");
    expect(panels.get("Settings/Profile")!.style.display).not.toBe("none");
  });

  it("deep nesting: 3-level tree renders correctly", () => {
    const { container, panels } = makeSlotContainers([
      "Settings/Advanced/Logging",
    ]);
    wireInteractivity(container, "tree", [
      "Settings/Advanced/Logging",
    ], panels);

    const nav = container.querySelector(".casehub-tree-nav") as HTMLElement;
    // Settings > Advanced > Logging
    const groupLabels = nav.querySelectorAll(".tree-group-label");
    expect(groupLabels).toHaveLength(2); // Settings and Advanced
    expect(groupLabels[0]!.textContent).toContain("Settings");
    expect(groupLabels[1]!.textContent).toContain("Advanced");
  });
});
