// Re-export types
export type {
  ExternalDataSetDef,
  ExternalColumnDef,
  DataRequest,
  FetchResult,
  DataProvider,
  DataProviderConfig,
  WebSocketAuthConfig,
  ExtractionPreset,
  PresetRegistry,
  ExtractionResult,
  ResolveResult,
  PagesDataMessage,
  ServiceCapabilities,
} from "./types.js";

export { HttpMethod, LOCAL_CAPABILITIES, isServiceCapabilities } from "./types.js";

// Schema
export { parseExternalDataSetDef } from "./schema.js";
export type { ParsedExternalDataSetDef } from "./schema.js";

// Parsers
export { parseCsv } from "./csv.js";
export type { CsvParseOptions, CsvParseResult } from "./csv.js";
export { parseMetrics } from "./metrics-parser.js";

// Presets
export { createPresetRegistry } from "./presets/registry.js";

// Extraction
export { extractDataSet } from "./extraction.js";

// Expression Generator
export { evaluateGenerator } from "./expression-generator.js";

// Join
export { joinDataSets } from "./join.js";

// Resolver
export { resolveExternalDataSet } from "./resolver.js";
export type { ResolverContext } from "./resolver.js";

// Providers (public — useful for consumers)
export { InlineProvider } from "./providers/inline.js";
export { CorsProxyProvider } from "./providers/cors-proxy.js";
export { BrowserFetchProvider } from "./providers/browser-fetch.js";
export { ServerRelayProvider } from "./providers/server-relay.js";
export { ServerQueryClient } from "./providers/server-query.js";
export { PostMessageProvider } from "./providers/post-message.js";

// Factory
export { createDataProviderFactory } from "./provider-factory.js";
export type { DataProviderFactory } from "./provider-factory.js";

// Push source abstraction
export type { PushSource, PushSourceConfig, PushSourceError } from "./sources/push-source.js";

// WebSocket
export { createWebSocketSource } from "./sources/websocket-source.js";

// SSE
export { createSseSource } from "./sources/sse-source.js";

// Push pool (generic)
export { createPushPool } from "./sources/push-pool.js";
export type { PushPool } from "./sources/push-pool.js";
