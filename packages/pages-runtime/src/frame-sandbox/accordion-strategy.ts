import type {
  Entry,
  ContentFactory,
  LayoutStrategy,
  LayoutCallbacks,
  AccordionState,
} from "./types.js";

export function createAccordionStrategy(
  callbacks?: LayoutCallbacks,
): LayoutStrategy {
  let containerEl: HTMLElement | null = null;
  let currentEntries: Entry[] = [];
  let factory: ContentFactory | null = null;
  const collapsed = new Set<string>();
  const heights: Record<string, number> = {};
  const sectionElements = new Map<string, HTMLElement>();

  function ensureContent(entry: Entry): HTMLElement {
    if (!entry.contentElement && factory) {
      const result = factory(entry);
      entry.contentElement = result.element;
      entry.contentDispose = result.dispose;
    }
    return entry.contentElement!;
  }

  function createSection(entry: Entry): HTMLElement {
    const section = document.createElement("div");
    section.setAttribute("data-accordion-section", entry.key);

    const header = document.createElement("div");
    header.setAttribute("data-section-key", entry.key);
    header.style.cssText =
      "display:flex;align-items:center;padding:4px 8px;cursor:pointer;" +
      "background:var(--pages-surface-2,#2a2a2a);" +
      "border-bottom:1px solid var(--pages-border-1,#333);" +
      "user-select:none;";

    const chevron = document.createElement("span");
    chevron.textContent = "▼";
    chevron.style.cssText =
      "margin-right:6px;font-size:10px;transition:transform 0.15s;";

    const label = document.createElement("span");
    label.textContent = entry.label;
    label.style.cssText =
      "color:var(--pages-text-1,#e0e0e0);font-size:13px;";

    header.appendChild(chevron);
    header.appendChild(label);

    const body = document.createElement("div");
    body.setAttribute("data-section-body", entry.key);
    body.style.cssText = "flex:1;overflow:auto;display:flex;flex-direction:column;";

    header.addEventListener("click", () => {
      if (collapsed.has(entry.key)) {
        collapsed.delete(entry.key);
        chevron.style.transform = "";
        body.style.display = "";
        body.appendChild(ensureContent(entry));
        section.style.flex = "1";
      } else {
        collapsed.add(entry.key);
        chevron.style.transform = "rotate(-90deg)";
        if (body.firstChild) body.removeChild(body.firstChild);
        body.style.display = "none";
        section.style.flex = "0 0 auto";
      }
      callbacks?.onStateChange?.();
    });

    section.style.cssText =
      "display:flex;flex-direction:column;" +
      (collapsed.has(entry.key) ? "flex:0 0 auto;" : "flex:1;");
    section.appendChild(header);
    section.appendChild(body);

    if (!collapsed.has(entry.key)) {
      body.appendChild(ensureContent(entry));
    } else {
      chevron.style.transform = "rotate(-90deg)";
      body.style.display = "none";
    }

    sectionElements.set(entry.key, section);
    return section;
  }

  const organiser: LayoutStrategy = {
    type: "accordion",

    mount(container, entries, contentFactory) {
      containerEl = container;
      currentEntries = [...entries];
      factory = contentFactory;

      for (const entry of currentEntries) {
        if (entry.meta?.accordion?.collapsed) collapsed.add(entry.key);
      }

      container.style.cssText =
        "display:flex;flex-direction:column;height:100%;overflow:auto;";

      for (const entry of currentEntries) {
        container.appendChild(createSection(entry));
      }
    },

    unmount() {
      for (const entry of currentEntries) {
        const body = containerEl?.querySelector(
          `[data-section-body="${entry.key}"]`,
        );
        if (body?.firstChild) body.removeChild(body.firstChild);
      }

      sectionElements.clear();
      if (containerEl) {
        containerEl.innerHTML = "";
        containerEl.style.cssText = "";
      }
      containerEl = null;
      factory = null;
    },

    addEntry(entry, _atIndex?) {
      currentEntries.push(entry);
      if (containerEl) {
        containerEl.appendChild(createSection(entry));
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

      sectionElements.get(key)?.remove();
      sectionElements.delete(key);
      collapsed.delete(key);
      delete heights[key];

      callbacks?.onEntryClose?.(key);

      if (currentEntries.length === 1 && callbacks?.onCollapse) {
        callbacks.onCollapse(currentEntries[0]!);
        return;
      }
    },

    getState(): AccordionState {
      return {
        collapsed: [...collapsed],
        heights: { ...heights },
      };
    },

    restoreState() {},

    refreshEntry(key: string): void {
      const entry = currentEntries.find(e => e.key === key);
      if (!entry) return;
      const section = sectionElements.get(key);
      if (!section) return;
      const contentDiv = section.lastElementChild as HTMLElement | null;
      if (!contentDiv) return;
      if (entry.contentElement?.parentElement) {
        entry.contentElement.remove();
      }
      entry.contentDispose?.();
      entry.contentElement = undefined;
      entry.contentDispose = undefined;
      contentDiv.appendChild(ensureContent(entry));
    },

    dispose() {
      for (const entry of currentEntries) {
        entry.contentDispose?.();
        entry.contentElement = undefined;
        entry.contentDispose = undefined;
      }
      organiser.unmount();
      currentEntries = [];
      collapsed.clear();
    },
  };

  return organiser;
}
