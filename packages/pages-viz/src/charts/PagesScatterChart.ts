import { use } from "echarts/core";
import { ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { PagesChartElement } from "../base/PagesChartElement.js";
import type { ScatterChartProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { customElement } from "lit/decorators.js";

// Register required ECharts components
use([ScatterChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent]);

@customElement("pages-scatter-chart")
export class PagesScatterChart extends PagesChartElement<ScatterChartProps> {
  override async buildOption(
    props: ScatterChartProps,
    dataset: TypedDataSet,
  ): Promise<Record<string, unknown>> {
    // Stage 1: Convert dataset to source
    const source = await datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const series: Record<string, unknown> = {
      type: "scatter",
      encode: { x: 0, y: 1 },
    };

    // If dataset has ≥3 columns, add symbolSize callback using column 3
    if (dataset.columns.length >= 3) {
      series.symbolSize = (value: unknown[]) => {
        const v = value[2];
        return typeof v === "number" ? Math.sqrt(v) * 3 : 10;
      };
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: { type: "value" },
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

