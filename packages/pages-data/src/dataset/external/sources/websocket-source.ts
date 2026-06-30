import type { DataSetId, Column, ColumnId } from "../../types.js";
import type { DataSetEvent, DataSetEventListener, AppendEvent, ReplaceEvent, RemoveEvent } from "../../events.js";
import type { ExternalDataSetDef, WebSocketAuthConfig } from "../types.js";
import { toTypedDataSet } from "../../conversion.js";
import { columnId } from "../../types.js";

interface Subscription {
  readonly def: ExternalDataSetDef;
  readonly listener: DataSetEventListener;
}

export interface WebSocketSource {
  subscribe(dataSetId: DataSetId, def: ExternalDataSetDef, listener: DataSetEventListener): void;
  unsubscribe(dataSetId: DataSetId): void;
  close(): void;
}

export interface WebSocketSourceConfig {
  readonly relay?: { readonly endpoint: string };
  readonly auth?: WebSocketAuthConfig;
}

interface WireMessage {
  dataset?: string;
  type?: string;
  columns?: Column[];
  rows?: (string | null)[][];
  row?: (string | null)[];
  key?: string;
}

export function createWebSocketSource(
  baseUrl: string,
  config?: WebSocketSourceConfig,
  WSConstructor: typeof WebSocket = WebSocket,
): WebSocketSource {
  const subscriptions = new Map<DataSetId, Subscription>();
  const wireNameToId = new Map<string, DataSetId>();
  const idToWireName = new Map<DataSetId, string>();

  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function buildConnectionUrl(): string {
    let url = new URL(baseUrl);

    if (config?.relay) {
      url = new URL(config.relay.endpoint);
      url.searchParams.set("target", baseUrl);
    }

    if (config?.auth?.type === "query-param") {
      url.searchParams.set(config.auth.paramName ?? "token", config.auth.token);
    }

    return url.toString();
  }

  function extractWireName(url: string | undefined, fallbackId: DataSetId): string {
    if (!url) return fallbackId;
    try {
      const urlObj = new URL(url);
      const datasetParam = urlObj.searchParams.get("dataset");
      return datasetParam ?? fallbackId;
    } catch {
      return fallbackId;
    }
  }

  function connect(): void {
    if (ws && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
      return;
    }

    ws = new WSConstructor(buildConnectionUrl());

    ws.onopen = () => {
      reconnectAttempt = 0;
      // Resubscribe all existing subscriptions
      for (const [id, subscription] of subscriptions) {
        const wireName = idToWireName.get(id);
        if (wireName) {
          ws?.send(JSON.stringify({ type: "subscribe", dataset: wireName }));
        }
      }
    };

    ws.onmessage = (event) => {
      handleMessage(event.data);
    };

    ws.onclose = (event) => {
      handleClose(event.code, event.reason);
    };

    ws.onerror = () => {
      // Error will trigger onclose
    };
  }

  function handleMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn("[WebSocketSource] Failed to parse message as JSON:", data);
      return;
    }

    const messages = Array.isArray(parsed) ? parsed : [parsed];

    for (const msg of messages) {
      if (typeof msg !== "object" || msg === null) {
        console.warn("[WebSocketSource] Message is not an object:", msg);
        continue;
      }
      processMessage(msg as WireMessage);
    }
  }

  function processMessage(msg: WireMessage): void {
    const wireName = msg.dataset;
    const dataSetId = wireName ? wireNameToId.get(wireName) : undefined;

    if (!dataSetId) {
      // Unsubscribed dataset — skip silently
      return;
    }

    const subscription = subscriptions.get(dataSetId);
    if (!subscription) {
      return;
    }

    const eventType = msg.type;
    if (!eventType) {
      console.warn("[WebSocketSource] Message missing type field:", msg);
      return;
    }

    try {
      switch (eventType) {
        case "snapshot": {
          if (!msg.columns || !msg.rows) {
            console.warn("[WebSocketSource] snapshot event missing columns or rows:", msg);
            return;
          }
          const dataset = toTypedDataSet({ columns: msg.columns, data: msg.rows });
          subscription.listener({ type: "snapshot", dataset });
          break;
        }

        case "append": {
          if (!msg.columns || !msg.rows) {
            console.warn("[WebSocketSource] append event missing columns or rows:", msg);
            return;
          }
          const dataset = toTypedDataSet({ columns: msg.columns, data: msg.rows });
          const event: AppendEvent = {
            type: "append",
            rows: dataset.rows,
            ...(subscription.def.cacheMaxRows !== undefined && { maxRows: subscription.def.cacheMaxRows }),
          };
          subscription.listener(event);
          break;
        }

        case "replace": {
          if (!msg.columns || !msg.row || !msg.key) {
            console.warn("[WebSocketSource] replace event missing columns, row, or key:", msg);
            return;
          }
          const keyColumn = subscription.def.keyColumn;
          if (!keyColumn) {
            console.warn("[WebSocketSource] replace event requires keyColumn in def:", msg);
            return;
          }
          const dataset = toTypedDataSet({ columns: msg.columns, data: [msg.row] });
          if (dataset.rows.length === 0) {
            console.warn("[WebSocketSource] replace event produced no rows:", msg);
            return;
          }
          const event: ReplaceEvent = {
            type: "replace",
            keyColumn: columnId(keyColumn),
            key: msg.key,
            row: dataset.rows[0]!,
          };
          subscription.listener(event);
          break;
        }

        case "remove": {
          if (!msg.key) {
            console.warn("[WebSocketSource] remove event missing key:", msg);
            return;
          }
          const keyColumn = subscription.def.keyColumn;
          if (!keyColumn) {
            console.warn("[WebSocketSource] remove event requires keyColumn in def:", msg);
            return;
          }
          const event: RemoveEvent = {
            type: "remove",
            keyColumn: columnId(keyColumn),
            key: msg.key,
          };
          subscription.listener(event);
          break;
        }

        default:
          console.warn("[WebSocketSource] Unknown event type:", eventType);
      }
    } catch (error) {
      console.warn("[WebSocketSource] Error processing message:", msg, error);
    }
  }

  function handleClose(code: number, reason: string): void {
    const shouldReconnect =
      code === 1001 || // Going Away
      code === 1006 || // Abnormal Closure
      code === 1011; // Unexpected Condition

    if (shouldReconnect && subscriptions.size > 0) {
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
      reconnectAttempt++;
      reconnectTimer = setTimeout(() => {
        connect();
      }, delay);
    } else if (code >= 4000) {
      console.warn(`[WebSocketSource] Application error (${code}): ${reason}`);
    }
  }

  return {
    subscribe(dataSetId: DataSetId, def: ExternalDataSetDef, listener: DataSetEventListener): void {
      const wireName = extractWireName(def.url, dataSetId);

      subscriptions.set(dataSetId, { def, listener });
      wireNameToId.set(wireName, dataSetId);
      idToWireName.set(dataSetId, wireName);

      if (subscriptions.size === 1) {
        connect();
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "subscribe", dataset: wireName }));
      }
    },

    unsubscribe(dataSetId: DataSetId): void {
      const wireName = idToWireName.get(dataSetId);
      if (wireName && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", dataset: wireName }));
      }

      subscriptions.delete(dataSetId);
      if (wireName) {
        wireNameToId.delete(wireName);
        idToWireName.delete(dataSetId);
      }

      if (subscriptions.size === 0) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (ws) {
          ws.close();
          ws = null;
        }
      }
    },

    close(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
      subscriptions.clear();
      wireNameToId.clear();
      idToWireName.clear();
    },
  };
}
