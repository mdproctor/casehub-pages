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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border: 1px solid #d0d5dd;
  border-radius: 20px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
}
[data-tab-bar] button[data-slot]:hover {
  background: #f2f4f7;
  border-color: #98a2b3;
  color: #344054;
}
[data-tab-bar] button[data-slot][data-active] {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}
[data-tab-bar] button[data-slot][data-active]:hover {
  background: #4338ca;
  border-color: #4338ca;
}
.casehub-sidebar {
  flex-direction: column;
  gap: 2px;
  padding: 0 12px 0 0;
  border-right: 1px solid #e5e7eb;
  min-width: 140px;
}
.casehub-sidebar button[data-slot] {
  border-radius: 8px;
  border: none;
  text-align: left;
  padding: 8px 12px;
}
.casehub-tabs {
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0;
}
.casehub-tabs button[data-slot] {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px 16px;
  border-bottom: 2px solid transparent;
}
.casehub-tabs button[data-slot]:hover {
  background: #f9fafb;
  border-color: transparent;
  border-bottom-color: #d0d5dd;
}
.casehub-tabs button[data-slot][data-active] {
  background: transparent;
  color: #4f46e5;
  border-bottom-color: #4f46e5;
}
.casehub-tabs button[data-slot][data-active]:hover {
  background: #f5f3ff;
}
.casehub-menu {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  gap: 0;
  padding: 0;
}
.casehub-menu button[data-slot] {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 8px 14px;
  font-size: 13px;
}
.casehub-menu button[data-slot]:hover {
  background: #f2f4f7;
  border-color: transparent;
}
.casehub-menu button[data-slot][data-active] {
  background: transparent;
  font-weight: 600;
  color: #1f2937;
  border-bottom: 2px solid #4f46e5;
}
.casehub-tree-nav {
  flex-direction: column;
  padding: 0 12px 0 0;
  border-right: 1px solid #e5e7eb;
  min-width: 160px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}
.casehub-tree-nav ul { list-style: none; margin: 0; padding: 0; }
.casehub-tree-nav li { margin: 0; }
.casehub-tree-nav .tree-group-label {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; cursor: pointer; user-select: none;
  color: #475467; font-weight: 500;
}
.casehub-tree-nav .tree-group-label:hover { background: #f2f4f7; border-radius: 4px; }
.casehub-tree-nav .tree-leaf {
  display: block; padding: 4px 8px 4px 24px;
  cursor: pointer; color: #475467; text-decoration: none;
  border-radius: 4px;
}
.casehub-tree-nav .tree-leaf:hover { background: #f2f4f7; }
.casehub-tree-nav .tree-leaf[data-active] { background: #ede9fe; color: #4f46e5; font-weight: 500; }
.casehub-tree-nav .tree-children { padding-left: 16px; }
.casehub-tiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  padding: 0 0 16px;
}
.casehub-tiles-grid .tile-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #475467;
  transition: all 0.15s ease;
}
.casehub-tiles-grid .tile-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: #98a2b3; }
.casehub-tiles-grid .tile-card[data-active] { border-color: #4f46e5; color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
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
  bar.className = type === "pills" ? "casehub-pills"
    : type === "menu" ? "casehub-menu"
    : "casehub-tabs";

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
  bar.className = "casehub-sidebar";

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
          dispatchSlotChange(container, name);
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
  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  const swap = buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
  );

  const nav = doc.createElement("div");
  const prevButton = doc.createElement("button");
  prevButton.dataset.carouselPrev = "";
  prevButton.textContent = "←";

  const nextButton = doc.createElement("button");
  nextButton.dataset.carouselNext = "";
  nextButton.textContent = "→";

  nav.appendChild(prevButton);
  nav.appendChild(nextButton);
  container.appendChild(nav);

  prevButton.addEventListener("click", () => {
    const currentIndex = slotNames.indexOf(currentSlot);
    const newIndex = (currentIndex - 1 + slotNames.length) % slotNames.length;
    swap(slotNames[newIndex]!);
  });

  nextButton.addEventListener("click", () => {
    const currentIndex = slotNames.indexOf(currentSlot);
    const newIndex = (currentIndex + 1) % slotNames.length;
    swap(slotNames[newIndex]!);
  });
}

function wireStack(
  container: HTMLElement,
  slotNames: readonly string[],
  panels: Map<string, HTMLElement>,
  lazy?: LazyConfig,
): void {
  let currentSlot = renderInitialSlot(slotNames, panels, lazy);

  buildSwap(
    container, slotNames, panels, lazy,
    () => currentSlot,
    (s) => { currentSlot = s; },
  );
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
  grid.className = "casehub-tiles-grid";

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
    const target = (e.target as HTMLElement).closest(".tile-card") as HTMLElement | null;
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
      const segment = segments[i]!;
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
  nav.className = "casehub-tree-nav";

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
      const groupLabel = segments[i]!;
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
