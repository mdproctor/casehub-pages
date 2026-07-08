import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { DataSetLookup } from "../../dataset/lookup.js";
import { ServerQueryClient } from "../../dataset/external/providers/server-query.js";

export interface ServerQuerySourceOptions {
  readonly tokenFn?: () => string | null;
  readonly operations?: DataSetLookup["operations"];
}

/**
 * Creates a DataSource that fetches data via server-side SQL query.
 *
 * Wraps the existing ServerQueryClient. The server executes the query and
 * returns typed results.
 *
 * @param endpoint - Server query endpoint URL
 * @param dataSetId - Dataset ID to query for
 * @param options - Optional auth token function and operations
 * @param fetchFn - Optional fetch override for testing
 */
export function serverQuerySource(
  endpoint: string,
  dataSetId: DataSetId,
  options?: ServerQuerySourceOptions,
  fetchFn?: typeof globalThis.fetch,
): DataSource {
  let connected = false;

  return {
    connect(sink: DataSink): void {
      connected = true;

      const client = new ServerQueryClient(
        endpoint,
        fetchFn ?? globalThis.fetch.bind(globalThis),
        options?.tokenFn,
      );

      const lookup: DataSetLookup = {
        dataSetId,
        operations: options?.operations ?? [],
      };

      void client.query(lookup)
        .then((dataset) => {
          if (connected) {
            sink.apply({ type: "snapshot", dataset });
          }
        })
        .catch((err: unknown) => {
          if (connected) {
            sink.error({
              message: err instanceof Error ? err.message : String(err),
              permanent: false,
            });
          }
        });
    },

    disconnect(): void {
      connected = false;
    },
  };
}
