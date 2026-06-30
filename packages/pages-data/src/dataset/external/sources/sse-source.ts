import type { DataSetId } from "../../types.js";
import type { ExternalDataSetDef } from "../types.js";
import type { DataSetEventListener } from "../../events.js";
import type { PushSource, PushSourceConfig, PushSourceError, Subscription, WireMessage } from "./push-source.js";
import { processWireMessage } from "./push-source.js";

function sseSchemeToHttp(url: string): string {
  if (url.startsWith("sses://")) return "https://" + url.slice(7);
  if (url.startsWith("sse://")) return "http://" + url.slice(6);
  return url;
}

function buildSseUrl(baseUrl: string, config?: PushSourceConfig): string {
  const url = new URL(sseSchemeToHttp(baseUrl));
  if (config?.auth?.type === "query-param") {
    url.searchParams.set(config.auth.paramName ?? "token", config.auth.token);
  }
  return url.toString();
}

function extractWireName(url: string | undefined, fallbackId: DataSetId): string {
  if (!url) return fallbackId;
  try {
    const urlObj = new URL(sseSchemeToHttp(url));
    const datasetParam = urlObj.searchParams.get("dataset");
    return datasetParam ?? fallbackId;
  } catch {
    return fallbackId;
  }
}

export function createSseSource(
  baseUrl: string,
  config?: PushSourceConfig,
  ESConstructor: typeof EventSource = EventSource,
): PushSource {
  const subscriptions = new Map<DataSetId, Subscription>();
  const wireNameToId = new Map<string, DataSetId>();
  const idToWireName = new Map<DataSetId, string>();

  let es: InstanceType<typeof EventSource> | null = null;

  function connect(): void {
    if (es && es.readyState !== ESConstructor.CLOSED) return;

    es = new ESConstructor(buildSseUrl(baseUrl, config));

    for (const op of ["snapshot", "append", "replace", "remove", "event"] as const) {
      es.addEventListener(op, ((e: MessageEvent) => {
        let parsed: unknown;
        try { parsed = JSON.parse(e.data as string); } catch {
          console.warn("[SseSource] Failed to parse SSE event data:", e.data);
          return;
        }
        processWireMessage({ ...(parsed as WireMessage), op }, subscriptions, wireNameToId, config);
      }) as EventListener);
    }

    es.addEventListener("message", ((e: MessageEvent) => {
      let parsed: unknown;
      try { parsed = JSON.parse(e.data as string); } catch {
        console.warn("[SseSource] Failed to parse SSE message data:", e.data);
        return;
      }
      processWireMessage(parsed as WireMessage, subscriptions, wireNameToId, config);
    }) as EventListener);

    es.onerror = () => {
      if (es?.readyState === ESConstructor.CLOSED) {
        for (const sub of subscriptions.values()) {
          sub.onError({ message: "SSE connection closed permanently", permanent: true });
        }
      }
    };
  }

  return {
    subscribe(dataSetId: DataSetId, def: ExternalDataSetDef, listener: DataSetEventListener, onError: (error: PushSourceError) => void): void {
      if (subscriptions.has(dataSetId)) return;

      const wireName = extractWireName(def.url, dataSetId);
      subscriptions.set(dataSetId, { def, listener, onError });
      wireNameToId.set(wireName, dataSetId);
      idToWireName.set(dataSetId, wireName);

      if (subscriptions.size === 1) {
        connect();
      }
    },

    unsubscribe(dataSetId: DataSetId): void {
      const wireName = idToWireName.get(dataSetId);
      subscriptions.delete(dataSetId);
      if (wireName) {
        wireNameToId.delete(wireName);
        idToWireName.delete(dataSetId);
      }

      if (subscriptions.size === 0 && es) {
        es.close();
        es = null;
      }
    },

    close(): void {
      if (es) {
        es.close();
        es = null;
      }
      subscriptions.clear();
      wireNameToId.clear();
      idToWireName.clear();
    },
  };
}
