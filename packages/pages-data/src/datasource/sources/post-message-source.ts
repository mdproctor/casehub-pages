import type { DataSource, DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import type { ExternalColumnDef } from "../../dataset/external/types.js";
import type { PresetRegistry } from "../../dataset/external/types.js";
import { extractDataSet } from "../../dataset/external/extraction.js";
import { createPresetRegistry } from "../../dataset/external/presets/registry.js";

export interface PostMessageSourceOptions {
  readonly columns?: readonly ExternalColumnDef[];
  readonly dataPath?: string;
  readonly type?: string;
  readonly expression?: string;
  readonly timeoutMs?: number;
  readonly eventTarget?: EventTarget;
  readonly presets?: PresetRegistry;
}

export function postMessageSource(
  dataSetId: DataSetId,
  options?: PostMessageSourceOptions,
): DataSource {
  const presets = options?.presets ?? createPresetRegistry();
  let handler: ((event: Event) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const target = options?.eventTarget ?? globalThis;

  function cleanup(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (handler !== null) {
      target.removeEventListener("message", handler);
      handler = null;
    }
  }

  return {
    connect(sink: DataSink): void {
      const timeoutMs = options?.timeoutMs ?? 30_000;

      timer = setTimeout(() => {
        cleanup();
        sink.error({
          message: `PostMessage timeout: no data for dataset "${dataSetId}" within ${String(timeoutMs)}ms`,
          permanent: true,
        });
      }, timeoutMs);

      handler = (event: Event) => {
        const msgEvent = event as MessageEvent;
        const msg = msgEvent.data as { type?: string; dataSetId?: string; data?: unknown; contentType?: string } | null;
        if (
          msg &&
          msg.type === "casehub-pages-dataset" &&
          msg.dataSetId === dataSetId
        ) {
          cleanup();

          const fetchResult = msg.contentType !== undefined
            ? { data: msg.data, contentType: msg.contentType }
            : { data: msg.data };

          const def = {
            uuid: dataSetId,
            ...(options?.dataPath !== undefined && { dataPath: options.dataPath }),
            ...(options?.type !== undefined && { type: options.type }),
            ...(options?.expression !== undefined && { expression: options.expression }),
            ...(options?.columns !== undefined && { columns: options.columns }),
          };

          void extractDataSet(fetchResult, def, presets)
            .then(({ dataset }) => {
              sink.apply({ type: "snapshot", dataset });
            })
            .catch((err: unknown) => {
              sink.error({
                message: err instanceof Error ? err.message : String(err),
                permanent: true,
              });
            });
        }
      };

      target.addEventListener("message", handler);
    },

    disconnect(): void {
      cleanup();
    },
  };
}
