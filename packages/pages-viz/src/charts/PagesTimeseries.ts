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
import type { TimeseriesProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import { ColumnType } from "@casehubio/pages-data";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components
use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, DatasetComponent]);

export class PagesTimeseries extends PagesChartElement<TimeseriesProps> {
  override async buildOption(
    props: TimeseriesProps,
    dataset: TypedDataSet,
  ): Promise<Record<string, unknown>> {
    // Stage 1: Convert dataset to source
    const source = await datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    // Determine time axis column: if column 0 is LABEL, use column 1 as time axis
    const col0Type = dataset.columns[0]?.type;
    const timeCol = col0Type === ColumnType.LABEL && dataset.columns.length > 2 ? 1 : 0;
    const series: Record<string, unknown>[] = [];
    for (let i = timeCol + 1; i < dataset.columns.length; i++) {
      series.push({
        type: "line",
        encode: { x: timeCol, y: i },
      });
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: { type: "time" },
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

if (!customElements.get('pages-timeseries')) {
  customElements.define('pages-timeseries', PagesTimeseries);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-timeseries': PagesTimeseries;
  }
}
