import type { Layout, Component } from "@casehubio/pages-component";
export type { Layout };

export interface ContainerPolicy {
  readonly allowedLayouts: readonly Layout[];
  readonly maxDepth: number;
}

export const DEFAULT_POLICY: ContainerPolicy = {
  allowedLayouts: ["free", "tabbed", "accordion"],
  maxDepth: 5,
};

export const SPLIT_POLICY: ContainerPolicy = {
  allowedLayouts: ["free", "tabbed", "accordion", "splith", "splitv"],
  maxDepth: 5,
};

export interface PerLayoutMeta {
  free?: { x: number; y: number; width: number; height: number };
  accordion?: { height: number; collapsed: boolean };
}

export interface Entry {
  readonly key: string;
  readonly label: string;
  contentElement?: HTMLElement | undefined;
  contentDispose?: (() => void) | undefined;
  meta?: PerLayoutMeta;
  childContainer?: Container | undefined;
  component?: Component | undefined;
}

export type ContentFactory = (entry: Entry) => {
  element: HTMLElement;
  dispose?: () => void;
};

export interface TabState {
  activeKey: string;
  order: string[];
}

export interface AccordionState {
  collapsed: string[];
  heights: Record<string, number>;
}

export interface FreeLayoutEntry {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface FreeLayoutState {
  entries: Record<string, FreeLayoutEntry>;
  zOrder: string[];
}

export interface SplitState {
  ratios: number[];
}

export interface LayoutCallbacks {
  onEntryClose?: (key: string) => void;
  onEntryReorder?: (keys: string[]) => void;
  onTabDragOut?: (key: string, x: number, y: number) => void;
  onTabDragStart?: (key: string, ghost: HTMLElement) => void;
  onTabDragMove?: (key: string, x: number, y: number) => void;
  onTabDragEnd?: () => void;
  onStateChange?: () => void;
  onEntryMove?: (key: string, x: number, y: number) => void;
  onEntryResize?: (key: string, w: number, h: number) => void;
  onCollapse?: (remaining: Entry) => void;
}

export interface LayoutStrategy {
  readonly type: Layout;
  mount(
    container: HTMLElement,
    entries: Entry[],
    factory: ContentFactory,
  ): void;
  unmount(): void;
  addEntry(entry: Entry, atIndex?: number): void;
  removeEntry(key: string): void;
  getState(): TabState | AccordionState | FreeLayoutState | SplitState;
  restoreState(state: unknown): void;
  refreshEntry(key: string): void;
  dispose(): void;
}

export interface Container {
  readonly entries: readonly Entry[];
  readonly organiser: LayoutStrategy;
  readonly policy: ContainerPolicy;
  readonly depth: number;
  addEntry(entry: Entry, atIndex?: number): void;
  removeEntry(key: string): void;
  replaceChild(oldKey: string, newChild: Entry): void;
  refreshEntry(key: string): void;
  setLayout(type: Layout): void;
  mount(container: HTMLElement): void;
  unmount(): void;
  dispose(): void;
}

export interface ContainerConfig {
  entries: Entry[];
  layout: Layout;
  policy?: ContainerPolicy;
  contentFactory: ContentFactory;
  callbacks?: LayoutCallbacks;
  depth?: number;
  freeLayoutState?: FreeLayoutState;
  onCollapse?: (remainingChild: Entry) => void;
  onAdd?: () => void;
  onLayoutChange?: (type: Layout) => void;
  showToolbar?: boolean;
}
