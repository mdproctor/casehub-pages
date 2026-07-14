import type { Component } from "../model/types.js";
import { slotSwapRegistry, dispatchSlotChange } from "./slot-swap.js";
import type { SwapFn } from "./slot-swap.js";

let stylesInjected = false;
function injectNavStyles(doc: Document): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = doc.createElement("style");
  style.textContent = `
[data-tab-bar] {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0 12px;
}
[data-tab-bar] button[data-slot] {
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border: 1px solid var(--pages-neutral-6, #e0e0e0);
  border-radius: 20px;
  background: var(--pages-neutral-1, #fff);
  color: var(--pages-neutral-11, #888);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
}
[data-tab-bar] button[data-slot]:hover {
  background: var(--pages-accent-4, #e8f0fe);
  border-color: var(--pages-neutral-6, #e0e0e0);
  color: var(--pages-neutral-12, #333);
}
[data-tab-bar] button[data-slot][data-active] {
  background: var(--pages-accent-9, #5470c6);
  border-color: var(--pages-accent-9, #5470c6);
  color: #fff;
}
[data-tab-bar] button[data-slot][data-active]:hover {
  background: var(--pages-accent-10, #4361b0);
  border-color: var(--pages-accent-10, #4361b0);
}
.pages-sidebar {
  flex-direction: column;
  gap: 2px;
  padding: 0 12px 0 0;
  border-right: 1px solid var(--pages-neutral-6, #e0e0e0);
  min-width: 140px;
}
.pages-sidebar button[data-slot] {
  border-radius: 8px;
  border: none;
  text-align: left;
  padding: 8px 12px;
}
.pages-tabs {
  gap: 0;
  border-bottom: 1px solid var(--pages-neutral-6, #e0e0e0);
  padding-bottom: 0;
}
.pages-tabs ~ [data-slot] {
  padding-top: var(--pages-space-3, 12px);
}
.pages-tabs button[data-slot] {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px 16px;
  border-bottom: 2px solid transparent;
}
.pages-tabs button[data-slot]:hover {
  background: var(--pages-neutral-2, #f0f0f0);
  border-color: transparent;
  border-bottom-color: var(--pages-neutral-6, #e0e0e0);
}
.pages-tabs button[data-slot][data-active] {
  background: transparent;
  color: var(--pages-accent-9, #5470c6);
  border-bottom-color: var(--pages-accent-9, #5470c6);
}
.pages-tabs button[data-slot][data-active]:hover {
  background: var(--pages-accent-3, #e8eaf6);
}
.pages-menu {
  background: var(--pages-neutral-2, #f0f0f0);
  border-bottom: 1px solid var(--pages-neutral-6, #e0e0e0);
  gap: 0;
  padding: 0;
}
.pages-menu button[data-slot] {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px 14px;
  font-size: 13px;
}
.pages-menu button[data-slot]:hover {
  background: var(--pages-accent-4, #e8f0fe);
  border-color: transparent;
}
.pages-menu button[data-slot][data-active] {
  background: transparent;
  font-weight: 600;
  color: var(--pages-neutral-12, #333);
  border-bottom: 2px solid var(--pages-accent-9, #5470c6);
}
.pages-tree-nav {
  flex-direction: column;
  padding: 0 12px 0 0;
  border-right: 1px solid var(--pages-neutral-6, #e0e0e0);
  min-width: 160px;
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: 13px;
}
.pages-tree-nav ul { list-style: none; margin: 0; padding: 0; }
.pages-tree-nav li { margin: 0; }
.pages-tree-nav .tree-group-label {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; cursor: pointer; user-select: none;
  color: var(--pages-neutral-11, #888); font-weight: 500;
}
.pages-tree-nav .tree-group-label:hover { background: var(--pages-accent-4, #e8f0fe); border-radius: var(--pages-radius-sm, 4px); }
.pages-tree-nav .tree-leaf {
  display: block; padding: 4px 8px 4px 24px;
  cursor: pointer; color: var(--pages-neutral-11, #888); text-decoration: none;
  border-radius: var(--pages-radius-sm, 4px);
}
.pages-tree-nav .tree-leaf:hover { background: var(--pages-accent-4, #e8f0fe); }
.pages-tree-nav .tree-leaf[data-active] { background: var(--pages-accent-3, #e8eaf6); color: var(--pages-accent-9, #5470c6); font-weight: 500; }
.pages-tree-nav .tree-children { padding-left: 16px; }
.pages-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  padding: 0 0 16px;
}
.pages-tiles-grid .tile-card {
  border: 1px solid var(--pages-neutral-6, #e0e0e0);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  text-align: center;
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: var(--pages-font-size-base, 14px);
  font-weight: 500;
  color: var(--pages-neutral-11, #888);
  transition: all 0.15s ease;
}
.pages-tiles-grid .tile-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: var(--pages-neutral-6, #e0e0e0); }
.pages-tiles-grid .tile-card[data-active] { border-color: var(--pages-accent-9, #5470c6); color: var(--pages-accent-9, #5470c6); box-shadow: 0 0 0 1px var(--pages-accent-9, #5470c6); }
[data-accordion-header] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  margin: 2px 0;
  border: 1px solid var(--pages-neutral-5, #e0e0e0);
  border-radius: 6px;
  background: var(--pages-neutral-2, #f5f5f5);
  color: var(--pages-neutral-12, #333);
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}
[data-accordion-header]:hover {
  background: var(--pages-accent-4, #e8f0fe);
  border-color: var(--pages-accent-7, #7e9bd6);
}
[data-accordion-header]::before {
  content: '▶';
  font-size: 10px;
  transition: transform 0.15s ease;
}
[data-accordion-header][data-expanded]::before {
  transform: rotate(90deg);
}
.pages-carousel-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 0;
}
.pages-carousel-nav button {
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: 18px;
  width: 36px;
  height: 36px;
  border: 1px solid var(--pages-neutral-6, #e0e0e0);
  border-radius: 50%;
  background: var(--pages-neutral-1, #fff);
  color: var(--pages-neutral-11, #888);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.pages-carousel-nav button:hover {
  background: var(--pages-accent-4, #e8f0fe);
  border-color: var(--pages-accent-9, #5470c6);
  color: var(--pages-neutral-12, #333);
}
.pages-carousel-dots {
  display: flex;
  gap: 6px;
  align-items: center;
}
.pages-carousel-dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pages-neutral-6, #e0e0e0);
  cursor: pointer;
  transition: all 0.15s ease;
}
.pages-carousel-dots .dot[data-active] {
  background: var(--pages-accent-9, #5470c6);
  width: 10px;
  height: 10px;
}
.pages-carousel-dots .dot:hover {
  background: var(--pages-accent-7, #7e9bd6);
}
.pages-stack-bar {
  display: flex;
  gap: 4px;
  padding: 4px 0 12px;
}
.pages-stack-bar button {
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--pages-neutral-6, #e0e0e0);
  border-radius: 4px;
  background: var(--pages-neutral-1, #fff);
  color: var(--pages-neutral-11, #888);
  cursor: pointer;
  transition: all 0.15s ease;
}
.pages-stack-bar button:hover {
  background: var(--pages-accent-4, #e8f0fe);
}
.pages-stack-bar button[data-active] {
  background: var(--pages-neutral-12, #333);
  color: var(--pages-neutral-1, #fff);
  border-color: var(--pages-neutral-12, #333);
}
`;
  doc.head.appendChild(style);
}

export interface LazyConfig {
  readonly slotChildren: Readonly<Record<string, readonly Component[]>>;
  readonly renderSlot: (
    parent: HTMLElement,
    children: readonly Component[],
    slotName: string,
  ) => void;
}

export function wireInteractivity(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document = globalThis.document,
  lazy?: LazyConfig,
): void {
  switch (type) {
    case "tabs":
    case "pills":
    case "menu":
      wireTabs(container, type, slotNames, panels, doc, lazy);
      break;
    case "tree":
      wireTree(container, slotNames, panels, doc, lazy);
      break;
    case "tiles":
      wireTiles(container, slotNames, panels, doc, lazy);
      break;
    case "sidebar":
      wireSidebar(container, slotNames, panels, doc, lazy);
      break;
    case "accordion":
      wireAccordion(container, slotNames, panels, doc);
      break;
    case "carousel":
      wireCarousel(container, slotNames, panels, doc, lazy);
      break;
    case "stack":
      wireStack(container, slotNames, panels, lazy);
      break;
    case "split":
      wireSplit(container, slotNames, panels, doc);
      break;
  }
}

function applyOneVisible(
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  activeIndex: number,
): void {
  slotNames.forEach((name, i) => {
    const panel = panels.get(name);
    if (panel) {
      panel.style.display = i === activeIndex ? "" : "none";
    }
  });
}

function updateButtons(bar: HTMLElement, activeSlot: string): void {
  for (const btn of bar.querySelectorAll<HTMLElement>("button[data-slot]")) {
    if (btn.dataset.slot === activeSlot) {
      btn.dataset.active = "";
    } else {
      delete btn.dataset.active;
    }
  }
}

function renderInitialSlot(
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy: LazyConfig | undefined,
): string {
  const currentSlot = slotNames[0] ?? "";
  if (lazy && currentSlot) {
    const firstPanel = panels.get(currentSlot);
    if (firstPanel) {
      lazy.renderSlot(
        firstPanel,
        lazy.slotChildren[currentSlot] ?? [],
        currentSlot,
      );
    }
  }
  applyOneVisible(slotNames, panels, 0);
  return currentSlot;
}

function buildSwap(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy: LazyConfig | undefined,
  getCurrentSlot: () => string,
  setCurrentSlot: (s: string) => void,
  afterSwap?: (slotName: string) => void,
): SwapFn {
  const swap: SwapFn = (slotName: string) => {
    if (slotName === getCurrentSlot()) return;

    if (lazy) {
      const oldPanel = panels.get(getCurrentSlot());
      if (oldPanel) oldPanel.innerHTML = "";
      const newPanel = panels.get(slotName);
      if (newPanel) {
        lazy.renderSlot(
          newPanel,
          lazy.slotChildren[slotName] ?? [],
          slotName,
        );
      }
    }

    const newIndex = slotNames.indexOf(slotName);
    if (newIndex >= 0) {
      applyOneVisible(slotNames, panels, newIndex);
    }

    setCurrentSlot(slotName);
    afterSwap?.(slotName);
    dispatchSlotChange(container, slotName);
  };

  slotSwapRegistry.set(container, swap);
  return swap;
}

function wireTabs(
  container: HTMLElement,
  type: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);
  const bar = doc.createElement("div");
  bar.dataset.tabBar = "";
  bar.className = type === "pills" ? "pages-pills"
    : type === "menu" ? "pages-menu"
    : "pages-tabs";

  slotNames.forEach((name) => {
    const button = doc.createElement("button");
    button.dataset.slot = name;
    button.textContent = name;
    bar.appendChild(button);
  });

  container.insertBefore(bar, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => { updateButtons(bar, slotName); },
  );

  bar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") {
      const slotName = target.dataset.slot;
      if (slotName) swap(slotName);
    }
  });
}

function wireSidebar(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);
  const bar = doc.createElement("div");
  bar.dataset.tabBar = "";
  bar.className = "pages-sidebar";

  slotNames.forEach((name) => {
    const button = doc.createElement("button");
    button.dataset.slot = name;
    button.textContent = name;
    bar.appendChild(button);
  });

  container.insertBefore(bar, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => { updateButtons(bar, slotName); },
  );

  bar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") {
      const slotName = target.dataset.slot;
      if (slotName) swap(slotName);
    }
  });
}

function wireAccordion(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
): void {
  slotNames.forEach((name) => {
    const panel = panels.get(name);
    if (panel) {
      panel.style.display = "";
      const header = doc.createElement("button");
      header.dataset.accordionHeader = "";
      header.textContent = name;
      container.insertBefore(header, panel);

      header.addEventListener("click", () => {
        const wasHidden = panel.style.display === "none";
        panel.style.display = wasHidden ? "" : "none";
        if (wasHidden) {
          header.setAttribute("data-expanded", "");
          dispatchSlotChange(container, name);
        } else {
          header.removeAttribute("data-expanded");
        }
      });
    }
  });
}

function wireCarousel(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);
  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const dots: HTMLElement[] = [];

  const updateDots = (): void => {
    const idx = slotNames.indexOf(currentSlot);
    dots.forEach((d, i) => {
      if (i === idx) d.setAttribute("data-active", "");
      else d.removeAttribute("data-active");
    });
  };

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; updateDots(); },
  );

  const nav = doc.createElement("div");
  nav.className = "pages-carousel-nav";

  const prevButton = doc.createElement("button");
  prevButton.textContent = "‹";
  prevButton.setAttribute("aria-label", "Previous slide");
  prevButton.setAttribute("data-carousel-prev", "");

  const dotsContainer = doc.createElement("div");
  dotsContainer.className = "pages-carousel-dots";
  slotNames.forEach((name, i) => {
    const dot = doc.createElement("div");
    dot.className = "dot";
    dot.title = name;
    if (i === slotNames.indexOf(currentSlot)) dot.setAttribute("data-active", "");
    dot.addEventListener("click", () => {
      const slot = slotNames[i];
      if (slot !== undefined) swap(slot);
    });
    dots.push(dot);
    dotsContainer.appendChild(dot);
  });

  const nextButton = doc.createElement("button");
  nextButton.textContent = "›";
  nextButton.setAttribute("aria-label", "Next slide");
  nextButton.setAttribute("data-carousel-next", "");

  nav.appendChild(prevButton);
  nav.appendChild(dotsContainer);
  nav.appendChild(nextButton);
  container.appendChild(nav);

  prevButton.addEventListener("click", () => {
    const currentIndex = slotNames.indexOf(currentSlot);
    const newIndex = (currentIndex - 1 + slotNames.length) % slotNames.length;
    const slot = slotNames[newIndex];
    if (slot !== undefined) swap(slot);
  });

  nextButton.addEventListener("click", () => {
    const currentIndex = slotNames.indexOf(currentSlot);
    const newIndex = (currentIndex + 1) % slotNames.length;
    const slot = slotNames[newIndex];
    if (slot !== undefined) swap(slot);
  });
}

function wireStack(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy?: LazyConfig,
): void {
  injectNavStyles(container.ownerDocument);
  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const buttons: HTMLElement[] = [];

  const updateButtons = (): void => {
    buttons.forEach((btn, i) => {
      if (slotNames[i] === currentSlot) btn.setAttribute("data-active", "");
      else btn.removeAttribute("data-active");
    });
  };

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; updateButtons(); },
  );

  const bar = container.ownerDocument.createElement("div");
  bar.className = "pages-stack-bar";

  slotNames.forEach((name, i) => {
    const btn = container.ownerDocument.createElement("button");
    btn.textContent = name;
    if (i === 0) btn.setAttribute("data-active", "");
    btn.addEventListener("click", () => {
      const slot = slotNames[i];
      if (slot !== undefined) swap(slot);
    });
    buttons.push(btn);
    bar.appendChild(btn);
  });

  container.insertBefore(bar, container.firstChild);
}

function wireTiles(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);

  const grid = doc.createElement("div");
  grid.className = "pages-tiles-grid";

  slotNames.forEach((name) => {
    const card = doc.createElement("div");
    card.className = "tile-card";
    card.dataset.tileName = name;
    card.textContent = name;
    grid.appendChild(card);
  });

  container.insertBefore(grid, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  function updateCards(activeSlot: string): void {
    for (const card of grid.querySelectorAll<HTMLElement>(".tile-card")) {
      if (card.dataset.tileName === activeSlot) {
        card.dataset.active = "";
      } else {
        delete card.dataset.active;
      }
    }
  }

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => { updateCards(slotName); },
  );

  // Mark initial active card
  updateCards(currentSlot);

  grid.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".tile-card");
    if (target?.dataset.tileName) {
      swap(target.dataset.tileName);
    }
  });
}

interface TreeNode {
  label: string;
  slotKey?: string;       // leaf nodes have a slot key
  children: TreeNode[];
}

function buildTreeStructure(slotNames: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const slotKey of slotNames) {
    const segments = slotKey.split("/");
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined) continue;
      const isLeaf = i === segments.length - 1;

      if (isLeaf) {
        current.push({ label: segment, slotKey, children: [] });
      } else {
        let group = current.find(n => n.label === segment && !n.slotKey);
        if (!group) {
          group = { label: segment, children: [] };
          current.push(group);
        }
        current = group.children;
      }
    }
  }

  return root;
}

function wireTree(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
  lazy?: LazyConfig,
): void {
  injectNavStyles(doc);

  const nav = doc.createElement("div");
  nav.className = "pages-tree-nav";

  const treeStructure = buildTreeStructure(slotNames);
  const groupElements = new Map<string, HTMLElement>(); // slotKey prefix → children container

  function renderTreeNodes(nodes: TreeNode[], parentUl: HTMLElement, depth: number): void {
    for (const node of nodes) {
      const li = doc.createElement("li");

      if (node.slotKey) {
        // Leaf node
        const leaf = doc.createElement("span");
        leaf.className = "tree-leaf";
        leaf.dataset.slot = node.slotKey;
        leaf.textContent = node.label;
        leaf.addEventListener("click", () => {
          if (node.slotKey) swap(node.slotKey);
        });
        li.appendChild(leaf);
      } else {
        // Group node
        const label = doc.createElement("span");
        label.className = "tree-group-label";
        label.textContent = (depth === 0 ? "▾ " : "▸ ") + node.label;

        const childrenUl = doc.createElement("ul");
        childrenUl.className = "tree-children";
        // Top-level expanded, nested collapsed
        if (depth > 0) childrenUl.style.display = "none";

        label.addEventListener("click", () => {
          const isCollapsed = childrenUl.style.display === "none";
          childrenUl.style.display = isCollapsed ? "" : "none";
          label.textContent = (isCollapsed ? "▾ " : "▸ ") + node.label;
        });

        li.appendChild(label);
        li.appendChild(childrenUl);

        // Store reference for auto-expand
        groupElements.set(node.label, childrenUl);

        renderTreeNodes(node.children, childrenUl, depth + 1);
      }

      parentUl.appendChild(li);
    }
  }

  const rootUl = doc.createElement("ul");
  renderTreeNodes(treeStructure, rootUl, 0);
  nav.appendChild(rootUl);

  container.insertBefore(nav, container.firstChild);

  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  function updateActiveLeaf(slotName: string): void {
    for (const leaf of nav.querySelectorAll<HTMLElement>(".tree-leaf")) {
      if (leaf.dataset.slot === slotName) {
        leaf.dataset.active = "";
      } else {
        delete leaf.dataset.active;
      }
    }
  }

  function autoExpandParents(slotName: string): void {
    const segments = slotName.split("/");
    if (segments.length <= 1) return;
    // Walk ancestor groups and expand any that are collapsed
    for (let i = 0; i < segments.length - 1; i++) {
      const groupLabel = segments[i];
      if (groupLabel === undefined) continue;
      const childrenEl = groupElements.get(groupLabel);
      if (childrenEl && childrenEl.style.display === "none") {
        childrenEl.style.display = "";
        const labelEl = childrenEl.previousElementSibling as HTMLElement | null;
        if (labelEl?.classList.contains("tree-group-label")) {
          labelEl.textContent = "▾ " + groupLabel;
        }
      }
    }
  }

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
    (slotName) => {
      updateActiveLeaf(slotName);
      autoExpandParents(slotName);
    },
  );

  // Mark initial active leaf
  updateActiveLeaf(currentSlot);
}

function wireSplit(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  doc: Document,
): void {
  const propsStr = container.dataset.componentProps;
  const props = propsStr ? JSON.parse(propsStr) as { direction?: string; ratio?: number[]; minSizes?: number[] } : {};
  const direction = props.direction ?? "horizontal";
  const ratio = props.ratio;
  const minSizes = props.minSizes;

  // Apply flex ratios to slot containers
  for (let i = 0; i < slotNames.length; i++) {
    const name = slotNames[i]!;
    const panel = panels.get(name);
    if (panel) {
      panel.style.flex = String(ratio?.[i] ?? 1);
      panel.style.overflow = "hidden";
      if (minSizes?.[i] !== undefined) {
        const prop = direction === "horizontal" ? "minWidth" : "minHeight";
        panel.style[prop] = `${String(minSizes[i])}px`;
      }
    }
  }

  // Insert drag handles between slot containers
  for (let i = 0; i < slotNames.length - 1; i++) {
    const currentName = slotNames[i]!;
    const currentPanel = panels.get(currentName);
    if (!currentPanel) continue;

    const handle = doc.createElement("div");
    handle.dataset.splitHandle = String(i);
    handle.style.flexShrink = "0";
    handle.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    if (direction === "horizontal") {
      handle.style.width = "6px";
    } else {
      handle.style.height = "6px";
    }
    handle.style.background = "var(--pages-neutral-6, #e0e0e0)";
    handle.style.userSelect = "none";

    currentPanel.insertAdjacentElement("afterend", handle);

    attachDragHandler(handle, i, direction, slotNames, panels, minSizes, container.dataset.componentId ?? "");
  }
}

function attachDragHandler(
  handle: HTMLElement,
  index: number,
  direction: string,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  minSizes: readonly number[] | undefined,
  componentId: string,
): void {
  handle.addEventListener("mousedown", (startEvent: MouseEvent) => {
    startEvent.preventDefault();
    const beforeName = slotNames[index]!;
    const afterName = slotNames[index + 1]!;
    const beforeMaybe = panels.get(beforeName);
    const afterMaybe = panels.get(afterName);
    if (!beforeMaybe || !afterMaybe) return;

    const before: HTMLElement = beforeMaybe;
    const after: HTMLElement = afterMaybe;

    const startPos = direction === "horizontal" ? startEvent.clientX : startEvent.clientY;
    const beforeSize = direction === "horizontal" ? before.offsetWidth : before.offsetHeight;
    const afterSize = direction === "horizontal" ? after.offsetWidth : after.offsetHeight;
    const totalSize = beforeSize + afterSize;
    const minBefore = minSizes?.[index] ?? 50;
    const minAfter = minSizes?.[index + 1] ?? 50;

    function onMouseMove(moveEvent: MouseEvent): void {
      const currentPos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - startPos;
      let newBeforeSize = Math.max(minBefore, Math.min(totalSize - minAfter, beforeSize + delta));
      let newAfterSize = totalSize - newBeforeSize;
      if (newAfterSize < minAfter) {
        newAfterSize = minAfter;
        newBeforeSize = totalSize - newAfterSize;
      }
      before.style.flex = `0 0 ${String(newBeforeSize)}px`;
      after.style.flex = `0 0 ${String(newAfterSize)}px`;
    }

    function onMouseUp(): void {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      const ratios: number[] = [];
      for (const name of slotNames) {
        const panel = panels.get(name);
        if (panel) {
          const size = direction === "horizontal" ? panel.offsetWidth : panel.offsetHeight;
          ratios.push(size);
        }
      }
      const total = ratios.reduce((a, b) => a + b, 0);
      const normalized = total > 0 ? ratios.map(r => Math.round(r / total * 100)) : ratios;

      handle.dispatchEvent(new CustomEvent("pages-split-resize", {
        bubbles: true,
        composed: true,
        detail: { componentId, ratios: normalized },
      }));
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}
