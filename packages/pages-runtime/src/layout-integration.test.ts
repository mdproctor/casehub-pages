import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { loadSite } from "./site.js";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import type { LayoutState } from "@casehubio/pages-component/dist/model/types.js";
import type { LayoutStore } from "./layout-store.js";
import { registerPanel, clearPanelRegistry } from "./panel-registry.js";

/** In-memory layout store for tests (no localStorage in happy-dom). */
function createTestStore(): LayoutStore {
  const data = new Map<string, LayoutState>();
  return {
    async load(key: string): Promise<LayoutState | null> {
      return data.get(key) ?? null;
    },
    async save(key: string, state: LayoutState): Promise<void> {
      data.set(key, state);
    },
    async delete(key: string): Promise<void> {
      data.delete(key);
    },
  };
}

/** Extract the flex-grow value from a potentially expanded flex shorthand. */
function flexGrow(el: HTMLElement): string {
  const flex = el.style.flex;
  // happy-dom may expand "40" to "40 1 0%"; extract the first token
  return flex.split(" ")[0]!;
}

describe("layout serialization", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    clearPanelRegistry();
    history.replaceState(null, "", location.pathname);
  });

  function buildWorkbench(): Component {
    return {
      type: "split",
      id: "main-split",
      props: { direction: "horizontal", ratio: [70, 30] },
      slots: {
        "0": [{ type: "html", props: { content: "Left" } }],
        "1": [{ type: "html", props: { content: "Right" } }],
      },
    };
  }

  it("site.layout returns empty state for fresh site", async () => {
    const site = await loadSite(container, buildWorkbench());
    const layout = site.layout;
    expect(layout.splits).toEqual({});
    expect(layout.docks).toEqual({});
    expect(layout.panels).toEqual({});
    site.dispose();
  });

  it("direct layout injection overrides split ratios", async () => {
    const savedLayout: LayoutState = {
      splits: { "main-split": [40, 60] },
      docks: {},
      panels: {},
    };
    const site = await loadSite(container, buildWorkbench(), { layout: savedLayout });

    const slots = container.querySelectorAll("[data-component-type='split'] > [data-slot]");
    expect(flexGrow(slots[0] as HTMLElement)).toBe("40");
    expect(flexGrow(slots[1] as HTMLElement)).toBe("60");

    site.dispose();
  });

  it("layout injection with ratio count mismatch is discarded", async () => {
    const savedLayout: LayoutState = {
      splits: { "main-split": [33, 33, 33] }, // 3-way ratio on 2-way split
      docks: {},
      panels: {},
    };
    const site = await loadSite(container, buildWorkbench(), { layout: savedLayout });

    // Should use component-tree defaults (70, 30) since mismatch
    const slots = container.querySelectorAll("[data-component-type='split'] > [data-slot]");
    expect(flexGrow(slots[0] as HTMLElement)).toBe("70");
    expect(flexGrow(slots[1] as HTMLElement)).toBe("30");

    site.dispose();
  });

  it("pages-split-resize event updates site.layout.splits", async () => {
    const site = await loadSite(container, buildWorkbench());
    expect(site.layout.splits).toEqual({});

    container.dispatchEvent(new CustomEvent("pages-split-resize", {
      bubbles: true,
      detail: { componentId: "main-split", ratios: [55, 45] },
    }));

    expect(site.layout.splits).toEqual({ "main-split": [55, 45] });

    site.dispose();
  });

  it("dock toggle updates site.layout.docks", async () => {
    const workbench: Component = {
      type: "split",
      id: "ws",
      props: { direction: "horizontal", ratio: [70, 30] },
      slots: {
        "0": [{ type: "html", props: { content: "Main" } }],
        "1": [{ type: "html", id: "sidebar", props: { content: "Side" } }],
      },
    };
    const site = await loadSite(container, workbench);

    container.dispatchEvent(new CustomEvent("pages-dock-toggle", {
      bubbles: true,
      detail: { panelId: "sidebar", visible: false },
    }));

    expect(site.layout.docks["sidebar"]).toBe(false);

    site.dispose();
  });

  describe("auto-persistence via LayoutStore", () => {
    it("auto-loads layout from store on init", async () => {
      const store = createTestStore();
      await store.save("ws", {
        splits: { "main-split": [40, 60] },
        docks: {},
        panels: {},
      });

      const site = await loadSite(container, buildWorkbench(), {
        layoutStore: store,
        layoutKey: "ws",
      });

      const slots = container.querySelectorAll("[data-component-type='split'] > [data-slot]");
      expect(flexGrow(slots[0] as HTMLElement)).toBe("40");
      expect(flexGrow(slots[1] as HTMLElement)).toBe("60");

      site.dispose();
    });

    it("auto-saves layout on split resize (debounced)", async () => {
      vi.useFakeTimers();
      const store = createTestStore();
      const site = await loadSite(container, buildWorkbench(), {
        layoutStore: store,
        layoutKey: "ws",
      });

      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [55, 45] },
      }));

      // Not saved yet (debounced)
      expect(await store.load("ws")).toBeNull();

      vi.advanceTimersByTime(500);

      const saved = await store.load("ws");
      expect(saved?.splits["main-split"]).toEqual([55, 45]);

      site.dispose();
      vi.useRealTimers();
    });

    it("store takes precedence over direct layout injection", async () => {
      const store = createTestStore();
      await store.save("ws", {
        splits: { "main-split": [25, 75] },
        docks: {},
        panels: {},
      });

      const site = await loadSite(container, buildWorkbench(), {
        layout: { splits: { "main-split": [50, 50] }, docks: {}, panels: {} },
        layoutStore: store,
        layoutKey: "ws",
      });

      const slots = container.querySelectorAll("[data-component-type='split'] > [data-slot]");
      expect(flexGrow(slots[0] as HTMLElement)).toBe("25");

      site.dispose();
    });

    it("layout injection used as fallback when store returns null", async () => {
      const store = createTestStore();
      // store is empty

      const site = await loadSite(container, buildWorkbench(), {
        layout: { splits: { "main-split": [45, 55] }, docks: {}, panels: {} },
        layoutStore: store,
        layoutKey: "ws",
      });

      const slots = container.querySelectorAll("[data-component-type='split'] > [data-slot]");
      expect(flexGrow(slots[0] as HTMLElement)).toBe("45");

      site.dispose();
    });

    it("dispose cancels pending layout save", async () => {
      vi.useFakeTimers();
      const store = createTestStore();
      const saveSpy = vi.spyOn(store, "save");

      const site = await loadSite(container, buildWorkbench(), {
        layoutStore: store,
        layoutKey: "ws",
      });

      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [55, 45] },
      }));

      site.dispose();
      vi.advanceTimersByTime(1000);

      expect(saveSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("custom layoutSaveDelayMs overrides default 500ms", async () => {
      vi.useFakeTimers();
      const store = createTestStore();
      const site = await loadSite(container, buildWorkbench(), {
        layoutStore: store,
        layoutKey: "ws",
        layoutSaveDelayMs: 2000,
      });

      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [55, 45] },
      }));

      // Not saved at default 500ms
      vi.advanceTimersByTime(500);
      expect(await store.load("ws")).toBeNull();

      // Not saved at 1000ms
      vi.advanceTimersByTime(500);
      expect(await store.load("ws")).toBeNull();

      // Saved at 2000ms
      vi.advanceTimersByTime(1000);
      const saved = await store.load("ws");
      expect(saved?.splits["main-split"]).toEqual([55, 45]);

      site.dispose();
      vi.useRealTimers();
    });

    it("debounce resets on repeated events within delay window", async () => {
      vi.useFakeTimers();
      const store = createTestStore();
      const site = await loadSite(container, buildWorkbench(), {
        layoutStore: store,
        layoutKey: "ws",
        layoutSaveDelayMs: 1000,
      });

      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [55, 45] },
      }));

      vi.advanceTimersByTime(800);
      expect(await store.load("ws")).toBeNull();

      // Second event resets the timer
      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [60, 40] },
      }));

      // 200ms after second event — only 200ms into new 1000ms window
      vi.advanceTimersByTime(200);
      expect(await store.load("ws")).toBeNull();

      // Complete the second debounce window
      vi.advanceTimersByTime(800);
      const saved = await store.load("ws");
      expect(saved?.splits["main-split"]).toEqual([60, 40]);

      site.dispose();
      vi.useRealTimers();
    });

    it("no save when store not configured", async () => {
      vi.useFakeTimers();
      const site = await loadSite(container, buildWorkbench());

      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [55, 45] },
      }));

      vi.advanceTimersByTime(1000);

      // splitRatios updated in-memory but no crash and no store write
      expect(site.layout.splits["main-split"]).toEqual([55, 45]);

      site.dispose();
      vi.useRealTimers();
    });
  });

  describe("panel capture", () => {
    it("captures host-panel entries with explicit IDs", async () => {
      if (!customElements.get("test-layout-panel")) {
        customElements.define("test-layout-panel", class extends HTMLElement {});
      }
      registerPanel("test-p", "test-layout-panel");

      const workbench: Component = {
        type: "split",
        id: "ws",
        props: { direction: "horizontal", ratio: [50, 50] },
        slots: {
          "0": [{ type: "host-panel", id: "my-panel", props: { typeName: "test-p", panelProps: { foo: 1 } } }],
          "1": [{ type: "html", props: { content: "Right" } }],
        },
      };

      const site = await loadSite(container, workbench);
      const panels = site.layout.panels;

      expect(panels["my-panel"]).toBeDefined();
      expect(panels["my-panel"]!.typeName).toBe("test-p");
      expect(panels["my-panel"]!.props).toEqual({ foo: 1 });

      site.dispose();
    });
  });

  describe("hidden dock panel correction", () => {
    it("preserves last known ratio when panel hidden during resize", async () => {
      const site = await loadSite(container, buildWorkbench());

      // First resize: set known ratios
      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [60, 40] },
      }));

      // Resize with one panel hidden (measures as 0)
      container.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        detail: { componentId: "main-split", ratios: [100, 0] },
      }));

      // Hidden panel should keep its last known ratio
      expect(site.layout.splits["main-split"]).toEqual([100, 40]);

      site.dispose();
    });
  });
});
