import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExternalDataSetDef } from "../../dataset/external/types.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";

export interface SseSourceOptions {
  readonly dataPath?: string;
  readonly expression?: string;
  readonly columns?: readonly ExternalColumnDef[];
  readonly keyColumn?: string;
  readonly cacheMaxRows?: number;
  readonly accumulate?: boolean;
}

/**
 * Creates a DataSource that receives live data via Server-Sent Events.
 *
 * Wraps the existing PushPool/SseSource machinery — connection pooling is
 * preserved (multiple sseSource calls with the same base URL share one
 * underlying EventSource connection via the pool).
 *
 * @param url - SSE endpoint URL (supports sse:// and sses:// schemes)
 * @param pool - PushPool that manages shared SSE connections
 * @param dataSetId - Unique identifier for this dataset subscription
 * @param options - Optional extraction and caching configuration
 */
export function sseSource(
  url: string,
  pool: PushPool,
  dataSetId: DataSetId,
  options?: SseSourceOptions,
): DataSource {
  let connected = false;

  function buildDef(): ExternalDataSetDef {
    const def: ExternalDataSetDef = { uuid: dataSetId, url };
    if (!options) return def;
    return {
      ...def,
      ...(options.dataPath !== undefined && { dataPath: options.dataPath }),
      ...(options.expression !== undefined && { expression: options.expression }),
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.keyColumn !== undefined && { keyColumn: options.keyColumn }),
      ...(options.cacheMaxRows !== undefined && { cacheMaxRows: options.cacheMaxRows }),
      ...(options.accumulate !== undefined && { accumulate: options.accumulate }),
    };
  }

  return {
    connect(sink: DataSink): void {
      connected = true;
      const pushSource = pool.acquire(url);
      const def = buildDef();

      pushSource.subscribe(
        dataSetId,
        def,
        (event) => {
          if (connected) {
            sink.apply(event);
          }
        },
        (error) => {
          if (connected) {
            sink.error({
              message: error.message,
              permanent: error.permanent,
            });
          }
        },
      );
    },

    disconnect(): void {
      if (!connected) return;
      connected = false;
      const pushSource = pool.acquire(url);
      pushSource.unsubscribe(dataSetId);
    },
  };
}
