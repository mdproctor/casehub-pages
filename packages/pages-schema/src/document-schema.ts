import { z } from "zod";
import { externalDataSetDefSchema } from "@casehubio/pages-data";
import {
  barChartPropsSchema, lineChartPropsSchema, areaChartPropsSchema,
  pieChartPropsSchema, scatterChartPropsSchema, bubbleChartPropsSchema,
  timeseriesPropsSchema, heatmapChartPropsSchema, treemapChartPropsSchema,
  densityHeatmapPropsSchema, metricGridPropsSchema,
  dataTablePropsSchema, gridTablePropsSchema,
  metricPropsSchema, meterPropsSchema, selectorPropsSchema,
  mapPropsSchema, badgePropsSchema, countdownPropsSchema,
  timelinePropsSchema, graphPropsSchema, eventTimelinePropsSchema,
  groupedViewPropsSchema,
  gridPropsSchema, columnsPropsSchema, rowsPropsSchema, stackPropsSchema,
  tabsPropsSchema, pillsPropsSchema, sidebarPropsSchema, treePropsSchema,
  menuPropsSchema, accordionPropsSchema, carouselPropsSchema,
  splitPropsSchema, dockBarPropsSchema, hostPanelPropsSchema,
  floatingWorkspacePropsSchema,
  panelPropsSchema, htmlPropsSchema, markdownPropsSchema, titlePropsSchema,
  lazyPagePropsSchema, pagePropsSchema,
  textInputPropsSchema, numberInputPropsSchema, dropdownPropsSchema,
  checkboxPropsSchema, datePickerPropsSchema, textareaPropsSchema,
  schemaFormPropsSchema, actionButtonPropsSchema,
  formScopePropsSchema, submitButtonPropsSchema,
  iframePluginPropsSchema,
} from "./component-schemas.js";

const componentBase = z.object({
  id: z.string().optional(),
  style: z.record(z.string()).optional(),
  visibleWhen: z.string().optional(),
});

export const componentSchema: z.ZodType = z.discriminatedUnion("type", [
  componentBase.extend({ type: z.literal("grid"), properties: gridPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("columns"), properties: columnsPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("rows"), properties: rowsPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("stack"), properties: stackPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("tabs"), properties: tabsPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("pills"), properties: pillsPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("sidebar"), properties: sidebarPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("tree"), properties: treePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("menu"), properties: menuPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("accordion"), properties: accordionPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("carousel"), properties: carouselPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("split"), properties: splitPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("dock-bar"), properties: dockBarPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("host-panel"), properties: hostPanelPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("floating-workspace"), properties: floatingWorkspacePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("panel"), properties: panelPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("html"), properties: htmlPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("markdown"), properties: markdownPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("title"), properties: titlePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("lazy-page"), properties: lazyPagePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("page"), properties: pagePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("bar-chart"), properties: barChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("line-chart"), properties: lineChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("area-chart"), properties: areaChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("pie-chart"), properties: pieChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("scatter-chart"), properties: scatterChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("bubble-chart"), properties: bubbleChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("timeseries"), properties: timeseriesPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("heatmap-chart"), properties: heatmapChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("treemap-chart"), properties: treemapChartPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("density-heatmap"), properties: densityHeatmapPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("metric-grid"), properties: metricGridPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("data-table"), properties: dataTablePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("grid-table"), properties: gridTablePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("metric"), properties: metricPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("meter"), properties: meterPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("selector"), properties: selectorPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("map"), properties: mapPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("badge"), properties: badgePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("countdown"), properties: countdownPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("timeline"), properties: timelinePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("graph"), properties: graphPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("event-timeline"), properties: eventTimelinePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("grouped-view"), properties: groupedViewPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("iframe-plugin"), properties: iframePluginPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("input"), properties: textInputPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("number-input"), properties: numberInputPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("select"), properties: dropdownPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("checkbox"), properties: checkboxPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("date-picker"), properties: datePickerPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("textarea"), properties: textareaPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("schema-form"), properties: schemaFormPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("action-button"), properties: actionButtonPropsSchema.optional() }),
  componentBase.extend({ type: z.literal("form-scope"), properties: formScopePropsSchema.optional() }),
  componentBase.extend({ type: z.literal("submit-button"), properties: submitButtonPropsSchema.optional() }),
]);

const navItemSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.enum(["GROUP", "ITEM"]).optional(),
    id: z.string().optional(),
    children: z.array(navItemSchema).optional(),
    page: z.string().optional(),
  })
);

const navTreeSchema = z.object({
  root_items: z.array(navItemSchema).optional(),
});

const columnSchema = z.object({
  span: z.number().optional(),
  components: z.array(componentSchema).optional(),
  properties: z.record(z.unknown()).optional(),
});

const rowSchema = z.object({
  columns: z.array(columnSchema).optional(),
  properties: z.record(z.unknown()).optional(),
});

const pageEntrySchema = z.object({
  name: z.string().optional(),
  components: z.array(componentSchema).optional(),
  rows: z.array(rowSchema).optional(),
  columns: z.array(columnSchema).optional(),
  properties: z.record(z.string()).optional(),
});

export const dashboardSchema: z.ZodType = z.object({
  pages: z.array(pageEntrySchema).optional(),
  datasets: z.array(externalDataSetDefSchema).optional(),
  navTree: navTreeSchema.optional(),
  properties: z.record(z.string()).optional(),
});
