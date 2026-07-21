import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
} from "echarts/components";
import { PagesChartElement } from "../base/PagesChartElement.js";
import type { AreaChartProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components (area uses LineChart with areaStyle)
use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, DatasetComponent]);

export class PagesAreaChart extends PagesChartElement<AreaChartProps> {
  override async buildOption(
    props: AreaChartProps,
    dataset: TypedDataSet,
  ): Promise<Record<string, unknown>> {
    // Stage 1: Convert dataset to source
    const source = await datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const subtype = props.subtype || "area";
    const isStacked = subtype === "area-stacked";

    // Generate series for each data column (skip first column = category)
    const series: Record<string, unknown>[] = [];
    for (let i = 1; i < dataset.columns.length; i++) {
      const seriesEntry: Record<string, unknown> = {
        type: "line",
        encode: { x: 0, y: i },
        areaStyle: {},
      };
      if (isStacked) {
        seriesEntry.stack = "total";
      }
      series.push(seriesEntry);
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: { type: "category" },
      yAxis: { type: "value" },
      series,
      tooltip: { trigger: "axis" },
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

if (!customElements.get('pages-area-chart')) {
  customElements.define('pages-area-chart', PagesAreaChart);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-area-chart': PagesAreaChart;
  }
}
