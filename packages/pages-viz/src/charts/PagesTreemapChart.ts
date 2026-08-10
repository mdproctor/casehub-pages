import { use } from "echarts/core";
import { TreemapChart } from "echarts/charts";
import {
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { PagesChartElement } from "../base/PagesChartElement.js";
import type { TreemapChartProps } from "@casehubio/pages-component";
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data";
import { applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { cellToRaw } from "../base/cell-extract.js";
import { customElement } from "lit/decorators.js";

use([TreemapChart, TooltipComponent, VisualMapComponent]);

interface TreeNode {
  name: string;
  value: number;
  colorValue?: number;
  children?: TreeNode[];
}

@customElement("pages-treemap-chart")
export class PagesTreemapChart extends PagesChartElement<TreemapChartProps> {
  override buildOption(
    props: TreemapChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    const nameColIdx = 0;
    const valueColIdx = 1;
    const colorColId = props.colorColumn;
    const colorColIdx = colorColId
      ? dataset.columns.findIndex(c => c.id === colorColId)
      : -1;

    let data: TreeNode[];

    if (props.parentColumn) {
      data = this.buildHierarchical(dataset, nameColIdx, valueColIdx, colorColIdx, props.parentColumn);
    } else {
      data = this.buildFlat(dataset, nameColIdx, valueColIdx, colorColIdx);
    }

    const series: Record<string, unknown> = {
      type: "treemap",
      data,
    };

    if (colorColIdx >= 0) {
      series.visibleMin = 300;
    }

    let option: Record<string, unknown> = {
      series: [series],
      tooltip: { trigger: "item" },
    };

    if (colorColIdx >= 0) {
      const colorValues = this.collectColorValues(data);
      const min = colorValues.length > 0 ? Math.min(...colorValues) : 0;
      const max = colorValues.length > 0 ? Math.max(...colorValues) : 1;
      option.visualMap = {
        min,
        max,
        calculable: true,
        dimension: "colorValue",
      };
    }

    option = applyChartSettings(option, props, { cartesianAxes: false });

    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }

  private buildFlat(
    dataset: TypedDataSet,
    nameIdx: number,
    valueIdx: number,
    colorIdx: number,
  ): TreeNode[] {
    return dataset.rows.map(row => {
      const nameCell = row.cells[nameIdx]!;
      const valueCell = row.cells[valueIdx]!;
      const name = nameCell.type !== "NULL" ? String(cellToRaw(nameCell)) : "";
      const value = valueCell.type !== "NULL" ? cellToRaw(valueCell) as number : 0;

      const node: TreeNode = { name, value };

      if (colorIdx >= 0) {
        const colorCell = row.cells[colorIdx]!;
        if (colorCell.type !== "NULL") {
          node.colorValue = cellToRaw(colorCell) as number;
        }
      }

      return node;
    });
  }

  private buildHierarchical(
    dataset: TypedDataSet,
    nameIdx: number,
    valueIdx: number,
    colorIdx: number,
    parentColId: ColumnId,
  ): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const row of dataset.rows) {
      const nameCell = row.cells[nameIdx]!;
      const valueCell = row.cells[valueIdx]!;
      const name = nameCell.type !== "NULL" ? String(cellToRaw(nameCell)) : "";
      const value = valueCell.type !== "NULL" ? cellToRaw(valueCell) as number : 0;

      const node: TreeNode = { name, value };

      if (colorIdx >= 0) {
        const colorCell = row.cells[colorIdx]!;
        if (colorCell.type !== "NULL") {
          node.colorValue = cellToRaw(colorCell) as number;
        }
      }

      nodeMap.set(name, node);
    }

    for (const row of dataset.rows) {
      const nameCell = row.cells[nameIdx]!;
      const name = nameCell.type !== "NULL" ? String(cellToRaw(nameCell)) : "";
      const parentCell = row.cell(parentColId);
      const parentName = parentCell.type !== "NULL" ? String(cellToRaw(parentCell)) : "";

      const node = nodeMap.get(name)!;

      if (!parentName) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(parentName);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }

    const clearBranchValues = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          delete (n as Partial<TreeNode>).value;
          clearBranchValues(n.children);
        }
      }
    };
    clearBranchValues(roots);

    return roots;
  }

  private collectColorValues(nodes: TreeNode[]): number[] {
    const values: number[] = [];
    const visit = (list: TreeNode[]): void => {
      for (const n of list) {
        if (n.colorValue !== undefined) values.push(n.colorValue);
        if (n.children) visit(n.children);
      }
    };
    visit(nodes);
    return values;
  }
}
