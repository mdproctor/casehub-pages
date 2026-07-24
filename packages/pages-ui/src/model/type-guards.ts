import type { Component } from "./types.js";
import type { TypedComponent } from "@casehubio/pages-component";

// Re-export everything from pages-component
export type {
  ComponentTypeRegistry,
  ComponentType,
  TypedComponent,
} from "@casehubio/pages-component";
export {
  getProps,
  isComponentType,
  isGrid,
  isColumns,
  isRows,
  isStack,
  isTabs,
  isPills,
  isSidebar,
  isTree,
  isMenu,
  isAccordion,
  isCarousel,
  isPanel,
  isHtml,
  isMarkdown,
  isTitle,
  isLazyPage,
  isBarChart,
  isLineChart,
  isAreaChart,
  isPieChart,
  isScatterChart,
  isBubbleChart,
  isTimeseries,
  isDataTable,
  isGridTable,
  isMetric,
  isMeter,
  isSelector,
  isMap,
  isIframePlugin,
  isInput,
  isNumberInput,
  isSelect,
  isCheckbox,
  isDatePicker,
  isTextarea,
  isSplit,
  isDockBar,
  isHostPanel,
} from "@casehubio/pages-component";

// isPage is a pages-ui utility (moved from pages-component)
export function isPage(c: Component): c is TypedComponent<"page"> {
  return c.type === "page";
}

// isFormInput is a pages-ui utility combining multiple guards
const FORM_INPUT_TYPES = new Set(["input", "number-input", "select", "checkbox", "date-picker", "textarea"]);

export function isFormInput(c: Component): boolean {
  return FORM_INPUT_TYPES.has(c.type);
}
