import type { FrameConfig, FrameLayout, FrameTabConfig, SnapZone } from "@casehubio/pages-component";
import { zoneToRect } from "./frame-boundaries.js";
import type { FloatingFrameBackend } from "./floating-frame-backend.js";
import { bringToFront as zBringToFront, normalizeForSave } from "./frame-zorder.js";
import { findSpatialTarget } from "./frame-spatial-nav.js";
import { applyPreset, type Preset } from "./frame-organisers.js";

const DEFAULT_SIZE = { width: 400, height: 300 };
const DEFAULT_POSITION = { x: 50, y: 50 };

export interface FloatingFrameEngine {
  readonly frames: ReadonlyMap<string, FrameLayout>;
  createFrame(config: FrameConfig): FrameLayout;
  removeFrame(key: string): void;
  hideFrame(key: string): void;
  showFrame(key: string): void;
  addTab(frameKey: string, tab: FrameTabConfig, options?: { skipBackend?: boolean }): void;
  removeTab(frameKey: string, tabKey: string, options?: { skipBackend?: boolean }): void;
  moveTab(fromFrame: string, tabKey: string, toFrame: string): void;
  setActiveTab(frameKey: string, tabKey: string): void;
  bringToFront(key: string): void;
  togglePin(key: string): void;
  updatePosition(key: string, pos: { x: number; y: number }): void;
  updateSize(key: string, size: { width: number; height: number }): void;
  setDetached(key: string, detached: boolean): void;
  snapFrame(key: string, zone: SnapZone, canvasSize: { width: number; height: number }): void;
  unsnapFrame(key: string): void;
  recomputeSnappedFrames(canvasSize: { width: number; height: number }): void;
  focusDirection(direction: "up" | "down" | "left" | "right"): string | null;
  applyOrganiser(preset: Preset, canvasSize?: { width: number; height: number }): void;
  reorderTabs(frameKey: string, tabKeys: readonly string[]): void;
  setBackend(newBackend: FloatingFrameBackend): void;
  renderAll(): void;
  toggleViewMode(key: string): void;
  setAccordionState(key: string, state: { collapsed: readonly string[]; heights: Readonly<Record<string, number>> }): void;
  captureLayout(): readonly FrameLayout[];
  restoreLayout(saved: readonly FrameLayout[]): void;
  dispose(): void;
}

export function createFloatingFrameEngine(
  initialBackend: FloatingFrameBackend,
  savedLayout?: readonly FrameLayout[],
): FloatingFrameEngine {
  let backend = initialBackend;
  let frames = new Map<string, FrameLayout>();
  let disposed = false;
  let nextOrder = 0;
  const preSnapState = new Map<string, { position: { x: number; y: number }; size: { width: number; height: number } }>();

  function assertAlive(): void {
    if (disposed) throw new Error("Engine is disposed");
  }

  if (savedLayout) {
    for (const layout of savedLayout) {
      frames.set(layout.key, layout);
      if (!layout.hidden) backend.renderFrame(layout);
      if (layout.order >= nextOrder) nextOrder = layout.order + 1;
    }
  }

  const engine: FloatingFrameEngine = {
    get frames() { return new Map(frames); },

    createFrame(config: FrameConfig): FrameLayout {
      assertAlive();
      const layout: FrameLayout = {
        key: config.key,
        order: nextOrder++,
        position: config.position ?? DEFAULT_POSITION,
        size: config.size ?? DEFAULT_SIZE,
        zIndex: 1,
        pinned: config.pinned ?? false,
        hidden: false,
        tabs: config.tabs,
        activeTabKey: config.tabs[0]?.key ?? "",
        ...(config.viewMode ? { viewMode: config.viewMode } : {}),
        ...(config.allowViewToggle !== undefined ? { allowViewToggle: config.allowViewToggle } : {}),
        ...(config.allowAddTab !== undefined ? { allowAddTab: config.allowAddTab } : {}),
        ...(config.allowArrangement !== undefined ? { allowArrangement: config.allowArrangement } : {}),
      };
      frames.set(config.key, layout);
      frames = zBringToFront(frames, config.key);
      backend.renderFrame(frames.get(config.key)!);
      return frames.get(config.key)!;
    },

    removeFrame(key: string) {
      assertAlive();
      if (!frames.has(key)) return;
      backend.removeFrame(key);
      frames.delete(key);
    },

    hideFrame(key: string) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame || frame.hidden) return;
      backend.removeFrame(key);
      frames.set(key, { ...frame, hidden: true } as FrameLayout);
    },

    showFrame(key: string) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame || !frame.hidden) return;
      const shown: FrameLayout = { ...frame, hidden: false };
      frames.set(key, shown);
      frames = zBringToFront(frames, key);
      backend.renderFrame(frames.get(key)!);
    },

    addTab(frameKey: string, tab: FrameTabConfig, options?: { skipBackend?: boolean }) {
      assertAlive();
      const frame = frames.get(frameKey);
      if (!frame) return;
      let accordionState = frame.accordionState;
      if (frame.viewMode === "accordion" && accordionState) {
        accordionState = { ...accordionState, heights: { ...accordionState.heights } };
      }
      const updated: FrameLayout = { ...frame, tabs: [...frame.tabs, tab], ...(accordionState ? { accordionState } : {}) };
      frames.set(frameKey, updated);
      if (!options?.skipBackend) backend.addTab(frameKey, tab);
    },

    removeTab(frameKey: string, tabKey: string, options?: { skipBackend?: boolean }) {
      assertAlive();
      const frame = frames.get(frameKey);
      if (!frame) return;
      const newTabs = frame.tabs.filter(t => t.key !== tabKey);
      const activeTabKey = frame.activeTabKey === tabKey ? (newTabs[0]?.key ?? "") : frame.activeTabKey;
      let accordionState = frame.accordionState;
      if (accordionState) {
        const collapsed = accordionState.collapsed.filter(k => k !== tabKey);
        const { [tabKey]: _, ...heights } = accordionState.heights;
        accordionState = { collapsed, heights };
      }
      const updated: FrameLayout = { ...frame, tabs: newTabs, activeTabKey, ...(accordionState ? { accordionState } : {}) };
      frames.set(frameKey, updated);
      if (!options?.skipBackend) backend.removeTab(frameKey, tabKey);
    },

    reorderTabs(frameKey: string, tabKeys: readonly string[]) {
      assertAlive();
      const frame = frames.get(frameKey);
      if (!frame) return;
      const reordered = tabKeys
        .map(k => frame.tabs.find(t => t.key === k))
        .filter((t): t is FrameTabConfig => t !== undefined);
      if (reordered.length !== frame.tabs.length) return;
      frames.set(frameKey, { ...frame, tabs: reordered });
    },

    moveTab(fromFrame: string, tabKey: string, toFrame: string) {
      assertAlive();
      const srcFrame = frames.get(fromFrame);
      const dstFrame = frames.get(toFrame);
      if (!srcFrame || !dstFrame) return;
      const tab = srcFrame.tabs.find(t => t.key === tabKey);
      if (!tab) return;
      this.removeTab(fromFrame, tabKey);
      this.addTab(toFrame, tab);
    },

    setActiveTab(frameKey: string, tabKey: string) {
      assertAlive();
      const frame = frames.get(frameKey);
      if (!frame) return;
      const updated: FrameLayout = { ...frame, activeTabKey: tabKey };
      frames.set(frameKey, updated);
      backend.setActiveTab(frameKey, tabKey);
    },

    bringToFront(key: string) {
      assertAlive();
      frames = zBringToFront(frames, key);
      backend.bringToFront(key);
    },

    togglePin(key: string) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      const updated: FrameLayout = { ...frame, pinned: !frame.pinned };
      frames.set(key, updated);
      frames = zBringToFront(frames, key);
      backend.bringToFront(key);
    },

    updatePosition(key: string, pos: { x: number; y: number }) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      frames.set(key, { ...frame, position: pos });
    },

    updateSize(key: string, size: { width: number; height: number }) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      frames.set(key, { ...frame, size });
    },

    setDetached(key: string, detached: boolean) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      frames.set(key, { ...frame, detached });
    },

    snapFrame(key: string, zone: SnapZone, canvasSize: { width: number; height: number }) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      if (!frame.snappedZone) {
        preSnapState.set(key, { position: frame.position, size: frame.size });
      }
      const rect = zoneToRect(zone, canvasSize);
      frames.set(key, { ...frame, snappedZone: zone, position: rect.position, size: rect.size });
      backend.updatePosition(key, rect.position);
      backend.updateSize(key, rect.size);
    },

    unsnapFrame(key: string) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame || !frame.snappedZone) return;
      const saved = preSnapState.get(key);
      preSnapState.delete(key);
      if (saved) {
        frames.set(key, { ...frame, snappedZone: undefined, position: saved.position, size: saved.size });
        backend.updatePosition(key, saved.position);
        backend.updateSize(key, saved.size);
      } else {
        frames.set(key, { ...frame, snappedZone: undefined });
      }
    },

    recomputeSnappedFrames(canvasSize: { width: number; height: number }) {
      assertAlive();
      for (const [key, frame] of frames) {
        if (!frame.snappedZone) continue;
        const rect = zoneToRect(frame.snappedZone, canvasSize);
        frames.set(key, { ...frame, position: rect.position, size: rect.size });
        backend.updatePosition(key, rect.position);
        backend.updateSize(key, rect.size);
      }
    },

    focusDirection(direction) {
      assertAlive();
      const visible = new Map([...frames].filter(([, f]) => !f.hidden));
      if (visible.size === 0) return null;
      const currentKey = [...visible.entries()].reduce((a, b) => a[1].zIndex > b[1].zIndex ? a : b)[0];
      return findSpatialTarget(visible, currentKey, direction);
    },

    applyOrganiser(preset, canvasSize) {
      assertAlive();
      const visible = [...frames.values()].filter(f => !f.hidden);
      if (visible.length === 0) return;
      const canvas = canvasSize ?? { width: 1200, height: 800 };
      const arranged = applyPreset(visible, canvas, preset);
      for (const a of arranged) {
        frames.set(a.key, a);
        backend.updatePosition(a.key, a.position);
        backend.updateSize(a.key, a.size);
      }
    },

    setBackend(newBackend: FloatingFrameBackend) {
      assertAlive();
      backend.dispose();
      backend = newBackend;
    },

    renderAll() {
      assertAlive();
      for (const [, frame] of frames) {
        if (!frame.hidden) backend.renderFrame(frame);
      }
    },

    toggleViewMode(key: string) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      const { viewMode: _, ...rest } = frame;
      frames.set(key, frame.viewMode === "accordion" ? rest : { ...rest, viewMode: "accordion" as const });
    },

    setAccordionState(key: string, state: { collapsed: readonly string[]; heights: Readonly<Record<string, number>> }) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      frames.set(key, { ...frame, accordionState: state });
    },

    captureLayout(): readonly FrameLayout[] {
      const normalized = normalizeForSave(frames);
      return [...normalized.values()]
        .sort((a, b) => a.order - b.order)
        .map(layout => {
          const containerTree = backend.captureContainerTree(layout.key);
          return containerTree ? { ...layout, containerTree } : layout;
        });
    },

    restoreLayout(saved: readonly FrameLayout[]) {
      assertAlive();
      for (const [key] of frames) backend.removeFrame(key);
      frames.clear();
      preSnapState.clear();
      nextOrder = 0;
      for (const layout of saved) {
        frames.set(layout.key, layout);
        if (!layout.hidden) backend.renderFrame(layout);
        if (layout.order >= nextOrder) nextOrder = layout.order + 1;
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      backend.dispose();
      frames.clear();
      preSnapState.clear();
    },
  };

  return engine;
}
