import type { DataSetId, Column } from "../../types.js";
import { columnId } from "../../types.js";
import type { ExternalDataSetDef } from "../types.js";
import type { DataSetEventListener, AppendEvent, ReplaceEvent, RemoveEvent } from "../../events.js";
import { toTypedDataSet } from "../../conversion.js";
import { dispatchWireEvent } from "./push-wire.js";

export interface PushSourceError {
  readonly message: string;
  readonly permanent: boolean;
}

export interface PushSource {
  subscribe(
    dataSetId: DataSetId,
    def: ExternalDataSetDef,
    listener: DataSetEventListener,
    onError: (error: PushSourceError) => void,
  ): void;
  unsubscribe(dataSetId: DataSetId): void;
  close(): void;
}

export interface PushSourceConfig {
  readonly relay?: { readonly endpoint: string };
  readonly auth?: { readonly type: "query-param"; readonly paramName?: string; readonly token: string };
  readonly eventTarget?: EventTarget;
}

export interface WireMessage {
  dataset?: string;
  op?: string;
  seq?: string;
  columns?: Column[];
  rows?: (string | null)[][];
  row?: (string | null)[];
  key?: string;
  topic?: string;
  payload?: unknown;
}

export interface Subscription {
  readonly def: ExternalDataSetDef;
  readonly listener: DataSetEventListener;
  readonly onError: (error: PushSourceError) => void;
}

export function processWireMessage(
  msg: WireMessage,
  subscriptions: Map<DataSetId, Subscription>,
  wireNameToId: Map<string, DataSetId>,
  config?: PushSourceConfig,
  updateSeq?: (seq: string) => void,
): void {
  if (msg.op === "event" && msg.topic) {
    if (config?.eventTarget) {
      dispatchWireEvent(msg, config.eventTarget);
    }
    return;
  }

  const wireName = msg.dataset;
  let dataSetId = wireName !== undefined ? wireNameToId.get(wireName) : undefined;

  if (dataSetId === undefined) {
    if (wireName === undefined && subscriptions.size === 1) {
      const firstKey = subscriptions.keys().next().value;
      if (firstKey === undefined) return;
      dataSetId = firstKey;
    } else {
      return;
    }
  }

  const subscription = subscriptions.get(dataSetId);
  if (!subscription) return;

  const eventType = msg.op;
  if (!eventType) {
    console.warn("[PushSource] Message missing op field:", msg);
    return;
  }

  try {
    switch (eventType) {
      case "snapshot": {
        if (!msg.columns || !msg.rows) {
          console.warn("[PushSource] snapshot event missing columns or rows:", msg);
          return;
        }
        const dataset = toTypedDataSet({ columns: msg.columns, data: msg.rows });
        subscription.listener({ type: "snapshot", dataset });
        if (msg.seq !== undefined && updateSeq) updateSeq(msg.seq);
        break;
      }

      case "append": {
        if (!msg.columns || !msg.rows) {
          console.warn("[PushSource] append event missing columns or rows:", msg);
          return;
        }
        const dataset = toTypedDataSet({ columns: msg.columns, data: msg.rows });
        const event: AppendEvent = {
          type: "append",
          rows: dataset.rows,
          ...(subscription.def.cacheMaxRows !== undefined && { maxRows: subscription.def.cacheMaxRows }),
        };
        subscription.listener(event);
        if (msg.seq !== undefined && updateSeq) updateSeq(msg.seq);
        break;
      }

      case "replace": {
        if (!msg.columns || !msg.row || !msg.key) {
          console.warn("[PushSource] replace event missing columns, row, or key:", msg);
          return;
        }
        const keyCol = subscription.def.keyColumn;
        if (!keyCol) {
          console.warn("[PushSource] replace event requires keyColumn in def:", msg);
          return;
        }
        const dataset = toTypedDataSet({ columns: msg.columns, data: [msg.row] });
        if (dataset.rows.length === 0) {
          console.warn("[PushSource] replace event produced no rows:", msg);
          return;
        }
        const event: ReplaceEvent = {
          type: "replace",
          keyColumn: columnId(keyCol),
          key: msg.key,
          row: dataset.rows[0]!,
        };
        subscription.listener(event);
        if (msg.seq !== undefined && updateSeq) updateSeq(msg.seq);
        break;
      }

      case "remove": {
        if (!msg.key) {
          console.warn("[PushSource] remove event missing key:", msg);
          return;
        }
        const keyCol = subscription.def.keyColumn;
        if (!keyCol) {
          console.warn("[PushSource] remove event requires keyColumn in def:", msg);
          return;
        }
        const event: RemoveEvent = {
          type: "remove",
          keyColumn: columnId(keyCol),
          key: msg.key,
        };
        subscription.listener(event);
        if (msg.seq !== undefined && updateSeq) updateSeq(msg.seq);
        break;
      }

      default:
        console.warn("[PushSource] Unknown event type:", eventType);
    }
  } catch (error) {
    console.warn("[PushSource] Error processing message:", error);
    subscription.onError({
      message: `Error processing message: ${error instanceof Error ? error.message : String(error)}`,
      permanent: false,
    });
  }
}
