import type { DataSetId, TypedDataSet, Column } from "./types.js";
import type { DataSetLookup } from "./lookup.js";
import type { DataSetOp, ResolvedDataSetOp } from "./ops.js";
import { applyOps } from "./ops.js";
import { resolveFilterTypes } from "./filter-resolve.js";
import { DataSetError } from "./errors.js";
import type { DataSetEvent } from "./events.js";

export interface DataSetManagerOptions {
  readonly onChanged?: (id: DataSetId, dataset: TypedDataSet) => void;
}

export interface LookupOptions {
  readonly rowOffset?: number;
  readonly rowCount?: number;
  readonly referenceDate?: Date;
}

export interface LookupResult {
  readonly dataset: TypedDataSet;
  readonly totalRows: number;
}

export interface DataSetManager {
  register(id: DataSetId, dataset: TypedDataSet): void;
  get(id: DataSetId): TypedDataSet | undefined;
  remove(id: DataSetId): boolean;
  has(id: DataSetId): boolean;
  accumulate(id: DataSetId, dataset: TypedDataSet, maxRows?: number): void;
  apply(id: DataSetId, event: DataSetEvent): void;
  lookup(query: DataSetLookup, options?: LookupOptions): LookupResult;
}

function resolveOps(
  ops: readonly DataSetOp[],
  columns: readonly Column[],
): ResolvedDataSetOp[] {
  return ops.map(op => {
    if (op.type !== "filter") return op;
    return {
      type: "filter" as const,
      expressions: op.expressions.map(expr => resolveFilterTypes(expr, columns)),
    };
  });
}

function paginate(
  ds: TypedDataSet,
  offset: number,
  count: number,
): TypedDataSet {
  if (offset === 0 && count < 0) return ds;
  const start = Math.min(offset, ds.rows.length);
  const rows = count < 0
    ? ds.rows.slice(start)
    : ds.rows.slice(start, start + count);
  return { columns: ds.columns, rows };
}

class DataSetManagerImpl implements DataSetManager {
  private readonly datasets = new Map<DataSetId, TypedDataSet>();
  private readonly options: DataSetManagerOptions | undefined;

  constructor(options?: DataSetManagerOptions) {
    this.options = options;
  }

  register(id: DataSetId, dataset: TypedDataSet): void {
    this.datasets.set(id, dataset);
    this.options?.onChanged?.(id, dataset);
  }

  get(id: DataSetId): TypedDataSet | undefined {
    return this.datasets.get(id);
  }

  remove(id: DataSetId): boolean {
    return this.datasets.delete(id);
  }

  has(id: DataSetId): boolean {
    return this.datasets.has(id);
  }

  accumulate(id: DataSetId, dataset: TypedDataSet, maxRows?: number): void {
    if (dataset.rows.length === 0) {
      if (!this.datasets.has(id)) {
        this.datasets.set(id, dataset);
      }
      return;
    }
    const existing = this.datasets.get(id);
    if (!existing) {
      this.datasets.set(id, dataset);
      this.options?.onChanged?.(id, dataset);
      return;
    }

    // Validate column schema compatibility before merging
    if (existing.columns.length !== dataset.columns.length) {
      throw new DataSetError(
        "SCHEMA_MISMATCH",
        `Column schema mismatch in accumulate: new dataset has ${String(dataset.columns.length)} columns, expected ${String(existing.columns.length)}`,
      );
    }
    for (let i = 0; i < existing.columns.length; i++) {
      const existingCol = existing.columns[i];
      const newCol = dataset.columns[i];
      if (!existingCol || !newCol) {
        throw new DataSetError(
          "INVALID_OPERATION",
          `Column at index ${String(i)} is undefined`,
        );
      }
      if (existingCol.id !== newCol.id) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Column schema mismatch in accumulate: column "${newCol.id}" at position ${String(i)}, expected "${existingCol.id}"`,
        );
      }
      if (existingCol.type !== newCol.type) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Column schema mismatch in accumulate: column "${newCol.id}" has type ${newCol.type}, expected ${existingCol.type}`,
        );
      }
    }

    const combined = [...dataset.rows, ...existing.rows];
    const rows = maxRows !== undefined && maxRows >= 0
      ? combined.slice(0, maxRows)
      : combined;
    const result = { columns: dataset.columns, rows };
    this.datasets.set(id, result);
    this.options?.onChanged?.(id, result);
  }

  apply(id: DataSetId, event: DataSetEvent): void {
    switch (event.type) {
      case "snapshot":
        this.datasets.set(id, event.dataset);
        this.options?.onChanged?.(id, event.dataset);
        break;
      case "append": {
        const existing = this.datasets.get(id);
        if (existing === undefined) {
          return;
        }
        const combined = [...existing.rows, ...event.rows];
        const trimmed = event.maxRows !== undefined && event.maxRows >= 0
          ? combined.slice(-event.maxRows)
          : combined;
        const result: TypedDataSet = { columns: existing.columns, rows: trimmed };
        this.datasets.set(id, result);
        this.options?.onChanged?.(id, result);
        break;
      }
      case "replace": {
        const existing = this.datasets.get(id);
        if (existing === undefined) return;
        let matched = false;
        const rows = existing.rows.map(row => {
          const cell = row.cell(event.keyColumn);
          if (cell.type !== "NULL" && String(cell.value) === event.key) {
            matched = true;
            return event.row;
          }
          return row;
        });
        if (!matched) return;
        const result: TypedDataSet = { columns: existing.columns, rows };
        this.datasets.set(id, result);
        this.options?.onChanged?.(id, result);
        break;
      }
      case "remove": {
        const existing = this.datasets.get(id);
        if (existing === undefined) return;
        const rows = existing.rows.filter(row => {
          const cell = row.cell(event.keyColumn);
          return cell.type === "NULL" || String(cell.value) !== event.key;
        });
        if (rows.length === existing.rows.length) return;
        const result: TypedDataSet = { columns: existing.columns, rows };
        this.datasets.set(id, result);
        this.options?.onChanged?.(id, result);
        break;
      }
    }
  }

  lookup(query: DataSetLookup, options?: LookupOptions): LookupResult {
    const offset = options?.rowOffset ?? 0;
    if (offset < 0) {
      throw new DataSetError("INVALID_OPERATION", `rowOffset cannot be negative: ${String(offset)}`);
    }

    const dataset = this.datasets.get(query.dataSetId);
    if (!dataset) {
      throw new DataSetError("UNKNOWN_PROVIDER", `Dataset "${query.dataSetId}" not registered`);
    }

    const resolvedOps = resolveOps(query.operations, dataset.columns);
    const opsOptions = options?.referenceDate !== undefined ? { referenceDate: options.referenceDate } : undefined;
    const result = applyOps(dataset, resolvedOps, opsOptions);
    const totalRows = result.rows.length;
    const paginated = paginate(result, offset, options?.rowCount ?? -1);
    return { dataset: paginated, totalRows };
  }
}

export function createDataSetManager(options?: DataSetManagerOptions): DataSetManager {
  return new DataSetManagerImpl(options);
}
