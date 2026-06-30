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
  get(id: DataSetId): TypedDataSet | undefined;
  remove(id: DataSetId): boolean;
  has(id: DataSetId): boolean;
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

  get(id: DataSetId): TypedDataSet | undefined {
    return this.datasets.get(id);
  }

  remove(id: DataSetId): boolean {
    return this.datasets.delete(id);
  }

  has(id: DataSetId): boolean {
    return this.datasets.has(id);
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
        const colCount = existing.columns.length;
        if (event.rows.some(row => row.cells.length !== colCount)) {
          console.warn(
            `[DataSetManager] append rejected: row cell count mismatch (expected ${String(colCount)})`,
          );
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
