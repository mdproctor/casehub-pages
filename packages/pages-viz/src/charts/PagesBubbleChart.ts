import { use } from "echarts/core";
import { ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { PagesChartElement } from "../base/PagesChartElement.js";
import type { BubbleChartProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import { ColumnType } from "@casehubio/pages-data";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { cellToRaw } from "../base/cell-extract.js";
import { customElement } from "lit/decorators.js";

// Register required ECharts components
use([ScatterChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent]);

@customElement("pages-bubble-chart")
export class PagesBubbleChart extends PagesChartElement<BubbleChartProps> {
  override async buildOption(
    props: BubbleChartProps,
    dataset: TypedDataSet,
  ): Promise<Record<string, unknown>> {
    // Stage 1: Convert dataset to source
    const source = await datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const minR = props.minRadius ?? 5;
    const maxR = props.maxRadius ?? 50;

    // Find value range from column 3 (index 2)
    const sizeColumn = dataset.columns[2];
    const values = sizeColumn
      ? dataset.rows.map(row => {
          const cell = row.cell(sizeColumn.id);
          return cellToRaw(cell);
        }).filter((v): v is number => typeof v === "number")
      : [];

    let dataMin: number;
    let dataMax: number;
    let range: number;

    if (values.length === 0) {
      // No valid values — use constant symbol size (midpoint)
      dataMin = 0;
      dataMax = 0;
      range = 1;
    } else {
      dataMin = Math.min(...values);
      dataMax = Math.max(...values);
      range = dataMax - dataMin || 1;
    }

    const series: Record<string, unknown> = {
      type: "scatter",
      encode: { x: 0, y: 1 },
      symbolSize: (value: unknown[]) => {
        const v = value[2];
        if (typeof v !== "number") return values.length === 0 ? (minR + maxR) / 2 : minR;
        return minR + ((v - dataMin) / range) * (maxR - minR);
      },
    };

    const col0Type = dataset.columns[0]?.type;
    const xAxisType = col0Type === ColumnType.LABEL ? "category" : "value";

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: { type: xAxisType },
      yAxis: { type: "value" },
      series: [series],
      tooltip: { trigger: "item" },
    };

    // Stage 3: Apply ChartSettings
    option = applyChartSettings(option, props);

    // Stage 4: Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

