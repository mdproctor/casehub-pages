// Re-export all DSL builders
export {
  // Page builders
  page,
  type PageOptions,
  // Layout builders
  grid,
  at,
  columns,
  rows,
  metricGrid,
  stack,
  // Navigation builders
  tabs,
  pills,
  sidebar,
  tree,
  menu,
  accordion,
  carousel,
  // Wrapper builders
  panel,
  // Content builders
  html,
  markdown,
  title,
  // Decorator builders
  withId,
  withAccess,
  withStyle,
  // Dataset helpers
  bind,
  resetGridCounter,
  // Data component builders
  barChart,
  lineChart,
  areaChart,
  pieChart,
  scatterChart,
  bubbleChart,
  timeseries,
  dataTable,
  gridTable,
  metric,
  meter,
  selector,
  mapChart,
  iframePlugin,
  // Form input builders
  textInput,
  numberInput,
  dropdown,
  checkbox,
  datePicker,
  textarea,
  // Workbench primitive builders
  split,
  dockBar,
  hostPanel,
} from "./builders.js";

// Re-export all lookup helpers
export {
  // Main lookup builder
  lookup,
  // Group builders
  groupBy,
  groupByCalendar,
  // Filter builders
  filterBy,
  and,
  or,
  not,
  // Sort builder
  sortBy,
  // Result column helpers
  col,
  sum,
  avg,
  count,
  min,
  max,
  distinct,
  join,
  distinctJoin,
} from "./lookup-helpers.js";

// Re-export data source constructors from pages-data for ergonomic imports
export { inlineSource } from "@casehubio/pages-data";
export type { InlineSourceOptions } from "@casehubio/pages-data";
export { restSource } from "@casehubio/pages-data";
export type { RestSourceOptions } from "@casehubio/pages-data";
