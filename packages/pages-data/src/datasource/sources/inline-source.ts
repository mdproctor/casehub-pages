import type { DataSource, DataSink } from "../types.js";
import type { ExternalColumnDef } from "../../dataset/external/types.js";
import type { Column } from "../../dataset/types.js";
import { ColumnType, columnId } from "../../dataset/types.js";
import { toTypedDataSet } from "../../dataset/conversion.js";

export type InlineData =
  | readonly unknown[][]
  | string
  | Record<string, unknown>[];

export interface InlineSourceOptions {
  readonly columns?: readonly ExternalColumnDef[];
  readonly expression?: string;
  readonly dataPath?: string;
  readonly type?: string;
}

export function inlineSource(data: InlineData, options?: InlineSourceOptions): DataSource {
  return {
    connect(sink: DataSink): void {
      try {
        let rows: unknown[][];

        if (typeof data === "string") {
          const parsed: unknown = JSON.parse(data);
          if (!Array.isArray(parsed)) {
            sink.error({ message: "Inline data string must parse to an array", permanent: true });
            return;
          }
          rows = parsed as unknown[][];
        } else if (Array.isArray(data) && data.length > 0 && !Array.isArray(data[0])) {
          // Object array — convert to row arrays
          const objects = data;
          const keys = Object.keys(objects[0]!);
          rows = objects.map(obj => keys.map(k => obj[k]));
          if (!options?.columns) {
            // Infer columns from object keys
            const inferredCols: Column[] = keys.map(k => ({
              id: columnId(k),
              name: k,
              type: ColumnType.TEXT,
            }));
            const dataset = toTypedDataSet({
              columns: inferredCols,
              data: rows.map(r => r.map(v => v === null || v === undefined ? null : String(v))),
            });
            sink.apply({ type: "snapshot", dataset });
            return;
          }
        } else {
          rows = data as unknown[][];
        }

        const explicitCols = options?.columns ?? [];
        const columns: Column[] = explicitCols.map(c => ({
          id: c.id,
          name: c.name ?? String(c.id),
          type: c.type,
        }));
        const dataset = toTypedDataSet({
          columns,
          data: rows.map(r => r.map(v => v === null || v === undefined ? null : String(v))),
        });
        sink.apply({ type: "snapshot", dataset });
      } catch (err) {
        sink.error({
          message: err instanceof Error ? err.message : String(err),
          permanent: true,
        });
      }
    },

    disconnect(): void {
      // no-op — synchronous source, already emitted
    },
  };
}
