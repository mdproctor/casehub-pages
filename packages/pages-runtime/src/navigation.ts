import type { Component } from "@casehub/pages-component/dist/model/types.js";
import type { PagePathMap } from "./page-paths.js";
import { activateSlot } from "@casehub/pages-component/dist/renderer/activate-slot.js";

export type PageIndex = Map<string, Component>;
export type ActiveSlots = Map<string, string>;

const INTERACTIVE_TYPES = new Set([
  "tabs", "pills", "sidebar", "accordion", "carousel", "stack",
  "tree", "menu", "tiles",
]);

export function buildPageIndex(
  root: Component,
  paths: PagePathMap,
): PageIndex {
  const index: PageIndex = new Map();
  walkPages(root, paths, index);
  return index;
}

export function extendPageIndex(
  root: Component,
  paths: PagePathMap,
  index: PageIndex,
): void {
  walkPages(root, paths, index);
}

function walkPages(
  component: Component,
  paths: PagePathMap,
  index: PageIndex,
): void {
  if (component.type === "page") {
    const path = paths.get(component) ?? "";
    index.set(path, component);
  }

  if (component.items) {
    for (const item of component.items) {
      walkPages(item.component, paths, index);
    }
  }

  if (component.slots) {
    for (const children of Object.values(component.slots)) {
      for (const child of children) {
        walkPages(child, paths, index);
      }
    }
  }
}

export function computeCurrentPage(
  root: Component,
  activeSlots: ActiveSlots,
): string {
  const segments: string[] = [];
  walkActive(root, activeSlots, segments);
  return segments.join("/");
}

function walkActive(
  component: Component,
  activeSlots: ActiveSlots,
  segments: string[],
): void {
  if (!component.slots) return;

  if (INTERACTIVE_TYPES.has(component.type) && component.id) {
    const activeSlot = activeSlots.get(component.id);
    if (activeSlot) {
      const children = component.slots[activeSlot];
      if (children) {
        for (const child of children) {
          if (child.type === "page") {
            segments.push(activeSlot);
          }
          walkActive(child, activeSlots, segments);
        }
      }
      return;
    }
  }

  // Non-interactive or no active slot: walk all children
  for (const children of Object.values(component.slots)) {
    for (const child of children) {
      walkActive(child, activeSlots, segments);
    }
  }
}

export function walkNavigate(
  root: Component,
  segments: string[],
  target: HTMLElement,
  lazyPageResolutions: Map<Component, Component>,
): string {
  const reached: string[] = [];
  let currentNodes: readonly Component[] = root.slots
    ? Object.values(root.slots).flat()
    : [];

  for (const segment of segments) {
    const container = findInteractiveWithSlot(currentNodes, segment, lazyPageResolutions);
    if (!container) break;

    const domEl = target.querySelector<HTMLElement>(
      `[data-component-id="${container.id}"]`,
    );
    if (!domEl || !activateSlot(domEl, segment)) break;

    reached.push(segment);

    const slotChildren = container.slots![segment]!;
    currentNodes = descendIntoChildren(slotChildren, lazyPageResolutions);
  }

  return reached.join("/");
}

function findInteractiveWithSlot(
  nodes: readonly Component[],
  slotName: string,
  lazyResolutions: Map<Component, Component>,
): Component | undefined {
  for (const node of nodes) {
    if (INTERACTIVE_TYPES.has(node.type) && node.id && node.slots?.[slotName]) {
      return node;
    }

    const resolved = node.type === "lazy-page" ? lazyResolutions.get(node) : undefined;
    const children = resolved
      ? [
          ...(resolved.slots ? Object.values(resolved.slots).flat() : []),
          ...(resolved.items ? resolved.items.map((i) => i.component) : []),
        ]
      : [
          ...(node.slots ? Object.values(node.slots).flat() : []),
          ...(node.items ? node.items.map((i) => i.component) : []),
        ];

    if (children.length > 0) {
      const found = findInteractiveWithSlot(children, slotName, lazyResolutions);
      if (found) return found;
    }
  }
  return undefined;
}

function descendIntoChildren(
  slotChildren: readonly Component[],
  lazyResolutions: Map<Component, Component>,
): readonly Component[] {
  const result: Component[] = [];
  for (const child of slotChildren) {
    const resolved = child.type === "lazy-page" ? lazyResolutions.get(child) : undefined;
    if (resolved) {
      result.push(...(resolved.slots ? Object.values(resolved.slots).flat() : []));
    } else {
      result.push(child);
    }
  }
  return result;
}
