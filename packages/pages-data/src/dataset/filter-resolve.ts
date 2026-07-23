import type { Column, ColumnId } from "./types.js";
import { findColumn } from "./column-lookup.js";
import { ColumnType } from "./types.js";
import type {
  FilterExpression,
  ResolvedFilterExpression,
  CoreFunctionType,
  NumericFilter,
  StringFilter,
  DateFilter,
  ResolvedLeaf,
} from "./filter.js";
import { DataSetError } from "./errors.js";
import { parseTimeFrame } from "./timeframe.js";

export function resolveFilterTypes(
  expression: FilterExpression,
  columns: readonly Column[],
): ResolvedFilterExpression {
  if ("children" in expression) {
    return {
      type: expression.type,
      children: expression.children.map(child => resolveFilterTypes(child, columns)),
    };
  }

  if ("child" in expression) {
    return {
      type: "not",
      child: resolveFilterTypes(expression.child, columns),
    };
  }

  if (expression.type === "unresolved") {
    const column = findColumn(columns, expression.columnId);
    if (!column) {
      console.warn(`[pages-data] Filter skipped: column "${expression.columnId}" not found in dataset`);
      return { type: "and", children: [] };
    }

    return resolveLeaf(expression.columnId, expression.fn, expression.args, column.type);
  }

  // Already resolved
  return expression;
}

function resolveLeaf(
  columnId: ColumnId,
  fn: CoreFunctionType,
  args: readonly string[],
  columnType: ColumnType,
): ResolvedLeaf {
  switch (columnType) {
    case ColumnType.NUMBER:
      return { type: "numeric", columnId, filter: resolveNumericFilter(fn, args) };
    case ColumnType.TEXT:
    case ColumnType.LABEL:
      return { type: "string", columnId, filter: resolveStringFilter(fn, args) };
    case ColumnType.DATE:
      return { type: "date", columnId, filter: resolveDateFilter(fn, args) };
  }
}

function resolveNumericFilter(fn: CoreFunctionType, args: readonly string[]): NumericFilter {
  switch (fn) {
    case "IS_NULL":
      return { fn: "IS_NULL" };
    case "NOT_NULL":
      return { fn: "NOT_NULL" };
    case "EQUALS_TO":
      return { fn: "EQUALS_TO", value: parseNumber(requireArg(args, 0, fn)) };
    case "NOT_EQUALS_TO":
      return { fn: "NOT_EQUALS_TO", value: parseNumber(requireArg(args, 0, fn)) };
    case "GREATER_THAN":
      return { fn: "GREATER_THAN", value: parseNumber(requireArg(args, 0, fn)) };
    case "GREATER_OR_EQUALS_TO":
      return { fn: "GREATER_OR_EQUALS_TO", value: parseNumber(requireArg(args, 0, fn)) };
    case "LOWER_THAN":
      return { fn: "LOWER_THAN", value: parseNumber(requireArg(args, 0, fn)) };
    case "LOWER_OR_EQUALS_TO":
      return { fn: "LOWER_OR_EQUALS_TO", value: parseNumber(requireArg(args, 0, fn)) };
    case "BETWEEN":
      return { fn: "BETWEEN", low: parseNumber(requireArg(args, 0, fn)), high: parseNumber(requireArg(args, 1, fn)) };
    case "IN":
      return { fn: "IN", values: args.map(parseNumber) };
    case "NOT_IN":
      return { fn: "NOT_IN", values: args.map(parseNumber) };
    case "LIKE_TO":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `LIKE_TO cannot be used with NUMBER columns`,
      );
    case "TIME_FRAME":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `TIME_FRAME cannot be used with NUMBER columns`,
      );
  }
}

function resolveStringFilter(fn: CoreFunctionType, args: readonly string[]): StringFilter {
  switch (fn) {
    case "IS_NULL":
      return { fn: "IS_NULL" };
    case "NOT_NULL":
      return { fn: "NOT_NULL" };
    case "EQUALS_TO":
      return { fn: "EQUALS_TO", value: requireArg(args, 0, fn) };
    case "NOT_EQUALS_TO":
      return { fn: "NOT_EQUALS_TO", value: requireArg(args, 0, fn) };
    case "GREATER_THAN":
      return { fn: "GREATER_THAN", value: requireArg(args, 0, fn) };
    case "GREATER_OR_EQUALS_TO":
      return { fn: "GREATER_OR_EQUALS_TO", value: requireArg(args, 0, fn) };
    case "LOWER_THAN":
      return { fn: "LOWER_THAN", value: requireArg(args, 0, fn) };
    case "LOWER_OR_EQUALS_TO":
      return { fn: "LOWER_OR_EQUALS_TO", value: requireArg(args, 0, fn) };
    case "BETWEEN":
      return { fn: "BETWEEN", low: requireArg(args, 0, fn), high: requireArg(args, 1, fn) };
    case "LIKE_TO": {
      const pattern = requireArg(args, 0, fn);
      const caseSensitive = args[1] === "false" ? false : true;
      return { fn: "LIKE_TO", pattern, caseSensitive };
    }
    case "IN":
      return { fn: "IN", values: args };
    case "NOT_IN":
      return { fn: "NOT_IN", values: args };
    case "TIME_FRAME":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `TIME_FRAME cannot be used with TEXT/LABEL columns`,
      );
  }
}

function resolveDateFilter(fn: CoreFunctionType, args: readonly string[]): DateFilter {
  switch (fn) {
    case "IS_NULL":
      return { fn: "IS_NULL" };
    case "NOT_NULL":
      return { fn: "NOT_NULL" };
    case "EQUALS_TO":
      return { fn: "EQUALS_TO", value: parseDate(requireArg(args, 0, fn)) };
    case "NOT_EQUALS_TO":
      return { fn: "NOT_EQUALS_TO", value: parseDate(requireArg(args, 0, fn)) };
    case "GREATER_THAN":
      return { fn: "GREATER_THAN", value: parseDate(requireArg(args, 0, fn)) };
    case "GREATER_OR_EQUALS_TO":
      return { fn: "GREATER_OR_EQUALS_TO", value: parseDate(requireArg(args, 0, fn)) };
    case "LOWER_THAN":
      return { fn: "LOWER_THAN", value: parseDate(requireArg(args, 0, fn)) };
    case "LOWER_OR_EQUALS_TO":
      return { fn: "LOWER_OR_EQUALS_TO", value: parseDate(requireArg(args, 0, fn)) };
    case "BETWEEN":
      return { fn: "BETWEEN", low: parseDate(requireArg(args, 0, fn)), high: parseDate(requireArg(args, 1, fn)) };
    case "TIME_FRAME":
      return { fn: "TIME_FRAME", timeFrame: parseTimeFrame(requireArg(args, 0, fn)) };
    case "IN":
      return { fn: "IN", values: args.map(parseDate) };
    case "NOT_IN":
      return { fn: "NOT_IN", values: args.map(parseDate) };
    case "LIKE_TO":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `LIKE_TO cannot be used with DATE columns`,
      );
  }
}

function requireArg(args: readonly string[], index: number, fn: CoreFunctionType): string {
  const value = args[index];
  if (value === undefined) {
    throw new DataSetError(
      "RESOLUTION_FAILED",
      `${fn} requires argument at index ${String(index)} but only ${String(args.length)} provided`,
    );
  }
  return value;
}

function parseNumber(s: string): number {
  const n = parseFloat(s);
  if (Number.isNaN(n)) {
    throw new DataSetError(
      "RESOLUTION_FAILED",
      `Cannot parse "${s}" as a number`,
    );
  }
  return n;
}

function parseDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new DataSetError(
      "RESOLUTION_FAILED",
      `Cannot parse "${s}" as a date`,
    );
  }
  return d;
}
