import type { TypedDataSet } from "../types.js";
import type { DataSetManager } from "../manager.js";
import type {
  ExternalDataSetDef,
  DataProvider,
  DataProviderConfig,
  PresetRegistry,
  ResolveResult,
  DataRequest,
  ServiceCapabilities,
} from "./types.js";
import { HttpMethod } from "./types.js";
import { DataSetError } from "../errors.js";
import { extractDataSet } from "./extraction.js";
import { joinDataSets } from "./join.js";
import type { DataSetLookup } from "../lookup.js";
import { ServerQueryClient } from "./providers/server-query.js";

export interface ResolverContext {
  readonly manager: DataSetManager;
  readonly providerFactory: {
    create(
      def: ExternalDataSetDef,
      config: DataProviderConfig,
    ): DataProvider | undefined;
  };
  readonly providerConfig: DataProviderConfig;
  readonly presetRegistry: PresetRegistry;
  readonly capabilities: ServiceCapabilities;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(def: ExternalDataSetDef): void {
  if (!def.uuid) {
    throw new DataSetError("INVALID_DEFINITION", "uuid is required");
  }

  const sourceCount =
    (def.url !== undefined ? 1 : 0) +
    (def.content !== undefined ? 1 : 0) +
    (def.join !== undefined ? 1 : 0);

  if (sourceCount === 0) {
    throw new DataSetError(
      "INVALID_DEFINITION",
      `Dataset "${def.uuid}" must specify exactly one of: url, content, join`,
    );
  }

  if (sourceCount > 1) {
    throw new DataSetError(
      "INVALID_DEFINITION",
      `Dataset "${def.uuid}" must specify exactly one of: url, content, join (found ${String(sourceCount)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// DataRequest builder
// ---------------------------------------------------------------------------

function buildRequest(def: ExternalDataSetDef): DataRequest {
  const request: DataRequest = {
    url: def.url ?? "",
    method: def.method ?? HttpMethod.GET,
    headers: def.headers ?? {},
    query: def.query ?? {},
    ...(def.form !== undefined ? { form: def.form } : {}),
    ...(def.body !== undefined ? { body: def.body } : {}),
  };
  return request;
}

// ---------------------------------------------------------------------------
// Source determination
// ---------------------------------------------------------------------------

function determineSource(
  def: ExternalDataSetDef,
): "url" | "content" | "join" {
  if (def.join !== undefined) return "join";
  if (def.content !== undefined) return "content";
  return "url";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function resolveExternalDataSet(
  def: ExternalDataSetDef,
  ctx: ResolverContext,
  lookup?: DataSetLookup,
  fetchFn?: typeof globalThis.fetch,
): Promise<ResolveResult> {
  // ---- Server-query route (early return — bypasses validate/determineSource) ----
  if (def.serverQuery) {
    if (!ctx.providerConfig.serverQuery) {
      throw new DataSetError(
        "CONFIG_MISSING",
        `Dataset "${String(def.uuid)}" uses serverQuery but no serverQuery config is provided`,
      );
    }
    const config = ctx.providerConfig.serverQuery;
    const client = new ServerQueryClient(
      config.endpoint,
      fetchFn ?? globalThis.fetch.bind(globalThis),
      config.tokenFn,
    );
    const effectiveLookup = lookup ?? { dataSetId: def.uuid, operations: [] };
    const dataset = await client.query(effectiveLookup);
    ctx.manager.apply(def.uuid, { type: "snapshot", dataset });
    return { dataset, inferredColumns: false, source: "serverQuery" };
  }

  // ---- Existing code (unchanged) ----
  validate(def);

  const source = determineSource(def);

  // ---- Join route ----
  if (source === "join") {
    if (def.join === undefined) {
      throw new DataSetError("INVALID_DEFINITION", `Dataset "${def.uuid}" determined as join but join is undefined`);
    }
    const dataset = joinDataSets(def.join, ctx.manager);
    ctx.manager.apply(def.uuid, { type: "snapshot", dataset });
    return { dataset, inferredColumns: false, source: "join" };
  }

  // ---- Content / URL route ----
  const provider = ctx.providerFactory.create(def, ctx.providerConfig);
  if (!provider) {
    throw new DataSetError(
      "INVALID_DEFINITION",
      `No provider available for dataset "${def.uuid}"`,
    );
  }

  const request = buildRequest(def);

  let fetchResult;
  try {
    fetchResult = await provider.fetch(request);
  } catch (e) {
    if (e instanceof DataSetError) throw e;
    throw new DataSetError(
      "FETCH_FAILED",
      `Failed to fetch dataset "${def.uuid}": ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  const { dataset, inferredColumns } = await extractDataSet(
    fetchResult,
    def,
    ctx.presetRegistry,
  );

  // ---- Apply resolved dataset ----
  applyResolvedDataSet(def, dataset, ctx.manager);

  return { dataset, inferredColumns, source };
}

function applyResolvedDataSet(
  def: ExternalDataSetDef,
  dataset: TypedDataSet,
  manager: DataSetManager,
): void {
  if (def.accumulate && manager.has(def.uuid)) {
    const event = def.cacheMaxRows !== undefined
      ? { type: "append" as const, rows: dataset.rows, maxRows: def.cacheMaxRows }
      : { type: "append" as const, rows: dataset.rows };
    manager.apply(def.uuid, event);
  } else {
    manager.apply(def.uuid, { type: "snapshot", dataset });
  }
}
