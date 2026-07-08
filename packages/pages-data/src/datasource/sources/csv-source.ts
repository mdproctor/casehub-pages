import type { DataSource, DataSink } from "../types.js";
import type { ExternalColumnDef } from "../../dataset/external/types.js";
import type { Column } from "../../dataset/types.js";
import { ColumnType, columnId } from "../../dataset/types.js";
import { parseCsv } from "../../dataset/external/csv.js";
import type { CsvParseOptions } from "../../dataset/external/csv.js";
import { toTypedDataSet } from "../../dataset/conversion.js";

export interface CsvSourceOptions {
  readonly delimiter?: string;
  readonly hasHeader?: boolean;
  readonly columns?: readonly ExternalColumnDef[];
}

export function csvSource(csv: string, options?: CsvSourceOptions): DataSource {
  return {
    connect(sink: DataSink): void {
      try {
        const parseOpts: CsvParseOptions = {
          ...(options?.delimiter !== undefined && { delimiter: options.delimiter }),
          hasHeader: options?.hasHeader ?? true,
        };
        const parsed = parseCsv(csv, parseOpts);

        if (parsed.rows.length === 0 && parsed.headers.length === 0) {
          sink.error({ message: "CSV is empty", permanent: true });
          return;
        }

        let columns: readonly Column[];
        if (options?.columns) {
          columns = options.columns.map(c => ({
            id: c.id,
            name: c.name ?? String(c.id),
            type: c.type,
          }));
        } else {
          columns = parsed.headers.map(h => ({
            id: columnId(h),
            name: h,
            type: ColumnType.TEXT,
          }));
        }

        const dataset = toTypedDataSet({ columns, data: parsed.rows });
        sink.apply({ type: "snapshot", dataset });
      } catch (err) {
        sink.error({
          message: err instanceof Error ? err.message : String(err),
          permanent: true,
        });
      }
    },

    disconnect(): void {},
  };
}
