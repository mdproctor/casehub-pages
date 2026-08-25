import type {
  Entry,
  ContentFactory,
  Layout,
  LayoutStrategy,
  LayoutCallbacks,
  SplitState,
} from "./types.js";

export function createSplitStrategy(
  direction: "horizontal" | "vertical",
  callbacks?: LayoutCallbacks,
): LayoutStrategy {
  const type: Layout = direction === "horizontal" ? "splith" : "splitv";
  let hostElement: HTMLElement | null = null;
  let flexContainer: HTMLElement | null = null;
  let currentEntries: Entry[] = [];
  let ratios: number[] = [];
  let factory: ContentFactory | null = null;

  function ensureContent(entry: Entry): HTMLElement {
    if (!entry.contentElement && factory) {
      const result = factory(entry);
      entry.contentElement = result.element;
      entry.contentDispose = result.dispose;
    }
    return entry.contentElement!;
  }

  function createPane(entry: Entry, ratio: number): HTMLElement {
    const pane = document.createElement("div");
    pane.setAttribute("data-split-pane", entry.key);
    pane.style.cssText =
      `flex:${ratio};overflow:hidden;position:relative;min-width:0;min-height:0;`;
    pane.appendChild(ensureContent(entry));
    return pane;
  }

  function createDivider(index: number): HTMLElement {
    const divider = document.createElement("div");
    divider.setAttribute("data-split-divider", String(index));
    const isHorizontal = direction === "horizontal";
    divider.style.cssText =
      `flex:0 0 4px;cursor:${isHorizontal ? "col-resize" : "row-resize"};` +
      `background:var(--pages-border-1,#333);z-index:1;`;

    divider.addEventListener("pointerdown", (startEvt) => {
      startEvt.preventDefault();
      if (!flexContainer) return;
      const totalSize = isHorizontal ? flexContainer.clientWidth : flexContainer.clientHeight;
      if (totalSize === 0) return;
      const startPos = isHorizontal ? startEvt.clientX : startEvt.clientY;
      const startRatioLeft = ratios[index]!;
      const startRatioRight = ratios[index + 1]!;
      const combinedRatio = startRatioLeft + startRatioRight;

      const onMove = (moveEvt: PointerEvent) => {
        const delta = (isHorizontal ? moveEvt.clientX : moveEvt.clientY) - startPos;
        const ratioDelta = (delta / totalSize) * ratios.reduce((a, b) => a + b, 0);
        const newLeft = Math.max(0.02, Math.min(combinedRatio - 0.02, startRatioLeft + ratioDelta));
        ratios[index] = newLeft;
        ratios[index + 1] = combinedRatio - newLeft;
        const panes = flexContainer!.querySelectorAll("[data-split-pane]");
        (panes[index] as HTMLElement).style.flex = String(ratios[index]);
        (panes[index + 1] as HTMLElement).style.flex = String(ratios[index + 1]);
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        callbacks?.onStateChange?.();
      };

      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    return divider;
  }

  function rebuild(): void {
    if (!flexContainer) return;

    for (const entry of currentEntries) {
      if (entry.contentElement?.parentElement) {
        entry.contentElement.remove();
      }
    }
    flexContainer.innerHTML = "";

    for (let i = 0; i < currentEntries.length; i++) {
      if (i > 0) {
        flexContainer.appendChild(createDivider(i - 1));
      }
      flexContainer.appendChild(createPane(currentEntries[i]!, ratios[i]!));
    }
  }

  function equalRatios(count: number): number[] {
    return Array.from({ length: count }, () => 1 / count);
  }

  const strategy: LayoutStrategy = {
    type,

    mount(container, entries, contentFactory) {
      hostElement = container;
      currentEntries = [...entries];
      factory = contentFactory;
      ratios = equalRatios(entries.length);

      flexContainer = document.createElement("div");
      flexContainer.setAttribute("data-split-container", direction);
      flexContainer.style.cssText =
        `display:flex;flex-direction:${direction === "horizontal" ? "row" : "column"};` +
        `width:100%;height:100%;`;

      for (let i = 0; i < currentEntries.length; i++) {
        if (i > 0) {
          flexContainer.appendChild(createDivider(i - 1));
        }
        flexContainer.appendChild(createPane(currentEntries[i]!, ratios[i]!));
      }

      container.appendChild(flexContainer);
    },

    unmount() {
      for (const entry of currentEntries) {
        if (entry.contentElement?.parentElement) {
          entry.contentElement.remove();
        }
      }
      flexContainer?.remove();
      flexContainer = null;
      hostElement = null;
      factory = null;
    },

    addEntry(entry, atIndex?) {
      const insertAt = atIndex !== undefined && atIndex >= 0 && atIndex <= currentEntries.length
        ? atIndex
        : currentEntries.length;
      currentEntries.splice(insertAt, 0, entry);
      ratios = equalRatios(currentEntries.length);
      rebuild();
    },

    removeEntry(key) {
      const idx = currentEntries.findIndex((e) => e.key === key);
      if (idx === -1) return;

      const entry = currentEntries[idx]!;
      entry.contentDispose?.();
      delete entry.contentElement;
      delete entry.contentDispose;
      currentEntries.splice(idx, 1);

      callbacks?.onEntryClose?.(key);

      if (currentEntries.length === 1 && callbacks?.onCollapse) {
        callbacks.onCollapse(currentEntries[0]!);
        return;
      }

      ratios = equalRatios(currentEntries.length);
      rebuild();
    },

    getState(): SplitState {
      return { ratios: [...ratios] };
    },

    restoreState(state: unknown) {
      const s = state as SplitState | undefined;
      if (s?.ratios && s.ratios.length === currentEntries.length) {
        ratios = [...s.ratios];
        if (flexContainer) {
          const panes = flexContainer.querySelectorAll("[data-split-pane]");
          for (let i = 0; i < panes.length; i++) {
            (panes[i] as HTMLElement).style.flex = String(ratios[i]);
          }
        }
      }
    },

    refreshEntry(key: string): void {
      const entry = currentEntries.find(e => e.key === key);
      if (!entry || !flexContainer) return;
      const pane = flexContainer.querySelector(`[data-split-pane="${key}"]`) as HTMLElement;
      if (!pane) return;
      if (entry.contentElement?.parentElement) {
        entry.contentElement.remove();
      }
      entry.contentDispose?.();
      entry.contentElement = undefined;
      entry.contentDispose = undefined;
      pane.appendChild(ensureContent(entry));
    },

    dispose() {
      for (const entry of currentEntries) {
        entry.contentDispose?.();
        entry.contentElement = undefined;
        entry.contentDispose = undefined;
      }
      strategy.unmount();
      currentEntries = [];
      ratios = [];
    },
  };

  return strategy;
}
