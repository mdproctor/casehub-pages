import type { ExternalDataSetDef } from "../../dataset/external/types.js";
import type { ResolverContext } from "../../dataset/external/resolver.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import type { DataSetManager } from "../../dataset/manager.js";
import type { DataSourceBinding } from "../types.js";
import type { InlineSourceOptions } from "./inline-source.js";
import type { RestSourceOptions } from "./rest-source.js";
import type { WsSourceOptions } from "./ws-source.js";
import type { SseSourceOptions } from "./sse-source.js";
import type { ServerQuerySourceOptions } from "./server-query-source.js";
import { inlineSource } from "./inline-source.js";
import { restSource } from "./rest-source.js";
import { sseSource } from "./sse-source.js";
import { wsSource } from "./ws-source.js";
import { joinSource } from "./join-source.js";
import { serverQuerySource } from "./server-query-source.js";

/**
 * Runtime dependencies needed to create DataSource instances from
 * ExternalDataSetDef. These are provided by the DataPipeline at
 * construction time.
 */
export interface DefToBindingDeps {
  readonly ctx: ResolverContext;
  readonly wsPool: PushPool;
  readonly ssePool: PushPool;
  readonly manager: DataSetManager;
}

function buildInlineOpts(def: ExternalDataSetDef): InlineSourceOptions {
  const opts: InlineSourceOptions = {};
  if (def.columns !== undefined) (opts as { columns: typeof def.columns }).columns = def.columns;
  if (def.expression !== undefined) (opts as { expression: string }).expression = def.expression;
  if (def.dataPath !== undefined) (opts as { dataPath: string }).dataPath = def.dataPath;
  if (def.type !== undefined) (opts as { type: string }).type = def.type;
  return opts;
}

function buildPushOpts(def: ExternalDataSetDef): WsSourceOptions & SseSourceOptions {
  const opts: WsSourceOptions = {};
  if (def.columns !== undefined) (opts as { columns: typeof def.columns }).columns = def.columns;
  if (def.keyColumn !== undefined) (opts as { keyColumn: string }).keyColumn = def.keyColumn;
  if (def.dataPath !== undefined) (opts as { dataPath: string }).dataPath = def.dataPath;
  if (def.expression !== undefined) (opts as { expression: string }).expression = def.expression;
  if (def.cacheMaxRows !== undefined) (opts as { cacheMaxRows: number }).cacheMaxRows = def.cacheMaxRows;
  if (def.accumulate !== undefined) (opts as { accumulate: boolean }).accumulate = def.accumulate;
  return opts;
}

function buildRestOpts(def: ExternalDataSetDef): RestSourceOptions {
  const opts: RestSourceOptions = {};
  if (def.method !== undefined) (opts as { method: typeof def.method }).method = def.method;
  if (def.headers !== undefined) (opts as { headers: Record<string, string> }).headers = { ...def.headers };
  if (def.query !== undefined) (opts as { query: Record<string, string> }).query = { ...def.query };
  if (def.body !== undefined) (opts as { body: string }).body = def.body;
  if (def.form !== undefined) (opts as { form: Record<string, string> }).form = { ...def.form };
  if (def.dataPath !== undefined) (opts as { dataPath: string }).dataPath = def.dataPath;
  if (def.type !== undefined) (opts as { type: string }).type = def.type;
  if (def.expression !== undefined) (opts as { expression: string }).expression = def.expression;
  if (def.columns !== undefined) (opts as { columns: typeof def.columns }).columns = def.columns;
  if (def.refreshTime !== undefined) (opts as { refreshTime: string }).refreshTime = def.refreshTime;
  if (def.accumulate !== undefined) (opts as { accumulate: boolean }).accumulate = def.accumulate;
  if (def.cacheMaxRows !== undefined) (opts as { maxRows: number }).maxRows = def.cacheMaxRows;
  if (def.cacheEnabled !== undefined) (opts as { cacheEnabled: boolean }).cacheEnabled = def.cacheEnabled;
  return opts;
}

/**
 * Converts an ExternalDataSetDef (from YAML parsing) into a
 * DataSourceBinding with a fully-wired DataSource.
 *
 * Mapping rules follow spec §6.4:
 * - content set → inlineSource
 * - join set → joinSource
 * - serverQuery + url → serverQuerySource
 * - url ws:// / wss:// → wsSource
 * - url sse:// / sses:// → sseSource
 * - url (default) → restSource
 */
export function defToBinding(
  def: ExternalDataSetDef,
  deps: DefToBindingDeps,
): DataSourceBinding {
  const base: { id: typeof def.uuid; keyColumn?: string } = { id: def.uuid };
  if (def.keyColumn !== undefined) {
    base.keyColumn = def.keyColumn;
  }

  // 1. Inline content
  if (def.content !== undefined) {
    return { ...base, source: inlineSource(def.content, buildInlineOpts(def)) };
  }

  // 2. Join
  if (def.join !== undefined) {
    return { id: def.uuid, source: joinSource(deps.manager, ...def.join) };
  }

  // 3. Server-side query
  if (def.serverQuery && def.url) {
    const serverQueryConfig = deps.ctx.providerConfig.serverQuery;
    const opts: ServerQuerySourceOptions = {};
    if (serverQueryConfig?.tokenFn !== undefined) {
      (opts as { tokenFn: () => string | null }).tokenFn = serverQueryConfig.tokenFn;
    }
    return {
      id: def.uuid,
      source: serverQuerySource(
        serverQueryConfig?.endpoint ?? def.url,
        def.uuid,
        opts,
      ),
    };
  }

  const url = def.url ?? "";

  // 4. WebSocket
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return { ...base, source: wsSource(url, deps.wsPool, def.uuid, buildPushOpts(def)) };
  }

  // 5. SSE
  if (url.startsWith("sse://") || url.startsWith("sses://")) {
    return { ...base, source: sseSource(url, deps.ssePool, def.uuid, buildPushOpts(def)) };
  }

  // 6. Default: REST
  return { ...base, source: restSource(url, deps.ctx, def.uuid, buildRestOpts(def)) };
}
