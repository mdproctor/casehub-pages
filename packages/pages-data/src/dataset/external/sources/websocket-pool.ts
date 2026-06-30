import type { WebSocketSourceConfig } from "./websocket-source.js";
import { createWebSocketSource, type WebSocketSource } from "./websocket-source.js";

export interface WebSocketPool {
  configure(config: WebSocketSourceConfig): void;
  acquire(baseUrl: string): WebSocketSource;
  releaseAll(): void;
}

export function createWebSocketPool(
  WS: typeof WebSocket = WebSocket,
): WebSocketPool {
  const sources = new Map<string, WebSocketSource>();
  let config: WebSocketSourceConfig | undefined;

  return {
    configure(cfg: WebSocketSourceConfig): void {
      config = cfg;
    },

    acquire(baseUrl: string): WebSocketSource {
      let source = sources.get(baseUrl);
      if (source === undefined) {
        source = createWebSocketSource(baseUrl, config, WS);
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
