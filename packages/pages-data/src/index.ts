export type {
  ColumnId,
  DataSetId,
  Column,
  ColumnSettings,
  CellValue,
  TypedDataSet,
  TypedRow,
  DataSet,
  DatasetContract,
} from "./dataset/types.js";
export { ColumnType, dataSetId, columnId } from "./dataset/types.js";

export type { SortColumn, SortOp, SortOrder } from "./dataset/sort.js";

export type { DataSetOp } from "./dataset/ops.js";
export { applyOps, validateOpOrder } from "./dataset/ops.js";

export type { DataSetLookup } from "./dataset/lookup.js";
export { createLookup } from "./dataset/lookup.js";
export { parseLookup } from "./dataset/lookup-parser.js";

export type { Aggregation, GroupingKey, GroupStrategy, GroupOp, ResultColumn, FixedCalendarUnit } from "./dataset/group.js";

export type { FilterOp, FilterExpression, CoreFunctionType, UnresolvedLeaf } from "./dataset/filter.js";

export type { DataSetEvent } from "./dataset/events.js";

export { compileOrCached } from "./expression/jsonata-bridge.js";

export { fromRows, toTypedDataSet, createTypedRow, toWireDataSet } from "./dataset/conversion.js";

export type { DataSetManager, LookupOptions } from "./dataset/manager.js";
export { createDataSetManager } from "./dataset/manager.js";

export {
  type ExternalDataSetDef,
  type ExternalColumnDef,
  type DataRequest,
  type FetchResult,
  type DataProvider,
  type DataProviderConfig,
  type WebSocketAuthConfig,
  type ExtractionPreset,
  type PresetRegistry,
  type ExtractionResult,
  type ResolveResult,
  type PagesDataMessage,
  type ServiceCapabilities,
  HttpMethod,
  LOCAL_CAPABILITIES,
  isServiceCapabilities,
  parseRefreshTime,
  type ParsedExternalDataSetDef,
  parseExternalDataSetDef,
  type CsvParseOptions,
  type CsvParseResult,
  parseCsv,
  parseMetrics,
  createPresetRegistry,
  extractDataSet,
  evaluateGenerator,
  joinDataSets,
  type ResolverContext,
  resolveExternalDataSet,
  InlineProvider,
  CorsProxyProvider,
  BrowserFetchProvider,
  ServerRelayProvider,
  ServerQueryClient,
  PostMessageProvider,
  createDataProviderFactory,
  type DataProviderFactory,
  type PushSource,
  type PushSourceConfig,
  type PushSourceError,
  buildConnectionUrl,
  sendListen,
  sendUnlisten,
  dispatchWireEvent,
  createWebSocketSource,
  createSseSource,
  SSEManager,
  type SSEEvent,
  type SSEHandler,
  type SSESubscribeOptions,
  createPushPool,
  type PushPool,
  type EventConnection,
  type ListenAck,
  type ConnectionStatus,
  type EventConnectionOptions,
  createEventConnection,
  isValidTopicOrPattern,
  matchesTopic,
  isMatchedByRegistrations,
} from "./dataset/external/index.js";

export {
  EventStream,
  type EventStreamOptions,
  createEventStreamPool,
  type EventStreamPool,
} from "./event-stream/index.js";

export * from "./datasource/index.js";

export type { GroupBoundary, GroupNode } from "./group-extraction.js";
export { extractGroupBoundaries, extractGroupTree } from "./group-extraction.js";
