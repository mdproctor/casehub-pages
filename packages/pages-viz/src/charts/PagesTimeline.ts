import {use} from "echarts/core";
import {CustomChart} from "echarts/charts";
import {DataZoomComponent, GridComponent, LegendComponent, TooltipComponent,} from "echarts/components";
import {CanvasRenderer} from "echarts/renderers";
import {PagesChartElement} from "../base/PagesChartElement.js";
import type {TimelineProps} from "@casehubio/pages-component";
import type {TypedDataSet} from "@casehubio/pages-data/dist/dataset/types.js";
import {applyChartSettings} from "./option-pipeline.js";
import {deepMerge} from "../base/deep-merge.js";
import {cellToRaw} from "../base/cell-extract.js";

// Register required ECharts components
use([CanvasRenderer, CustomChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent]);

interface TimelineDataItem {
  readonly name: string;
  readonly start: Date | null;
  readonly end: Date | null;
  readonly category: string;
  readonly isMilestone?: boolean;
}

export class PagesTimeline extends PagesChartElement<TimelineProps> {
  override buildOption(
    props: TimelineProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Resolve column indices
    const startColId = props.startColumn || dataset.columns[1]?.id;
    const endColId = props.endColumn;
    const labelColId = props.labelColumn || dataset.columns[0]?.id;
    const categoryColId = props.categoryColumn;

    const startIdx = dataset.columns.findIndex(c => c.id === startColId);
    const endIdx = endColId ? dataset.columns.findIndex(c => c.id === endColId) : -1;
    const labelIdx = labelColId ? dataset.columns.findIndex(c => c.id === labelColId) : -1;
    const categoryIdx = categoryColId ? dataset.columns.findIndex(c => c.id === categoryColId) : -1;

    // Extract data items
    const items: TimelineDataItem[] = dataset.rows.map(row => {
      const startCell = startIdx >= 0 ? row.cells[startIdx] : null;
      const endCell = endIdx >= 0 ? row.cells[endIdx] : null;
      const labelCell = labelIdx >= 0 ? row.cells[labelIdx] : null;
      const categoryCell = categoryIdx >= 0 ? row.cells[categoryIdx] : null;

      const start = startCell && startCell.type === "DATE" ? startCell.value : null;
      const end = endCell && endCell.type === "DATE" ? endCell.value : null;
      const name = labelCell ? String(cellToRaw(labelCell)) : "";
      const category = categoryCell ? String(cellToRaw(categoryCell)) : "";

      return {
        name,
        start,
        end,
        category,
        isMilestone: end === null,
      };
    });

    // Extract distinct categories for y-axis
    const distinctCategories = categoryIdx >= 0
      ? Array.from(new Set(items.map(item => item.category)))
      : [""];

    // Build custom series data
    const seriesData = items.map((item, _idx) => {
      const dataItem: Record<string, unknown> = {
        name: item.name,
        value: [
          item.start ? item.start.getTime() : 0,
          distinctCategories.indexOf(item.category),
          item.end ? item.end.getTime() : (item.start ? item.start.getTime() : 0),
        ],
      };

      if (item.isMilestone) {
        dataItem.isMilestone = true;
        dataItem.itemStyle = { color: "#91cc75" };
      }

      return dataItem;
    });

    // Custom renderItem function
    const renderItem = (params: unknown, api: unknown): unknown => {
      // Type assertions needed for ECharts internal API (no published types for Custom series renderItem)
      const apiTyped = api as { value: (idx: number) => unknown; coord: (point: [unknown, unknown]) => [number, number]; size: (dim: [number, number]) => [number, number]; style: (opts: unknown) => unknown; visual: (name: string) => unknown };
      const paramsTyped = params as { data?: { isMilestone?: boolean; itemStyle?: { color?: string } } };

      const categoryIndex = apiTyped.value(1);
      const start = apiTyped.coord([apiTyped.value(0), categoryIndex]);
      const end = apiTyped.coord([apiTyped.value(2), categoryIndex]);
      const height = apiTyped.size([0, 1])[1] * 0.6;

      const isMilestone = paramsTyped.data?.isMilestone === true;

      if (isMilestone) {
        // Render diamond milestone marker
        const x = start[0];
        const y = start[1];
        const size = 8;
        return {
          type: "polygon",
          shape: {
            points: [
              [x, y - size],
              [x + size, y],
              [x, y + size],
              [x - size, y],
            ],
          },
          style: apiTyped.style({
            fill: paramsTyped.data?.itemStyle?.color || apiTyped.visual("color"),
          }),
        };
      } else {
        // Render horizontal bar
        const rectShape = {
          x: start[0],
          y: start[1] - height / 2,
          width: Math.max(end[0] - start[0], 2),
          height,
        };

        return {
          type: "rect",
          shape: rectShape,
          style: apiTyped.style({}),
        };
      }
    };

    let option: Record<string, unknown> = {
      xAxis: { type: "time" },
      yAxis: {
        type: "category",
        data: distinctCategories,
      },
      series: [
        {
          type: "custom",
          renderItem,
          encode: {
            x: [0, 2],
            y: 1,
          },
          data: seriesData,
        },
      ],
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const paramsTyped = params as { dataIndex: number };
          const item = items[paramsTyped.dataIndex];
          if (!item) return "";

          const startStr = item.start ? item.start.toLocaleDateString() : "N/A";
          const endStr = item.end ? item.end.toLocaleDateString() : "N/A";
          const type = item.isMilestone ? "Milestone" : "Duration";

          return `<b>${item.name}</b><br/>${type}<br/>Start: ${startStr}${item.end ? `<br/>End: ${endStr}` : ""}`;
        },
      },
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

customElements.define("pages-timeline", PagesTimeline);
