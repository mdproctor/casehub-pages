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
    updatePinState: vi.fn(),
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

    it("dispose is idempotent", () => {
      engine.dispose();
      engine.dispose();
      expect(backend.dispose).toHaveBeenCalledOnce();
    });
  });
});
