import type {Component} from "../model/types.js";
import type {ColumnId} from "@casehubio/pages-data/dist/dataset/types.js";
import type {Aggregation, GroupingKey, GroupStrategy} from "@casehubio/pages-data/dist/dataset/group.js";
import type {AggregationBinding} from "@casehubio/pages-component";
import { parseLookup } from "@casehubio/pages-data/dist/dataset/lookup-parser.js";

function parseStrategy(raw: Record<string, unknown>): GroupStrategy {
  const strategy = (raw.strategy as string | undefined) ?? "distinct";
  switch (strategy) {
    case "distinct":
      return { mode: "distinct" };
    case "fixedCalendar": {
      const unit = raw.unit as string | undefined;
      if (!unit) throw new Error("Unit is required when strategy is fixedCalendar");
      return { mode: "fixedCalendar", unit: unit as "QUARTER" | "MONTH" | "DAY_OF_WEEK" | "HOUR" | "MINUTE" | "SECOND" };
    }
    case "dynamicRange":
      return { mode: "dynamicRange", preferredUnit: raw.preferredUnit as string | undefined } as GroupStrategy;
    case "dynamic":
      return { mode: "dynamic", preferredUnit: raw.preferredUnit as string | undefined } as GroupStrategy;
    default:
      throw new Error(`Unknown group strategy: ${strategy}`);
  }
}

function parseAggregation(fnStr: string): Aggregation {
  switch (fnStr) {
    case "SUM": return { fn: "SUM" };
    case "AVERAGE": case "AVG": return { fn: "AVERAGE" };
    case "MEDIAN": return { fn: "MEDIAN" };
    case "COUNT": return { fn: "COUNT" };
    case "DISTINCT": return { fn: "DISTINCT" };
    case "MIN": return { fn: "MIN" };
    case "MAX": return { fn: "MAX" };
    case "JOIN": return { fn: "JOIN", separator: ", " };
    case "DISTINCTJOIN": return { fn: "DISTINCTJOIN", separator: ", " };
    default:
      throw new Error(`Unknown aggregation function: ${fnStr}`);
  }
}

export function desugarGroupedView(raw: Record<string, unknown>): Component {
  const groupByRaw = raw.groupBy as Record<string, unknown>;
  if (!groupByRaw) throw new Error("grouped-view requires a groupBy field");

  const column = groupByRaw.column as string;
  const order = raw.order as string | undefined;

  const groupBy: GroupingKey = {
    sourceId: column as ColumnId,
    columnId: column as ColumnId,
    strategy: parseStrategy(groupByRaw),
    maxIntervals: (groupByRaw.maxIntervals as number) ?? 100,
    emptyIntervals: (raw.emptyGroups as boolean) ?? false,
    ascendingOrder: order === "desc" ? false : true,
  };

  const aggregations: AggregationBinding[] = ((raw.aggregations as Array<Record<string, unknown>>) ?? []).map((a) => ({
    column: a.column as ColumnId,
    fn: parseAggregation(a.fn as string),
  }));

  const groupDisplay = raw.groupDisplay as string | undefined;
  const contentDisplay = raw.contentDisplay as string | undefined;
  if (groupDisplay === "table-row" && contentDisplay === "list") {
    throw new Error(
      "Invalid combination: groupDisplay 'table-row' + contentDisplay 'list'. " +
      "<dl> content cannot render inside table rows.",
    );
  }

  const props: Record<string, unknown> = { groupBy };

  if (raw.preset != null) props.preset = raw.preset;
  if (groupDisplay != null) props.groupDisplay = groupDisplay;
  if (contentDisplay != null) props.contentDisplay = contentDisplay;
  if (raw.defaultExpanded != null) props.defaultExpanded = raw.defaultExpanded;
  if (raw.showGroupSummary != null) props.showGroupSummary = raw.showGroupSummary;
  if (aggregations.length > 0) props.aggregations = aggregations;
  if (order != null) props.order = order;
  if (raw.emptyGroups != null) props.emptyGroups = raw.emptyGroups;

  if (raw.lookup != null) {
    props.lookup = parseLookup(raw.lookup);
  }

  return { type: "grouped-view", props };
}
