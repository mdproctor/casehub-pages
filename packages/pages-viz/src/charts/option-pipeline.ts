import type { TypedDataSet, ColumnSettings } from "@casehubio/pages-data";
import type { ChartSettings } from "@casehubio/pages-component";
import { cellToRaw, resolveColumnName, applyCellExpression, resolveColumnExpression } from "../base/cell-extract.js";

/**
 * Stage 1: Convert TypedDataSet to ECharts dataset.source format.
 *
 * Returns an array-of-arrays where:
 * - First row contains display names (resolved via resolveColumnName)
 * - Subsequent rows contain raw values (via cellToRaw)
 */
export async function datasetToSource(
  dataset: TypedDataSet,
  propsColumns?: readonly ColumnSettings[],
): Promise<(string | number | Date | null)[][]> {
  const expressions = dataset.columns.map((c) => resolveColumnExpression(c.id, propsColumns));
  const dataRows = await Promise.all(
    dataset.rows.map(async (row) =>
      Promise.all(
        dataset.columns.map(async (c, i) => {
          const cell = row.cells[i];
          if (!cell) return null;
          const raw = cellToRaw(cell);
          return expressions[i] ? applyCellExpression(raw, expressions[i]) : raw;
        }),
      ),
    ),
  );
  return [
    dataset.columns.map((c) => resolveColumnName(c, propsColumns)),
    ...dataRows,
  ];
}

/**
 * Options for applyChartSettings behavior.
 */
export interface ChartSettingsOptions {
  /**
   * Whether to apply xAxis/yAxis settings (for Cartesian charts).
   * Default: true
   */
  readonly cartesianAxes?: boolean;
}

/**
 * Stage 3: Apply typed ChartSettings fields to ECharts option.
 *
 * Mutates and returns the option object. Only sets fields that are defined.
 *
 * @param settingsOptions - Optional configuration to control which settings are applied
 */
export function applyChartSettings(
  option: Record<string, unknown>,
  props: { title?: string } & ChartSettings,
  settingsOptions?: ChartSettingsOptions,
): Record<string, unknown> {
  const withAxes = settingsOptions?.cartesianAxes ?? true;
  // Title
  if (props.title !== undefined) {
    option.title = { text: props.title };
  }

  // Legend
  if (props.legend !== undefined) {
    const legend: Record<string, unknown> = { ...((option.legend as Record<string, unknown> | undefined) ?? {}) };

    if (props.legend.show !== undefined) {
      legend.show = props.legend.show;
    }

    if (props.legend.position !== undefined) {
      switch (props.legend.position) {
        case "top":
          legend.top = 0;
          break;
        case "bottom":
          legend.bottom = 0;
          break;
        case "left":
          legend.left = 0;
          legend.orient = "vertical";
          break;
        case "right":
          legend.right = 0;
          legend.orient = "vertical";
          break;
      }
    }

    option.legend = legend;
  }

  // X-Axis (only for Cartesian charts)
  if (withAxes && props.xAxis !== undefined) {
    const xAxis: Record<string, unknown> = { ...((option.xAxis as Record<string, unknown> | undefined) ?? {}) };

    if (props.xAxis.title !== undefined) {
      xAxis.name = props.xAxis.title;
    }

    if (props.xAxis.showLabels !== undefined) {
      xAxis.axisLabel = { show: props.xAxis.showLabels };
    }

    if (props.xAxis.labelAngle != null) {
      const existing = (xAxis.axisLabel as Record<string, unknown> | undefined) ?? {};
      xAxis.axisLabel = { ...existing, rotate: props.xAxis.labelAngle };
    }

    option.xAxis = xAxis;
  }

  // Y-Axis (only for Cartesian charts)
  if (withAxes && props.yAxis !== undefined) {
    const yAxis: Record<string, unknown> = { ...((option.yAxis as Record<string, unknown> | undefined) ?? {}) };

    if (props.yAxis.title !== undefined) {
      yAxis.name = props.yAxis.title;
    }

    if (props.yAxis.showLabels !== undefined) {
      yAxis.axisLabel = { show: props.yAxis.showLabels };
    }

    if (props.yAxis.labelAngle != null) {
      const existing = (yAxis.axisLabel as Record<string, unknown> | undefined) ?? {};
      yAxis.axisLabel = { ...existing, rotate: props.yAxis.labelAngle };
    }

    option.yAxis = yAxis;
  }

  // Margins (via grid)
  if (props.margin !== undefined) {
    const grid: Record<string, unknown> = { ...((option.grid as Record<string, unknown> | undefined) ?? {}) };

    if (props.margin.top !== undefined) {
      grid.top = props.margin.top;
    }

    if (props.margin.right !== undefined) {
      grid.right = props.margin.right;
    }

    if (props.margin.bottom !== undefined) {
      grid.bottom = props.margin.bottom;
    }

    if (props.margin.left !== undefined) {
      grid.left = props.margin.left;
    }

    option.grid = grid;
  }

  // Grid line visibility (splitLine controls gridlines)
  if (withAxes && props.grid !== undefined) {
    if (props.grid.x === false) {
      const xAxis: Record<string, unknown> = { ...((option.xAxis as Record<string, unknown> | undefined) ?? {}) };
      const existing = (xAxis.splitLine as Record<string, unknown> | undefined) ?? {};
      xAxis.splitLine = { ...existing, show: false };
      option.xAxis = xAxis;
    }
    if (props.grid.y === false) {
      const yAxis: Record<string, unknown> = { ...((option.yAxis as Record<string, unknown> | undefined) ?? {}) };
      const existing = (yAxis.splitLine as Record<string, unknown> | undefined) ?? {};
      yAxis.splitLine = { ...existing, show: false };
      option.yAxis = yAxis;
    }
  }

  // Compact grid.top when no internal title and no explicit margin.top
  if (withAxes && props.title === undefined && props.margin?.top === undefined) {
    const grid: Record<string, unknown> = { ...((option.grid as Record<string, unknown> | undefined) ?? {}) };
    if (grid.top === undefined) {
      grid.top = 10;
      option.grid = grid;
    }
  }

  // Zoom
  if (props.zoom === true) {
    option.dataZoom = [{ type: "inside" }, { type: "slider" }];
  }

  return option;
}
