import {use} from "echarts/core";
import {GraphChart} from "echarts/charts";
import {LegendComponent, TooltipComponent} from "echarts/components";
import {CanvasRenderer} from "echarts/renderers";
import {PagesChartElement} from "../base/PagesChartElement.js";
import type {GraphProps} from "@casehubio/pages-component";
import type {TypedDataSet} from "@casehubio/pages-data";
import {applyChartSettings} from "./option-pipeline.js";
import {deepMerge} from "../base/deep-merge.js";
import {cellToRaw} from "../base/cell-extract.js";

// Register required ECharts components
use([CanvasRenderer, GraphChart, TooltipComponent, LegendComponent]);

interface GraphNode {
  name: string;
  label?: { show: true; formatter: string };
  symbolSize?: number;
  itemStyle?: { color: string };
}

interface GraphLink {
  source: string;
  target: string;
  value?: number;
}

export class PagesGraph extends PagesChartElement<GraphProps> {
  override buildOption(
    props: GraphProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Resolve column indices
    const sourceColId = props.sourceColumn || dataset.columns[0]?.id;
    const targetColId = props.targetColumn || dataset.columns[1]?.id;
    const valueColId = props.valueColumn;
    const nodeLabelColId = props.nodeLabelColumn;
    const nodeColorColId = props.nodeColorColumn;
    const nodeSizeColId = props.nodeSizeColumn;

    const sourceIdx = sourceColId ? dataset.columns.findIndex(c => c.id === sourceColId) : -1;
    const targetIdx = targetColId ? dataset.columns.findIndex(c => c.id === targetColId) : -1;
    const valueIdx = valueColId ? dataset.columns.findIndex(c => c.id === valueColId) : -1;
    const nodeLabelIdx = nodeLabelColId ? dataset.columns.findIndex(c => c.id === nodeLabelColId) : -1;
    const nodeColorIdx = nodeColorColId ? dataset.columns.findIndex(c => c.id === nodeColorColId) : -1;
    const nodeSizeIdx = nodeSizeColId ? dataset.columns.findIndex(c => c.id === nodeSizeColId) : -1;

    // Build links from edge rows
    const links: GraphLink[] = [];
    const nodeMap = new Map<string, { label?: string; color?: string; size?: number }>();

    dataset.rows.forEach(row => {
      const sourceCell = sourceIdx >= 0 ? row.cells[sourceIdx] : null;
      const targetCell = targetIdx >= 0 ? row.cells[targetIdx] : null;
      const valueCell = valueIdx >= 0 ? row.cells[valueIdx] : null;
      const nodeLabelCell = nodeLabelIdx >= 0 ? row.cells[nodeLabelIdx] : null;
      const nodeColorCell = nodeColorIdx >= 0 ? row.cells[nodeColorIdx] : null;
      const nodeSizeCell = nodeSizeIdx >= 0 ? row.cells[nodeSizeIdx] : null;

      const source = sourceCell ? String(cellToRaw(sourceCell)) : "";
      const target = targetCell ? String(cellToRaw(targetCell)) : "";

      const link: GraphLink = { source, target };
      if (valueCell && valueCell.type === "NUMBER") {
        link.value = valueCell.value;
      }
      links.push(link);

      // Capture node properties from the first occurrence of each node
      // Node appears as source → capture its properties from this row
      if (!nodeMap.has(source)) {
        const nodeProps: { label?: string; color?: string; size?: number } = {};
        if (nodeLabelCell) {
          nodeProps.label = String(cellToRaw(nodeLabelCell));
        }
        if (nodeColorCell) {
          const category = String(cellToRaw(nodeColorCell));
          const color = props.nodeColorMap?.[category];
          if (color !== undefined) {
            nodeProps.color = color;
          }
        }
        if (nodeSizeCell && nodeSizeCell.type === "NUMBER") {
          nodeProps.size = nodeSizeCell.value;
        }
        nodeMap.set(source, nodeProps);
      }

      // Node appears as target → capture properties if not already captured
      if (!nodeMap.has(target)) {
        const nodeProps: { label?: string; color?: string; size?: number } = {};
        // For target nodes appearing first, we need to search where they appear as source
        // But this row might have the properties for the source node only
        // So we initialize empty and will fill in when/if they appear as source later
        nodeMap.set(target, nodeProps);
      }
    });

    // Second pass: fill in target node properties from rows where they appear as source
    dataset.rows.forEach(row => {
      const sourceCell = sourceIdx >= 0 ? row.cells[sourceIdx] : null;
      const nodeLabelCell = nodeLabelIdx >= 0 ? row.cells[nodeLabelIdx] : null;
      const nodeColorCell = nodeColorIdx >= 0 ? row.cells[nodeColorIdx] : null;
      const nodeSizeCell = nodeSizeIdx >= 0 ? row.cells[nodeSizeIdx] : null;

      const source = sourceCell ? String(cellToRaw(sourceCell)) : "";
      const nodeProps = nodeMap.get(source);

      if (nodeProps) {
        if (nodeLabelCell && !nodeProps.label) {
          nodeProps.label = String(cellToRaw(nodeLabelCell));
        }
        if (nodeColorCell && !nodeProps.color) {
          const category = String(cellToRaw(nodeColorCell));
          const color = props.nodeColorMap?.[category];
          if (color !== undefined) {
            nodeProps.color = color;
          }
        }
        if (nodeSizeCell && nodeSizeCell.type === "NUMBER" && !nodeProps.size) {
          nodeProps.size = nodeSizeCell.value;
        }
      }
    });

    // Build nodes array
    const nodes: GraphNode[] = [];
    nodeMap.forEach((props, name) => {
      const node: GraphNode = { name };
      if (props.label) {
        node.label = { show: true, formatter: props.label };
      }
      if (props.size !== undefined) {
        node.symbolSize = props.size;
      }
      if (props.color) {
        node.itemStyle = { color: props.color };
      }
      nodes.push(node);
    });

    // Build series
    const layout = props.layout ?? "force";
    const series: Record<string, unknown> = {
      type: "graph",
      layout,
      data: nodes,
      links,
    };

    if (layout === "force") {
      series.force = { repulsion: 100 };
    }

    if (props.directed) {
      series.edgeSymbol = ["none", "arrow"];
    }

    let option: Record<string, unknown> = {
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

if (!customElements.get('pages-graph')) {
  customElements.define('pages-graph', PagesGraph);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-graph': PagesGraph;
  }
}
