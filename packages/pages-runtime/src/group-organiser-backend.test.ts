import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createGroupOrganiserBackend } from "./group-organiser-backend.js";
import type { FloatingFrameBackend } from "./floating-frame-backend.js";
import type {
  FrameLayout,
  FrameTabConfig,
  ContentFactory,
} from "@casehubio/pages-component";

let resizeObserverCallback: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | null = null;
const ResizeObserverMock = vi.fn().mockImplementation((cb: any) => {
  resizeObserverCallback = cb;
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
});
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

function testContentFactory(): ContentFactory {
  return (tab: FrameTabConfig) => {
    const el = document.createElement("div");
    el.textContent = `Tab: ${tab.key}`;
    el.dataset.contentKey = tab.key;
    return { element: el };
  };
}

function makeLayout(
  key: string,
  tabs: string[],
  overrides?: Partial<FrameLayout>,
): FrameLayout {
  return {
    key,
    tabs: tabs.map((t) => ({
      key: t,
      label: t.toUpperCase(),
      content: { type: "html", props: {} },
    })),
    position: { x: 50, y: 50 },
    size: { width: 300, height: 200 },
    order: 0,
    zIndex: 1,
    pinned: false,
    hidden: false,
    activeTabKey: tabs[0]!,
    ...overrides,
  };
}

describe("GroupOrganiserBackend", () => {
  let container: HTMLElement;
  let backend: FloatingFrameBackend;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.cssText = "width:800px;height:600px;";
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    backend = createGroupOrganiserBackend();
    backend.attach(container, testContentFactory());
  });

  afterEach(() => {
    backend.dispose();
    document.body.removeChild(container);
  });

  it("renderFrame creates a positioned frame with tabs", () => {
    backend.renderFrame(makeLayout("f1", ["a", "b"]));

    const frame = container.querySelector("[data-frame-key='f1']");
    expect(frame).not.toBeNull();
    const tabs = container.querySelectorAll(
      "[data-tab-strip] [data-tab-key]",
    );
    expect(tabs).toHaveLength(2);
  });

  it("renderFrame sets position and size from layout", () => {
    backend.renderFrame(
      makeLayout("f1", ["a"], {
        position: { x: 100, y: 200 },
        size: { width: 500, height: 400 },
      }),
    );

    const frame = container.querySelector(
      "[data-frame-key='f1']",
    ) as HTMLElement;
    expect(frame.style.left).toBe("100px");
    expect(frame.style.top).toBe("200px");
    expect(frame.style.width).toBe("500px");
    expect(frame.style.height).toBe("400px");
  });

  it("removeFrame removes the frame", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    backend.removeFrame("f1");

    expect(container.querySelector("[data-frame-key='f1']")).toBeNull();
  });

  it("addTab adds a tab to a frame", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    backend.addTab("f1", {
      key: "b",
      label: "B",
      content: { type: "html", props: {} },
    });

    const tabs = container.querySelectorAll(
      "[data-tab-strip] [data-tab-key]",
    );
    expect(tabs).toHaveLength(2);
  });

  it("removeTab removes a tab", () => {
    backend.renderFrame(makeLayout("f1", ["a", "b"]));
    backend.removeTab("f1", "a");

    const tabs = container.querySelectorAll(
      "[data-tab-strip] [data-tab-key]",
    );
    expect(tabs).toHaveLength(1);
  });

  it("setActiveTab switches visible content", () => {
    backend.renderFrame(makeLayout("f1", ["a", "b"]));
    backend.setActiveTab("f1", "b");

    const content = container.querySelector(
      "[data-tab-content] [data-content-key='b']",
    );
    expect(content).not.toBeNull();
  });

  it("updatePosition changes frame CSS", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    backend.updatePosition("f1", { x: 100, y: 200 });

    const frame = container.querySelector(
      "[data-frame-key='f1']",
    ) as HTMLElement;
    expect(frame.style.left).toBe("100px");
    expect(frame.style.top).toBe("200px");
  });

  it("updateSize changes frame CSS", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    backend.updateSize("f1", { width: 500, height: 400 });

    const frame = container.querySelector(
      "[data-frame-key='f1']",
    ) as HTMLElement;
    expect(frame.style.width).toBe("500px");
    expect(frame.style.height).toBe("400px");
  });

  it("bringToFront updates z-order", () => {
    backend.renderFrame(makeLayout("f1", ["a"], { zIndex: 1 }));
    backend.renderFrame(makeLayout("f2", ["b"], { zIndex: 2 }));

    backend.bringToFront("f1");

    const f1 = container.querySelector(
      "[data-frame-key='f1']",
    ) as HTMLElement;
    const f2 = container.querySelector(
      "[data-frame-key='f2']",
    ) as HTMLElement;
    expect(Number(f1.style.zIndex)).toBeGreaterThan(
      Number(f2.style.zIndex),
    );
  });

  it("getFrameElement returns the frame div", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    const el = backend.getFrameElement("f1");
    expect(el).not.toBeNull();
    expect(el!.getAttribute("data-frame-key")).toBe("f1");
  });

  it("getFrameElement returns null for unknown key", () => {
    expect(backend.getFrameElement("nope")).toBeNull();
  });

  it("onFrameMove fires when frame is dragged", () => {
    const cb = vi.fn();
    backend.onFrameMove(cb);
    backend.renderFrame(makeLayout("f1", ["a"]));

    const titlebar = container.querySelector(
      "[data-frame-titlebar]",
    ) as HTMLElement;
    titlebar.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 60,
        clientY: 60,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 110, clientY: 130 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(cb).toHaveBeenCalledWith(
      "f1",
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("onFrameResize fires when frame is resized", () => {
    const cb = vi.fn();
    backend.onFrameResize(cb);
    backend.renderFrame(makeLayout("f1", ["a"]));

    const handle = container.querySelector(
      "[data-resize-handle='se']",
    ) as HTMLElement;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 350,
        clientY: 250,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 400, clientY: 300 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(cb).toHaveBeenCalledWith(
      "f1",
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );
  });

  it("onFrameClose fires from chrome close button", () => {
    const cb = vi.fn();
    backend.onFrameClose(cb);
    backend.renderFrame(makeLayout("f1", ["a"]));

    const closeBtn = container.querySelector(".frame-close-dot") as HTMLElement;
    closeBtn.click();

    expect(cb).toHaveBeenCalledWith("f1");
  });

  it("onFramePin fires from chrome pin button", () => {
    const cb = vi.fn();
    backend.onFramePin(cb);
    backend.renderFrame(makeLayout("f1", ["a"]));

    const pinBtn = container.querySelector(".frame-pin-btn") as HTMLElement;
    pinBtn.click();

    expect(cb).toHaveBeenCalledWith("f1");
  });

  it("onTabDragOut fires when tab dragged outside strip", () => {
    const cb = vi.fn();
    backend.onTabDragOut(cb);
    backend.renderFrame(makeLayout("f1", ["a", "b"]));

    const tabA = container.querySelector(
      "[data-tab-key='a']",
    ) as HTMLElement;
    tabA.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 200 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(cb).toHaveBeenCalledWith("f1", "a", { x: 10, y: 200 });
  });

  it("onTabReorder fires when tabs reordered via drag", () => {
    const cb = vi.fn();
    backend.onTabReorder(cb);
    backend.renderFrame(makeLayout("f1", ["a", "b", "c"]));

    // Mock tab bounds for reorder detection
    const buttons = [
      ...container.querySelectorAll("[data-tab-key]"),
    ] as HTMLElement[];
    let left = 0;
    for (const btn of buttons) {
      const l = left;
      vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        left: l, right: l + 80, top: 0, bottom: 30,
        width: 80, height: 30, x: l, y: 0, toJSON: () => ({}),
      } as DOMRect);
      left += 80;
    }
    const strip = container.querySelector("[data-tab-strip]") as HTMLElement;
    vi.spyOn(strip, "getBoundingClientRect").mockReturnValue({
      left: 0, right: left, top: 0, bottom: 30,
      width: left, height: 30, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);

    const tabA = buttons[0]!;
    tabA.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 40,
        clientY: 15,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 200, clientY: 15 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(cb).toHaveBeenCalledWith("f1", expect.any(Array));
  });

  it("updatePinState toggles drag lock", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    backend.updatePinState("f1", true);

    const pinBtn = container.querySelector(".frame-pin-btn") as HTMLElement;
    expect(pinBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("dispose cleans up all frames", () => {
    backend.renderFrame(makeLayout("f1", ["a"]));
    backend.renderFrame(makeLayout("f2", ["b"]));
    backend.dispose();

    expect(container.querySelector("[data-frame-key]")).toBeNull();
  });

  it("unwrap returns null", () => {
    expect(backend.unwrap()).toBeNull();
  });

  it("toolbar + button adds tab to its own frame container", () => {
    backend.renderFrame(makeLayout("f1", ["a", "b"]));

    const frame = container.querySelector("[data-frame-key='f1']") as HTMLElement;
    const strip = frame.querySelector("[data-tab-strip]") as HTMLElement;
    const tabsBefore = strip.querySelectorAll("[data-tab-key]").length;

    const addBtn = Array.from(
      strip.querySelector("[data-container-toolbar]")?.children ?? []
    ).find(el => el.textContent === "+") as HTMLElement;
    expect(addBtn).toBeTruthy();

    addBtn.click();
    const tabsAfter = strip.querySelectorAll("[data-tab-key]").length;
    expect(tabsAfter).toBe(tabsBefore + 1);
  });

  it("tab drag preview never appears after toolbar buttons", () => {
    backend.renderFrame(makeLayout("f1", ["a", "b"]));
    backend.renderFrame(makeLayout("f2", ["c"], { position: { x: 400, y: 50 } }));

    const f2 = container.querySelector("[data-frame-key='f2']") as HTMLElement;
    const f2Strip = f2.querySelector("[data-tab-strip]") as HTMLElement;
    const f2Toolbar = f2Strip.querySelector("[data-container-toolbar]") as HTMLElement;
    expect(f2Toolbar).toBeTruthy();

    vi.spyOn(f2Strip, "getBoundingClientRect").mockReturnValue({
      left: 400, right: 700, top: 50, bottom: 76,
      width: 300, height: 26, x: 400, y: 50, toJSON: () => ({}),
    } as DOMRect);
    const tabC = f2Strip.querySelector("[data-tab-key='c']") as HTMLElement;
    vi.spyOn(tabC, "getBoundingClientRect").mockReturnValue({
      left: 400, right: 460, top: 50, bottom: 76,
      width: 60, height: 26, x: 400, y: 50, toJSON: () => ({}),
    } as DOMRect);

    const f1Strip = container.querySelector("[data-frame-key='f1'] [data-tab-strip]") as HTMLElement;
    const tabA = f1Strip.querySelector("[data-tab-key='a']") as HTMLElement;
    vi.spyOn(f1Strip, "getBoundingClientRect").mockReturnValue({
      left: 50, right: 350, top: 50, bottom: 76,
      width: 300, height: 26, x: 50, y: 50, toJSON: () => ({}),
    } as DOMRect);

    tabA.dispatchEvent(new PointerEvent("pointerdown", { clientX: 80, clientY: 63, bubbles: true }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 80, clientY: 120 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 650, clientY: 63 }));

    const preview = f2Strip.querySelector("[data-tab-preview]");
    expect(preview).toBeTruthy();

    const children = Array.from(f2Strip.children);
    const previewIdx = children.indexOf(preview as Element);
    const toolbarIdx = children.indexOf(f2Toolbar);
    expect(previewIdx).toBeLessThan(toolbarIdx);

    document.dispatchEvent(new PointerEvent("pointerup"));
  });

  describe("container resize", () => {
    it("scales frame positions and sizes proportionally when container resizes", () => {
      // First resize records the baseline (attach sets lastContainerSize=null)
      expect(resizeObserverCallback).not.toBeNull();
      resizeObserverCallback!([{ contentRect: { width: 800, height: 600 } }]);

      const layout = makeLayout("f1", ["a"], {
        position: { x: 100, y: 50 },
        size: { width: 400, height: 300 },
      });
      backend.renderFrame(layout);

      const frameEl = container.querySelector("[data-frame-key='f1']") as HTMLElement;
      expect(frameEl).not.toBeNull();
      expect(frameEl.style.left).toBe("100px");
      expect(frameEl.style.top).toBe("50px");
      expect(frameEl.style.width).toBe("400px");
      expect(frameEl.style.height).toBe("300px");

      // Resize from 800x600 to 1600x1200 (2x)
      resizeObserverCallback!([{ contentRect: { width: 1600, height: 1200 } }]);

      expect(frameEl.style.left).toBe("200px");
      expect(frameEl.style.top).toBe("100px");
      expect(frameEl.style.width).toBe("800px");
      expect(frameEl.style.height).toBe("600px");
    });
  });

  describe("captureContainerTree", () => {
    it("captures dynamically added tabs", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));

      backend.addTab("f1", { key: "c", label: "C", content: { type: "html", props: {} } });

      const tree = backend.captureContainerTree("f1");
      expect(tree).toBeDefined();
      expect(tree!.tabs).toHaveLength(3);
      expect(tree!.tabs.map(t => t.key)).toEqual(["a", "b", "c"]);
    });

    it("captures flat single-tab frame", () => {
      backend.renderFrame(makeLayout("f1", ["a"]));
      const tree = backend.captureContainerTree("f1");
      expect(tree).toBeDefined();
      expect(tree!.tabs).toHaveLength(1);
      expect(tree!.tabs[0]!.key).toBe("a");
    });

    it("capture→restore round trip preserves tabs and layout", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b", "c"]));
      backend.addTab("f1", { key: "d", label: "D", content: { type: "html", props: {} } });

      const tree = backend.captureContainerTree("f1");
      expect(tree).toBeDefined();
      expect(tree!.tabs).toHaveLength(4);

      backend.removeFrame("f1");
      backend.renderFrame(makeLayout("f1", ["a", "b", "c"], { containerTree: tree! }));

      const restored = backend.captureContainerTree("f1");
      expect(restored).toBeDefined();
      expect(restored!.tabs.map(t => t.key)).toEqual(["a", "b", "c", "d"]);
      expect(restored!.layout).toBe("tabbed");
    });

    it("capture→restore round trip preserves accordion layout", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));
      backend.setFrameLayout("f1", "accordion");

      const tree = backend.captureContainerTree("f1");
      expect(tree).toBeDefined();
      expect(tree!.layout).toBe("accordion");

      backend.removeFrame("f1");
      backend.renderFrame(makeLayout("f1", ["a", "b"], { containerTree: tree! }));

      const restored = backend.captureContainerTree("f1");
      expect(restored).toBeDefined();
      expect(restored!.layout).toBe("accordion");
      expect(restored!.tabs.map(t => t.key)).toEqual(["a", "b"]);
    });

    it("capture→restore preserves toolbar in restored frame", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));

      const tree = backend.captureContainerTree("f1");
      backend.removeFrame("f1");
      backend.renderFrame(makeLayout("f1", ["a", "b"], { containerTree: tree! }));

      const frameEl = backend.getFrameElement("f1")!;
      const toolbar = frameEl.querySelector("[data-container-toolbar]");
      expect(toolbar).not.toBeNull();
    });
  });

  describe("getRootContainer", () => {
    it("returns the live Container for a rendered frame", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));
      const root = backend.getRootContainer("f1");
      expect(root).not.toBeNull();
      expect(root!.entries).toHaveLength(2);
      expect(root!.entries.map(e => e.key)).toEqual(["a", "b"]);
    });

    it("returns null for unknown frame key", () => {
      expect(backend.getRootContainer("nope")).toBeNull();
    });

    it("returns same object on repeated calls", () => {
      backend.renderFrame(makeLayout("f1", ["a"]));
      const c1 = backend.getRootContainer("f1");
      const c2 = backend.getRootContainer("f1");
      expect(c1).toBe(c2);
    });

    it("container survives unmount/remount cycle", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));
      const root = backend.getRootContainer("f1")!;
      const frameEl = backend.getFrameElement("f1")!;
      const tabContentEl = frameEl.querySelector("[data-frame-body]") as HTMLElement;
      expect(tabContentEl).not.toBeNull();

      root.unmount();
      expect(tabContentEl.children.length).toBe(0);

      root.mount(tabContentEl);
      expect(tabContentEl.children.length).toBeGreaterThan(0);
      expect(root.entries).toHaveLength(2);
    });
  });

  describe("nest button lifecycle", () => {
    it("nest button is present in content element after render", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));

      const frameEl = backend.getFrameElement("f1")!;
      const nestBtn = frameEl.querySelector("[data-nest-button]");
      expect(nestBtn).not.toBeNull();
    });

    it("nest button survives layout switch tabbed→accordion→tabbed", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));

      backend.setFrameLayout("f1", "accordion");
      backend.setFrameLayout("f1", "tabbed");

      const frameEl = backend.getFrameElement("f1")!;
      const nestBtn = frameEl.querySelector("[data-nest-button]");
      expect(nestBtn).not.toBeNull();
    });

    it("nest button appears for each tab when activated", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b"]));

      backend.setActiveTab("f1", "b");

      const frameEl = backend.getFrameElement("f1")!;
      const content = frameEl.querySelector("[data-tab-content]")!;
      const nestBtn = content.querySelector("[data-nest-button]");
      expect(nestBtn).not.toBeNull();
    });
  });

  describe("split tree via containerTree", () => {
    it("renders a pre-built split tree with nested leaf containers", () => {
      backend.renderFrame(makeLayout("f1", ["a"], {
        containerTree: {
          layout: "splith",
          tabs: [
            { key: "p1", label: "P1", content: null, children: {
              layout: "tabbed",
              tabs: [
                { key: "a", label: "A", content: { type: "html", props: {} } },
                { key: "b", label: "B", content: { type: "html", props: {} } },
              ],
            }},
            { key: "p2", label: "P2", content: null, children: {
              layout: "tabbed",
              tabs: [
                { key: "c", label: "C", content: { type: "html", props: {} } },
              ],
            }},
          ],
        },
      }));

      const root = backend.getRootContainer("f1");
      expect(root).not.toBeNull();
      expect(root!.organiser.type).toBe("splith");
      expect(root!.entries).toHaveLength(2);

      const pane1 = root!.entries[0]!.childContainer;
      const pane2 = root!.entries[1]!.childContainer;
      expect(pane1).not.toBeNull();
      expect(pane2).not.toBeNull();
      expect(pane1!.entries.map(e => e.key)).toEqual(["a", "b"]);
      expect(pane2!.entries.map(e => e.key)).toEqual(["c"]);
    });

    it("refreshEntry on split root preserves sibling pane content", () => {
      backend.renderFrame(makeLayout("f1", ["a"], {
        containerTree: {
          layout: "splith",
          tabs: [
            { key: "p1", label: "P1", content: null, children: {
              layout: "tabbed",
              tabs: [
                { key: "a", label: "A", content: { type: "html", props: {} } },
                { key: "b", label: "B", content: { type: "html", props: {} } },
              ],
            }},
            { key: "p2", label: "P2", content: null, children: {
              layout: "tabbed",
              tabs: [
                { key: "c", label: "C", content: { type: "html", props: {} } },
              ],
            }},
          ],
        },
      }));

      const siblingContent = container.querySelector("[data-content-key='c']");
      expect(siblingContent).not.toBeNull();

      const root = backend.getRootContainer("f1")!;
      const pane1Entry = root.entries[0]!;
      const oldChild = pane1Entry.childContainer!;
      oldChild.unmount();
      pane1Entry.childContainer = undefined;
      pane1Entry.contentDispose = undefined;

      root.refreshEntry("p1");

      const siblingContentAfter = container.querySelector("[data-content-key='c']");
      expect(siblingContentAfter).toBe(siblingContent);
    });
  });

  describe("mount-transfer state preservation", () => {
    it("container preserves organiser state across unmount/mount cycle", () => {
      backend.renderFrame(makeLayout("f1", ["a", "b", "c"]));
      const root = backend.getRootContainer("f1")!;

      backend.setFrameLayout("f1", "accordion");
      expect(root.organiser.type).toBe("accordion");
      const stateBefore = root.organiser.getState();

      const frameEl = backend.getFrameElement("f1")!;
      const tabContentEl = frameEl.querySelector("[data-frame-body]") as HTMLElement;

      root.unmount();
      root.mount(tabContentEl);

      expect(root.organiser.type).toBe("accordion");
      const stateAfter = root.organiser.getState();
      expect(stateAfter).toEqual(stateBefore);
    });

    it("split tree container identity preserved across unmount/mount", () => {
      backend.renderFrame(makeLayout("f1", ["a"], {
        containerTree: {
          layout: "splith",
          tabs: [
            { key: "p1", label: "P1", content: null, children: {
              layout: "tabbed",
              tabs: [
                { key: "a", label: "A", content: { type: "html", props: {} } },
              ],
            }},
            { key: "p2", label: "P2", content: null, children: {
              layout: "accordion",
              tabs: [
                { key: "b", label: "B", content: { type: "html", props: {} } },
                { key: "c", label: "C", content: { type: "html", props: {} } },
              ],
            }},
          ],
        },
      }));

      const root = backend.getRootContainer("f1")!;
      const pane2Before = root.entries[1]!.childContainer!;
      expect(pane2Before.organiser.type).toBe("accordion");

      const frameEl = backend.getFrameElement("f1")!;
      const tabContentEl = frameEl.querySelector("[data-frame-body]") as HTMLElement;

      root.unmount();
      root.mount(tabContentEl);

      const rootAfter = backend.getRootContainer("f1")!;
      expect(rootAfter).toBe(root);
      const pane2After = rootAfter.entries[1]!.childContainer!;
      expect(pane2After).toBe(pane2Before);
      expect(pane2After.organiser.type).toBe("accordion");
    });
  });
});
