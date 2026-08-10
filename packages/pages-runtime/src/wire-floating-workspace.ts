import type { FrameLayout } from "@casehubio/pages-component";
import type { FloatingFrameBackend } from "./floating-frame-backend.js";
import { createFloatingFrameEngine } from "./floating-frame-engine.js";
import type { FloatingFrameEngine } from "./floating-frame-engine.js";

export interface WireHandle {
  readonly engine: FloatingFrameEngine;
  dispose(): void;
}

export function wireFloatingWorkspace(
  backend: FloatingFrameBackend,
  container: HTMLElement,
  savedLayout?: readonly FrameLayout[],
): WireHandle {
  const engine = createFloatingFrameEngine(backend, savedLayout);

  backend.onFrameMove((key, pos) => {
    engine.updatePosition(key, pos);
    container.dispatchEvent(new CustomEvent("pages-frame-move", {
      bubbles: true, composed: true,
      detail: { frameKey: key, position: pos },
    }));
  });

  backend.onFrameResize((key, size) => {
    engine.updateSize(key, size);
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
    const newKey = `frame-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`;
    engine.createFrame({ key: newKey, tabs: [], position, size: { width: 400, height: 300 } });
    engine.moveTab(fromFrame, tabKey, newKey);
    const srcFrame = engine.frames.get(fromFrame);
    if (srcFrame && srcFrame.tabs.length === 0) {
      engine.removeFrame(fromFrame);
    }
    container.dispatchEvent(new CustomEvent("pages-tab-drag-out", {
      bubbles: true, composed: true,
      detail: { tabKey, fromFrame, position },
    }));
  });

  backend.onTabReorder((frameKey, tabKeys) => {
    container.dispatchEvent(new CustomEvent("pages-tab-reorder", {
      bubbles: true, composed: true,
      detail: { frameKey, tabKeys },
    }));
  });

  return {
    engine,
    dispose() {
      engine.dispose();
    },
  };
}
