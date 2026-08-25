import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFloatingFrameEngine } from "./floating-frame-engine.js";
import type { FloatingFrameEngine } from "./floating-frame-engine.js";
import type { FloatingFrameBackend } from "./floating-frame-backend.js";
import type { FrameConfig, FrameTabConfig } from "@casehubio/pages-component";

function mockBackend(): FloatingFrameBackend {
  return {
    attach: vi.fn(), detach: vi.fn(),
    renderFrame: vi.fn(), removeFrame: vi.fn(),
    updatePosition: vi.fn(), updateSize: vi.fn(), bringToFront: vi.fn(),
    addTab: vi.fn(), removeTab: vi.fn(), setActiveTab: vi.fn(),
    onFrameMove: vi.fn(), onFrameResize: vi.fn(), onTabDragOut: vi.fn(), onTabReorder: vi.fn(),
    onFrameClose: vi.fn(), onFramePin: vi.fn(),
    onFrameDragMove: vi.fn(), onTitlebarDoubleClick: vi.fn(), onViewModeToggle: vi.fn(), onAddTab: vi.fn(), onTabRemoved: vi.fn(), onArrangement: vi.fn(), onDetach: vi.fn(),
    onCrossFrameDrop: vi.fn(), onEdgeSplit: vi.fn(), onLayoutChange: vi.fn(), setFrameLayout: vi.fn(),
    updatePinState: vi.fn(),
    getFrameElement: vi.fn(() => null),
    getSubFrameElements: vi.fn(() => []),
    getTabContentElement: vi.fn(() => null),
    captureContainerTree: vi.fn(() => undefined),
    getRootContainer: vi.fn(() => null),
    dispose: vi.fn(), unwrap: vi.fn(() => null),
  };
}

function makeTab(key: string): FrameTabConfig {
  return { key, label: key, content: { type: "html", props: { content: `<div>${key}</div>` } } };
}

function makeFrameConfig(key: string, tabKeys = ["tab1"]): FrameConfig {
  return { key, tabs: tabKeys.map(makeTab) };
}

describe("FloatingFrameEngine", () => {
  let backend: FloatingFrameBackend;
  let engine: FloatingFrameEngine;

  beforeEach(() => {
    backend = mockBackend();
    engine = createFloatingFrameEngine(backend);
  });

  describe("frame lifecycle", () => {
    it("creates a frame", () => {
      const layout = engine.createFrame(makeFrameConfig("f1"));
      expect(layout.key).toBe("f1");
      expect(engine.frames.size).toBe(1);
      expect(backend.renderFrame).toHaveBeenCalledOnce();
    });

    it("assigns sequential orders", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.createFrame(makeFrameConfig("f2"));
      expect(engine.frames.get("f1")!.order).toBe(0);
      expect(engine.frames.get("f2")!.order).toBe(1);
    });

    it("uses default size when not specified", () => {
      const layout = engine.createFrame(makeFrameConfig("f1"));
      expect(layout.size).toEqual({ width: 400, height: 300 });
    });

    it("uses provided position and size", () => {
      const layout = engine.createFrame({
        ...makeFrameConfig("f1"),
        position: { x: 100, y: 200 },
        size: { width: 500, height: 400 },
      });
      expect(layout.position).toEqual({ x: 100, y: 200 });
      expect(layout.size).toEqual({ width: 500, height: 400 });
    });

    it("removes a frame", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.removeFrame("f1");
      expect(engine.frames.size).toBe(0);
      expect(backend.removeFrame).toHaveBeenCalledWith("f1");
    });

    it("removes unknown frame is a no-op", () => {
      engine.removeFrame("unknown");
      expect(backend.removeFrame).not.toHaveBeenCalled();
    });
  });

  describe("hide/show", () => {
    it("hides a frame", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.hideFrame("f1");
      expect(engine.frames.get("f1")!.hidden).toBe(true);
      expect(backend.removeFrame).toHaveBeenCalledWith("f1");
    });

    it("shows a hidden frame", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.hideFrame("f1");
      engine.showFrame("f1");
      expect(engine.frames.get("f1")!.hidden).toBe(false);
      expect(backend.renderFrame).toHaveBeenCalledTimes(2);
    });

    it("show on non-hidden frame is a no-op", () => {
      engine.createFrame(makeFrameConfig("f1"));
      const renderCount = (backend.renderFrame as ReturnType<typeof vi.fn>).mock.calls.length;
      engine.showFrame("f1");
      expect(backend.renderFrame).toHaveBeenCalledTimes(renderCount);
    });
  });

  describe("tab management", () => {
    it("adds a tab", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1"]));
      engine.addTab("f1", makeTab("t2"));
      expect(engine.frames.get("f1")!.tabs).toHaveLength(2);
      expect(backend.addTab).toHaveBeenCalled();
    });

    it("removes a tab", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2"]));
      engine.removeTab("f1", "t1");
      expect(engine.frames.get("f1")!.tabs).toHaveLength(1);
      expect(engine.frames.get("f1")!.tabs[0]!.key).toBe("t2");
    });

    it("updates activeTabKey when active tab is removed", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2"]));
      engine.setActiveTab("f1", "t1");
      engine.removeTab("f1", "t1");
      expect(engine.frames.get("f1")!.activeTabKey).toBe("t2");
    });

    it("moves tab between frames", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2"]));
      engine.createFrame(makeFrameConfig("f2", ["t3"]));
      engine.moveTab("f1", "t1", "f2");
      expect(engine.frames.get("f1")!.tabs).toHaveLength(1);
      expect(engine.frames.get("f2")!.tabs).toHaveLength(2);
    });

    it("sets active tab", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2"]));
      engine.setActiveTab("f1", "t2");
      expect(engine.frames.get("f1")!.activeTabKey).toBe("t2");
      expect(backend.setActiveTab).toHaveBeenCalledWith("f1", "t2");
    });

    it("reorders tabs", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2", "t3"]));
      engine.reorderTabs("f1", ["t3", "t1", "t2"]);
      const tabs = engine.frames.get("f1")!.tabs.map(t => t.key);
      expect(tabs).toEqual(["t3", "t1", "t2"]);
    });

    it("reorderTabs is no-op when keys don't match", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2"]));
      engine.reorderTabs("f1", ["t1"]);
      const tabs = engine.frames.get("f1")!.tabs.map(t => t.key);
      expect(tabs).toEqual(["t1", "t2"]);
    });

    it("removeTab cleans accordionState", () => {
      engine.createFrame({ ...makeFrameConfig("f1", ["t1", "t2"]), viewMode: "accordion" });
      engine.setAccordionState("f1", { collapsed: ["t1"], heights: { t1: 100, t2: 200 } });
      engine.removeTab("f1", "t1");
      const state = engine.frames.get("f1")!.accordionState!;
      expect(state.collapsed).toEqual([]);
      expect(state.heights).toEqual({ t2: 200 });
    });

    it("addTab with skipBackend does not call backend.addTab", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1"]));
      engine.addTab("f1", makeTab("t2"), { skipBackend: true });
      expect(engine.frames.get("f1")!.tabs).toHaveLength(2);
      expect(backend.addTab).not.toHaveBeenCalled();
    });

    it("removeTab with skipBackend does not call backend.removeTab", () => {
      engine.createFrame(makeFrameConfig("f1", ["t1", "t2"]));
      engine.removeTab("f1", "t2", { skipBackend: true });
      expect(engine.frames.get("f1")!.tabs).toHaveLength(1);
      expect(engine.frames.get("f1")!.tabs[0]!.key).toBe("t1");
      expect(backend.removeTab).not.toHaveBeenCalled();
    });

    it("addTab preserves accordionState in accordion mode", () => {
      engine.createFrame({ ...makeFrameConfig("f1", ["t1"]), viewMode: "accordion" });
      engine.setAccordionState("f1", { collapsed: [], heights: { t1: 200 } });
      engine.addTab("f1", makeTab("t2"));
      expect(engine.frames.get("f1")!.accordionState).toBeDefined();
    });
  });

  describe("z-index and pin", () => {
    it("toggles pin", () => {
      engine.createFrame(makeFrameConfig("f1"));
      expect(engine.frames.get("f1")!.pinned).toBe(false);
      engine.togglePin("f1");
      expect(engine.frames.get("f1")!.pinned).toBe(true);
      engine.togglePin("f1");
      expect(engine.frames.get("f1")!.pinned).toBe(false);
    });

    it("bringToFront updates z-index", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.createFrame(makeFrameConfig("f2"));
      const z1Before = engine.frames.get("f1")!.zIndex;
      engine.bringToFront("f1");
      expect(engine.frames.get("f1")!.zIndex).toBeGreaterThan(z1Before);
    });
  });

  describe("spatial navigation", () => {
    it("finds frame in direction from topmost frame", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 0, y: 0 }, size: { width: 400, height: 300 } });
      engine.createFrame({ ...makeFrameConfig("f2"), position: { x: 500, y: 0 }, size: { width: 400, height: 300 } });
      engine.bringToFront("f1");
      const target = engine.focusDirection("right");
      expect(target).toBe("f2");
    });
  });

  describe("organisers", () => {
    it("applies preset", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 0, y: 0 }, size: { width: 400, height: 300 } });
      engine.createFrame({ ...makeFrameConfig("f2"), position: { x: 0, y: 0 }, size: { width: 400, height: 300 } });
      engine.applyOrganiser("side-by-side");
      expect(engine.frames.get("f1")!.position.x).not.toBe(engine.frames.get("f2")!.position.x);
      expect(backend.updatePosition).toHaveBeenCalled();
    });
  });

  describe("serialization", () => {
    it("captures layout", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.createFrame(makeFrameConfig("f2"));
      const captured = engine.captureLayout();
      expect(captured).toHaveLength(2);
      expect(captured[0]!.key).toBe("f1");
      expect(captured[1]!.key).toBe("f2");
    });

    it("restores layout", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.createFrame(makeFrameConfig("f2"));
      const captured = engine.captureLayout();

      const engine2 = createFloatingFrameEngine(mockBackend(), captured);
      expect(engine2.frames.size).toBe(2);
      expect(engine2.frames.get("f1")!.key).toBe("f1");
    });

    it("captures hidden frames", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.hideFrame("f1");
      const captured = engine.captureLayout();
      expect(captured).toHaveLength(1);
      expect(captured[0]!.hidden).toBe(true);
    });

    it("does not render hidden frames on restore", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.hideFrame("f1");
      const captured = engine.captureLayout();

      const backend2 = mockBackend();
      createFloatingFrameEngine(backend2, captured);
      expect(backend2.renderFrame).not.toHaveBeenCalled();
    });
  });

  describe("position/size sync", () => {
    it("updatePosition updates frame position without backend call", () => {
      engine.createFrame(makeFrameConfig("f1"));
      (backend.updatePosition as ReturnType<typeof vi.fn>).mockClear();
      engine.updatePosition("f1", { x: 200, y: 300 });
      expect(engine.frames.get("f1")!.position).toEqual({ x: 200, y: 300 });
      expect(backend.updatePosition).not.toHaveBeenCalled();
    });

    it("updateSize updates frame size without backend call", () => {
      engine.createFrame(makeFrameConfig("f1"));
      (backend.updateSize as ReturnType<typeof vi.fn>).mockClear();
      engine.updateSize("f1", { width: 600, height: 500 });
      expect(engine.frames.get("f1")!.size).toEqual({ width: 600, height: 500 });
      expect(backend.updateSize).not.toHaveBeenCalled();
    });

    it("updatePosition on unknown key is a no-op", () => {
      engine.updatePosition("unknown", { x: 0, y: 0 });
      expect(engine.frames.size).toBe(0);
    });

    it("updateSize on unknown key is a no-op", () => {
      engine.updateSize("unknown", { width: 0, height: 0 });
      expect(engine.frames.size).toBe(0);
    });

    it("captureLayout reflects updated position after updatePosition", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.updatePosition("f1", { x: 999, y: 888 });
      const saved = engine.captureLayout();
      expect(saved[0]!.position).toEqual({ x: 999, y: 888 });
    });

    it("captureLayout reflects updated size after updateSize", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.updateSize("f1", { width: 777, height: 666 });
      const saved = engine.captureLayout();
      expect(saved[0]!.size).toEqual({ width: 777, height: 666 });
    });
  });

  describe("dispose", () => {
    it("disposes backend", () => {
      engine.dispose();
      expect(backend.dispose).toHaveBeenCalledOnce();
    });

    it("throws after dispose", () => {
      engine.dispose();
      expect(() => engine.createFrame(makeFrameConfig("f1"))).toThrow("disposed");
    });

    it("toggleViewMode throws after dispose", () => {
      engine.dispose();
      expect(() => engine.toggleViewMode("f1")).toThrow("disposed");
    });

    it("setAccordionState throws after dispose", () => {
      engine.dispose();
      expect(() => engine.setAccordionState("f1", { collapsed: [], heights: {} })).toThrow("disposed");
    });

    it("dispose is idempotent", () => {
      engine.dispose();
      engine.dispose();
      expect(backend.dispose).toHaveBeenCalledOnce();
    });
  });

  describe("setDetached", () => {
    it("marks frame as detached", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.setDetached("f1", true);
      expect(engine.frames.get("f1")!.detached).toBe(true);
    });

    it("clears detached flag", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.setDetached("f1", true);
      engine.setDetached("f1", false);
      expect(engine.frames.get("f1")!.detached).toBe(false);
    });

    it("is no-op for unknown key", () => {
      engine.setDetached("unknown", true);
      expect(engine.frames.size).toBe(0);
    });
  });

  describe("snapFrame / unsnapFrame", () => {
    it("sets snappedZone and updates position/size", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.snapFrame("f1", "left", { width: 1000, height: 800 });
      const f = engine.frames.get("f1")!;
      expect(f.snappedZone).toBe("left");
      expect(f.position).toEqual({ x: 0, y: 0 });
      expect(f.size.width).toBe(496);
      expect(backend.updatePosition).toHaveBeenCalledWith("f1", { x: 0, y: 0 });
      expect(backend.updateSize).toHaveBeenCalledWith("f1", expect.objectContaining({ width: 496 }));
    });

    it("captures pre-snap state and restores on unsnap", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 100, y: 200 }, size: { width: 300, height: 250 } });
      engine.snapFrame("f1", "right", { width: 1000, height: 800 });
      engine.unsnapFrame("f1");
      const f = engine.frames.get("f1")!;
      expect(f.snappedZone).toBeUndefined();
      expect(f.position).toEqual({ x: 100, y: 200 });
      expect(f.size).toEqual({ width: 300, height: 250 });
    });

    it("unsnapFrame is no-op when not snapped", () => {
      engine.createFrame(makeFrameConfig("f1"));
      const before = engine.frames.get("f1")!;
      engine.unsnapFrame("f1");
      expect(engine.frames.get("f1")!.position).toEqual(before.position);
    });

    it("restoreLayout clears preSnapState", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 100, y: 200 }, size: { width: 300, height: 250 } });
      engine.snapFrame("f1", "left", { width: 1000, height: 800 });
      const saved = [{
        key: "f1", order: 0, position: { x: 50, y: 50 }, size: { width: 400, height: 300 },
        zIndex: 1, pinned: false, hidden: false,
        tabs: [makeTab("t1")], activeTabKey: "t1",
      }];
      engine.restoreLayout(saved);
      engine.snapFrame("f1", "right", { width: 1000, height: 800 });
      engine.unsnapFrame("f1");
      expect(engine.frames.get("f1")!.position).toEqual({ x: 50, y: 50 });
    });

    it("snap to different zone without unsnap updates zone", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 100, y: 200 }, size: { width: 300, height: 250 } });
      engine.snapFrame("f1", "left", { width: 1000, height: 800 });
      engine.snapFrame("f1", "right", { width: 1000, height: 800 });
      const f = engine.frames.get("f1")!;
      expect(f.snappedZone).toBe("right");
      engine.unsnapFrame("f1");
      expect(engine.frames.get("f1")!.position).toEqual({ x: 100, y: 200 });
    });
  });

  describe("recomputeSnappedFrames", () => {
    it("recomputes position/size for snapped frames on resize", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.snapFrame("f1", "left", { width: 1000, height: 800 });
      engine.recomputeSnappedFrames({ width: 1200, height: 900 });
      const f = engine.frames.get("f1")!;
      expect(f.size.width).toBe(596);
      expect(f.size.height).toBe(900);
    });

    it("does not touch unsnapped frames", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 100, y: 100 } });
      engine.recomputeSnappedFrames({ width: 1200, height: 900 });
      expect(engine.frames.get("f1")!.position).toEqual({ x: 100, y: 100 });
    });
  });

  describe("setBackend + renderAll (persistent engine)", () => {
    it("setBackend swaps to new backend", () => {
      engine.createFrame(makeFrameConfig("f1"));
      const backend2 = mockBackend();
      engine.setBackend(backend2);
      engine.createFrame(makeFrameConfig("f2"));
      expect(backend2.renderFrame).toHaveBeenCalledOnce();
      expect(backend.dispose).toHaveBeenCalledOnce();
    });

    it("renderAll re-renders all visible frames into current backend", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.createFrame(makeFrameConfig("f2"));
      engine.hideFrame("f2");
      const backend2 = mockBackend();
      engine.setBackend(backend2);
      engine.renderAll();
      expect(backend2.renderFrame).toHaveBeenCalledOnce();
      const rendered = (backend2.renderFrame as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(rendered.key).toBe("f1");
    });

    it("positions survive backend swap", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), position: { x: 20, y: 20 } });
      engine.updatePosition("f1", { x: 100, y: 200 });
      const backend2 = mockBackend();
      engine.setBackend(backend2);
      engine.renderAll();
      const rendered = (backend2.renderFrame as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(rendered.position).toEqual({ x: 100, y: 200 });
    });
  });

  describe("viewMode", () => {
    it("copies viewMode from config to layout", () => {
      const frame = engine.createFrame({ ...makeFrameConfig("f1"), viewMode: "accordion" });
      expect(frame.viewMode).toBe("accordion");
    });

    it("defaults viewMode to undefined when not specified", () => {
      const frame = engine.createFrame(makeFrameConfig("f1"));
      expect(frame.viewMode).toBeUndefined();
    });

    it("toggleViewMode switches between tab and accordion", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.toggleViewMode("f1");
      expect(engine.frames.get("f1")?.viewMode).toBe("accordion");
      engine.toggleViewMode("f1");
      expect(engine.frames.get("f1")?.viewMode).toBeUndefined();
    });

    it("setAccordionState stores collapsed and heights", () => {
      engine.createFrame(makeFrameConfig("f1"));
      engine.setAccordionState("f1", { collapsed: ["tab1"], heights: { tab1: 200 } });
      expect(engine.frames.get("f1")?.accordionState).toEqual({ collapsed: ["tab1"], heights: { tab1: 200 } });
    });

    it("captureLayout preserves viewMode and accordionState", () => {
      engine.createFrame({ ...makeFrameConfig("f1"), viewMode: "accordion" });
      engine.setAccordionState("f1", { collapsed: ["tab1"], heights: { tab1: 200 } });
      const layout = engine.captureLayout();
      expect(layout[0]!.viewMode).toBe("accordion");
      expect(layout[0]!.accordionState).toEqual({ collapsed: ["tab1"], heights: { tab1: 200 } });
    });

    it("restoreLayout preserves viewMode", () => {
      const saved = [{
        key: "f1", order: 0, position: { x: 0, y: 0 }, size: { width: 400, height: 300 },
        zIndex: 1, pinned: false, hidden: false, viewMode: "accordion" as const,
        tabs: [makeTab("t1")],
        activeTabKey: "t1",
      }];
      engine.restoreLayout(saved);
      expect(engine.frames.get("f1")?.viewMode).toBe("accordion");
    });
  });
});
