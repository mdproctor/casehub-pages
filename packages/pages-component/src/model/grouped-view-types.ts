import type { ColumnId } from "@casehubio/pages-data";
import type { Aggregation, GroupingKey, GroupNode } from "@casehubio/pages-data";
import type { DataComponentCommon, TableColumnConfig, RowStyleRule, SelectionMode } from "./displayer-types.js";

export type { GroupNode };

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

export interface RowAccentConfig {
  readonly column: string;
  readonly colorMap: Readonly<Record<string, string>>;
  readonly default?: string;
  readonly columns?: 'all' | readonly string[];
}

export interface GroupedViewProps extends DataComponentCommon {
  readonly groupBy: GroupingKey | readonly GroupingKey[];
  readonly preset?: GroupedViewPreset;
  readonly groupDisplay?: GroupDisplayMode;
  readonly contentDisplay?: ContentDisplayMode;
  readonly defaultExpanded?: boolean;
  readonly showGroupSummary?: boolean;
  readonly aggregations?: readonly AggregationBinding[];
  readonly order?: "asc" | "desc";
  readonly emptyGroups?: boolean;
  readonly columnConfig?: readonly TableColumnConfig[];
  readonly rowStyle?: readonly RowStyleRule[];
  readonly rowAccent?: RowAccentConfig;
  readonly selection?: SelectionMode;
  readonly sortable?: boolean;
  readonly clientSort?: boolean;
  readonly renderAfterHeader?: (node: GroupNode) => HTMLElement | undefined;
}
