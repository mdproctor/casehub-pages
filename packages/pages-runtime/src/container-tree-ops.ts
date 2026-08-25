import type {
  ContainerState,
  FrameTabConfig,
  ContentFactory,
} from "@casehubio/pages-component";
import type {
  Container,
  Entry,
  Layout,
  ContentFactory as SandboxContentFactory,
  LayoutCallbacks,
} from "./frame-sandbox/types.js";

export function isSplitLayout(layout: Layout): boolean {
  return layout === "splith" || layout === "splitv";
}

export function findLeafContainer(
  container: Container,
  predicate?: (c: Container) => boolean,
): Container | null {
  for (const entry of container.entries) {
    if (entry.childContainer) {
      const found = findLeafContainer(entry.childContainer, predicate);
      if (found) return found;
    }
  }
  const hasLeafEntries = container.entries.some(e => !e.childContainer);
  if (hasLeafEntries && (!predicate || predicate(container))) return container;
  return null;
}

export function findContainerWithTab(
  container: Container,
  tabKey: string,
): Container | null {
  if (container.entries.some(e => e.key === tabKey)) return container;
  for (const entry of container.entries) {
    if (entry.childContainer) {
      const found = findContainerWithTab(entry.childContainer, tabKey);
      if (found) return found;
    }
  }
  return null;
}

export function forEachLeafContainer(
  container: Container,
  callback: (container: Container, paneKey?: string) => void,
  paneKey?: string,
): void {
  for (const entry of container.entries) {
    if (entry.childContainer) {
      forEachLeafContainer(entry.childContainer, callback, entry.key);
    }
  }
  const hasLeafEntries = container.entries.some(e => !e.childContainer);
  if (hasLeafEntries) callback(container, paneKey);
}

export function findParentOf(
  root: Container,
  targetContainer: Container,
): { container: Container; entry: Entry } | null {
  for (const entry of root.entries) {
    if (entry.childContainer === targetContainer) return { container: root, entry };
    if (entry.childContainer) {
      const found = findParentOf(entry.childContainer, targetContainer);
      if (found) return found;
    }
  }
  return null;
}

export function captureContainerState(container: Container): ContainerState {
  const tabs: FrameTabConfig[] = container.entries.map(entry => {
    if (entry.childContainer) {
      return {
        key: entry.key,
        label: entry.label,
        content: null,
        children: captureContainerState(entry.childContainer),
      };
    }
    return {
      key: entry.key,
      label: entry.label,
      content: entry.component ?? { type: "html", props: {} },
    };
  });

  return {
    layout: container.organiser.type,
    tabs,
    layoutState: container.organiser.getState(),
  };
}

export function restoreContainerFromState(
  containerState: ContainerState,
  frameKey: string,
  factory: SandboxContentFactory,
  callbacks: LayoutCallbacks,
  depth: number,
  createLeafFn: (frameKey: string, entries: Entry[]) => Container,
  createSplitFn: (frameKey: string, direction: "splith" | "splitv", childEntries: Array<{ key: string; child: Container }>) => Container,
): Container {
  const entries: Entry[] = containerState.tabs.map(tab => {
    const entry: Entry = { key: tab.key, label: tab.label };
    if (tab.children) {
      const child = restoreContainerFromState(
        tab.children, frameKey, factory, callbacks, depth + 1,
        createLeafFn, createSplitFn,
      );
      entry.childContainer = child;
    } else {
      entry.component = tab.content ?? undefined;
    }
    return entry;
  });

  const layout = containerState.layout;
  if (layout === "splith" || layout === "splitv") {
    const childEntries = entries
      .filter(e => e.childContainer)
      .map(e => ({ key: e.key, child: e.childContainer! }));
    if (childEntries.length > 0) {
      const container = createSplitFn(frameKey, layout, childEntries);
      if (containerState.layoutState) container.organiser.restoreState(containerState.layoutState);
      return container;
    }
  }

  const container = createLeafFn(frameKey, entries);
  if (layout !== "tabbed") {
    try { container.setLayout(layout); } catch { /* layout not allowed by policy */ }
  }
  if (containerState.layoutState) container.organiser.restoreState(containerState.layoutState);
  return container;
}
