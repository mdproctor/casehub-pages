import type { FloatingFrameBackend, BackendAttachOptions, FrameButtonConfig } from "./floating-frame-backend.js";
import type { FrameLayout, FrameTabConfig, ContentFactory, ContentFactoryResult } from "@casehubio/pages-component";

const CSS_MARKER = "data-pages-dockview-css";

export async function createDockviewBackend(): Promise<FloatingFrameBackend> {
  let DockviewComponent: any;
  let themeDark: any;

  try {
    const mod = await import("dockview-core");
    DockviewComponent = mod.DockviewComponent;
    themeDark = mod.themeDark;

    if (!document.querySelector(`style[${CSS_MARKER}]`)) {
      try {
        const cssModule = await import("dockview-core/dist/styles/dockview.css?raw" as string);
        const cssText = typeof cssModule === "string" ? cssModule : (cssModule as any).default;
        if (cssText) {
          const style = document.createElement("style");
          style.setAttribute(CSS_MARKER, "");
          style.textContent = cssText + "\n.dv-resize-container > .dv-groupview .dv-tabs-container { pointer-events: none; }\n.dv-resize-container > .dv-groupview .dv-tabs-container .dv-tab { pointer-events: auto; }\n";
          document.head.appendChild(style);
        }
      } catch {
        // CSS import may fail in test environments — not fatal
      }
    }
  } catch (err) {
    console.error("Failed to load dockview-core:", err);
    return createErrorBackend();
  }

  let dockview: any = null;
  let container: HTMLElement | null = null;
  let factory: ContentFactory | null = null;
  const frameMoveCallbacks: Array<(key: string, pos: { x: number; y: number }) => void> = [];
  const frameResizeCallbacks: Array<(key: string, size: { width: number; height: number }) => void> = [];
  const tabDragOutCallbacks: Array<(fromFrame: string, tabKey: string, position: { x: number; y: number }) => void> = [];
  const tabReorderCallbacks: Array<(frameKey: string, tabKeys: string[]) => void> = [];
  const frameCloseCallbacks: Array<(key: string) => void> = [];
  const framePinCallbacks: Array<(key: string) => void> = [];
  let storedExtraButtons: readonly FrameButtonConfig[] = [];
  const frameGroups = new Map<string, any>();
  const contentResults = new Map<string, ContentFactoryResult>();

  function findFloatingOverlay(frameKey: string): any {
    if (!dockview) return null;
    const group = frameGroups.get(frameKey);
    if (!group) return null;
    const fgs = (dockview as any).floatingGroups;
    return fgs?.find((fg: any) => fg._group === group) ?? null;
  }

  function subscribeOverlayEvents(frameKey: string): void {
    const fg = findFloatingOverlay(frameKey);
    if (!fg?.overlay?.onDidChangeEnd) return;
    fg.overlay.onDidChangeEnd(() => {
      const el = fg.overlay._element ?? fg.overlay.element;
      if (!el || !container) return;
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const pos = { x: rect.left - containerRect.left, y: rect.top - containerRect.top };
      const size = { width: rect.width, height: rect.height };
      for (const cb of frameMoveCallbacks) cb(frameKey, pos);
      for (const cb of frameResizeCallbacks) cb(frameKey, size);
    });
  }

  function injectFrameChrome(group: any, frameKey: string): void {
    const el = group.element ?? group.header?.element?.closest?.(".dv-groupview");
    if (!el) return;
    const titlebar = el.querySelector(".dv-floating-titlebar");
    if (!titlebar) return;

    const closeDot = document.createElement("span");
    closeDot.className = "frame-close-dot";
    closeDot.style.cssText = "width:12px;height:12px;border-radius:50%;background:#ff5f57;cursor:pointer;display:inline-block;margin:0 4px;";
    closeDot.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeDot.addEventListener("click", () => {
      for (const cb of frameCloseCallbacks) cb(frameKey);
    });

    const pinBtn = document.createElement("span");
    pinBtn.className = "frame-pin-btn";
    pinBtn.textContent = "\u{1F4CC}";
    pinBtn.style.cssText = "cursor:pointer;margin:0 4px;font-size:12px;opacity:0.5;";
    pinBtn.setAttribute("aria-pressed", "false");
    pinBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    pinBtn.addEventListener("click", () => {
      for (const cb of framePinCallbacks) cb(frameKey);
    });

    titlebar.prepend(pinBtn);
    titlebar.prepend(closeDot);

    for (const btnConfig of storedExtraButtons) {
      const btn = document.createElement("span");
      btn.className = `frame-extra-btn${btnConfig.className ? ` ${btnConfig.className}` : ""}`;
      btn.textContent = btnConfig.icon;
      btn.title = btnConfig.title;
      btn.style.cssText = "cursor:pointer;margin:0 4px;font-size:12px;";
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", () => btnConfig.onClick(frameKey));
      titlebar.appendChild(btn);
    }
  }

  const backend: FloatingFrameBackend = {
    attach(el: HTMLElement, contentFactory: ContentFactory, options?: BackendAttachOptions) {
      container = el;
      factory = contentFactory;
      storedExtraButtons = options?.extraButtons ?? [];
      dockview = new DockviewComponent(el, {
        createComponent: () => {
          const wrapper = document.createElement("div");
          wrapper.style.cssText = "width:100%;height:100%;overflow:auto;";
          let storedResult: ContentFactoryResult | undefined;
          let storedKey: string | undefined;
          return {
            element: wrapper,
            init(params: any) {
              const tabConfig = params?.params?.tabConfig as FrameTabConfig | undefined;
              if (!tabConfig || !factory) {
                wrapper.textContent = "No content";
                return;
              }
              storedKey = tabConfig.key;
              const result = factory(tabConfig);
              storedResult = result;
              contentResults.set(tabConfig.key, result);
              wrapper.appendChild(result.element);
            },
            dispose() {
              if (storedResult) {
                storedResult.dispose?.();
                if (storedKey) contentResults.delete(storedKey);
                storedResult = undefined;
              }
            },
          };
        },
        theme: { ...themeDark, tabAnimation: "smooth" },
        dndEdges: false,
      });
      const grid = el.querySelector<HTMLElement>(".dv-grid-view.dv-dockview");
      if (grid) grid.style.background = "transparent";
    },

    detach() {
      if (dockview) { dockview.dispose(); dockview = null; }
      container = null;
      factory = null;
      frameGroups.clear();
      contentResults.clear();
    },

    renderFrame(layout: FrameLayout) {
      if (!dockview || layout.tabs.length === 0) return;
      const firstTab = layout.tabs[0]!;
      const panel = dockview.addPanel({
        id: `${layout.key}:${firstTab.key}`,
        component: "default",
        params: { tabConfig: firstTab, frameKey: layout.key },
        title: firstTab.label,
        floating: { width: layout.size.width, height: layout.size.height, x: layout.position.x, y: layout.position.y },
      });
      const group = panel.group;
      frameGroups.set(layout.key, group);

      for (let i = 1; i < layout.tabs.length; i++) {
        const tab = layout.tabs[i]!;
        dockview.addPanel({
          id: `${layout.key}:${tab.key}`,
          component: "default",
          params: { tabConfig: tab, frameKey: layout.key },
          title: tab.label,
          position: { referenceGroup: group },
        });
      }

      if (layout.activeTabKey) {
        const activePanel = dockview.getPanel(`${layout.key}:${layout.activeTabKey}`);
        if (activePanel) activePanel.api.setActive();
      }

      subscribeOverlayEvents(layout.key);
      injectFrameChrome(group, layout.key);
    },

    removeFrame(key: string) {
      const group = frameGroups.get(key);
      if (!group || !dockview) return;
      const panels = [...group.panels];
      for (const p of panels) dockview.removePanel(p);
      frameGroups.delete(key);
    },

    updatePosition(key: string, pos: { x: number; y: number }) {
      const fg = findFloatingOverlay(key);
      if (fg?.overlay) {
        const bounds = fg.overlay.getBounds();
        fg.overlay.setBounds({ ...bounds, left: pos.x, top: pos.y });
      }
    },

    updateSize(key: string, size: { width: number; height: number }) {
      const fg = findFloatingOverlay(key);
      if (fg?.overlay) {
        const bounds = fg.overlay.getBounds();
        fg.overlay.setBounds({ ...bounds, width: size.width, height: size.height });
      }
    },

    bringToFront(key: string) {
      const fg = findFloatingOverlay(key);
      if (fg?.overlay) fg.overlay.bringToFront();
    },

    addTab(frameKey: string, tab: FrameTabConfig) {
      const group = frameGroups.get(frameKey);
      if (!group || !dockview) return;
      dockview.addPanel({
        id: `${frameKey}:${tab.key}`,
        component: "default",
        params: { tabConfig: tab, frameKey },
        title: tab.label,
        position: { referenceGroup: group },
      });
    },

    removeTab(frameKey: string, tabKey: string) {
      if (!dockview) return;
      const panel = dockview.getPanel(`${frameKey}:${tabKey}`);
      if (panel) dockview.removePanel(panel);
    },

    setActiveTab(frameKey: string, tabKey: string) {
      if (!dockview) return;
      const panel = dockview.getPanel(`${frameKey}:${tabKey}`);
      if (panel) panel.api.setActive();
    },

    onFrameMove(cb) { frameMoveCallbacks.push(cb); },
    onFrameResize(cb) { frameResizeCallbacks.push(cb); },
    onTabDragOut(cb) { tabDragOutCallbacks.push(cb); },
    onTabReorder(cb) { tabReorderCallbacks.push(cb); },
    onFrameClose(cb) { frameCloseCallbacks.push(cb); },
    onFramePin(cb) { framePinCallbacks.push(cb); },

    updatePinState(key: string, pinned: boolean) {
      const group = frameGroups.get(key);
      if (!group) return;

      if ("locked" in group) {
        group.locked = pinned;
      }

      const el = group.element ?? group.header?.element?.closest?.(".dv-groupview");
      if (!el) return;

      const titlebar = el.querySelector(".dv-floating-titlebar") as HTMLElement | null;
      if (titlebar) {
        const existingHandler = (titlebar as any).__pinDragLock as ((e: PointerEvent) => void) | undefined;
        if (pinned && !existingHandler) {
          const handler = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest(".frame-close-dot, .frame-pin-btn, .frame-extra-btn")) return;
            e.stopPropagation();
          };
          titlebar.addEventListener("pointerdown", handler, { capture: true });
          (titlebar as any).__pinDragLock = handler;
        } else if (!pinned && existingHandler) {
          titlebar.removeEventListener("pointerdown", existingHandler, { capture: true });
          delete (titlebar as any).__pinDragLock;
        }
      }

      const pinBtn = el.querySelector(".frame-pin-btn") as HTMLElement | null;
      if (pinBtn) {
        pinBtn.style.opacity = pinned ? "1" : "0.5";
        pinBtn.setAttribute("aria-pressed", String(pinned));
        pinBtn.classList.toggle("frame-pin-active", pinned);
      }
    },

    dispose() {
      if (dockview) { dockview.dispose(); dockview = null; }
      frameGroups.clear();
      contentResults.clear();
      frameMoveCallbacks.length = 0;
      frameResizeCallbacks.length = 0;
      tabDragOutCallbacks.length = 0;
      tabReorderCallbacks.length = 0;
      frameCloseCallbacks.length = 0;
      framePinCallbacks.length = 0;
    },

    unwrap() { return dockview ?? null; },
  };

  return backend;
}

function createErrorBackend(): FloatingFrameBackend {
  return {
    attach(container: HTMLElement) {
      const div = document.createElement("div");
      div.className = "pages-floating-workspace-error";
      div.textContent = "Floating workspace failed to load";
      div.style.cssText = "padding:24px;color:#ff5f57;text-align:center;";
      container.appendChild(div);
    },
    detach() {},
    renderFrame() {}, removeFrame() {}, updatePosition() {}, updateSize() {}, bringToFront() {},
    addTab() {}, removeTab() {}, setActiveTab() {},
    onFrameMove() {}, onFrameResize() {}, onTabDragOut() {}, onTabReorder() {},
    onFrameClose() {}, onFramePin() {},
    updatePinState() {},
    dispose() {},
    unwrap() { return null; },
  };
}
