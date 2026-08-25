import type {
  FrameLayout,
  FrameTabConfig,
  ContentFactory,
  ContainerState,
} from "@casehubio/pages-component";
import type {
  FloatingFrameBackend,
  BackendAttachOptions,
  FrameButtonConfig,
} from "./floating-frame-backend.js";
import {
  createContainer,
  containerizeEntry,
  DEFAULT_POLICY,
  SPLIT_POLICY,
  type Container,
  type ContainerConfig,
  type Entry,
  type ContentFactory as SandboxContentFactory,
  type LayoutCallbacks,
  type Layout,
} from "./frame-sandbox/index.js";
import { detectEdgeZone, edgeToDirection, type EdgeZone } from "./frame-boundaries.js";
import { injectFrameChrome, updatePinVisual } from "./frame-chrome.js";
import { createFrameShell, createFrameTitlebar, createFrameResizeHandles, wireTitlebarDrag } from "./frame-shell.js";
import {
  isSplitLayout,
  findLeafContainer,
  findContainerWithTab,
  forEachLeafContainer,
  findParentOf,
  captureContainerState,
  restoreContainerFromState,
} from "./container-tree-ops.js";
import type { FrameState } from "./frame-state.js";

type MoveCb = (key: string, pos: { x: number; y: number }) => void;
type ResizeCb = (
  key: string,
  size: { width: number; height: number },
) => void;
type TabDragOutCb = (
  fromFrame: string,
  tabKey: string,
  position: { x: number; y: number },
) => void;
type TabReorderCb = (frameKey: string, tabKeys: string[]) => void;
type FrameKeyCb = (key: string) => void;
type DragMoveCb = (key: string, pos: { x: number; y: number }) => void;
type TabRemovedCb = (frameKey: string, tabKey: string) => void;
type LayoutChangeCb = (frameKey: string, layout: Layout) => void;

const D = (...args: unknown[]) => console.debug("[compositor]", ...args);

export function createGroupOrganiserBackend(): FloatingFrameBackend {
  let containerEl: HTMLElement | null = null;
  let contentFactory: ContentFactory | null = null;
  let extraButtons: readonly FrameButtonConfig[] = [];

  const frames = new Map<string, FrameState>();
  let zOrder: string[] = [];
  let lastContainerSize: { width: number; height: number } | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const moveCbs: MoveCb[] = [];
  const resizeCbs: ResizeCb[] = [];
  const tabDragOutCbs: TabDragOutCb[] = [];
  const tabReorderCbs: TabReorderCb[] = [];
  const closeCbs: FrameKeyCb[] = [];
  const pinCbs: FrameKeyCb[] = [];
  const dragMoveCbs: DragMoveCb[] = [];
  const dblClickCbs: FrameKeyCb[] = [];
  const viewModeCbs: FrameKeyCb[] = [];
  const addTabCbs: FrameKeyCb[] = [];
  const tabRemovedCbs: TabRemovedCb[] = [];
  const arrangementCbs: ((frameKey: string, preset: string) => void)[] = [];
  const detachCbs: FrameKeyCb[] = [];
  const crossFrameDropCbs: ((
    fromFrame: string,
    tabKey: string,
    toFrame: string,
  ) => void)[] = [];
  const edgeSplitCbs: ((fromFrame: string, tabKey: string, targetFrame: string, zone: EdgeZone) => void)[] = [];
  const layoutChangeCbs: LayoutChangeCb[] = [];
  let suppressEntryClose = false;

  let dragState: {
    sourceFrame: string;
    tabKey: string;
    ghost: HTMLElement;
    targetFrame?: string | undefined;
  } | null = null;
  let crossFramePreview: {
    frameKey: string;
    placeholder: HTMLElement;
    insertIndex: number;
  } | null = null;

  function cleanupCrossFramePreview(): void {
    if (crossFramePreview) {
      crossFramePreview.placeholder.remove();
      crossFramePreview = null;
    }
    if (dragState) dragState.targetFrame = undefined;
  }

  let edgeSplitPreview: {
    frameKey: string;
    zone: EdgeZone;
    overlay: HTMLElement;
    targetLeaf?: Container;
  } | null = null;

  const EDGE_THRESHOLD = 40;

  function cleanupEdgeSplitPreview(): void {
    if (edgeSplitPreview) {
      edgeSplitPreview.overlay.remove();
      edgeSplitPreview = null;
    }
  }

  function showEdgeSplitOverlay(frameKey: string, zone: EdgeZone, targetEl: HTMLElement, targetLeaf?: Container): void {
    const state = frames.get(frameKey);
    if (!state) return;

    if (edgeSplitPreview?.frameKey === frameKey && edgeSplitPreview?.zone === zone) return;
    cleanupEdgeSplitPreview();

    const overlay = document.createElement("div");
    overlay.setAttribute("data-edge-split-overlay", zone);
    overlay.style.cssText =
      "position:absolute;pointer-events:none;" +
      "background:var(--pages-accent-3,#3b82f6);opacity:0.2;z-index:9999;";

    const frameRect = state.frameEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const top = targetRect.top - frameRect.top;
    const left = targetRect.left - frameRect.left;

    switch (zone) {
      case "left":
        overlay.style.top = `${top}px`; overlay.style.left = `${left}px`;
        overlay.style.width = `${EDGE_THRESHOLD}px`; overlay.style.height = `${targetRect.height}px`;
        break;
      case "right":
        overlay.style.top = `${top}px`; overlay.style.left = `${left + targetRect.width - EDGE_THRESHOLD}px`;
        overlay.style.width = `${EDGE_THRESHOLD}px`; overlay.style.height = `${targetRect.height}px`;
        break;
      case "top":
        overlay.style.top = `${top}px`; overlay.style.left = `${left}px`;
        overlay.style.width = `${targetRect.width}px`; overlay.style.height = `${EDGE_THRESHOLD}px`;
        break;
      case "bottom":
        overlay.style.top = `${top + targetRect.height - EDGE_THRESHOLD}px`; overlay.style.left = `${left}px`;
        overlay.style.width = `${targetRect.width}px`; overlay.style.height = `${EDGE_THRESHOLD}px`;
        break;
    }

    state.frameEl.appendChild(overlay);
    edgeSplitPreview = targetLeaf
      ? { frameKey, zone, overlay, targetLeaf }
      : { frameKey, zone, overlay };
    D("edge-highlight", { frame: frameKey, zone });
  }

  let paneCounter = 0;
  function nextPaneKey(): string {
    return `pane-${String(++paneCounter)}`;
  }

  const FRAME_POLICY = { allowedLayouts: ["free" as Layout, "tabbed" as Layout, "accordion" as Layout], maxDepth: DEFAULT_POLICY.maxDepth };

  function createLeafContainer(frameKey: string, entries: Entry[]): Container {
    const callbacks = createTabCallbacksForFrame(frameKey);
    return createContainer({
      entries,
      layout: "tabbed" as Layout,
      contentFactory: wrapContentFactory(frameKey),
      callbacks,
      policy: FRAME_POLICY,
      onLayoutChange: (type) => {
        for (const cb of layoutChangeCbs) cb(frameKey, type);
      },
    });
  }

  function createSplitContainer(
    frameKey: string,
    direction: "splith" | "splitv",
    childEntries: Array<{ key: string; child: Container }>,
  ): Container {
    const entries: Entry[] = childEntries.map(({ key, child }) => ({
      key,
      label: key,
      childContainer: child,
    }));

    return createContainer({
      entries,
      layout: direction,
      contentFactory: (entry: Entry) => {
        if (entry.childContainer) {
          const child = entry.childContainer;
          const el = document.createElement("div");
          el.style.cssText = "display:flex;flex-direction:column;height:100%;";
          child.mount(el);
          return { element: el, dispose: () => { child.dispose(); } };
        }
        return { element: document.createElement("div") };
      },
      policy: SPLIT_POLICY,
      showToolbar: false,
      onCollapse: (remainingEntry) => {
        const state = frames.get(frameKey);
        if (!state) return;
        const remainingChild = remainingEntry.childContainer;
        if (!remainingChild) return;

        const collapsingContainer = findContainerWithTab(state.rootContainer, remainingEntry.key);

        if (collapsingContainer === state.rootContainer) {
          remainingChild.unmount();
          remainingEntry.childContainer = undefined;
          while (state.tabContentEl.firstChild) {
            state.tabContentEl.removeChild(state.tabContentEl.firstChild);
          }
          state.rootContainer = remainingChild;
          remainingChild.mount(state.tabContentEl);
          D("split-collapse root", { frame: frameKey, surviving: remainingEntry.key });
        } else if (collapsingContainer) {
          const parentInfo = findParentOf(state.rootContainer, collapsingContainer);
          if (parentInfo) {
            remainingChild.unmount();
            remainingEntry.childContainer = undefined;
            parentInfo.entry.childContainer = remainingChild;
            parentInfo.entry.contentDispose = undefined;
            parentInfo.container.refreshEntry(parentInfo.entry.key);
            D("split-collapse nested", { frame: frameKey, surviving: remainingEntry.key, parent: parentInfo.entry.key });
          }
        }
      },
    });
  }

  function handleEmptyLeaf(frameKey: string, leafContainer: Container): void {
    const state = frames.get(frameKey);
    if (!state) return;

    if (leafContainer === state.rootContainer) {
      D("empty-source → remove frame", { frame: frameKey });
      state.rootContainer.dispose();
      state.frameEl.remove();
      frames.delete(frameKey);
      zOrder = zOrder.filter(k => k !== frameKey);
      applyZOrder();
      for (const cb of closeCbs) cb(frameKey);
      return;
    }

    const parentInfo = findParentOf(state.rootContainer, leafContainer);
    if (parentInfo) {
      D("empty-source → remove pane", { frame: frameKey, paneKey: parentInfo.entry.key });
      parentInfo.container.removeEntry(parentInfo.entry.key);
    }
  }

  function createTabCallbacksForFrame(frameKey: string): LayoutCallbacks {
    return {
      onEntryReorder(keys) {
        for (const cb of tabReorderCbs) cb(frameKey, keys);
      },
      onTabDragStart(_tabKey, ghost) {
        D("drag-start", { frame: frameKey, tab: _tabKey });
        dragState = { sourceFrame: frameKey, tabKey: _tabKey, ghost };
      },
      onTabDragMove(_tabKey, x, y) {
        handleCrossFrameDragMove(frameKey, x, y);
      },
      onTabDragEnd() {
        if (dragState?.targetFrame) {
          const targetKey = dragState.targetFrame;
          const tabKey = dragState.tabKey;
          const insertIdx = crossFramePreview?.insertIndex ?? -1;
          D("drop-on-strip", { tab: tabKey, from: frameKey, to: targetKey, insertIdx });

          const targetState = frames.get(targetKey);
          const sourceState = frames.get(frameKey);

          const targetLeaf = targetState ? findDropTargetContainer(targetState) : null;

          cleanupCrossFramePreview();
          cleanupEdgeSplitPreview();
          dragState = null;

          if (sourceState && targetState) {
            const sourceContainer = findContainerWithTab(sourceState.rootContainer, tabKey);
            if (!sourceContainer) return;
            const entry = sourceContainer.entries.find(e => e.key === tabKey);
            if (!entry) return;

            suppressEntryClose = true;
            sourceContainer.removeEntry(tabKey);
            suppressEntryClose = false;
            if (targetLeaf) {
              const targetIdx = insertIdx >= 0 && insertIdx <= targetLeaf.entries.length
                ? insertIdx : targetLeaf.entries.length;
              targetLeaf.addEntry(entry, targetIdx);

              const targetEl = targetState.tabContentEl;
              const droppedBtn = targetEl.querySelector(
                `[data-tab-key="${entry.key}"]`,
              ) as HTMLElement | null;
              if (droppedBtn) {
                droppedBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
                document.dispatchEvent(new PointerEvent("pointerup"));
              }
            }

            D("drop-on-strip done", { tab: tabKey, srcRemaining: sourceContainer.entries.length, tgtTabs: targetLeaf?.entries.length });
            for (const cb of crossFrameDropCbs) cb(frameKey, tabKey, targetKey);

            if (sourceContainer.entries.length === 0) {
              D("source-empty after strip drop", { frame: frameKey });
              handleEmptyLeaf(frameKey, sourceContainer);
            }
          }
        } else if (edgeSplitPreview) {
          const { frameKey: targetFrame, zone, targetLeaf: paneLeaf } = edgeSplitPreview;
          const tabKey = dragState?.tabKey ?? "";
          D("drop-on-edge", { tab: tabKey, from: frameKey, target: targetFrame, zone });
          cleanupEdgeSplitPreview();
          cleanupCrossFramePreview();
          dragState = null;
          splitFrame(frameKey, tabKey, targetFrame, zone, paneLeaf);
          for (const cb of edgeSplitCbs) cb(frameKey, tabKey, targetFrame, zone);
        } else {
          D("drag-cancelled", { frame: frameKey, tab: dragState?.tabKey });
          cleanupCrossFramePreview();
          cleanupEdgeSplitPreview();
          dragState = null;
        }
      },
      onTabDragOut(tabKey, x, y) {
        if (dragState?.targetFrame) return;
        if (edgeSplitPreview) return;
        D("drag-out", { frame: frameKey, tab: tabKey, x: Math.round(x), y: Math.round(y) });
        dragState = null;
        let relX = x;
        let relY = y;
        if (containerEl) {
          const rect = containerEl.getBoundingClientRect();
          relX = x - rect.left;
          relY = y - rect.top;
        }
        for (const cb of tabDragOutCbs) cb(frameKey, tabKey, { x: relX, y: relY });
      },
      onEntryClose(tabKey) {
        if (suppressEntryClose) return;
        D("tab-close", { frame: frameKey, tab: tabKey });
        const state = frames.get(frameKey);
        if (!state) return;
        const leaf = findContainerWithTab(state.rootContainer, tabKey);
        if (leaf) {
          leaf.removeEntry(tabKey);
          for (const cb of tabRemovedCbs) cb(frameKey, tabKey);
          if (leaf.entries.length === 0 && leaf !== state.rootContainer) {
            handleEmptyLeaf(frameKey, leaf);
          }
        } else {
          for (const cb of tabRemovedCbs) cb(frameKey, tabKey);
        }
      },
    };
  }

  function findDropTargetContainer(state: FrameState): Container | null {
    if (isSplitLayout(state.rootContainer.organiser.type)) {
      return findLeafContainer(state.rootContainer, (c) => {
        const el = getContainerElement(state, c);
        if (!el) return false;
        return !!el.querySelector("[data-tab-strip] [data-tab-preview]");
      });
    }
    return state.rootContainer;
  }

  function getContainerElement(state: FrameState, container: Container): HTMLElement | null {
    if (container === state.rootContainer) return state.tabContentEl;
    const parentInfo = findParentOf(state.rootContainer, container);
    if (parentInfo) {
      const pane = state.tabContentEl.querySelector(`[data-split-pane="${parentInfo.entry.key}"]`);
      return pane as HTMLElement | null;
    }
    return null;
  }

  function splitFrame(
    fromFrameKey: string,
    tabKey: string,
    targetFrameKey: string,
    zone: EdgeZone,
    targetLeaf?: Container,
  ): void {
    const targetState = frames.get(targetFrameKey);
    if (!targetState) return;

    const sourceState = frames.get(fromFrameKey);
    if (!sourceState) return;

    const sourceContainer = findContainerWithTab(sourceState.rootContainer, tabKey);
    if (!sourceContainer) return;
    const entryIdx = sourceContainer.entries.findIndex(e => e.key === tabKey);
    if (entryIdx === -1) return;
    const droppedEntry = sourceContainer.entries[entryIdx]!;

    suppressEntryClose = true;
    sourceContainer.removeEntry(tabKey);
    suppressEntryClose = false;

    if (fromFrameKey !== targetFrameKey && sourceContainer.entries.length === 0) {
      handleEmptyLeaf(fromFrameKey, sourceContainer);
    }

    const direction: Layout = (zone === "left" || zone === "right") ? "splith" : "splitv";
    const droppedKey = nextPaneKey();
    const originalKey = nextPaneKey();
    const droppedContainer = createLeafContainer(targetFrameKey, [droppedEntry]);

    if (targetLeaf && targetLeaf !== targetState.rootContainer) {
      const parentInfo = findParentOf(targetState.rootContainer, targetLeaf);
      if (parentInfo) {
        targetLeaf.unmount();
        const children = (zone === "left" || zone === "top")
          ? [{ key: droppedKey, child: droppedContainer }, { key: originalKey, child: targetLeaf }]
          : [{ key: originalKey, child: targetLeaf }, { key: droppedKey, child: droppedContainer }];
        const newSplit = createSplitContainer(targetFrameKey, direction as "splith" | "splitv", children);
        parentInfo.entry.childContainer = newSplit;
        parentInfo.entry.contentDispose = undefined;
        parentInfo.container.refreshEntry(parentInfo.entry.key);
        D("splitFrame pane-level", { frame: targetFrameKey, dir: direction, pane: parentInfo.entry.key });
      }
    } else {
      targetState.rootContainer.unmount();
      const originalContainer = targetState.rootContainer;
      const children = (zone === "left" || zone === "top")
        ? [{ key: droppedKey, child: droppedContainer }, { key: originalKey, child: originalContainer }]
        : [{ key: originalKey, child: originalContainer }, { key: droppedKey, child: droppedContainer }];
      const splitContainer = createSplitContainer(targetFrameKey, direction as "splith" | "splitv", children);
      targetState.rootContainer = splitContainer;
      splitContainer.mount(targetState.tabContentEl);
      D("splitFrame root-level", { frame: targetFrameKey, dir: direction });
    }

    if (fromFrameKey === targetFrameKey && sourceContainer.entries.length === 0 && sourceContainer !== (targetLeaf ?? targetState.rootContainer)) {
      handleEmptyLeaf(targetFrameKey, sourceContainer);
    }
  }

  function handleCrossFrameDragMove(
    sourceFrame: string,
    x: number,
    y: number,
  ): void {
    let foundTarget: string | undefined;

    for (const [key, state] of frames) {
      const strips: HTMLElement[] = [];

      if (isSplitLayout(state.rootContainer.organiser.type)) {
        const dragTabKey = dragState?.tabKey ?? "";
        forEachLeafContainer(state.rootContainer, (leaf) => {
          if (leaf.entries.some(e => e.key === dragTabKey)) return;
          const el = getContainerElement(state, leaf);
          if (!el) return;
          const strip = el.querySelector("[data-tab-strip]") as HTMLElement | null;
          if (strip) strips.push(strip);
        });
      } else if (key !== sourceFrame) {
        const s = state.tabContentEl.querySelector("[data-tab-strip]") as HTMLElement | null;
        if (s) strips.push(s);
      }

      let matchedStrip: HTMLElement | null = null;
      for (const strip of strips) {
        const rect = strip.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top - 15 && y <= rect.bottom + 15) {
          matchedStrip = strip;
          break;
        }
      }
      if (!matchedStrip) continue;

      foundTarget = key;

      if (!crossFramePreview || crossFramePreview.frameKey !== key) {
        cleanupCrossFramePreview();
        const placeholder = document.createElement("button");
        placeholder.setAttribute("data-tab-preview", "");
        const sourceState = frames.get(sourceFrame);
        let dragEntry: Entry | undefined;
        if (sourceState) {
          const srcContainer = findContainerWithTab(sourceState.rootContainer, dragState?.tabKey ?? "");
          dragEntry = srcContainer?.entries.find(e => e.key === dragState?.tabKey);
        }
        placeholder.textContent = dragEntry?.label ?? dragState?.tabKey ?? "";
        placeholder.style.cssText =
          "padding:4px 12px;border:none;" +
          "background:var(--pages-surface-3,#333);" +
          "color:var(--pages-text-1,#e0e0e0);" +
          "opacity:0.5;pointer-events:none;" +
          "border-bottom:2px solid transparent;" +
          "transition:all 0.15s ease;";
        const sentinel = matchedStrip.querySelector("[data-container-toolbar], [data-toolbar-actions]");
        if (sentinel) {
          matchedStrip.insertBefore(placeholder, sentinel);
        } else {
          matchedStrip.appendChild(placeholder);
        }
        crossFramePreview = { frameKey: key, placeholder, insertIndex: -1 };
      }

      const buttons = [...matchedStrip.querySelectorAll("[data-tab-key]")] as HTMLElement[];
      const placeholder = crossFramePreview!.placeholder;
      let insertBefore: HTMLElement | null = null;
      let idx = buttons.length;
      for (let i = 0; i < buttons.length; i++) {
        const bRect = buttons[i]!.getBoundingClientRect();
        const mid = bRect.left + bRect.width / 2;
        if (x < mid) {
          insertBefore = buttons[i]!;
          idx = i;
          break;
        }
      }
      crossFramePreview!.insertIndex = idx;
      if (insertBefore) {
        matchedStrip.insertBefore(placeholder, insertBefore);
      } else {
        const toolbarSentinel = matchedStrip.querySelector("[data-container-toolbar], [data-toolbar-actions]");
        if (toolbarSentinel) {
          matchedStrip.insertBefore(placeholder, toolbarSentinel);
        } else if (placeholder.nextSibling) {
          matchedStrip.appendChild(placeholder);
        }
      }

      break;
    }

    if (!foundTarget) {
      cleanupCrossFramePreview();

      let edgeHit: { frameKey: string; zone: EdgeZone; targetEl: HTMLElement; targetLeaf?: Container } | null = null;

      for (const [key, state] of frames) {
        if (key === sourceFrame && !isSplitLayout(state.rootContainer.organiser.type) && state.rootContainer.entries.length < 2) continue;

        if (isSplitLayout(state.rootContainer.organiser.type)) {
          forEachLeafContainer(state.rootContainer, (leaf) => {
            if (edgeHit) return;

            const dragTabKey = dragState?.tabKey ?? "";
            const isSourcePane = leaf.entries.some(e => e.key === dragTabKey);
            if (isSourcePane && leaf.entries.length < 2) return;

            const el = getContainerElement(state, leaf);
            if (!el) return;
            const contentEl = el.querySelector("[data-tab-content]") as HTMLElement | null;
            if (!contentEl) return;

            const contentRect = contentEl.getBoundingClientRect();
            const zone = detectEdgeZone({ x, y }, contentRect, EDGE_THRESHOLD);
            if (zone) {
              edgeHit = { frameKey: key, zone, targetEl: contentEl, targetLeaf: leaf };
            }
          });
        } else {
          const contentEl = state.tabContentEl.querySelector("[data-tab-content]") as HTMLElement | null;
          if (contentEl) {
            const contentRect = contentEl.getBoundingClientRect();
            const zone = detectEdgeZone({ x, y }, contentRect, EDGE_THRESHOLD);
            if (zone) {
              edgeHit = { frameKey: key, zone, targetEl: contentEl };
            }
          }
        }

        if (edgeHit) break;
      }

      if (edgeHit) {
        showEdgeSplitOverlay(edgeHit.frameKey, edgeHit.zone, edgeHit.targetEl, edgeHit.targetLeaf);
      } else {
        cleanupEdgeSplitPreview();
      }
    } else {
      cleanupEdgeSplitPreview();
    }

    if (dragState) dragState.targetFrame = foundTarget ?? undefined;
  }

  function applyZOrder(): void {
    zOrder = zOrder.filter((k) => frames.has(k));
    for (let i = 0; i < zOrder.length; i++) {
      frames.get(zOrder[i]!)!.frameEl.style.zIndex = String(i + 1);
    }
  }

  function computeFrameBounds(): { width: number; height: number } {
    let maxRight = 0;
    let maxBottom = 0;
    for (const state of frames.values()) {
      const right = state.position.x + state.size.width;
      const bottom = state.position.y + state.size.height;
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return { width: maxRight + 20, height: maxBottom + 20 };
  }

  function handleContainerResize(newWidth: number, newHeight: number): void {
    if (!lastContainerSize || lastContainerSize.width === 0 || lastContainerSize.height === 0 || frames.size === 0) {
      const bounds = computeFrameBounds();
      lastContainerSize = bounds.width > 20 ? bounds : { width: newWidth, height: newHeight };
      if (Math.abs(newWidth - lastContainerSize.width) < 1 && Math.abs(newHeight - lastContainerSize.height) < 1) return;
    }
    const scaleX = newWidth / lastContainerSize.width;
    const scaleY = newHeight / lastContainerSize.height;
    if (Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) return;

    for (const state of frames.values()) {
      state.position = {
        x: Math.round(state.position.x * scaleX),
        y: Math.round(state.position.y * scaleY),
      };
      state.size = {
        width: Math.round(state.size.width * scaleX),
        height: Math.round(state.size.height * scaleY),
      };
      state.frameEl.style.left = `${state.position.x}px`;
      state.frameEl.style.top = `${state.position.y}px`;
      state.frameEl.style.width = `${state.size.width}px`;
      state.frameEl.style.height = `${state.size.height}px`;
    }
    lastContainerSize = { width: newWidth, height: newHeight };
  }

  function bringToFrontInternal(key: string): void {
    zOrder = zOrder.filter((k) => k !== key);
    zOrder.push(key);
    applyZOrder();
  }

  function wrapContentFactory(frameKey: string): SandboxContentFactory {
    return (entry: Entry): { element: HTMLElement; dispose?: () => void } => {
      if (!contentFactory) {
        return { element: document.createElement("div") };
      }

      if (entry.childContainer) {
        const child = entry.childContainer;
        const el = document.createElement("div");
        el.style.cssText = "display:flex;flex-direction:column;height:100%;";
        child.mount(el);
        return { element: el, dispose: () => { child.dispose(); } };
      }

      const tabConfig: FrameTabConfig = {
        key: entry.key,
        label: entry.label,
        content: entry.component ?? { type: "html", props: {} },
      };
      const result = contentFactory(tabConfig);

      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-content-wrapper", "");
      wrapper.style.cssText = "position:relative;height:100%;overflow:auto;";
      wrapper.appendChild(result.element);

      const btn = document.createElement("button");
      btn.setAttribute("data-nest-button", "");
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", "Nest content into tabbed container");
      btn.textContent = "⊞";
      btn.title = "Nest";
      btn.style.cssText = "position:absolute;bottom:8px;right:8px;z-index:10;padding:4px 8px;border:1px solid var(--pages-border-1,#333);background:var(--pages-surface-2,#222);color:var(--pages-text-2,#aaa);border-radius:4px;cursor:pointer;font-size:14px;opacity:0.5;transition:opacity 0.15s ease;";
      btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
      btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.5"; });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentState = frames.get(frameKey);
        if (!currentState) return;
        const parentContainer = findContainerWithTab(currentState.rootContainer, entry.key);
        if (!parentContainer) return;
        try {
          containerizeEntry(entry, parentContainer, wrapContentFactory(frameKey));
        } catch { D("nest blocked — depth limit", { frame: frameKey, entry: entry.key }); return; }
        btn.remove();
        while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
        if (entry.childContainer) {
          const el = document.createElement("div");
          el.style.cssText = "display:flex;flex-direction:column;height:100%;";
          entry.childContainer.mount(el);
          wrapper.appendChild(el);
        }
        entry.contentElement = wrapper;
        entry.contentDispose = () => { entry.childContainer?.dispose(); };
      });
      wrapper.appendChild(btn);

      const ret: { element: HTMLElement; dispose?: () => void } = { element: wrapper };
      if (result.dispose) ret.dispose = result.dispose;
      return ret;
    };
  }

  const backend: FloatingFrameBackend = {
    attach(container, factory, options?) {
      containerEl = container;
      contentFactory = factory;
      extraButtons = options?.extraButtons ?? [];
      lastContainerSize = null;
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) handleContainerResize(width, height);
        }
      });
      resizeObserver.observe(container);
    },

    detach() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      lastContainerSize = null;
      containerEl = null;
      contentFactory = null;
    },

    renderFrame(layout: FrameLayout) {
      if (!containerEl) return;
      D("frame-create", { key: layout.key, tabs: layout.tabs.map(t => t.label) });

      const frameEl = createFrameShell(
        layout.key,
        layout.position,
        layout.size,
      );

      frameEl.addEventListener(
        "pointerdown",
        () => bringToFrontInternal(layout.key),
        { capture: true },
      );

      const titlebar = createFrameTitlebar();

      const tabContentEl = document.createElement("div");
      tabContentEl.setAttribute("data-frame-body", "");
      tabContentEl.style.cssText =
        "flex:1;display:flex;flex-direction:column;overflow:hidden;";

      const state: FrameState = {
        key: layout.key,
        position: { ...layout.position },
        size: { ...layout.size },
        frameEl,
        rootContainer: null!,
        tabContentEl,
      };

      let rootContainer: Container;

      if (layout.containerTree) {
        rootContainer = restoreContainerFromState(
          layout.containerTree,
          layout.key,
          wrapContentFactory(layout.key),
          createTabCallbacksForFrame(layout.key),
          1,
          createLeafContainer,
          createSplitContainer,
        );
      } else {
        const tabEntries: Entry[] = layout.tabs.map((tab) => {
          const entry: Entry = {
            key: tab.key,
            label: tab.label,
          };
          entry.component = tab.content ?? undefined;
          return entry;
        });

        const initialLayout: Layout = layout.viewMode === "accordion" ? "accordion" : "tabbed";

        rootContainer = createContainer({
          entries: tabEntries,
          layout: initialLayout,
          contentFactory: wrapContentFactory(layout.key),
          callbacks: createTabCallbacksForFrame(layout.key),
          policy: FRAME_POLICY,
          onLayoutChange: (type) => {
            for (const cb of layoutChangeCbs) cb(layout.key, type);
          },
        });
      }

      (state as { rootContainer: Container }).rootContainer = rootContainer;

      titlebar.addEventListener("pointerdown", (startEvt) => {
        if (
          (startEvt.target as HTMLElement).closest(
            ".frame-close-dot, .frame-pin-btn, .frame-extra-btn, .frame-detach-dot",
          )
        )
          return;
        startEvt.preventDefault();
        document.body.style.userSelect = "none";
        const startX = startEvt.clientX;
        const startY = startEvt.clientY;
        const startLeft = state.position.x;
        const startTop = state.position.y;

        const onMove = (e: PointerEvent) => {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          state.position = { x: startLeft + dx, y: startTop + dy };
          frameEl.style.left = `${state.position.x}px`;
          frameEl.style.top = `${state.position.y}px`;
          for (const cb of dragMoveCbs)
            cb(layout.key, { ...state.position });
        };

        const onUp = () => {
          document.body.style.userSelect = "";
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          for (const cb of moveCbs) cb(layout.key, { ...state.position });
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });

      frameEl.appendChild(titlebar);
      frameEl.appendChild(tabContentEl);

      rootContainer.mount(tabContentEl);

      if (layout.activeTabKey) {
        const btns = tabContentEl.querySelectorAll("[data-tab-key]");
        for (const btn of btns) {
          if (btn.getAttribute("data-tab-key") === layout.activeTabKey) {
            (btn as HTMLElement).dispatchEvent(
              new PointerEvent("pointerdown", { bubbles: true }),
            );
            document.dispatchEvent(new PointerEvent("pointerup"));
            break;
          }
        }
      }

      injectFrameChrome(
        frameEl,
        titlebar,
        {
          onClose: () => {
            for (const cb of closeCbs) cb(layout.key);
          },
          onPin: () => {
            for (const cb of pinCbs) cb(layout.key);
          },
          onDetach: () => {
            for (const cb of detachCbs) cb(layout.key);
          },
          onTitlebarDoubleClick: () => {
            for (const cb of dblClickCbs) cb(layout.key);
          },
        },
        extraButtons.map((btn) => ({
          icon: btn.icon,
          title: btn.title,
          className: btn.className,
          onClick: () => btn.onClick(layout.key),
        })),
      );

      createFrameResizeHandles(frameEl, state, (k, w, h) => {
        for (const cb of resizeCbs) cb(k, { width: w, height: h });
      }, layout.key);

      frames.set(layout.key, state);
      zOrder.push(layout.key);
      containerEl.appendChild(frameEl);
      applyZOrder();
    },

    removeFrame(key) {
      const state = frames.get(key);
      if (!state) return;
      D("frame-remove", { key });
      state.rootContainer.dispose();
      state.frameEl.remove();
      frames.delete(key);
      zOrder = zOrder.filter((k) => k !== key);
      applyZOrder();
    },

    updatePosition(key, pos) {
      const state = frames.get(key);
      if (!state) return;
      state.position = { ...pos };
      state.frameEl.style.left = `${pos.x}px`;
      state.frameEl.style.top = `${pos.y}px`;
    },

    updateSize(key, size) {
      const state = frames.get(key);
      if (!state) return;
      state.size = { ...size };
      state.frameEl.style.width = `${size.width}px`;
      state.frameEl.style.height = `${size.height}px`;
    },

    bringToFront(key) {
      bringToFrontInternal(key);
    },

    addTab(frameKey, tab) {
      const state = frames.get(frameKey);
      if (!state) return;
      D("tab-add", { frame: frameKey, tab: tab.label || tab.key });
      const entry: Entry = {
        key: tab.key,
        label: tab.label,
      };
      entry.component = tab.content ?? undefined;

      const leaf = findLeafContainer(state.rootContainer);
      if (leaf) {
        leaf.addEntry(entry);
        const btn = state.tabContentEl.querySelector(
          `[data-tab-key="${tab.key}"]`,
        ) as HTMLElement | null;
        if (btn) {
          btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          document.dispatchEvent(new PointerEvent("pointerup"));
        }
      }
    },

    removeTab(frameKey, tabKey) {
      const state = frames.get(frameKey);
      if (!state) return;
      D("tab-remove (backend)", { frame: frameKey, tab: tabKey });
      suppressEntryClose = true;
      const leaf = findContainerWithTab(state.rootContainer, tabKey);
      if (leaf) {
        leaf.removeEntry(tabKey);
        if (leaf.entries.length === 0 && leaf !== state.rootContainer) {
          handleEmptyLeaf(frameKey, leaf);
        }
      }
      suppressEntryClose = false;
    },

    setActiveTab(frameKey, tabKey) {
      const state = frames.get(frameKey);
      if (!state) return;
      const btn = state.tabContentEl.querySelector(
        `[data-tab-key="${tabKey}"]`,
      ) as HTMLElement | null;
      if (btn) {
        btn.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true }),
        );
        document.dispatchEvent(new PointerEvent("pointerup"));
      }
    },

    onFrameMove(cb) {
      moveCbs.push(cb);
    },
    onFrameResize(cb) {
      resizeCbs.push(cb);
    },
    onTabDragOut(cb) {
      tabDragOutCbs.push(cb);
    },
    onTabReorder(cb) {
      tabReorderCbs.push(cb);
    },
    onFrameClose(cb) {
      closeCbs.push(cb);
    },
    onFramePin(cb) {
      pinCbs.push(cb);
    },
    onFrameDragMove(cb) {
      dragMoveCbs.push(cb);
    },
    onTitlebarDoubleClick(cb) {
      dblClickCbs.push(cb);
    },
    onViewModeToggle(cb) {
      viewModeCbs.push(cb);
    },
    onAddTab(cb) {
      addTabCbs.push(cb);
    },
    onTabRemoved(cb) {
      tabRemovedCbs.push(cb);
    },
    onArrangement(cb) {
      arrangementCbs.push(cb);
    },
    onDetach(cb) {
      detachCbs.push(cb);
    },
    onCrossFrameDrop(cb) {
      crossFrameDropCbs.push(cb);
    },
    onEdgeSplit(cb) {
      edgeSplitCbs.push(cb);
    },
    onLayoutChange(cb) {
      layoutChangeCbs.push(cb);
    },

    setFrameLayout(frameKey, layout) {
      const state = frames.get(frameKey);
      if (!state) return;
      const leaf = findLeafContainer(state.rootContainer);
      if (leaf) {
        try { leaf.setLayout(layout as Layout); } catch { /* layout not allowed by policy */ }
      }
    },

    updatePinState(key, pinned) {
      const state = frames.get(key);
      if (!state) return;
      updatePinVisual(state.frameEl, pinned);
    },

    getFrameElement(key) {
      return frames.get(key)?.frameEl ?? null;
    },

    getSubFrameElements(_frameKey) {
      return [];
    },

    getTabContentElement(frameKey, tabKey) {
      const state = frames.get(frameKey);
      if (!state) return null;
      const leaf = findContainerWithTab(state.rootContainer, tabKey);
      if (!leaf) return null;
      const entry = leaf.entries.find(e => e.key === tabKey);
      return entry?.contentElement ?? null;
    },

    captureContainerTree(frameKey: string): ContainerState | undefined {
      const state = frames.get(frameKey);
      if (!state) return undefined;
      return captureContainerState(state.rootContainer);
    },

    getRootContainer(frameKey: string): Container | null {
      const state = frames.get(frameKey);
      return state?.rootContainer ?? null;
    },

    dispose() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      lastContainerSize = null;
      for (const state of frames.values()) {
        state.rootContainer.dispose();
        state.frameEl.remove();
      }
      frames.clear();
      zOrder = [];
    },

    unwrap() {
      return null;
    },
  };

  return backend;
}
