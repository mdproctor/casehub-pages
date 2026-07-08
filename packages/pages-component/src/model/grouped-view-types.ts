import type { ColumnId } from "@casehubio/pages-data";
import type { Aggregation, GroupingKey } from "@casehubio/pages-data/dist/dataset/group.js";
import type { DataComponentCommon } from "./displayer-types.js";

export type GroupDisplayMode = "table-row" | "section-heading";
export type ContentDisplayMode = "table" | "list";
export type GroupedViewPreset = "spreadsheet" | "sectioned" | "list";

export type GroupedViewMode =
  | { readonly groupDisplay: "table-row"; readonly contentDisplay: "table" }
  | { readonly groupDisplay: "section-heading"; readonly contentDisplay: "table" }
  | { readonly groupDisplay: "section-heading"; readonly contentDisplay: "list" };

export interface AggregationBinding {
  readonly column: ColumnId;
  readonly fn: Aggregation;
}

export interface GroupedViewProps extends DataComponentCommon {
  readonly groupBy: GroupingKey;
  readonly preset?: GroupedViewPreset;
  readonly groupDisplay?: GroupDisplayMode;
  readonly contentDisplay?: ContentDisplayMode;
  readonly defaultExpanded?: boolean;
  readonly showGroupSummary?: boolean;
  readonly aggregations?: readonly AggregationBinding[];
  readonly order?: "asc" | "desc";
  readonly emptyGroups?: boolean;
}
