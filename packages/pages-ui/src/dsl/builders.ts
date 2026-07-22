import type {
  Component,
  GridItem,
  AccessControl,
} from "../model/types.js";
import type { TypedComponent } from "@casehubio/pages-component";
import type {
  HtmlProps,
  MarkdownProps,
  TitleProps,
  PanelProps,
  GridProps,
  ColumnsProps,
} from "../model/component-props.js";
import type {
  SplitProps,
  DockBarProps,
  DockItem,
  HostPanelProps,
} from "@casehubio/pages-component";
import type { PageProps, PageSettings, DataScope, SaveConfig } from "../model/page-types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data";
import type { DataSetId } from "@casehubio/pages-data";
import type { DataSourceBinding, DataSource } from "@casehubio/pages-data";
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
  TextInputProps,
  NumberInputProps,
  DropdownProps,
  CheckboxProps,
  DatePickerProps,
  TextareaProps,
} from "@casehubio/pages-component";

// Grid ID counter — scoped per page tree via resetGridCounter()
let gridCounter = 0;

export function resetGridCounter(): void {
  gridCounter = 0;
}

export interface PageOptions {
  readonly datasets?: readonly ExternalDataSetDef[] | readonly DataSourceBinding[];
  readonly settings?: PageSettings;
  readonly properties?: Record<string, string>;
  readonly dataScope?: DataScope;
  readonly save?: SaveConfig;
}

function isPageOptions(arg: unknown): arg is PageOptions {
  if (typeof arg !== "object" || arg === null) return false;
  const obj = arg as Record<string, unknown>;
  // PageOptions has no 'type' property (Components always do)
  if ("type" in obj) return false;
  // Must have at least one of the PageOptions fields
  return "datasets" in obj || "settings" in obj || "properties" in obj
      || "dataScope" in obj || "save" in obj;
}

function freeze<T>(obj: T): T {
  return Object.freeze(obj);
}

export function page(
  name: string,
  ...args: (Component | PageOptions)[]
): TypedComponent<"page"> {
  // Validate name
  if (name.includes("/")) {
    throw new Error(`Page name cannot contain '/': ${name}`);
  }

  // Split args into children and options
  const children: Component[] = [];
  let options: PageOptions | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (i === args.length - 1 && isPageOptions(arg)) {
      options = arg;
    } else {
      children.push(arg as Component);
    }
  }

  // Validate no duplicate child page names at same level
  const childPages = children.filter((c) => c.type === "page");
  const pageNames = new Set<string>();
  for (const child of childPages) {
    const childName = (child.props as PageProps).name;
    if (childName) {
      if (pageNames.has(childName)) {
        throw new Error(`Duplicate child page name: ${childName}`);
      }
      pageNames.add(childName);
    }
  }

  const props: PageProps = {
    name,
    ...(options?.datasets && { datasets: options.datasets }),
    ...(options?.settings && { settings: options.settings }),
    ...(options?.properties && { properties: options.properties }),
    ...(options?.dataScope && { dataScope: options.dataScope }),
    ...(options?.save && { save: options.save }),
  };

  return freeze({
    type: "page" as const,
    props,
    slots: { content: children },
  });
}

export function grid(columns: number, ...items: GridItem[]): TypedComponent<"grid"> {
  const gridId = `grid_${String(gridCounter++)}`;

  const props: GridProps = { columns };

  return freeze({
    type: "grid" as const,
    id: gridId,
    props,
    items,
  });
}

export function at(
  x: number,
  y: number,
  w: number,
  h: number,
  component: Component
): GridItem {
  return freeze({
    placement: freeze({ x, y, w, h }),
    component,
  });
}

export function columns(
  distribution: number[],
  ...slotContents: Component[][]
): TypedComponent<"columns"> {
  if (distribution.length !== slotContents.length) {
    throw new Error(
      `Distribution length (${String(distribution.length)}) must match slotContents length (${String(slotContents.length)})`
    );
  }

  const slots: Record<string, readonly Component[]> = {};
  for (let i = 0; i < slotContents.length; i++) {
    const content = slotContents[i];
    if (!content) continue;
    slots[`col-${String(i)}`] = content;
  }

  const props: ColumnsProps = { distribution };

  return freeze({
    type: "columns" as const,
    props,
    slots: freeze(slots),
  });
}

export function rows(...children: Component[]): Component {
  return freeze({
    type: "rows",
    slots: { default: children },
  });
}

export function metricGrid(...children: Component[]): Component {
  return freeze({
    type: "metric-grid",
    slots: { default: children },
  });
}

export function stack(...children: Component[]): Component {
  return freeze({
    type: "stack",
    slots: { default: children },
  });
}

// Helper for navigation components
function navComponent(
  type: string,
  entries: [string, ...Component[]][]
): Component {
  const slots: Record<string, readonly Component[]> = {};
  for (const [label, ...components] of entries) {
    slots[label] = components;
  }

  return freeze({
    type,
    slots: freeze(slots),
  });
}

export function tabs(...entries: [string, ...Component[]][]): Component {
  return navComponent("tabs", entries);
}

export function pills(...entries: [string, ...Component[]][]): Component {
  return navComponent("pills", entries);
}

export function sidebar(...entries: [string, ...Component[]][]): Component {
  return navComponent("sidebar", entries);
}

export function tree(...entries: [string, ...Component[]][]): Component {
  return navComponent("tree", entries);
}

export function menu(...entries: [string, ...Component[]][]): Component {
  return navComponent("menu", entries);
}

export function accordion(...entries: [string, ...Component[]][]): Component {
  return navComponent("accordion", entries);
}

export function carousel(...entries: [string, ...Component[]][]): Component {
  return navComponent("carousel", entries);
}

export function panel(title: string, ...children: Component[]): TypedComponent<"panel"> {
  const props: PanelProps = { title };

  return freeze({
    type: "panel" as const,
    props,
    slots: { default: children },
  });
}

export function html(content: string): TypedComponent<"html"> {
  const props: HtmlProps = { content };

  return freeze({
    type: "html" as const,
    props,
  });
}

export function markdown(content: string): TypedComponent<"markdown"> {
  const props: MarkdownProps = { content };

  return freeze({
    type: "markdown" as const,
    props,
  });
}

export function title(text: string, size?: string): TypedComponent<"title"> {
  const props: TitleProps = {
    text,
    ...(size !== undefined && { size }),
  };

  return freeze({
    type: "title" as const,
    props,
  });
}

export function withId(id: string, component: Component): Component {
  return freeze({
    ...component,
    id,
  });
}

export function withAccess(
  access: AccessControl,
  component: Component
): Component {
  return freeze({
    ...component,
    access,
  });
}

export function withStyle(
  style: Record<string, string>,
  component: Component
): Component {
  return freeze({
    ...component,
    style: freeze(style),
  });
}

// Data component builders
export function barChart(props: BarChartProps): TypedComponent<"bar-chart"> {
  return freeze({
    type: "bar-chart" as const,
    props: { ...props },
  });
}

export function lineChart(props: LineChartProps): TypedComponent<"line-chart"> {
  return freeze({
    type: "line-chart" as const,
    props: { ...props },
  });
}

export function areaChart(props: AreaChartProps): TypedComponent<"area-chart"> {
  return freeze({
    type: "area-chart" as const,
    props: { ...props },
  });
}

export function pieChart(props: PieChartProps): TypedComponent<"pie-chart"> {
  return freeze({
    type: "pie-chart" as const,
    props: { ...props },
  });
}

export function scatterChart(props: ScatterChartProps): TypedComponent<"scatter-chart"> {
  return freeze({
    type: "scatter-chart" as const,
    props: { ...props },
  });
}

export function bubbleChart(props: BubbleChartProps): TypedComponent<"bubble-chart"> {
  return freeze({
    type: "bubble-chart" as const,
    props: { ...props },
  });
}

export function timeseries(props: TimeseriesProps): TypedComponent<"timeseries"> {
  return freeze({
    type: "timeseries" as const,
    props: { ...props },
  });
}

export function table(props: TableProps): TypedComponent<"table"> {
  return freeze({
    type: "table" as const,
    props: { ...props },
  });
}

export function metric(props: MetricProps): TypedComponent<"metric"> {
  return freeze({
    type: "metric" as const,
    props: { ...props },
  });
}

export function meter(props: MeterProps): TypedComponent<"meter"> {
  return freeze({
    type: "meter" as const,
    props: { ...props },
  });
}

export function selector(props: SelectorProps): TypedComponent<"selector"> {
  return freeze({
    type: "selector" as const,
    props: { ...props },
  });
}

export function mapChart(props: MapProps): TypedComponent<"map"> {
  return freeze({
    type: "map" as const,
    props: { ...props },
  });
}

export function iframePlugin(props: IframePluginProps): TypedComponent<"iframe-plugin"> {
  return freeze({
    type: "iframe-plugin" as const,
    props: { ...props },
  });
}

// Form input builders
export function textInput(props: TextInputProps): Component {
  return freeze({ type: "text-input" as const, props: freeze({ ...props }) });
}

export function numberInput(props: NumberInputProps): Component {
  return freeze({ type: "number-input" as const, props: freeze({ ...props }) });
}

export function dropdown(props: DropdownProps): Component {
  return freeze({ type: "dropdown" as const, props: freeze({ ...props }) });
}

export function checkbox(props: CheckboxProps): Component {
  return freeze({ type: "checkbox" as const, props: freeze({ ...props }) });
}

export function datePicker(props: DatePickerProps): Component {
  return freeze({ type: "date-picker" as const, props: freeze({ ...props }) });
}

export function textarea(props: TextareaProps): Component {
  return freeze({ type: "textarea" as const, props: freeze({ ...props }) });
}

// DataSource binding builder

export function bind(
  id: string,
  source: DataSource,
  options?: { keyColumn?: string },
): DataSourceBinding {
  return Object.freeze({
    id: id as DataSetId,
    source,
    ...(options?.keyColumn !== undefined && { keyColumn: options.keyColumn }),
  });
}

// Workbench primitive builders

export function split(
  direction: "horizontal" | "vertical",
  children: Component[],
  options?: { ratio?: number[]; minSizes?: number[] },
): TypedComponent<"split"> {
  const slots: Record<string, readonly Component[]> = {};
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    slots[String(i)] = [child];
  }
  const props: SplitProps = {
    direction,
    ...(options?.ratio ? { ratio: options.ratio } : {}),
    ...(options?.minSizes ? { minSizes: options.minSizes } : {}),
  };
  return freeze({ type: "split" as const, props, slots: freeze(slots) });
}

export function dockBar(
  orientation: "vertical" | "horizontal",
  items: DockItem[],
): TypedComponent<"dock-bar"> {
  const props: DockBarProps = { orientation, items };
  return freeze({ type: "dock-bar" as const, props });
}

export function hostPanel(
  typeName: string,
  panelProps?: Record<string, unknown>,
): TypedComponent<"host-panel"> {
  const props: HostPanelProps = {
    typeName,
    ...(panelProps ? { panelProps } : {}),
  };
  return freeze({ type: "host-panel" as const, props });
}
