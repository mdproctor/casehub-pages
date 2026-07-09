import { createPushPool } from "../../dataset/external/sources/push-pool.js";
import { createSseSource } from "../../dataset/external/sources/sse-source.js";
import { createWebSocketSource } from "../../dataset/external/sources/websocket-source.js";

export const defaultSsePushPool = createPushPool(
  (baseUrl, config) => createSseSource(baseUrl, config),
);

export const defaultWsPushPool = createPushPool(
  (baseUrl, config) => createWebSocketSource(baseUrl, config),
);
