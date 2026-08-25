import type { FrameLayout, FrameTabConfig, ContentFactory, ContainerState } from "@casehubio/pages-component";
import type { Container } from "./frame-sandbox/types.js";
import type { EdgeZone } from "./frame-boundaries.js";

export interface FrameButtonConfig {
  readonly icon: string;
  readonly title: string;
  readonly className?: string;
  readonly onClick: (frameKey: string) => void;
}

export interface BackendAttachOptions {
  readonly extraButtons?: readonly FrameButtonConfig[];
}

export interface FloatingFrameBackend {
  attach(container: HTMLElement, contentFactory: ContentFactory, options?: BackendAttachOptions): void;
  detach(): void;

  renderFrame(layout: FrameLayout): void;
  removeFrame(key: string): void;
  updatePosition(key: string, pos: { x: number; y: number }): void;
  updateSize(key: string, size: { width: number; height: number }): void;
  bringToFront(key: string): void;

  addTab(frameKey: string, tab: FrameTabConfig): void;
  removeTab(frameKey: string, tabKey: string): void;
  setActiveTab(frameKey: string, tabKey: string): void;

  onFrameMove(cb: (key: string, pos: { x: number; y: number }) => void): void;
  onFrameResize(cb: (key: string, size: { width: number; height: number }) => void): void;
  onTabDragOut(cb: (fromFrame: string, tabKey: string, position: { x: number; y: number }) => void): void;
  onTabReorder(cb: (frameKey: string, tabKeys: string[]) => void): void;
  onFrameClose(cb: (key: string) => void): void;
  onFramePin(cb: (key: string) => void): void;
  onFrameDragMove(cb: (key: string, pos: { x: number; y: number }) => void): void;
  onTitlebarDoubleClick(cb: (key: string) => void): void;
  onViewModeToggle(cb: (key: string) => void): void;
  onAddTab(cb: (key: string) => void): void;
  onTabRemoved(cb: (frameKey: string, tabKey: string) => void): void;
  onArrangement(cb: (frameKey: string, preset: string) => void): void;
  onDetach(cb: (frameKey: string) => void): void;
  onCrossFrameDrop(cb: (fromFrame: string, tabKey: string, toFrame: string) => void): void;
  onEdgeSplit(cb: (fromFrame: string, tabKey: string, targetFrame: string, zone: EdgeZone) => void): void;
  onLayoutChange(cb: (frameKey: string, layout: string) => void): void;
  setFrameLayout(frameKey: string, layout: string): void;

  updatePinState(key: string, pinned: boolean): void;
  getFrameElement(key: string): HTMLElement | null;
  getSubFrameElements(frameKey: string): Array<{ element: HTMLElement; tabKey: string }>;
  getTabContentElement(frameKey: string, tabKey: string): HTMLElement | null;

  captureContainerTree(frameKey: string): ContainerState | undefined;
  getRootContainer(frameKey: string): Container | null;

  dispose(): void;
  unwrap(): unknown | null;
}
