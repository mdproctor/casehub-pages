import type { ContentFactory, FrameLayout, FrameTabConfig } from "@casehubio/pages-component";
import type { FloatingFrameBackend, FrameButtonConfig } from "./floating-frame-backend.js";
import { createFloatingFrameEngine } from "./floating-frame-engine.js";
import type { FloatingFrameEngine } from "./floating-frame-engine.js";
import { createFrameDetachHandler, type FrameDetachHandler } from "./frame-detach-handler.js";
import { createFrameZonePicker } from "./frame-zone-picker.js";
import { injectAnimationStyles } from "./frame-animations.js";
import type { Preset } from "./frame-organisers.js";
import {
  createContainerToolbar as createContainerToolbar,
  type ContainerToolbar,
} from "./frame-sandbox/container-toolbar";
import type { Layout, Entry } from "./frame-sandbox/types.js";
import { createContainer } from "./frame-sandbox/index.js";

export interface WireOptions {
  readonly detachEnabled?: boolean | undefined;
  readonly contentFactory?: ContentFactory | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly getNestedEngine?: ((tabKey: string) => FloatingFrameEngine | undefined) | undefined;
  readonly existingEngine?: FloatingFrameEngine | undefined;
}

export interface WireHandle {
  readonly engine: FloatingFrameEngine;
  readonly detachHandler?: FrameDetachHandler | undefined;
  readonly zonePickerButton?: FrameButtonConfig | undefined;
  readonly containerToolbar?: ContainerToolbar | undefined;
  setContentFactory(factory: ContentFactory): void;
  applyViewMode(key: string): void;
  dispose(): void;
}

export function wireFloatingWorkspace(
  backend: FloatingFrameBackend,
  container: HTMLElement,
  savedLayout?: readonly FrameLayout[],
  options?: WireOptions,
): WireHandle {
  const engine = options?.existingEngine ?? createFloatingFrameEngine(backend, savedLayout);

  backend.onFrameMove((key, pos) => {
    engine.updatePosition(key, pos);
    backend.updatePosition(key, pos);
    container.dispatchEvent(new CustomEvent("pages-frame-move", {
      bubbles: true, composed: true,
      detail: { frameKey: key, position: pos },
    }));
  });

  backend.onFrameResize((key, size) => {
    engine.updateSize(key, size);
    backend.updateSize(key, size);
    container.dispatchEvent(new CustomEvent("pages-frame-resize", {
      bubbles: true, composed: true,
      detail: { frameKey: key, size },
    }));
  });

  backend.onFrameClose((key) => {
    engine.removeFrame(key);
    container.dispatchEvent(new CustomEvent("pages-frame-close", {
      bubbles: true, composed: true,
      detail: { frameKey: key },
    }));
  });

  backend.onFramePin((key) => {
    engine.togglePin(key);
    const frame = engine.frames.get(key);
    const pinned = frame?.pinned ?? false;
    backend.updatePinState(key, pinned);
    container.dispatchEvent(new CustomEvent("pages-frame-pin", {
      bubbles: true, composed: true,
      detail: { frameKey: key, pinned },
    }));
  });

  backend.onTabDragOut((fromFrame, tabKey, position) => {
    const frame = engine.frames.get(fromFrame);
    const tab = frame?.tabs.find(t => t.key === tabKey);
    if (!tab) return;
    engine.removeTab(fromFrame, tabKey);
    const newKey = `frame-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`;
    engine.createFrame({ key: newKey, tabs: [tab], position, size: { width: 400, height: 300 } });
    const srcFrame = engine.frames.get(fromFrame);
    const srcFrameEl = backend.getFrameElement(fromFrame);
    if (srcFrame && srcFrame.tabs.length === 0 && !srcFrameEl?.querySelector("[data-split-container]")) {
      engine.removeFrame(fromFrame);
    }
    container.dispatchEvent(new CustomEvent("pages-tab-drag-out", {
      bubbles: true, composed: true,
      detail: { tabKey, fromFrame, position },
    }));
  });

  backend.onEdgeSplit((fromFrame, tabKey, targetFrame, zone) => {
    if (fromFrame !== targetFrame) {
      engine.removeTab(fromFrame, tabKey, { skipBackend: true });
      const sourceAfter = engine.frames.get(fromFrame);
      const srcEl = backend.getFrameElement(fromFrame);
      if (sourceAfter && sourceAfter.tabs.length === 0 && !srcEl?.querySelector("[data-split-container]")) {
        engine.removeFrame(fromFrame);
      }
    }
    container.dispatchEvent(new CustomEvent("pages-edge-split", {
      bubbles: true, composed: true,
      detail: { fromFrame, tabKey, targetFrame, zone },
    }));
  });

  backend.onTabReorder((frameKey, tabKeys) => {
    engine.reorderTabs(frameKey, tabKeys);
    container.dispatchEvent(new CustomEvent("pages-tab-reorder", {
      bubbles: true, composed: true,
      detail: { frameKey, tabKeys },
    }));
  });

  injectAnimationStyles();

  let detachHandler: FrameDetachHandler | undefined;

  if (options?.detachEnabled !== false && options?.contentFactory && options?.signal) {
    detachHandler = createFrameDetachHandler(engine, container, options.contentFactory, options.signal);
    backend.onDetach((frameKey) => { detachHandler!.detach(frameKey); });
  }

  let zonePickerButton: FrameButtonConfig | undefined;
  if (options?.signal) {
    zonePickerButton = createFrameZonePicker(engine, backend, container, options.signal);
  }

  if (options?.getNestedEngine) {
    const getNestedEngine = options.getNestedEngine;
    backend.onArrangement((frameKey, preset) => {
      const frame = engine.frames.get(frameKey);
      if (!frame) return;
      const nestedEngine = getNestedEngine(frame.activeTabKey);
      if (!nestedEngine) return;
      const frameEl = backend.getFrameElement(frameKey);
      if (!frameEl) return;
      nestedEngine.applyOrganiser(preset as Preset, { width: frameEl.clientWidth, height: frameEl.clientHeight });
    });
  }

  // Container handles layout changes internally — sync engine state only
  backend.onLayoutChange((frameKey: string, layout: string) => {
    const frame = engine.frames.get(frameKey);
    if (!frame) return;
    if (layout === "accordion" && frame.viewMode !== "accordion") {
      engine.toggleViewMode(frameKey);
    } else if (layout !== "accordion" && frame.viewMode === "accordion") {
      engine.toggleViewMode(frameKey);
    }
  });

  // Legacy: onViewModeToggle still registered but Container-based frames
  // handle layout changes internally. This handles any external callers.
  backend.onViewModeToggle((key: string) => {
    engine.toggleViewMode(key);
  });

  let addTabCounter = 0;
  backend.onAddTab((key: string) => {
    addTabCounter++;
    const tabKey = `tab-${String(Date.now())}-${String(addTabCounter)}`;
    const newTab: FrameTabConfig = {
      key: tabKey,
      label: `Tab ${String((engine.frames.get(key)?.tabs.length ?? 0) + 1)}`,
      content: { type: "html" as const, props: { content: `<div style="padding:12px"><h3>New Tab</h3><p>Empty workspace tab.</p></div>` } },
    };
    engine.addTab(key, newTab);
  });

  backend.onTabRemoved((frameKey: string, tabKey: string) => {
    const frame = engine.frames.get(frameKey);
    if (!frame || !frame.tabs.some(t => t.key === tabKey)) return;
    try { engine.removeTab(frameKey, tabKey); } catch { /* engine already disposed */ }
    const after = engine.frames.get(frameKey);
    const frameEl = backend.getFrameElement(frameKey);
    if (after && after.tabs.length === 0 && !frameEl?.querySelector("[data-split-container]")) {
      engine.removeFrame(frameKey);
    }
  });

  let workspaceContainer: ReturnType<typeof import("./frame-sandbox/index.js").createContainer> | null = null;
  let workspaceMode: Layout = "free";
  let wsHostEl: HTMLElement | null = null;
  let storedContentFactory: ContentFactory | null = null;

  function hideFrames(): void {
    for (const [key] of engine.frames) {
      const frameEl = backend.getFrameElement(key);
      if (frameEl) frameEl.style.display = "none";
    }
  }

  function showFrames(): void {
    for (const [key] of engine.frames) {
      const frameEl = backend.getFrameElement(key);
      if (frameEl) frameEl.style.display = "";
    }
  }

  function buildWorkspaceContainer(initialLayout: Layout): void {
    const entries: Entry[] = [];
    for (const [key, frame] of engine.frames) {
      if (frame.hidden) continue;
      const rootContainer = backend.getRootContainer(key);
      if (rootContainer) rootContainer.unmount();
      entries.push({
        key,
        label: frame.tabs[0]?.label ?? key,
        childContainer: rootContainer ?? undefined,
      });
    }

    workspaceContainer = createContainer({
      entries,
      layout: initialLayout,
      contentFactory: (entry) => {
        if (entry.childContainer) {
          const el = document.createElement("div");
          el.style.cssText = "display:flex;flex-direction:column;height:100%;";
          entry.childContainer.mount(el);
          return { element: el, dispose: () => { entry.childContainer!.unmount(); } };
        }
        const el = document.createElement("div");
        el.style.cssText = "padding:12px;";
        el.textContent = entry.label;
        return { element: el };
      },
      policy: { allowedLayouts: ["free", "tabbed", "accordion"], maxDepth: 5 },
      depth: 2,
    });

    wsHostEl = document.createElement("div");
    wsHostEl.setAttribute("data-workspace-container", "");
    wsHostEl.style.cssText = "position:absolute;inset:0;z-index:9999;background:var(--pages-neutral-2,#1e1e1e);overflow:auto;pointer-events:auto;";
    workspaceContainer.mount(wsHostEl);
    const wsParent = container.parentElement ?? container;
    wsParent.appendChild(wsHostEl);
  }

  let wsToolbar: ContainerToolbar | null = null;

  function applyWorkspaceMode(targetMode: Layout): void {
    if (targetMode === workspaceMode) return;

    if (workspaceMode !== "free" && targetMode !== "free" && workspaceContainer) {
      workspaceContainer.setLayout(targetMode);
      workspaceMode = targetMode;
      wsToolbar?.setActive(targetMode);
      return;
    }

    if (workspaceMode === "free" && targetMode !== "free") {
      hideFrames();
      const liveFrames = engine.captureLayout();
      const visibleFrames = liveFrames.filter(f => !f.hidden);
      const topFrameKey = visibleFrames.length > 0
        ? visibleFrames.reduce((a, b) => a.zIndex > b.zIndex ? a : b).key
        : "";

      if (workspaceContainer) {
        workspaceContainer.dispose();
        workspaceContainer = null;
      }
      wsHostEl?.remove();
      wsHostEl = null;

      buildWorkspaceContainer(targetMode);

      const hostAfterBuild = wsHostEl as HTMLElement | null;
      if (topFrameKey && hostAfterBuild) {
        const tabBtn = hostAfterBuild.querySelector(`[data-tab-key="${topFrameKey}"]`) as HTMLElement | null;
        if (tabBtn) {
          tabBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          document.dispatchEvent(new PointerEvent("pointerup"));
        }
      }
      workspaceMode = targetMode;
      wsToolbar?.setActive(targetMode);
      return;
    }

    if (workspaceMode !== "free" && targetMode === "free") {
      if (workspaceContainer) {
        workspaceContainer.dispose();
        workspaceContainer = null;
      }
      wsHostEl?.remove();
      wsHostEl = null;

      for (const [key] of engine.frames) {
        const frameEl = backend.getFrameElement(key);
        if (!frameEl) continue;
        const tabContentEl = frameEl.querySelector("[data-frame-body]") as HTMLElement | null;
        if (!tabContentEl) continue;
        const rootContainer = backend.getRootContainer(key);
        if (rootContainer) rootContainer.mount(tabContentEl);
      }

      showFrames();
      workspaceMode = targetMode;
      wsToolbar?.setActive(targetMode);
    }
  }

  const containerToolbar = createContainerToolbar(
    ["free", "tabbed", "accordion"] as readonly Layout[],
    "free" as Layout,
    {
      onAdd: () => {
        addTabCounter++;
        const frameKey = `frame-${String(Date.now())}-${String(addTabCounter)}`;
        const tab: FrameTabConfig = {
          key: `tab-${frameKey}`,
          label: `Tab 1`,
          content: { type: "html" as const, props: { content: `<div style="padding:12px"><h3>New Frame</h3><p>Empty workspace frame.</p></div>` } },
        };
        engine.createFrame({
          key: frameKey,
          tabs: [tab],
          position: { x: 50 + (engine.frames.size * 30), y: 50 + (engine.frames.size * 30) },
          size: { width: 400, height: 300 },
        });
      },
      onLayoutChange: (type) => {
        applyWorkspaceMode(type);
      },
      onArrange: (preset) => {
        const canvasSize = { width: container.clientWidth, height: container.clientHeight };
        engine.applyOrganiser(preset as Preset, canvasSize);
      },
    },
  );

  return {
    engine,
    detachHandler,
    zonePickerButton,
    containerToolbar,
    setContentFactory(factory: ContentFactory) {
      storedContentFactory = factory;
    },
    applyViewMode(_key: string) {
      // No-op: Container handles layout changes internally.
      // Kept for backward compatibility with activation.ts.
    },
    dispose() {
      if (workspaceContainer) { workspaceContainer.dispose(); workspaceContainer = null; }
      wsHostEl?.remove();
      wsHostEl = null;
      containerToolbar.dispose();
      detachHandler?.dispose();
      engine.dispose();
    },
  };
}
