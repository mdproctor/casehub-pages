export type {
  DataSource,
  DataSink,
  SourceError,
  Disposable,
  MutableDataSource,
  DataAction,
  DataSourceBinding,
  SourceFactory,
  SourceFactoryOptions,
} from "./types.js";

export type {
  ScenarioController,
  ScenarioControllerOptions,
  ScenarioAnnotation,
  AnnotationStyle,
  AnchorPosition,
  EventLogEntry,
} from "./controller.js";

export { createScenarioController } from "./controller.js";

export { inlineSource } from "./sources/inline-source.js";
export type { InlineData, InlineSourceOptions } from "./sources/inline-source.js";
export { csvSource } from "./sources/csv-source.js";
export type { CsvSourceOptions } from "./sources/csv-source.js";
export { simulated } from "./sources/simulated/simulated-source.js";
export type { SimulatedConfig } from "./sources/simulated/simulated-source.js";
export { replay } from "./sources/replay-source.js";
export type { RecordedEvent, ReplayOptions } from "./sources/replay-source.js";
export { recording } from "./sources/recording-source.js";
export type { RecordingCapture } from "./sources/recording-source.js";
export {
  transition,
  increment,
  decrement,
  addRow,
  removeRow,
  when,
  evaluateMutations,
} from "./sources/simulated/mutations.js";
export type {
  Mutation,
  TransitionMutation,
  IncrementMutation,
  DecrementMutation,
  AddRowMutation,
  RemoveRowMutation,
  ConditionalMutation,
  EvalContext,
} from "./sources/simulated/mutations.js";

// Wrapped sources — bridge existing machinery behind the DataSource interface
export { composite } from "./sources/composite-source.js";
export { restSource } from "./sources/rest-source.js";
export type { RestSourceOptions } from "./sources/rest-source.js";
export { sseSource } from "./sources/sse-source.js";
export type { SseSourceOptions } from "./sources/sse-source.js";
export { wsSource } from "./sources/ws-source.js";
export type { WsSourceOptions } from "./sources/ws-source.js";
export { joinSource } from "./sources/join-source.js";
export { postMessageSource } from "./sources/post-message-source.js";
export type { PostMessageSourceOptions } from "./sources/post-message-source.js";
export { serverQuerySource } from "./sources/server-query-source.js";
export type { ServerQuerySourceOptions } from "./sources/server-query-source.js";
export { createSourceFactory } from "./sources/source-factory.js";
export type { SourceFactoryDeps } from "./sources/source-factory.js";
export { defToBinding } from "./sources/def-to-binding.js";
export type { DefToBindingDeps } from "./sources/def-to-binding.js";
export { defaultSsePushPool, defaultWsPushPool } from "./sources/default-pools.js";
