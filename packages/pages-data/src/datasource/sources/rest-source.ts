import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExternalDataSetDef } from "../../dataset/external/types.js";
import { HttpMethod, parseRefreshTime } from "../../dataset/external/types.js";
import type { ResolverContext } from "../../dataset/external/resolver.js";
import { resolveExternalDataSet } from "../../dataset/external/resolver.js";

export interface RestSourceOptions {
  readonly method?: HttpMethod;
  readonly headers?: Record<string, string>;
  readonly query?: Record<string, string>;
  readonly form?: Record<string, string>;
  readonly body?: string;
  readonly dataPath?: string;
  readonly type?: string;
  readonly expression?: string;
  readonly columns?: readonly ExternalColumnDef[];
  readonly refreshTime?: string;
  readonly accumulate?: boolean;
  readonly maxRows?: number;
  readonly cacheEnabled?: boolean;
}

/**
 * Creates a DataSource that fetches data from a REST endpoint.
 *
 * Internally creates an ExternalDataSetDef and delegates to
 * resolveExternalDataSet(). If `refreshTime` is set, sets up a polling
 * interval that re-fetches on the configured cadence.
 *
 * @param url - The REST endpoint URL
 * @param ctx - ResolverContext providing the DataSetManager, provider factory,
 *   and preset registry needed by the resolver
 * @param dataSetId - Unique identifier for this dataset in the manager
 * @param options - REST configuration (method, headers, extraction pipeline, etc.)
 * @param fetchFn - Optional fetch override for testing
 */
export function restSource(
  url: string,
  ctx: ResolverContext,
  dataSetId: DataSetId,
  options?: RestSourceOptions,
  fetchFn?: typeof globalThis.fetch,
): DataSource {
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let connected = false;

  function buildDef(): ExternalDataSetDef {
    const def: ExternalDataSetDef = { uuid: dataSetId, url };
    if (!options) return def;
    return {
      ...def,
      ...(options.method !== undefined && { method: options.method }),
      ...(options.headers !== undefined && { headers: options.headers }),
      ...(options.query !== undefined && { query: options.query }),
      ...(options.form !== undefined && { form: options.form }),
      ...(options.body !== undefined && { body: options.body }),
      ...(options.dataPath !== undefined && { dataPath: options.dataPath }),
      ...(options.type !== undefined && { type: options.type }),
      ...(options.expression !== undefined && { expression: options.expression }),
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.refreshTime !== undefined && { refreshTime: options.refreshTime }),
      ...(options.accumulate !== undefined && { accumulate: options.accumulate }),
      ...(options.maxRows !== undefined && { cacheMaxRows: options.maxRows }),
      ...(options.cacheEnabled !== undefined && { cacheEnabled: options.cacheEnabled }),
    };
  }

  async function doFetch(sink: DataSink): Promise<void> {
    try {
      const def = buildDef();
      const result = await resolveExternalDataSet(def, ctx, undefined, fetchFn);
      if (connected) {
        sink.apply({ type: "snapshot", dataset: result.dataset });
      }
    } catch (err) {
      if (connected) {
        sink.error({
          message: err instanceof Error ? err.message : String(err),
          permanent: false,
        });
      }
    }
  }

  return {
    connect(sink: DataSink): void {
      connected = true;

      void doFetch(sink);

      if (options?.refreshTime) {
        const intervalMs = parseRefreshTime(options.refreshTime);
        refreshTimer = setInterval(() => {
          void doFetch(sink);
        }, intervalMs);
      }
    },

    disconnect(): void {
      connected = false;
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
  };
}
