import type { DataSetId } from "../../types.js";
import type { DataSetEventListener } from "../../events.js";
import type { ExternalDataSetDef } from "../types.js";
import type { PushSource, PushSourceConfig, PushSourceError, Subscription, WireMessage } from "./push-source.js";
import { processWireMessage } from "./push-source.js";
import { buildConnectionUrl, nextRequestId, sendSubscribe, sendUnsubscribe } from "./push-wire.js";

export function createWebSocketSource(
  baseUrl: string,
  config?: PushSourceConfig,
  WSConstructor: typeof WebSocket = WebSocket,
): PushSource {
  const subscriptions = new Map<DataSetId, Subscription>();
  const wireNameToId = new Map<string, DataSetId>();
  const idToWireName = new Map<DataSetId, string>();

  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeq: string | undefined;

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

    ws = new WSConstructor(buildConnectionUrl(baseUrl, config));

    ws.onopen = () => {
      reconnectAttempt = 0;
      // Resubscribe all existing subscriptions
      for (const [id] of subscriptions) {
        const wireName = idToWireName.get(id);
        if (wireName && ws) {
          const requestId = nextRequestId();
          sendSubscribe(ws, requestId, wireName, lastSeq);
        }
      }
    };

    ws.onmessage = (event) => {
      handleMessage(event.data as string);
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

      // Handle ack/error messages
      const wireMsg = msg as { op?: string; id?: string; message?: string };
      if (wireMsg.op === "ack") {
        console.debug("[WebSocketSource] Received ack:", wireMsg.id);
        continue;
      }
      if (wireMsg.op === "error") {
        console.warn("[WebSocketSource] Received error:", wireMsg.message ?? "unknown error");
        continue;
      }

      processWireMessage(
        msg as WireMessage,
        subscriptions,
        wireNameToId,
        config,
        (seq) => { lastSeq = seq; },
      );
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
    } else if (code >= 4000 && subscriptions.size > 0) {
      const message = `Application error (${code.toString()}): ${reason}`;
      for (const sub of subscriptions.values()) {
        sub.onError({ message, permanent: true });
      }
    } else if (code >= 1002 && code <= 1015) {
      console.warn(`[WebSocketSource] Protocol error (${code.toString()}): ${reason}`);
    }
  }

  return {
    subscribe(
      dataSetId: DataSetId,
      def: ExternalDataSetDef,
      listener: DataSetEventListener,
      onError: (error: PushSourceError) => void,
    ): void {
      if (subscriptions.has(dataSetId)) return;

      const wireName = extractWireName(def.url, dataSetId);

      subscriptions.set(dataSetId, { def, listener, onError });
      wireNameToId.set(wireName, dataSetId);
      idToWireName.set(dataSetId, wireName);

      if (subscriptions.size === 1) {
        connect();
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        const requestId = nextRequestId();
        sendSubscribe(ws, requestId, wireName);
      }
    },

    unsubscribe(dataSetId: DataSetId): void {
      const wireName = idToWireName.get(dataSetId);
      if (wireName && ws && ws.readyState === WebSocket.OPEN) {
        const requestId = nextRequestId();
        sendUnsubscribe(ws, requestId, wireName);
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
      lastSeq = undefined;
    },
  };
}
