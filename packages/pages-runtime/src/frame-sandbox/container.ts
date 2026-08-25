import type {
  Entry,
  Container,
  ContainerConfig,
  ContentFactory,
  LayoutStrategy,
  Layout,
  LayoutCallbacks,
  FreeLayoutState,
} from "./types.js";
import { DEFAULT_POLICY } from "./types.js";
import { createTabbedStrategy } from "./tabbed-strategy";
import { createAccordionStrategy } from "./accordion-strategy";
import { createFreeLayoutStrategy } from "./free-layout-strategy";
import { createSplitStrategy } from "./split-strategy";
import {
  createContainerToolbar,
  type ContainerToolbar,
} from "./container-toolbar";

export type { Entry, ContentFactory, Container, ContainerConfig } from "./types.js";

function createContentOrganiser(): LayoutStrategy {
  let mountedContainer: HTMLElement | null = null;

  return {
    type: "content" as Layout,
    mount(container, entries, factory) {
      mountedContainer = container;
      for (const entry of entries) {
        if (!entry.contentElement) {
          const result = factory(entry);
          entry.contentElement = result.element;
          entry.contentDispose = result.dispose;
        }
        container.appendChild(entry.contentElement);
      }
    },
    unmount() {
      if (mountedContainer) mountedContainer.innerHTML = "";
      mountedContainer = null;
    },
    addEntry() {},
    removeEntry() {},
    getState() {
      return {} as never;
    },
    restoreState() {},
    refreshEntry() {},
    dispose() {
      mountedContainer = null;
    },
  };
}

function buildOrganiser(
  type: Layout,
  callbacks?: LayoutCallbacks,
  freeLayoutState?: FreeLayoutState,
): LayoutStrategy {
  switch (type) {
    case "tabbed":
      return createTabbedStrategy(callbacks);
    case "accordion":
      return createAccordionStrategy(callbacks);
    case "free":
      return createFreeLayoutStrategy(freeLayoutState, callbacks);
    case "splith":
      return createSplitStrategy("horizontal", callbacks);
    case "splitv":
      return createSplitStrategy("vertical", callbacks);
    case "content":
      return createContentOrganiser();
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown layout type: ${_exhaustive}`);
    }
  }
}

export function createContainer(config: ContainerConfig): Container {
  const policy = config.policy ?? DEFAULT_POLICY;
  const depth = config.depth ?? 1;
  const entries: Entry[] = [...config.entries];
  let containerEl: HTMLElement | null = null;
  let organiserContainer: HTMLElement | null = null;
  let toolbar: ContainerToolbar | null = null;
  const factory = config.contentFactory;
  const savedStates = new Map<Layout, unknown>();

  function savePerChildMeta(layout: Layout): void {
    if (layout === "free") {
      const state = currentOrganiser.getState() as import("./types.js").FreeLayoutState;
      for (const entry of entries) {
        const s = state.entries[entry.key];
        if (s) {
          if (!entry.meta) entry.meta = {};
          entry.meta.free = { x: s.position.x, y: s.position.y, width: s.size.width, height: s.size.height };
        }
      }
    } else if (layout === "accordion") {
      const state = currentOrganiser.getState() as import("./types.js").AccordionState;
      for (const entry of entries) {
        if (!entry.meta) entry.meta = {};
        entry.meta.accordion = {
          height: state.heights[entry.key] ?? 0,
          collapsed: state.collapsed.includes(entry.key),
        };
      }
    }
  }

  function wrappedCallbacks(): LayoutCallbacks | undefined {
    const base: LayoutCallbacks = {
      ...config.callbacks,
      onStateChange: () => {
        config.callbacks?.onStateChange?.();
        injectToolbar();
      },
    };
    if (config.onCollapse) base.onCollapse = config.onCollapse;
    return base;
  }

  let currentOrganiser = buildOrganiser(config.layout, wrappedCallbacks(), config.freeLayoutState);

  if (depth > policy.maxDepth) {
    throw new Error(
      `Cannot create group at depth ${depth} — ` +
        `maximum nesting depth is ${policy.maxDepth}`,
    );
  }

  function mountOrganiserInto(container: HTMLElement): void {
    organiserContainer = document.createElement("div");
    organiserContainer.style.cssText = "flex:1;min-height:0;position:relative;display:flex;flex-direction:column;";
    container.appendChild(organiserContainer);
    currentOrganiser.mount(organiserContainer, entries, factory);
  }

  function injectToolbar(): void {
    if (!toolbar || !organiserContainer) return;
    toolbar.element.remove();

    const strip = Array.from(organiserContainer.children).find(
      (el) => el instanceof HTMLElement && el.hasAttribute("data-tab-strip"),
    ) as HTMLElement | null;
    const existingBar = Array.from(organiserContainer.children).find(
      (el) => el instanceof HTMLElement && el.hasAttribute("data-toolbar-bar"),
    ) as HTMLElement | null;

    if (strip) {
      if (existingBar) existingBar.remove();
      toolbar.element.style.position = "relative";
      toolbar.element.style.bottom = "";
      toolbar.element.style.right = "";
      toolbar.element.style.marginLeft = "auto";
      strip.appendChild(toolbar.element);
    } else {
      const toolbarBar = existingBar ?? (() => {
        const bar = document.createElement("div");
        bar.setAttribute("data-toolbar-bar", "");
        bar.style.cssText = "display:flex;justify-content:flex-end;border-bottom:1px solid var(--pages-border-1,#333);padding:2px 0;";
        organiserContainer.insertBefore(bar, organiserContainer.firstChild);
        return bar;
      })();
      toolbar.element.style.position = "relative";
      toolbar.element.style.bottom = "";
      toolbar.element.style.right = "";
      toolbar.element.style.marginLeft = "auto";
      toolbarBar.appendChild(toolbar.element);
    }
  }

  const group: Container = {
    get entries() {
      return entries;
    },
    get organiser() {
      return currentOrganiser;
    },
    get policy() {
      return policy;
    },
    get depth() {
      return depth;
    },

    addEntry(entry, atIndex?) {
      if (atIndex !== undefined && atIndex >= 0 && atIndex < entries.length) {
        entries.splice(atIndex, 0, entry);
      } else {
        entries.push(entry);
      }
      currentOrganiser.addEntry(entry, atIndex);
    },

    replaceChild(oldKey, newChild) {
      const idx = entries.findIndex(e => e.key === oldKey);
      if (idx === -1) throw new Error(`Child "${oldKey}" not found`);
      const old = entries[idx]!;
      currentOrganiser.removeEntry(oldKey);
      if (old.contentDispose) old.contentDispose();
      entries[idx] = newChild;
      currentOrganiser.addEntry(newChild);
    },

    refreshEntry(key) {
      const entry = entries.find(e => e.key === key);
      if (!entry) return;
      currentOrganiser.refreshEntry(key);
    },

    removeEntry(key) {
      const idx = entries.findIndex((e) => e.key === key);
      if (idx === -1) return;
      currentOrganiser.removeEntry(key);
      entries.splice(idx, 1);
    },

    setLayout(type) {
      if (!policy.allowedLayouts.includes(type)) {
        throw new Error(
          `Organiser "${type}" not allowed by policy. ` +
            `Allowed: ${policy.allowedLayouts.join(", ")}`,
        );
      }
      if (type === currentOrganiser.type) return;

      savedStates.set(currentOrganiser.type, currentOrganiser.getState());
      savePerChildMeta(currentOrganiser.type);
      currentOrganiser.unmount();
      if (organiserContainer) {
        organiserContainer.style.cssText = "flex:1;min-height:0;position:relative;display:flex;flex-direction:column;";
      }
      currentOrganiser = buildOrganiser(type, wrappedCallbacks());
      if (organiserContainer) {
        const saved = savedStates.get(type);
        if (saved) currentOrganiser.restoreState(saved);
        currentOrganiser.mount(organiserContainer, entries, factory);
      }
      toolbar?.setActive(type);
      injectToolbar();
      config.onLayoutChange?.(type);
    },

    mount(container) {
      containerEl = container;
      container.style.cssText = "display:flex;flex-direction:column;height:100%;";

      mountOrganiserInto(container);

      if (depth > 1 && organiserContainer) {
        const strip = Array.from(organiserContainer.children).find(
      (el) => el instanceof HTMLElement && el.hasAttribute("data-tab-strip"),
    ) as HTMLElement | null;
        if (strip) {
          strip.style.background = "var(--pages-surface-3,#2f2f2f)";
          strip.style.borderLeft = "2px solid var(--pages-accent-9,#3b82f6)";
          strip.style.paddingLeft = "4px";
          strip.style.fontSize = "13px";
        }
      }

      const wantToolbar = config.showToolbar ?? (depth <= 1);
      if (wantToolbar) {
        toolbar = createContainerToolbar(
          policy.allowedLayouts,
          currentOrganiser.type as Layout,
          {
            onAdd: config.onAdd ?? (() => {
              const key = `entry-${String(Date.now())}-${String(Math.random().toString(36).slice(2, 6))}`;
              const entry: Entry = { key, label: `Tab ${String(entries.length + 1)}` };
              group.addEntry(entry);
            }),
            onLayoutChange: (type) => {
              group.setLayout(type);
            },
          },
        );
        injectToolbar();
      }
    },

    unmount() {
      currentOrganiser.unmount();
      toolbar?.dispose();
      toolbar = null;
      organiserContainer?.remove();
      organiserContainer = null;
      if (containerEl) containerEl.style.cssText = "";
      containerEl = null;
    },

    dispose() {
      currentOrganiser.dispose();
      toolbar?.dispose();
      toolbar = null;
      organiserContainer?.remove();
      organiserContainer = null;
      containerEl = null;
    },
  };

  return group;
}

export function containerizeEntry(
  entry: Entry,
  parentContainer: Container,
  contentFactory: ContentFactory,
): void {
  if (entry.childContainer) return;
  if (parentContainer.depth + 1 > parentContainer.policy.maxDepth) {
    throw new Error(
      `Cannot nest at depth ${parentContainer.depth + 1} — maximum nesting depth is ${parentContainer.policy.maxDepth}`
    );
  }

  if (entry.contentDispose) entry.contentDispose();
  entry.contentElement = undefined;
  entry.contentDispose = undefined;

  const wrappedKey = `entry-${String(Date.now())}-${String(Math.random().toString(36).slice(2, 6))}`;
  const wrapped: Entry = { key: wrappedKey, label: entry.label };
  wrapped.component = entry.component;

  const emptyKey = `entry-${String(Date.now())}-${String(Math.random().toString(36).slice(2, 6))}`;
  const empty: Entry = { key: emptyKey, label: "New Tab" };

  const child = createContainer({
    entries: [wrapped, empty],
    layout: "tabbed",
    contentFactory,
    depth: parentContainer.depth + 1,
    policy: parentContainer.policy,
    showToolbar: true,
    onCollapse: (remaining) => {
      if (child.organiser.type === parentContainer.organiser.type) {
        flattenEntry(entry, remaining, contentFactory);
        parentContainer.refreshEntry(entry.key);
      }
    },
  });

  entry.component = undefined;
  entry.childContainer = child;
}

export function flattenEntry(
  parentEntry: Entry,
  remainingChildEntry: Entry,
  contentFactory: ContentFactory,
): void {
  if (!parentEntry.childContainer) return;

  parentEntry.childContainer.unmount();
  parentEntry.component = remainingChildEntry.component;

  if (remainingChildEntry.contentDispose) remainingChildEntry.contentDispose();
  remainingChildEntry.contentElement = undefined;
  remainingChildEntry.contentDispose = undefined;

  parentEntry.childContainer.dispose();
  parentEntry.childContainer = undefined;
}
