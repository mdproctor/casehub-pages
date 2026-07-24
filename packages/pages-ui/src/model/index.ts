// Core types
export type {
  Component,
  AccessControl,
  GridPlacement,
  GridItem,
  PermissionContext,
} from "./types.js";
export { ALLOW_ALL } from "./types.js";

// Component props
export type {
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
  PanelProps,
  HtmlProps,
  MarkdownProps,
  TitleProps,
  LazyPageProps,
  FilterSettings,
  DrillDown,
  RefreshSettings,
  SplitProps,
  DockBarProps,
  DockItem,
  HostPanelProps,
} from "./component-props.js";

// Page types (runtime types defined here, component-level types re-exported from pages-component)
export type {
  PageProps,
  PageSettings,
  DataComponentDefaults,
  LookupDefaults,
  DataSetDefaults,
  DataScope,
  DataScopeRef,
  SaveConfig,
  ViewState,
  DeepLink,
  Site,
} from "./page-types.js";

// Displayer types (re-exported from pages-component)
export type {
  DataComponentCommon,
  ChartSettings,
  BarChartProps,
  LineChartProps,
  AreaChartProps,
  PieChartProps,
  ScatterChartProps,
  BubbleChartProps,
  TimeseriesProps,
  DataTableProps,
  GridTableProps,
  MetricProps,
  MeterProps,
  SelectorProps,
  MapProps,
  IframePluginProps,
} from "@casehubio/pages-component";

// Form input types (re-exported from pages-component)
export type {
  FormInputCommon,
  TextInputProps,
  NumberInputProps,
  FixedOptions,
  DataSetOptions,
  DropdownProps,
  CheckboxProps,
  DatePickerProps,
  TextareaProps,
} from "@casehubio/pages-component";
export { isFixedOptions } from "@casehubio/pages-component";

// Type guards
export type { ComponentTypeRegistry } from "./type-guards.js";
export {
  getProps,
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
  isPage,
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
  isFormInput,
} from "./type-guards.js";
