import { z } from "zod";
import { dataComponentCommonSchema, chartSettingsSchema, filterSettingsSchema, refreshSettingsSchema } from "./base-schemas.js";

const submitConfigSchema = z.object({
  url: z.string(),
  method: z.enum(["POST", "PUT"]).optional(),
  fieldName: z.string().optional(),
  clearOnSubmit: z.boolean().optional(),
  onSuccess: z.object({ refresh: z.array(z.string()).optional(), message: z.string().optional() }).optional(),
  onError: z.object({ message: z.string().optional() }).optional(),
});

const formInputCommonSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  required: z.boolean().optional(),
  readonly: z.boolean().optional(),
  submit: submitConfigSchema.optional(),
});

const chartDataBase = dataComponentCommonSchema.merge(chartSettingsSchema);

// --- Chart data components ---

export const barChartPropsSchema = chartDataBase.extend({
  subtype: z.enum(["column", "column-stacked", "bar", "bar-stacked"]).optional(),
});

export const lineChartPropsSchema = chartDataBase.extend({
  subtype: z.enum(["line", "smooth"]).optional(),
});

export const areaChartPropsSchema = chartDataBase.extend({
  subtype: z.enum(["area", "area-stacked"]).optional(),
});

export const pieChartPropsSchema = chartDataBase.extend({
  subtype: z.enum(["pie", "donut"]).optional(),
});

export const scatterChartPropsSchema = chartDataBase;

export const bubbleChartPropsSchema = chartDataBase.extend({
  minRadius: z.number().optional(),
  maxRadius: z.number().optional(),
});

export const timeseriesPropsSchema = chartDataBase;

export const heatmapChartPropsSchema = chartDataBase.extend({
  minColor: z.string().optional(),
  maxColor: z.string().optional(),
});

export const treemapChartPropsSchema = chartDataBase.extend({
  parentColumn: z.string().optional(),
  colorColumn: z.string().optional(),
});

export const densityHeatmapPropsSchema = dataComponentCommonSchema.extend({
  xColumn: z.string().optional(),
  yColumn: z.string().optional(),
  valueColumn: z.string().optional(),
  gradient: z.array(z.object({ offset: z.number(), color: z.string() })).optional(),
  radius: z.number().optional(),
  aggregation: z.enum(["max", "sum", "mean", "count"]).optional(),
  showTooltip: z.boolean().optional(),
  showLegend: z.boolean().optional(),
});

export const metricGridPropsSchema = z.object({
  direction: z.enum(["row", "grid"]).optional(),
});

// --- Non-chart data components ---

export const dataTablePropsSchema = dataComponentCommonSchema.extend({
  pageSize: z.number().optional(),
  sortable: z.boolean().optional(),
  resizable: z.boolean().optional(),
  selection: z.enum(["none", "single", "multi"]).optional(),
  selectionKey: z.string().optional(),
});

export const gridTablePropsSchema = dataComponentCommonSchema.extend({
  columnHeaders: z.boolean().optional(),
  rowHeaders: z.boolean().optional(),
  cellDisplay: z.record(z.enum(["text", "boolean", "color", "badge", "number"])).optional(),
  compact: z.boolean().optional(),
  stripe: z.enum(["rows", "columns", "both"]).optional(),
  verticalLines: z.boolean().optional(),
  transpose: z.boolean().optional(),
});

export const metricPropsSchema = dataComponentCommonSchema.extend({
  subtype: z.enum(["card", "card2", "plain-text", "quota"]).optional(),
  pattern: z.string().optional(),
  html: z.object({
    template: z.string().optional(),
    javascript: z.string().optional(),
  }).optional(),
  sparklineData: z.array(z.number()).optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
});

export const meterPropsSchema = dataComponentCommonSchema.merge(chartSettingsSchema).extend({
  end: z.number().optional(),
  warning: z.number().optional(),
  critical: z.number().optional(),
});

export const selectorPropsSchema = dataComponentCommonSchema.extend({
  subtype: z.enum(["dropdown", "slider", "labels"]).optional(),
});

export const mapPropsSchema = dataComponentCommonSchema.merge(chartSettingsSchema).extend({
  subtype: z.enum(["regions", "markers"]).optional(),
  colorScheme: z.string().optional(),
  mapName: z.string().optional(),
});

export const badgePropsSchema = dataComponentCommonSchema.extend({
  column: z.string().optional(),
  colorMap: z.record(z.string()).optional(),
});

export const countdownPropsSchema = dataComponentCommonSchema.extend({
  deadlineColumn: z.string().optional(),
  format: z.enum(["full", "compact", "days-only"]).optional(),
  warningThreshold: z.string().optional(),
  criticalThreshold: z.string().optional(),
});

export const timelinePropsSchema = dataComponentCommonSchema.merge(chartSettingsSchema).extend({
  startColumn: z.string().optional(),
  endColumn: z.string().optional(),
  labelColumn: z.string().optional(),
  categoryColumn: z.string().optional(),
});

export const graphPropsSchema = dataComponentCommonSchema.merge(chartSettingsSchema).extend({
  layout: z.enum(["force", "circular", "none"]).optional(),
  sourceColumn: z.string().optional(),
  targetColumn: z.string().optional(),
  valueColumn: z.string().optional(),
  directed: z.boolean().optional(),
  nodeLabelColumn: z.string().optional(),
  nodeColorColumn: z.string().optional(),
  nodeColorMap: z.record(z.string()).optional(),
  nodeSizeColumn: z.string().optional(),
});

export const eventTimelinePropsSchema = dataComponentCommonSchema.extend({
  layout: z.enum(["vertical", "horizontal", "compact"]).optional(),
  pageSize: z.number().optional(),
  strategyKey: z.string().optional(),
});

// --- Grouped data ---

const groupingKeySchema = z.object({
  sourceId: z.string(),
  columnId: z.string(),
  strategy: z.object({ mode: z.string() }).passthrough(),
  maxIntervals: z.number().optional(),
  emptyIntervals: z.boolean().optional(),
  ascendingOrder: z.boolean().optional(),
});

const aggregationBindingSchema = z.object({
  column: z.string(),
  fn: z.object({ fn: z.string() }).passthrough(),
});

const rowAccentConfigSchema = z.object({
  column: z.string(),
  colorMap: z.record(z.string()),
  default: z.string().optional(),
  columns: z.union([z.literal("all"), z.array(z.string())]).optional(),
});

export const groupedViewPropsSchema = dataComponentCommonSchema.extend({
  groupBy: z.union([groupingKeySchema, z.array(groupingKeySchema)]),
  preset: z.enum(["spreadsheet", "sectioned", "list"]).optional(),
  groupDisplay: z.enum(["table-row", "section-heading"]).optional(),
  contentDisplay: z.enum(["table", "list"]).optional(),
  defaultExpanded: z.boolean().optional(),
  showGroupSummary: z.boolean().optional(),
  aggregations: z.array(aggregationBindingSchema).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  emptyGroups: z.boolean().optional(),
  rowAccent: rowAccentConfigSchema.optional(),
  selection: z.enum(["none", "single", "multi"]).optional(),
  sortable: z.boolean().optional(),
  clientSort: z.boolean().optional(),
});

// --- Layout components ---

export const gridPropsSchema = z.object({
  columns: z.number(),
});

export const columnsPropsSchema = z.object({
  distribution: z.array(z.number()),
});

export const rowsPropsSchema = z.object({});
export const stackPropsSchema = z.object({});
export const tabsPropsSchema = z.object({});
export const pillsPropsSchema = z.object({});
export const sidebarPropsSchema = z.object({});
export const treePropsSchema = z.object({});
export const menuPropsSchema = z.object({});
export const accordionPropsSchema = z.object({});
export const carouselPropsSchema = z.object({});

// --- Workbench components ---

export const splitPropsSchema = z.object({
  direction: z.enum(["horizontal", "vertical"]),
  ratio: z.array(z.number()).optional(),
  minSizes: z.array(z.number()).optional(),
});

const dockItemSchema = z.object({
  icon: z.string(),
  label: z.string(),
  panelId: z.string(),
  defaultOpen: z.boolean().optional(),
  zone: z.string().optional(),
  fixed: z.boolean().optional(),
});

export const dockBarPropsSchema = z.object({
  orientation: z.enum(["vertical", "horizontal"]),
  items: z.array(dockItemSchema),
  exclusive: z.boolean().optional(),
  side: z.enum(["left", "right", "bottom"]).optional(),
});

export const hostPanelPropsSchema = z.object({
  typeName: z.string(),
  panelProps: z.record(z.unknown()).optional(),
  lookup: z.any().optional(),
  selectionSource: z.string().optional(),
});

export const floatingWorkspacePropsSchema = z.object({
  centre: z.any(),
  frames: z.array(z.any()).optional(),
  organisers: z.boolean().optional(),
});

// --- Content / wrapper / page ---

export const panelPropsSchema = z.object({
  title: z.string(),
});

export const htmlPropsSchema = z.object({
  content: z.string(),
});

export const markdownPropsSchema = z.object({
  content: z.string(),
});

export const titlePropsSchema = z.object({
  text: z.string(),
  size: z.string().optional(),
});

export const lazyPagePropsSchema = z.object({
  name: z.string(),
  href: z.string(),
});

export const pagePropsSchema = z.object({
  name: z.string().optional(),
  datasets: z.array(z.any()).optional(),
  settings: z.object({
    mode: z.enum(["light", "dark"]).optional(),
    allowUrlProperties: z.boolean().optional(),
  }).passthrough().optional(),
  properties: z.record(z.string()).optional(),
});

// --- Form components ---

export const textInputPropsSchema = formInputCommonSchema.extend({
  placeholder: z.string().optional(),
  maxLength: z.number().optional(),
});

export const numberInputPropsSchema = formInputCommonSchema.extend({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

export const dropdownPropsSchema = formInputCommonSchema.extend({
  options: z.union([
    z.object({ values: z.array(z.string()) }),
    z.object({
      dataset: z.string(),
      labelColumn: z.string(),
      valueColumn: z.string(),
      filterField: z.string().optional(),
      filterColumn: z.string().optional(),
    }),
  ]),
});

export const checkboxPropsSchema = formInputCommonSchema;

export const datePickerPropsSchema = formInputCommonSchema.extend({
  min: z.string().optional(),
  max: z.string().optional(),
});

export const textareaPropsSchema = formInputCommonSchema.extend({
  rows: z.number().optional(),
  maxLength: z.number().optional(),
});

// --- Other components ---

const fieldSchemaZod: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.union([z.string(), z.array(z.string())]).optional(),
    format: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    properties: z.record(fieldSchemaZod).optional(),
    required: z.array(z.string()).optional(),
    items: fieldSchemaZod.optional(),
    oneOf: z.array(fieldSchemaZod).optional(),
    $ref: z.string().optional(),
    $defs: z.record(fieldSchemaZod).optional(),
  }).passthrough()
);

export const schemaFormPropsSchema = z.object({
  schema: fieldSchemaZod.optional(),
  mode: z.enum(["display", "edit"]).optional(),
  forceCreate: z.boolean().optional(),
  validateOnBlur: z.boolean().optional(),
  excludeFields: z.array(z.string()).optional(),
  fieldOrder: z.array(z.string()).optional(),
  fields: z.array(z.string()).optional(),
  labels: z.record(z.string()).optional(),
  fieldsOnly: z.boolean().optional(),
});

export const actionButtonPropsSchema = z.object({
  label: z.string(),
  url: z.string(),
  method: z.enum(["POST", "PUT", "DELETE"]).optional(),
  body: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
  confirm: z.string().optional(),
  style: z.enum(["primary", "danger", "secondary", "ghost", "outline"]).optional(),
  disabled: z.boolean().optional(),
  disabledWhen: z.string().optional(),
  onSuccess: z.object({ refresh: z.array(z.string()).optional(), message: z.string().optional() }).optional(),
  onError: z.object({ message: z.string().optional() }).optional(),
});

export const formScopePropsSchema = z.object({
  schema: fieldSchemaZod.optional(),
  validateOnBlur: z.boolean().optional(),
  mode: z.enum(["display", "edit"]).optional(),
});

export const submitButtonPropsSchema = z.object({
  label: z.string(),
  style: z.enum(["primary", "danger", "secondary", "ghost", "outline"]).optional(),
  disabled: z.boolean().optional(),
});

export const iframePluginPropsSchema = z.object({
  componentId: z.string(),
  settings: z.record(z.unknown()).optional(),
  lookup: z.any().optional(),
  title: z.string().optional(),
  visible: z.boolean().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  filter: filterSettingsSchema.optional(),
  refresh: refreshSettingsSchema.optional(),
});
