import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExternalDataSetDef } from "../../dataset/external/types.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import { defaultSsePushPool } from "./default-pools.js";

export interface SseSourceOptions {
  readonly dataPath?: string;
  readonly expression?: string;
  readonly columns?: readonly ExternalColumnDef[];
  readonly keyColumn?: string;
  readonly cacheMaxRows?: number;
  readonly accumulate?: boolean;
  readonly pool?: PushPool;
}

export function sseSource(
  url: string,
  dataSetId: DataSetId,
  options?: SseSourceOptions,
): DataSource {
  let connected = false;
  const pool = options?.pool ?? defaultSsePushPool;

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
        (event) => { if (connected) sink.apply(event); },
        (error) => {
          if (connected) sink.error({ message: error.message, permanent: error.permanent });
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
