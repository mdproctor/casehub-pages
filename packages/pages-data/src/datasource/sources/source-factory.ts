import type { DataSetId } from "../../dataset/types.js";
import type { SourceFactory, SourceFactoryOptions } from "../types.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import { restSource } from "./rest-source.js";
import { sseSource } from "./sse-source.js";
import { wsSource } from "./ws-source.js";

export interface SourceFactoryDeps {
  readonly wsPool?: PushPool;
  readonly ssePool?: PushPool;
  readonly fetchFn?: typeof globalThis.fetch;
  readonly presets?: PresetRegistry;
}

export function createSourceFactory(deps?: SourceFactoryDeps): SourceFactory {
  return (url: string, id: DataSetId, options?: SourceFactoryOptions) => {
    const columns = options?.columns;
    const dataPath = options?.dataPath;
    const totalPath = options?.totalPath;

    if (url.startsWith("ws://") || url.startsWith("wss://")) {
      return wsSource(url, id, {
        ...(columns !== undefined && { columns }),
        ...(dataPath !== undefined && { dataPath }),
        ...(deps?.wsPool !== undefined && { pool: deps.wsPool }),
      });
    }

    if (url.startsWith("sse://") || url.startsWith("sses://")) {
      return sseSource(url, id, {
        ...(columns !== undefined && { columns }),
        ...(dataPath !== undefined && { dataPath }),
        ...(deps?.ssePool !== undefined && { pool: deps.ssePool }),
      });
    }

    return restSource(url, id, {
      ...(columns !== undefined && { columns }),
      ...(dataPath !== undefined && { dataPath }),
      ...(totalPath !== undefined && { totalPath }),
      ...(deps?.fetchFn !== undefined && { fetchFn: deps.fetchFn }),
      ...(deps?.presets !== undefined && { presets: deps.presets }),
    });
  };
}
