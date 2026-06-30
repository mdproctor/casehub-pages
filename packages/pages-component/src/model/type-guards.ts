import type { Component } from "./types.js";
import type {
  GridProps,
  ColumnsProps,
  RowsProps,
  StackProps,
  TabsProps,
  PillsProps,
  SidebarProps,
  TreeProps,
  MenuProps,
  AccordionProps,
  CarouselProps,
  SplitProps,
  DockBarProps,
  HostPanelProps,
  PanelProps,
  HtmlProps,
  MarkdownProps,
  TitleProps,
  LazyPageProps,
} from "./component-props.js";
import type {
  BarChartProps,
  LineChartProps,
  AreaChartProps,
  PieChartProps,
  ScatterChartProps,
  BubbleChartProps,
  TimeseriesProps,
  TableProps,
  MetricProps,
  MeterProps,
  SelectorProps,
  MapProps,
  IframePluginProps,
} from "./displayer-types.js";
import type {
  TextInputProps,
  NumberInputProps,
  DropdownProps,
  CheckboxProps,
  DatePickerProps,
  TextareaProps,
} from "./form-input-types.js";
import type { PageProps } from "./page-props.js";

export interface ComponentTypeRegistry {
  // Layout components
  grid: GridProps;
  columns: ColumnsProps;
  rows: RowsProps;
  stack: StackProps;
  tabs: TabsProps;
  pills: PillsProps;
  sidebar: SidebarProps;
  tree: TreeProps;
  menu: MenuProps;
  accordion: AccordionProps;
  carousel: CarouselProps;
  // Workbench components
  split: SplitProps;
  "dock-bar": DockBarProps;
  "host-panel": HostPanelProps;
  // Wrapper components
  panel: PanelProps;
  // Content components
  html: HtmlProps;
  markdown: MarkdownProps;
  title: TitleProps;
  // Page components
  "lazy-page": LazyPageProps;
  page: PageProps;
  // Chart components
  "bar-chart": BarChartProps;
  "line-chart": LineChartProps;
  "area-chart": AreaChartProps;
  "pie-chart": PieChartProps;
  "scatter-chart": ScatterChartProps;
  "bubble-chart": BubbleChartProps;
  timeseries: TimeseriesProps;
  // Data components
  table: TableProps;
  metric: MetricProps;
  meter: MeterProps;
  selector: SelectorProps;
  map: MapProps;
  // Plugin component
  "iframe-plugin": IframePluginProps;
  // Form input components
  "text-input": TextInputProps;
  "number-input": NumberInputProps;
  dropdown: DropdownProps;
  checkbox: CheckboxProps;
  "date-picker": DatePickerProps;
  textarea: TextareaProps;
}

export type ComponentType = keyof ComponentTypeRegistry;
export type TypedComponent<T extends ComponentType> = Component<T, ComponentTypeRegistry[T]>;

export function getProps<T extends ComponentType>(
  component: Component,
  type: T,
): ComponentTypeRegistry[T] {
  if (component.type !== type) {
    throw new Error(`Expected ${type}, got ${component.type}`);
  }
  return component.props as unknown as ComponentTypeRegistry[T];
}

export function isComponentType<T extends ComponentType>(
  c: Component,
  type: T,
): c is TypedComponent<T> {
  return c.type === type;
}

// Layout components
export function isGrid(c: Component): c is TypedComponent<"grid"> {
  return c.type === "grid";
}

export function isColumns(c: Component): c is TypedComponent<"columns"> {
  return c.type === "columns";
}

export function isRows(c: Component): c is TypedComponent<"rows"> {
  return c.type === "rows";
}

export function isStack(c: Component): c is TypedComponent<"stack"> {
  return c.type === "stack";
}

export function isTabs(c: Component): c is TypedComponent<"tabs"> {
  return c.type === "tabs";
}

export function isPills(c: Component): c is TypedComponent<"pills"> {
  return c.type === "pills";
}

export function isSidebar(c: Component): c is TypedComponent<"sidebar"> {
  return c.type === "sidebar";
}

export function isTree(c: Component): c is TypedComponent<"tree"> {
  return c.type === "tree";
}

export function isMenu(c: Component): c is TypedComponent<"menu"> {
  return c.type === "menu";
}

export function isAccordion(c: Component): c is TypedComponent<"accordion"> {
  return c.type === "accordion";
}

export function isCarousel(c: Component): c is TypedComponent<"carousel"> {
  return c.type === "carousel";
}

// Workbench components
export function isSplit(c: Component): c is TypedComponent<"split"> {
  return c.type === "split";
}

export function isDockBar(c: Component): c is TypedComponent<"dock-bar"> {
  return c.type === "dock-bar";
}

export function isHostPanel(c: Component): c is TypedComponent<"host-panel"> {
  return c.type === "host-panel";
}

// Wrapper components
export function isPanel(c: Component): c is TypedComponent<"panel"> {
  return c.type === "panel";
}

// Content components
export function isHtml(c: Component): c is TypedComponent<"html"> {
  return c.type === "html";
}

export function isMarkdown(c: Component): c is TypedComponent<"markdown"> {
  return c.type === "markdown";
}

export function isTitle(c: Component): c is TypedComponent<"title"> {
  return c.type === "title";
}

// Page components
export function isLazyPage(c: Component): c is TypedComponent<"lazy-page"> {
  return c.type === "lazy-page";
}

// Chart components
export function isBarChart(c: Component): c is TypedComponent<"bar-chart"> {
  return c.type === "bar-chart";
}

export function isLineChart(c: Component): c is TypedComponent<"line-chart"> {
  return c.type === "line-chart";
}

export function isAreaChart(c: Component): c is TypedComponent<"area-chart"> {
  return c.type === "area-chart";
}

export function isPieChart(c: Component): c is TypedComponent<"pie-chart"> {
  return c.type === "pie-chart";
}

export function isScatterChart(c: Component): c is TypedComponent<"scatter-chart"> {
  return c.type === "scatter-chart";
}

export function isBubbleChart(c: Component): c is TypedComponent<"bubble-chart"> {
  return c.type === "bubble-chart";
}

export function isTimeseries(c: Component): c is TypedComponent<"timeseries"> {
  return c.type === "timeseries";
}

// Data components
export function isTable(c: Component): c is TypedComponent<"table"> {
  return c.type === "table";
}

export function isMetric(c: Component): c is TypedComponent<"metric"> {
  return c.type === "metric";
}

export function isMeter(c: Component): c is TypedComponent<"meter"> {
  return c.type === "meter";
}

export function isSelector(c: Component): c is TypedComponent<"selector"> {
  return c.type === "selector";
}

export function isMap(c: Component): c is TypedComponent<"map"> {
  return c.type === "map";
}

// Plugin component
export function isIframePlugin(c: Component): c is TypedComponent<"iframe-plugin"> {
  return c.type === "iframe-plugin";
}

// Form input components
export function isTextInput(c: Component): c is TypedComponent<"text-input"> {
  return c.type === "text-input";
}

export function isNumberInput(c: Component): c is TypedComponent<"number-input"> {
  return c.type === "number-input";
}

export function isDropdown(c: Component): c is TypedComponent<"dropdown"> {
  return c.type === "dropdown";
}

export function isCheckbox(c: Component): c is TypedComponent<"checkbox"> {
  return c.type === "checkbox";
}

export function isDatePicker(c: Component): c is TypedComponent<"date-picker"> {
  return c.type === "date-picker";
}

export function isTextarea(c: Component): c is TypedComponent<"textarea"> {
  return c.type === "textarea";
}
