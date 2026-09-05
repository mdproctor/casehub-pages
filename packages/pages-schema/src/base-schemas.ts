import { z } from "zod";
import { lookupSchema } from "@casehubio/pages-data";

const drillDownSchema = z.object({
  target: z.string(),
  parameters: z.record(z.string()).optional(),
});

export const filterSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  notification: z.boolean().optional(),
  listening: z.boolean().optional(),
  selfApply: z.boolean().optional(),
  group: z.string().optional(),
  drillDown: drillDownSchema.optional(),
});

export const refreshSettingsSchema = z.object({
  interval: z.number().optional(),
  showStaleIndicator: z.boolean().optional(),
});

export const columnSettingsSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  sortable: z.boolean().optional(),
  visible: z.boolean().optional(),
  width: z.string().optional(),
  minWidth: z.string().optional(),
  align: z.enum(["start", "center", "end"]).optional(),
  filterable: z.boolean().optional(),
  mergeRows: z.boolean().optional(),
});

export const chartSettingsSchema = z.object({
  resizable: z.boolean().optional(),
  zoom: z.boolean().optional(),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional(),
  legend: z.object({
    show: z.boolean().optional(),
    position: z.enum(["top", "bottom", "left", "right"]).optional(),
  }).optional(),
  margin: z.object({
    top: z.number().optional(),
    right: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
  }).optional(),
  xAxis: z.object({
    title: z.string().optional(),
    showLabels: z.boolean().optional(),
    labelAngle: z.number().optional(),
  }).optional(),
  yAxis: z.object({
    title: z.string().optional(),
    showLabels: z.boolean().optional(),
    labelAngle: z.number().optional(),
  }).optional(),
  grid: z.object({
    x: z.boolean().optional(),
    y: z.boolean().optional(),
  }).optional(),
  extra: z.record(z.unknown()).optional(),
});

export const dataComponentCommonSchema = z.object({
  title: z.string().optional(),
  visible: z.boolean().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  csvExport: z.boolean().optional(),
  lookup: lookupSchema,
  rowCount: z.number().optional(),
  rowOffset: z.number().optional(),
  columns: z.array(columnSettingsSchema).optional(),
  filter: filterSettingsSchema.optional(),
  refresh: refreshSettingsSchema.optional(),
});
