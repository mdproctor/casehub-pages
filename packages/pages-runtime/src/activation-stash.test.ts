import { describe, it, expect, vi } from "vitest";
import type { Component, FrameLayout } from "@casehubio/pages-component";
import { ALLOW_ALL } from "@casehubio/pages-component";
import type { FloatingFrameBackend } from "./floating-frame-backend.js";
import type { FloatingFrameEngine } from "./floating-frame-engine.js";
import { createFloatingFrameEngine } from "./floating-frame-engine.js";
import type { ComponentRegistry } from "./registry.js";
import type { PagePathMap } from "./page-paths.js";

function mockBackend(): FloatingFrameBackend {
  return {
    attach: vi.fn(), detach: vi.fn(),
    renderFrame: vi.fn(), removeFrame: vi.fn(),
    updatePosition: vi.fn(), updateSize: vi.fn(), bringToFront: vi.fn(),
    addTab: vi.fn(), removeTab: vi.fn(), setActiveTab: vi.fn(),
    onFrameMove: vi.fn(), onFrameResize: vi.fn(), onTabDragOut: vi.fn(), onTabReorder: vi.fn(),
    onFrameClose: vi.fn(), onFramePin: vi.fn(),
    onFrameDragMove: vi.fn(), onTitlebarDoubleClick: vi.fn(), onViewModeToggle: vi.fn(),
    onAddTab: vi.fn(), onTabRemoved: vi.fn(), onArrangement: vi.fn(), onDetach: vi.fn(),
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

vi.mock("./group-organiser-backend.js", () => ({
  createGroupOrganiserBackend: vi.fn(() => mockBackend()),
}));

const { createActivationCallback } = await import("./activation.js");

describe("floating-workspace persistent engine", () => {
  it("reuses existing engine from ref — positions survive recreation", async () => {
    const registry: ComponentRegistry = new Map();
    const pagePathMap: PagePathMap = new Map();

    const existingBackend = mockBackend();
    const existingEngine = createFloatingFrameEngine(existingBackend);
    existingEngine.createFrame({
      key: "outline",
      tabs: [{ key: "outline-tab", label: "Outline", content: { type: "html", props: { content: "" } } }],
      position: { x: 100, y: 200 },
      size: { width: 500, height: 400 },
    });
    existingEngine.updatePosition("outline", { x: 150, y: 250 });

    const wsRef: { engine: FloatingFrameEngine | undefined; stash: readonly FrameLayout[] | undefined } = {
      engine: existingEngine,
      stash: undefined,
    };

    const callback = createActivationCallback(registry, pagePathMap, {
      nestingDepth: 0,
      permissions: ALLOW_ALL,
      floatingWorkspaceRef: wsRef,
      pageIndex: new Map(),
      dataSetScope: new Map(),
      dataScopeRegistry: { get: () => undefined, set: () => {} },
      saveConfigRegistry: { has: () => false, get: () => undefined, set: () => {} },
      lazyPageResolutions: new Map(),
      fetchFn: globalThis.fetch,
      baseUrl: undefined,
      abortSignal: new AbortController().signal,
    } as any);

    const component: Component = {
      type: "floating-workspace",
      props: {
        centre: { type: "html", props: { content: "" } },
        frames: [{
          key: "outline",
          tabs: [{ key: "outline-tab", label: "Outline", content: { type: "html", props: { content: "" } } }],
          position: { x: 20, y: 20 },
          size: { width: 300, height: 200 },
        }],
      },
    };

    const el = document.createElement("div");
    el.dataset.componentId = "test-fw";
    el.dataset.componentType = "floating-workspace";
    pagePathMap.set(component, "test");
    callback(el, component);

    await vi.waitFor(() => {
      expect((existingBackend.dispose as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });

    const frame = wsRef.engine?.frames.get("outline");
    expect(frame).toBeDefined();
    expect(frame!.position).toEqual({ x: 150, y: 250 });
  });

  it("creates from config when no existing engine", async () => {
    const registry: ComponentRegistry = new Map();
    const pagePathMap: PagePathMap = new Map();

    const wsRef: { engine: FloatingFrameEngine | undefined; stash: readonly FrameLayout[] | undefined } = {
      engine: undefined,
      stash: undefined,
    };

    const callback = createActivationCallback(registry, pagePathMap, {
      nestingDepth: 0,
      permissions: ALLOW_ALL,
      floatingWorkspaceRef: wsRef,
      pageIndex: new Map(),
      dataSetScope: new Map(),
      dataScopeRegistry: { get: () => undefined, set: () => {} },
      saveConfigRegistry: { has: () => false, get: () => undefined, set: () => {} },
      lazyPageResolutions: new Map(),
      fetchFn: globalThis.fetch,
      baseUrl: undefined,
      abortSignal: new AbortController().signal,
    } as any);

    const component: Component = {
      type: "floating-workspace",
      props: {
        centre: { type: "html", props: { content: "" } },
        frames: [{
          key: "outline",
          tabs: [{ key: "outline-tab", label: "Outline", content: { type: "html", props: { content: "" } } }],
          position: { x: 20, y: 20 },
          size: { width: 300, height: 200 },
        }],
      },
    };

    const el = document.createElement("div");
    el.dataset.componentId = "test-fw2";
    el.dataset.componentType = "floating-workspace";
    pagePathMap.set(component, "test2");
    callback(el, component);

    await vi.waitFor(() => {
      expect(wsRef.engine).toBeDefined();
    });

    const frame = wsRef.engine!.frames.get("outline");
    expect(frame).toBeDefined();
    expect(frame!.position).toEqual({ x: 20, y: 20 });
  });
});
