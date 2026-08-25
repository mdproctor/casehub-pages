import type {
  Entry,
  ContentFactory,
  LayoutStrategy,
  LayoutCallbacks,
  TabState,
} from "./types.js";

export function createTabbedStrategy(
  callbacks?: LayoutCallbacks,
): LayoutStrategy {
  let containerEl: HTMLElement | null = null;
  let stripEl: HTMLElement | null = null;
  let contentEl: HTMLElement | null = null;
  let currentEntries: Entry[] = [];
  let activeKey = "";
  let factory: ContentFactory | null = null;

  function ensureContent(entry: Entry): HTMLElement {
    if (!entry.contentElement && factory) {
      const result = factory(entry);
      entry.contentElement = result.element;
      entry.contentDispose = result.dispose;
    }
    return entry.contentElement!;
  }

  function activateTab(key: string): void {
    if (!contentEl || !stripEl) return;
    activeKey = key;

    for (const btn of stripEl.querySelectorAll("[data-tab-key]")) {
      const isActive = btn.getAttribute("data-tab-key") === key;
      (btn as HTMLElement).classList.toggle("active", isActive);
      (btn as HTMLElement).style.borderBottom = isActive
        ? "2px solid var(--pages-accent-9,#3b82f6)"
        : "2px solid transparent";
    }

    for (let i = contentEl.childNodes.length - 1; i >= 0; i--) {
      const child = contentEl.childNodes[i]!;
      if (child instanceof HTMLElement && (child.hasAttribute("data-organiser-toolbar") || child.hasAttribute("data-container-toolbar"))) continue;
      contentEl.removeChild(child);
    }
    const entry = currentEntries.find((e) => e.key === key);
    if (entry) {
      contentEl.appendChild(ensureContent(entry));
    }
  }

  function createTabButton(entry: Entry): HTMLElement {
    const btn = document.createElement("button");
    btn.setAttribute("data-tab-key", entry.key);
    btn.textContent = entry.label;
    btn.style.cssText =
      "padding:4px 12px;border:none;cursor:pointer;" +
      "background:var(--pages-surface-2,#2a2a2a);" +
      "color:var(--pages-text-1,#e0e0e0);" +
      "border-bottom:2px solid transparent;";

    btn.style.position = "relative";
    const closeBtn = document.createElement("span");
    closeBtn.setAttribute("data-tab-close", "");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText =
      "position:absolute;right:1px;top:1px;" +
      "cursor:pointer;font-size:9px;opacity:0;line-height:1;" +
      "background:inherit;padding:0 2px;";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      organiser.removeEntry(entry.key);
    });
    btn.appendChild(closeBtn);

    btn.addEventListener("mouseenter", () => { closeBtn.style.opacity = "0.7"; });
    btn.addEventListener("mouseleave", () => { closeBtn.style.opacity = "0"; });

    btn.addEventListener("pointerdown", (startEvt) => {
      if (!stripEl) return;
      startEvt.preventDefault();
      let didDrag = false;
      let draggedOut = false;
      let lastX = startEvt.clientX;
      let lastY = startEvt.clientY;
      let ghost: HTMLElement | null = null;
      const DRAG_THRESHOLD = 4;
      const startX = startEvt.clientX;
      const startY = startEvt.clientY;
      let dragStarted = false;

      function enableTransitions(): void {
        const buttons = [
          ...stripEl!.querySelectorAll("[data-tab-key]"),
        ] as HTMLElement[];
        for (const b of buttons) {
          if (b !== btn) b.style.transition = "transform 0.15s ease";
        }
      }

      function clearTransitions(): void {
        const buttons = [
          ...stripEl!.querySelectorAll("[data-tab-key]"),
        ] as HTMLElement[];
        for (const b of buttons) {
          b.style.transition = "";
          b.style.transform = "";
        }
      }

      function createGhost(): HTMLElement {
        const g = btn.cloneNode(true) as HTMLElement;
        const btnRect = btn.getBoundingClientRect();
        g.style.cssText =
          `position:fixed;pointer-events:none;z-index:99999;` +
          `width:${btnRect.width}px;height:${btnRect.height}px;` +
          `opacity:0.9;padding:4px 12px;border:none;cursor:grabbing;` +
          `background:var(--pages-surface-3,#333);` +
          `color:var(--pages-text-1,#e0e0e0);` +
          `border-radius:4px;font-size:inherit;` +
          `box-shadow:0 4px 12px rgba(0,0,0,0.4);`;
        document.body.appendChild(g);
        return g;
      }

      const onMove = (e: PointerEvent) => {
        lastX = e.clientX;
        lastY = e.clientY;

        if (
          !dragStarted &&
          Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) <
            DRAG_THRESHOLD
        )
          return;

        if (!dragStarted) {
          dragStarted = true;
          ghost = createGhost();
          btn.style.opacity = "0.4";
          enableTransitions();
          callbacks?.onTabDragStart?.(entry.key, ghost);
        }

        ghost!.style.left = `${e.clientX - ghost!.offsetWidth / 2}px`;
        ghost!.style.top = `${e.clientY - ghost!.offsetHeight / 2}px`;

        const currentStripRect = stripEl!.getBoundingClientRect();
        const dy = Math.abs(
          e.clientY - currentStripRect.top - currentStripRect.height / 2,
        );
        if (dy > 30) {
          draggedOut = true;
          callbacks?.onTabDragMove?.(entry.key, e.clientX, e.clientY);
          if (ghost) {
            ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5)";
            ghost.style.transform = "scale(1.05)";
          }
          return;
        }
        draggedOut = false;
        callbacks?.onTabDragMove?.(entry.key, e.clientX, e.clientY);
        if (ghost) {
          ghost.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
          ghost.style.transform = "";
        }

        didDrag = true;
        const buttons = [
          ...stripEl!.querySelectorAll("[data-tab-key]"),
        ] as HTMLElement[];
        for (const other of buttons) {
          if (other === btn) continue;
          const rect = other.getBoundingClientRect();
          if (e.clientX > rect.left && e.clientX < rect.right) {
            const entryKey = entry.key;
            const otherKey = other.getAttribute("data-tab-key")!;
            const entryIdx = currentEntries.findIndex(
              (en) => en.key === entryKey,
            );
            const otherIdx = currentEntries.findIndex(
              (en) => en.key === otherKey,
            );
            if (entryIdx !== -1 && otherIdx !== -1 && entryIdx !== otherIdx) {
              [currentEntries[entryIdx], currentEntries[otherIdx]] = [
                currentEntries[otherIdx]!,
                currentEntries[entryIdx]!,
              ];
              if (entryIdx < otherIdx) {
                stripEl!.insertBefore(other, btn);
              } else {
                stripEl!.insertBefore(btn, other);
              }
            }
            break;
          }
        }
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        btn.style.opacity = "";
        clearTransitions();
        ghost?.remove();
        if (draggedOut) {
          callbacks?.onTabDragOut?.(entry.key, lastX, lastY);
        } else if (didDrag) {
          callbacks?.onEntryReorder?.(currentEntries.map((en) => en.key));
        } else {
          activateTab(entry.key);
        }
        callbacks?.onTabDragEnd?.();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    return btn;
  }

  const organiser: LayoutStrategy = {
    type: "tabbed",

    mount(container, entries, contentFactory) {
      containerEl = container;
      currentEntries = [...entries];
      factory = contentFactory;

      stripEl = document.createElement("div");
      stripEl.setAttribute("data-tab-strip", "");
      stripEl.style.cssText =
        "display:flex;gap:0;border-bottom:" +
        "1px solid var(--pages-border-1,#333);";

      contentEl = document.createElement("div");
      contentEl.setAttribute("data-tab-content", "");
      contentEl.style.cssText = "flex:1;overflow:auto;";

      container.style.cssText =
        "display:flex;flex-direction:column;height:100%;";

      for (const entry of currentEntries) {
        stripEl.appendChild(createTabButton(entry));
      }

      container.appendChild(stripEl);
      container.appendChild(contentEl);

      if (currentEntries.length > 0) {
        const restoreKey = activeKey && currentEntries.some(e => e.key === activeKey) ? activeKey : currentEntries[0]!.key;
        activateTab(restoreKey);
      }
    },

    unmount() {
      if (contentEl?.firstChild) {
        contentEl.removeChild(contentEl.firstChild);
      }

      stripEl?.remove();
      contentEl?.remove();
      if (containerEl) containerEl.style.cssText = "";
      stripEl = null;
      contentEl = null;
      containerEl = null;
      factory = null;
    },

    addEntry(entry, _atIndex?) {
      currentEntries.push(entry);
      if (stripEl) {
        const sentinel = stripEl.querySelector("[data-container-toolbar], [data-toolbar-actions]");
        if (sentinel) {
          stripEl.insertBefore(createTabButton(entry), sentinel);
        } else {
          stripEl.appendChild(createTabButton(entry));
        }
      }
    },

    removeEntry(key) {
      const idx = currentEntries.findIndex((e) => e.key === key);
      if (idx === -1) return;

      const entry = currentEntries[idx]!;
      entry.contentDispose?.();
      delete entry.contentElement;
      delete entry.contentDispose;
      currentEntries.splice(idx, 1);

      stripEl?.querySelector(`[data-tab-key="${key}"]`)?.remove();

      callbacks?.onEntryClose?.(key);

      if (currentEntries.length === 1 && callbacks?.onCollapse) {
        callbacks.onCollapse(currentEntries[0]!);
        return;
      }

      if (activeKey === key && currentEntries.length > 0) {
        activateTab(currentEntries[0]!.key);
      }
    },

    getState(): TabState {
      return {
        activeKey,
        order: currentEntries.map((e) => e.key),
      };
    },

    restoreState(state: unknown) {
      const s = state as TabState | undefined;
      if (s?.activeKey) activeKey = s.activeKey;
    },

    refreshEntry(key: string): void {
      const entry = currentEntries.find(e => e.key === key);
      if (!entry) return;
      if (key === activeKey && contentEl) {
        if (entry.contentElement?.parentElement) {
          entry.contentElement.remove();
        }
        entry.contentDispose?.();
        entry.contentElement = undefined;
        entry.contentDispose = undefined;
        contentEl.appendChild(ensureContent(entry));
      }
    },

    dispose() {
      for (const entry of currentEntries) {
        entry.contentDispose?.();
        delete entry.contentElement;
        delete entry.contentDispose;
      }
      organiser.unmount();
      currentEntries = [];
    },
  };

  return organiser;
}
