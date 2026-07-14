import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef, ExtractionDef } from "../../dataset/external/types.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import { HttpMethod, parseRefreshTime } from "../../dataset/external/types.js";
import { extractDataSet } from "../../dataset/external/extraction.js";
import { createPresetRegistry } from "../../dataset/external/presets/registry.js";

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

  readonly cacheEnabled?: boolean;
  readonly fetchFn?: typeof globalThis.fetch;
  readonly presets?: PresetRegistry;
}

export function restSource(
  url: string,
  _id: DataSetId,
  options?: RestSourceOptions,
): DataSource {
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let connected = false;
  const presets = options?.presets ?? createPresetRegistry();

  function buildUrl(): string {
    if (!options?.query || Object.keys(options.query).length === 0) return url;
    const base = new URL(url);
    for (const [k, v] of Object.entries(options.query)) {
      base.searchParams.set(k, v);
    }
    return base.toString();
  }

  function buildInit(): RequestInit {
    const init: RequestInit = {};
    const method = options?.method ?? HttpMethod.GET;
    if (method !== HttpMethod.GET) init.method = method;
    if (options?.headers) init.headers = { ...options.headers };
    if (options?.body) init.body = options.body;
    if (options?.form) {
      const formData = new URLSearchParams(options.form);
      init.body = formData.toString();
      init.headers = {
        ...(init.headers as Record<string, string> | undefined),
        "Content-Type": "application/x-www-form-urlencoded",
      };
    }
    return init;
  }

  function buildDef(): ExtractionDef {
    const def: ExtractionDef = { url };
    if (!options) return def;
    return {
      ...def,
      ...(options.dataPath !== undefined && { dataPath: options.dataPath }),
      ...(options.type !== undefined && { type: options.type }),
      ...(options.expression !== undefined && { expression: options.expression }),
      ...(options.columns !== undefined && { columns: options.columns }),
      ...(options.accumulate !== undefined && { accumulate: options.accumulate }),
    };
  }

  async function doFetch(sink: DataSink): Promise<void> {
    const fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
    try {
      const response = await fetchFn(buildUrl(), buildInit());
      if (!connected) return;

      const contentType = response.headers?.get("content-type") ?? undefined;
      let data: unknown;
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const { dataset } = await extractDataSet(
        { data, ...(contentType ? { contentType } : {}) },
        buildDef(),
        presets,
      );
      if (connected) {
        sink.apply({ type: "snapshot", dataset });
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
