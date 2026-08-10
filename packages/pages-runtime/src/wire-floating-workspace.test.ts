import { describe, it, expect, beforeEach, vi } from "vitest";
import { wireFloatingWorkspace } from "./wire-floating-workspace.js";
import type { FloatingFrameBackend } from "./floating-frame-backend.js";
import type { FrameTabConfig, FrameLayout } from "@casehubio/pages-component";

function makeTab(key: string): FrameTabConfig {
  return { key, label: key, content: { type: "html", props: { content: `<div>${key}</div>` } } };
}

type Callback<T extends unknown[]> = (...args: T) => void;

function mockBackend(): FloatingFrameBackend & {
  _fireMove: (key: string, pos: { x: number; y: number }) => void;
  _fireResize: (key: string, size: { width: number; height: number }) => void;
  _fireClose: (key: string) => void;
  _firePin: (key: string) => void;
  _fireTabDragOut: (fromFrame: string, tabKey: string, pos: { x: number; y: number }) => void;
  _fireTabReorder: (frameKey: string, tabKeys: string[]) => void;
} {
  const moveCbs: Callback<[string, { x: number; y: number }]>[] = [];
  const resizeCbs: Callback<[string, { width: number; height: number }]>[] = [];
  const closeCbs: Callback<[string]>[] = [];
  const pinCbs: Callback<[string]>[] = [];
  const tabDragOutCbs: Callback<[string, string, { x: number; y: number }]>[] = [];
  const tabReorderCbs: Callback<[string, string[]]>[] = [];

  return {
    attach: vi.fn(), detach: vi.fn(),
    renderFrame: vi.fn(), removeFrame: vi.fn(),
    updatePosition: vi.fn(), updateSize: vi.fn(), bringToFront: vi.fn(),
    addTab: vi.fn(), removeTab: vi.fn(), setActiveTab: vi.fn(),
    onFrameMove(cb) { moveCbs.push(cb); },
    onFrameResize(cb) { resizeCbs.push(cb); },
    onTabDragOut(cb) { tabDragOutCbs.push(cb); },
    onTabReorder(cb) { tabReorderCbs.push(cb); },
    onFrameClose(cb) { closeCbs.push(cb); },
    onFramePin(cb) { pinCbs.push(cb); },
    updatePinState: vi.fn(),
    dispose: vi.fn(), unwrap: vi.fn(() => null),
    _fireMove(key, pos) { for (const cb of moveCbs) cb(key, pos); },
    _fireResize(key, size) { for (const cb of resizeCbs) cb(key, size); },
    _fireClose(key) { for (const cb of closeCbs) cb(key); },
    _firePin(key) { for (const cb of pinCbs) cb(key); },
    _fireTabDragOut(from, tab, pos) { for (const cb of tabDragOutCbs) cb(from, tab, pos); },
    _fireTabReorder(fk, tks) { for (const cb of tabReorderCbs) cb(fk, tks); },
  };
}

describe("wireFloatingWorkspace", () => {
  let backend: ReturnType<typeof mockBackend>;
  let container: HTMLElement;

  beforeEach(() => {
    backend = mockBackend();
    container = document.createElement("div");
  });

  it("creates an engine and returns a WireHandle", () => {
    const handle = wireFloatingWorkspace(backend, container);
    expect(handle.engine).toBeDefined();
    expect(handle.engine.frames.size).toBe(0);
  });

  it("restores saved layout", () => {
    const saved = [{
      key: "f1", order: 0, position: { x: 10, y: 20 }, size: { width: 400, height: 300 },
      zIndex: 1, pinned: false, hidden: false, tabs: [makeTab("t1")], activeTabKey: "t1",
    }] as const;
    const handle = wireFloatingWorkspace(backend, container, saved);
    expect(handle.engine.frames.size).toBe(1);
  });

  describe("onFrameMove", () => {
    it("updates engine position and dispatches event", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1")] });

      const events: CustomEvent[] = [];
      container.addEventListener("pages-frame-move", ((e: Event) => events.push(e as CustomEvent)));

      backend._fireMove("f1", { x: 200, y: 300 });
      expect(handle.engine.frames.get("f1")!.position).toEqual({ x: 200, y: 300 });
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ frameKey: "f1", position: { x: 200, y: 300 } });
    });
  });

  describe("onFrameResize", () => {
    it("updates engine size and dispatches event", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1")] });

      const events: CustomEvent[] = [];
      container.addEventListener("pages-frame-resize", ((e: Event) => events.push(e as CustomEvent)));

      backend._fireResize("f1", { width: 600, height: 500 });
      expect(handle.engine.frames.get("f1")!.size).toEqual({ width: 600, height: 500 });
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ frameKey: "f1", size: { width: 600, height: 500 } });
    });
  });

  describe("onFrameClose", () => {
    it("removes frame from engine and dispatches event", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1")] });

      const events: CustomEvent[] = [];
      container.addEventListener("pages-frame-close", ((e: Event) => events.push(e as CustomEvent)));

      backend._fireClose("f1");
      expect(handle.engine.frames.size).toBe(0);
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ frameKey: "f1" });
    });
  });

  describe("onFramePin", () => {
    it("toggles pin on engine, calls updatePinState, and dispatches event", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1")] });

      const events: CustomEvent[] = [];
      container.addEventListener("pages-frame-pin", ((e: Event) => events.push(e as CustomEvent)));

      backend._firePin("f1");
      expect(handle.engine.frames.get("f1")!.pinned).toBe(true);
      expect(backend.updatePinState).toHaveBeenCalledWith("f1", true);
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ frameKey: "f1", pinned: true });

      backend._firePin("f1");
      expect(handle.engine.frames.get("f1")!.pinned).toBe(false);
      expect(backend.updatePinState).toHaveBeenCalledWith("f1", false);
      expect(events).toHaveLength(2);
      expect(events[1]!.detail).toEqual({ frameKey: "f1", pinned: false });
    });
  });

  describe("onTabDragOut", () => {
    it("creates new frame, moves tab, and dispatches event", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1"), makeTab("t2")] });

      const events: CustomEvent[] = [];
      container.addEventListener("pages-tab-drag-out", ((e: Event) => events.push(e as CustomEvent)));

      backend._fireTabDragOut("f1", "t2", { x: 100, y: 100 });

      expect(handle.engine.frames.get("f1")!.tabs).toHaveLength(1);
      expect(handle.engine.frames.size).toBe(2);
      expect(events).toHaveLength(1);
      expect(events[0]!.detail.tabKey).toBe("t2");
      expect(events[0]!.detail.fromFrame).toBe("f1");
    });

    it("auto-closes source frame when last tab dragged out", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1")] });

      backend._fireTabDragOut("f1", "t1", { x: 100, y: 100 });

      expect(handle.engine.frames.has("f1")).toBe(false);
    });
  });

  describe("onTabReorder", () => {
    it("dispatches event", () => {
      const handle = wireFloatingWorkspace(backend, container);

      const events: CustomEvent[] = [];
      container.addEventListener("pages-tab-reorder", ((e: Event) => events.push(e as CustomEvent)));

      backend._fireTabReorder("f1", ["t2", "t1"]);
      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ frameKey: "f1", tabKeys: ["t2", "t1"] });
    });
  });

  describe("dispose", () => {
    it("disposes the engine", () => {
      const handle = wireFloatingWorkspace(backend, container);
      handle.dispose();
      expect(() => handle.engine.createFrame({ key: "f1", tabs: [makeTab("t1")] })).toThrow("Engine is disposed");
    });
  });
});
