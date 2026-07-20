import { use } from "echarts/core";
import { PieChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { PagesChartElement } from "../base/PagesChartElement.js";
import type { PieChartProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { customElement } from "lit/decorators.js";

// Register required ECharts components
use([PieChart, TooltipComponent, LegendComponent, DatasetComponent]);

@customElement("pages-pie-chart")
export class PagesPieChart extends PagesChartElement<PieChartProps> {
  override async buildOption(
    props: PieChartProps,
    dataset: TypedDataSet,
  ): Promise<Record<string, unknown>> {
    // Stage 1: Convert dataset to source
    const source = await datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const subtype = props.subtype || "pie";
    const series: Record<string, unknown> = {
      type: "pie",
      encode: { itemName: 0, value: 1 },
    };

    if (subtype === "donut") {
      series.radius = ["40%", "70%"];
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      series: [series],
      tooltip: { trigger: "item" },
    };

    // Stage 3: Apply ChartSettings (skip xAxis/yAxis — pie has no axes)
    option = applyChartSettings(option, props, { cartesianAxes: false });

    // Stage 4: Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

