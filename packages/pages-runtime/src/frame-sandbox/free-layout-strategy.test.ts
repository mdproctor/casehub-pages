import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createFreeLayoutStrategy } from "./free-layout-strategy";
import type { Entry, ContentFactory, FreeLayoutState } from "./types.js";

let resizeObserverCallback: ((entries: Array<{ contentRect: { width: number; height: number } }>) => void) | null = null;
const ResizeObserverMock = vi.fn().mockImplementation((cb: any) => {
  resizeObserverCallback = cb;
  return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
});
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

function testFactory(): ContentFactory {
  return (entry) => {
    const el = document.createElement("div");
    el.textContent = `Content: ${entry.key}`;
    el.dataset.testKey = entry.key;
    return { element: el, dispose: () => el.remove() };
  };
}

function makeEntries(...keys: string[]): Entry[] {
  return keys.map((key) => ({ key, label: key.toUpperCase() }));
}

describe("FreeLayoutOrganiser", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.cssText = "width:800px;height:600px;position:relative;";
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("mounts entries as positioned frames", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 50, y: 50 },
          size: { width: 300, height: 200 },
        },
        b: {
          position: { x: 400, y: 100 },
          size: { width: 250, height: 180 },
        },
      },
      zOrder: ["a", "b"],
    });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const frames = container.querySelectorAll("[data-frame-key]");
    expect(frames).toHaveLength(2);

    const frameA = container.querySelector(
      "[data-frame-key='a']",
    ) as HTMLElement;
    expect(frameA.style.left).toBe("50px");
    expect(frameA.style.top).toBe("50px");
    expect(frameA.style.width).toBe("300px");
    expect(frameA.style.height).toBe("200px");
  });

  it("each frame has a titlebar and content area", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 0, y: 0 },
          size: { width: 200, height: 150 },
        },
      },
      zOrder: ["a"],
    });
    org.mount(container, makeEntries("a"), testFactory());

    const frame = container.querySelector("[data-frame-key='a']")!;
    const content = frame.querySelector("[data-test-key='a']");
    expect(frame).not.toBeNull();
    expect(content).not.toBeNull();
  });

  it("unmount detaches content, preserves on entries", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 0, y: 0 },
          size: { width: 200, height: 150 },
        },
      },
      zOrder: ["a"],
    });
    const entries = makeEntries("a");
    org.mount(container, entries, testFactory());

    const content = container.querySelector("[data-test-key='a']")!;
    org.unmount();

    expect(container.children).toHaveLength(0);
    expect(entries[0]!.contentElement).toBe(content);
  });

  it("returns correct state", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 10, y: 20 },
          size: { width: 100, height: 80 },
        },
      },
      zOrder: ["a"],
    });
    org.mount(container, makeEntries("a"), testFactory());

    const state = org.getState() as FreeLayoutState;
    expect(state.entries["a"]!.position).toEqual({ x: 10, y: 20 });
    expect(state.entries["a"]!.size).toEqual({ width: 100, height: 80 });
    expect(state.zOrder).toEqual(["a"]);
  });

  it("fires onEntryMove callback on drag", () => {
    const onEntryMove = vi.fn();
    const org = createFreeLayoutStrategy(
      {
        entries: {
          a: {
            position: { x: 0, y: 0 },
            size: { width: 200, height: 150 },
          },
        },
        zOrder: ["a"],
      },
      { onEntryMove },
    );
    org.mount(container, makeEntries("a"), testFactory());

    const frame = container.querySelector("[data-frame-key='a']") as HTMLElement;
    const titlebar = frame.querySelector("[data-frame-titlebar]") as HTMLElement;

    titlebar.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 60, clientY: 80 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(onEntryMove).toHaveBeenCalledWith("a", 50, 70);
  });

  it("fires onEntryResize callback on resize handle drag", () => {
    const onEntryResize = vi.fn();
    const org = createFreeLayoutStrategy(
      {
        entries: {
          a: {
            position: { x: 0, y: 0 },
            size: { width: 200, height: 150 },
          },
        },
        zOrder: ["a"],
      },
      { onEntryResize },
    );
    org.mount(container, makeEntries("a"), testFactory());

    const handle = container.querySelector(
      "[data-resize-handle='se']",
    ) as HTMLElement;

    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 200,
        clientY: 150,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 250, clientY: 200 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(onEntryResize).toHaveBeenCalledWith("a", 250, 200);
  });

  it("addEntry creates new frame", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 0, y: 0 },
          size: { width: 200, height: 150 },
        },
      },
      zOrder: ["a"],
    });
    org.mount(container, makeEntries("a"), testFactory());

    org.addEntry({ key: "b", label: "B" });

    const frames = container.querySelectorAll("[data-frame-key]");
    expect(frames).toHaveLength(2);
  });

  it("removeEntry removes frame", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 0, y: 0 },
          size: { width: 200, height: 150 },
        },
        b: {
          position: { x: 300, y: 0 },
          size: { width: 200, height: 150 },
        },
      },
      zOrder: ["a", "b"],
    });
    org.mount(container, makeEntries("a", "b"), testFactory());

    org.removeEntry("a");

    const frames = container.querySelectorAll("[data-frame-key]");
    expect(frames).toHaveLength(1);
    expect(frames[0]!.getAttribute("data-frame-key")).toBe("b");
  });

  it("clicking a frame brings it to front", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 0, y: 0 },
          size: { width: 200, height: 150 },
        },
        b: {
          position: { x: 50, y: 50 },
          size: { width: 200, height: 150 },
        },
      },
      zOrder: ["a", "b"],
    });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const frameA = container.querySelector(
      "[data-frame-key='a']",
    ) as HTMLElement;
    frameA.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    frameA.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true }),
    );

    const state = org.getState() as FreeLayoutState;
    expect(state.zOrder[state.zOrder.length - 1]).toBe("a");
  });

  it("z-order is reflected in CSS zIndex", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 0, y: 0 },
          size: { width: 200, height: 150 },
        },
        b: {
          position: { x: 50, y: 50 },
          size: { width: 200, height: 150 },
        },
      },
      zOrder: ["a", "b"],
    });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const frameA = container.querySelector(
      "[data-frame-key='a']",
    ) as HTMLElement;
    frameA.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    frameA.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true }),
    );

    const frameB = container.querySelector(
      "[data-frame-key='b']",
    ) as HTMLElement;
    expect(Number(frameA.style.zIndex)).toBeGreaterThan(
      Number(frameB.style.zIndex),
    );
  });

  it("scales frames proportionally on container resize", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: {
          position: { x: 100, y: 100 },
          size: { width: 400, height: 300 },
        },
      },
      zOrder: ["a"],
    });
    org.mount(container, makeEntries("a"), testFactory());

    expect(resizeObserverCallback).not.toBeNull();

    // Baseline is frame bounding box: (100+400+20)=520 x (100+300+20)=420
    // Resize to 1040x840 = 2x baseline
    resizeObserverCallback!([{ contentRect: { width: 1040, height: 840 } }]);

    const state = org.getState() as FreeLayoutState;
    expect(state.entries["a"]!.position.x).toBe(200);
    expect(state.entries["a"]!.position.y).toBe(200);
    expect(state.entries["a"]!.size.width).toBe(800);
    expect(state.entries["a"]!.size.height).toBe(600);
  });

  it("close dot removes the panel entry", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: { position: { x: 0, y: 0 }, size: { width: 200, height: 150 } },
        b: { position: { x: 300, y: 0 }, size: { width: 200, height: 150 } },
      },
      zOrder: ["a", "b"],
    });
    org.mount(container, makeEntries("a", "b"), testFactory());
    expect(container.querySelectorAll("[data-frame-key]")).toHaveLength(2);

    const closeBtn = container.querySelector("[data-frame-key='a'] .frame-close-dot") as HTMLElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(container.querySelectorAll("[data-frame-key]")).toHaveLength(1);
    expect(container.querySelector("[data-frame-key='b']")).not.toBeNull();
  });

  it("pin button brings panel to front and toggles visual", () => {
    const org = createFreeLayoutStrategy({
      entries: {
        a: { position: { x: 0, y: 0 }, size: { width: 200, height: 150 } },
        b: { position: { x: 50, y: 50 }, size: { width: 200, height: 150 } },
      },
      zOrder: ["a", "b"],
    });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const frameA = container.querySelector("[data-frame-key='a']") as HTMLElement;
    const frameB = container.querySelector("[data-frame-key='b']") as HTMLElement;
    expect(Number(frameB.style.zIndex)).toBeGreaterThan(Number(frameA.style.zIndex));

    const pinBtn = frameA.querySelector(".frame-pin-btn") as HTMLElement;
    expect(pinBtn).not.toBeNull();
    pinBtn.click();

    expect(Number(frameA.style.zIndex)).toBeGreaterThan(Number(frameB.style.zIndex));
    expect(pinBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
