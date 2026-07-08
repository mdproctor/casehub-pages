/**
 * Shared test utilities for datasource source tests.
 *
 * Constructs properly-typed TypedDataSet and TypedRow instances using the
 * canonical conversion functions, avoiding branded-type and structural
 * mismatches that surface under strict type checking.
 */
import { ColumnType, columnId } from "../../dataset/types.js";
import type { Column, TypedDataSet, DataSetId } from "../../dataset/types.js";
import { dataSetId } from "../../dataset/types.js";
import { toTypedDataSet } from "../../dataset/conversion.js";

export { dataSetId, columnId, ColumnType };
export type { TypedDataSet, DataSetId };

/** Shorthand for building a Column with id/name/type. */
export function col(id: string, type: ColumnType, name?: string): Column {
  return { id: columnId(id), name: name ?? id, type };
}

/**
 * Build a TypedDataSet from column definitions and raw string data.
 * This uses toTypedDataSet to get proper TypedRow instances with
 * cells, cell(), number(), text(), date() methods.
 */
export function makeDataset(
  columns: readonly Column[],
  data: readonly (readonly (string | null)[])[],
): TypedDataSet {
  return toTypedDataSet({ columns, data });
}

/**
 * Build a single-column TEXT dataset for simple identity tests.
 */
export function textDataset(label: string): TypedDataSet {
  const columns: Column[] = [col("name", ColumnType.TEXT)];
  return toTypedDataSet({ columns, data: [[label]] });
}
