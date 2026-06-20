import type { Component } from "@casehub/pages-component/dist/model/types.js";

export type PagePathMap = Map<Component, string>;

export function buildPagePathMap(root: Component): PagePathMap {
  const map: PagePathMap = new Map();
  walk(root, "", undefined, map);
  return map;
}

export function extendPagePathMap(
  root: Component,
  basePath: string,
  map: PagePathMap,
): void {
  walk(root, basePath, undefined, map);
}

function walk(
  component: Component,
  currentPath: string,
  slotName: string | undefined,
  map: PagePathMap,
): void {
  let path = currentPath;
  if (component.type === "page" && slotName !== undefined) {
    path = currentPath ? `${currentPath}/${slotName}` : slotName;
  }

  map.set(component, path);

  if (component.items) {
    for (const item of component.items) {
      const itemSlotName = item.component.type === "page"
        ? (item.component.props as Record<string, unknown> | undefined)?.name as string | undefined
        : undefined;
      walk(item.component, path, itemSlotName, map);
    }
  }

  if (component.slots) {
    for (const [name, children] of Object.entries(component.slots)) {
      for (const child of children) {
        walk(child, path, name, map);
      }
    }
  }
}
