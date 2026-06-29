import type { ExternalDataSetDef } from "../types.js";
import { createWebSocketSource, type WebSocketSource } from "./websocket-source.js";

export interface WebSocketPool {
  acquire(baseUrl: string, def: ExternalDataSetDef): WebSocketSource;
  releaseAll(): void;
}

export function createWebSocketPool(
  WS: typeof WebSocket = WebSocket,
): WebSocketPool {
  const sources = new Map<string, WebSocketSource>();

  return {
    acquire(baseUrl: string, def: ExternalDataSetDef): WebSocketSource {
      let source = sources.get(baseUrl);
      if (source === undefined) {
        source = createWebSocketSource(baseUrl, WS);
        sources.set(baseUrl, source);
      }
      return source;
    },

    releaseAll(): void {
      for (const source of sources.values()) {
        source.close();
      }
      sources.clear();
    },
  };
}
