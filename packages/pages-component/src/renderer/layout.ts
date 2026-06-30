import type { Component } from "../model/types.js";
import { isGrid, isColumns } from "../model/type-guards.js";

const LAYOUT_TYPES = new Set([
  "grid", "columns", "rows", "stack",
  "tabs", "pills", "accordion", "carousel",
  "sidebar", "tree", "panel", "split",
]);

export function isLayoutType(type: string): boolean {
  return LAYOUT_TYPES.has(type);
}

export function applyLayoutCSS(
  element: HTMLElement,
  component: Component,
): void {
  const type = component.type;
  switch (type) {
    case "grid": {
      element.style.display = "grid";
      if (isGrid(component)) {
        element.style.gridTemplateColumns = `repeat(${String(component.props?.columns ?? 12)}, 1fr)`;
      }
      break;
    }
    case "columns": {
      element.style.display = "grid";
      if (isColumns(component)) {
        if (component.props?.distribution) {
          element.style.gridTemplateColumns = component.props.distribution.map((n) => `${String(n)}fr`).join(" ");
        }
      }
      break;
    }
    case "rows":
      element.style.display = "flex";
      element.style.flexDirection = "column";
      break;
    case "stack":
    case "tabs":
    case "pills":
    case "carousel":
      break;
    case "accordion":
      element.style.display = "flex";
      element.style.flexDirection = "column";
      break;
    case "sidebar":
    case "tree":
      element.style.display = "grid";
      element.style.gridTemplateColumns = "auto 1fr";
      break;
    case "panel":
      break;
    case "split": {
      element.style.display = "flex";
      const direction = (component.props as { direction?: string } | undefined)?.direction;
      element.style.flexDirection = direction === "vertical" ? "column" : "row";
      break;
    }
  }
}
