import type { FrameConfig, FrameLayout, FrameTabConfig } from "@casehubio/pages-component";
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
  addTab(frameKey: string, tab: FrameTabConfig): void;
  removeTab(frameKey: string, tabKey: string): void;
  moveTab(fromFrame: string, tabKey: string, toFrame: string): void;
  setActiveTab(frameKey: string, tabKey: string): void;
  bringToFront(key: string): void;
  togglePin(key: string): void;
  updatePosition(key: string, pos: { x: number; y: number }): void;
  updateSize(key: string, size: { width: number; height: number }): void;
  focusDirection(direction: "up" | "down" | "left" | "right"): string | null;
  applyOrganiser(preset: Preset, canvasSize?: { width: number; height: number }): void;
  captureLayout(): readonly FrameLayout[];
  restoreLayout(saved: readonly FrameLayout[]): void;
  dispose(): void;
}

export function createFloatingFrameEngine(
  backend: FloatingFrameBackend,
  savedLayout?: readonly FrameLayout[],
): FloatingFrameEngine {
  let frames = new Map<string, FrameLayout>();
  let disposed = false;
  let nextOrder = 0;

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
      const shown: FrameLayout = { key: frame.key, order: frame.order, position: frame.position, size: frame.size, zIndex: frame.zIndex, pinned: frame.pinned, hidden: false, tabs: frame.tabs, activeTabKey: frame.activeTabKey };
      frames.set(key, shown);
      frames = zBringToFront(frames, key);
      backend.renderFrame(frames.get(key)!);
    },

    addTab(frameKey: string, tab: FrameTabConfig) {
      assertAlive();
      const frame = frames.get(frameKey);
      if (!frame) return;
      const updated: FrameLayout = { key: frame.key, order: frame.order, position: frame.position, size: frame.size, zIndex: frame.zIndex, pinned: frame.pinned, hidden: frame.hidden, tabs: [...frame.tabs, tab], activeTabKey: frame.activeTabKey };
      frames.set(frameKey, updated);
      backend.addTab(frameKey, tab);
    },

    removeTab(frameKey: string, tabKey: string) {
      assertAlive();
      const frame = frames.get(frameKey);
      if (!frame) return;
      const newTabs = frame.tabs.filter(t => t.key !== tabKey);
      const activeTabKey = frame.activeTabKey === tabKey ? (newTabs[0]?.key ?? "") : frame.activeTabKey;
      const updated: FrameLayout = { key: frame.key, order: frame.order, position: frame.position, size: frame.size, zIndex: frame.zIndex, pinned: frame.pinned, hidden: frame.hidden, tabs: newTabs, activeTabKey };
      frames.set(frameKey, updated);
      backend.removeTab(frameKey, tabKey);
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
      const updated: FrameLayout = { key: frame.key, order: frame.order, position: frame.position, size: frame.size, zIndex: frame.zIndex, pinned: frame.pinned, hidden: frame.hidden, tabs: frame.tabs, activeTabKey: tabKey };
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
      const updated: FrameLayout = { key: frame.key, order: frame.order, position: frame.position, size: frame.size, zIndex: frame.zIndex, pinned: !frame.pinned, hidden: frame.hidden, tabs: frame.tabs, activeTabKey: frame.activeTabKey };
      frames.set(key, updated);
      frames = zBringToFront(frames, key);
      backend.bringToFront(key);
    },

    updatePosition(key: string, pos: { x: number; y: number }) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      frames.set(key, { key: frame.key, order: frame.order, position: pos, size: frame.size, zIndex: frame.zIndex, pinned: frame.pinned, hidden: frame.hidden, tabs: frame.tabs, activeTabKey: frame.activeTabKey });
    },

    updateSize(key: string, size: { width: number; height: number }) {
      assertAlive();
      const frame = frames.get(key);
      if (!frame) return;
      frames.set(key, { key: frame.key, order: frame.order, position: frame.position, size, zIndex: frame.zIndex, pinned: frame.pinned, hidden: frame.hidden, tabs: frame.tabs, activeTabKey: frame.activeTabKey });
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

    captureLayout(): readonly FrameLayout[] {
      const normalized = normalizeForSave(frames);
      return [...normalized.values()].sort((a, b) => a.order - b.order);
    },

    restoreLayout(saved: readonly FrameLayout[]) {
      assertAlive();
      for (const [key] of frames) backend.removeFrame(key);
      frames.clear();
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
    },
  };

  return engine;
}
