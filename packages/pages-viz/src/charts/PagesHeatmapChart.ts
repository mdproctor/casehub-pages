import { use } from "echarts/core";
import { HeatmapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { PagesChartElement } from "../base/PagesChartElement.js";
import type { HeatmapChartProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import { applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { cellToRaw } from "../base/cell-extract.js";
import { customElement } from "lit/decorators.js";

use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent]);

@customElement("pages-heatmap-chart")
export class PagesHeatmapChart extends PagesChartElement<HeatmapChartProps> {
  override buildOption(
    props: HeatmapChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    const xLabels: string[] = [];
    const yLabels: string[] = [];
    const xIndex = new Map<string, number>();
    const yIndex = new Map<string, number>();

    for (const row of dataset.rows) {
      const xCell = row.cells[0]!;
      const yCell = row.cells[1]!;
      const xVal = xCell.type !== "NULL" ? String(cellToRaw(xCell)) : "";
      const yVal = yCell.type !== "NULL" ? String(cellToRaw(yCell)) : "";

      if (!xIndex.has(xVal)) {
        xIndex.set(xVal, xLabels.length);
        xLabels.push(xVal);
      }
      if (!yIndex.has(yVal)) {
        yIndex.set(yVal, yLabels.length);
        yLabels.push(yVal);
      }
    }

    const data: (number | null)[][] = dataset.rows.map(row => {
      const xCell = row.cells[0]!;
      const yCell = row.cells[1]!;
      const vCell = row.cells[2]!;
      const xi = xIndex.get(xCell.type !== "NULL" ? String(cellToRaw(xCell)) : "")!;
      const yi = yIndex.get(yCell.type !== "NULL" ? String(cellToRaw(yCell)) : "")!;
      const value = vCell.type !== "NULL" ? cellToRaw(vCell) as number : null;
      return [xi, yi, value];
    });

    const numericValues = data.map(d => d[2]).filter((v): v is number => v !== null);
    const min = numericValues.length > 0 ? Math.min(...numericValues) : 0;
    const max = numericValues.length > 0 ? Math.max(...numericValues) : 1;

    const visualMap: Record<string, unknown> = {
      min,
      max,
      calculable: true,
      orient: "vertical",
      right: 0,
      bottom: 55,
    };

    if (props.minColor || props.maxColor) {
      visualMap.inRange = {
        color: [props.minColor ?? "#e0f3f8", props.maxColor ?? "#d73027"],
      };
    }

    let option: Record<string, unknown> = {
      grid: { right: 80 },
      xAxis: { type: "category", data: xLabels },
      yAxis: { type: "category", data: yLabels },
      visualMap,
      series: [{ type: "heatmap", data }],
      tooltip: { trigger: "item" },
    };

    option = applyChartSettings(option, props);

    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}
