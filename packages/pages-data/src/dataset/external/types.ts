import type {ColumnId, ColumnType, DataSetId, TypedDataSet} from "../types.js";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
}

export interface ExternalColumnDef {
  readonly id: ColumnId;
  readonly name?: string;
  readonly type: ColumnType;
}

export interface ExtractionDef {
    readonly url?: string;
    readonly content?: string;
    readonly dataPath?: string;
    readonly type?: string;
    readonly expression?: string;
    readonly columns?: readonly ExternalColumnDef[];
    readonly accumulate?: boolean;
}


export interface ExternalDataSetDef extends ExtractionDef {
  readonly uuid: DataSetId;
  readonly name?: string;

  readonly join?: readonly DataSetId[];
  readonly serverQuery?: boolean;

  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
  readonly form?: Readonly<Record<string, string>>;
  readonly body?: string;

  readonly cacheEnabled?: boolean;
  readonly cacheMaxRows?: number;
  readonly refreshTime?: string;
  readonly keyColumn?: string;
}

export interface DataRequest {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly form?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly refreshTimeSeconds?: number;
}

export interface FetchResult {
  readonly data: unknown;
  readonly contentType?: string;
}

export interface PagesDataMessage {
  readonly type: "casehub-pages-dataset";
  readonly dataSetId: string;
  readonly data: unknown;
  readonly contentType?: string;
}

export interface ExtractionPreset {
  readonly id: string;
  readonly expression: string;
}

export interface PresetRegistry {
  get(id: string): ExtractionPreset | undefined;
  has(id: string): boolean;
}

export interface DataProvider {
  fetch(request: DataRequest): Promise<FetchResult>;
}

export interface WebSocketAuthConfig {
  readonly type: "query-param";
  readonly paramName?: string;
  readonly token: string;
}

export interface ServiceCapabilities {
  readonly serverSideQuery: boolean;
  readonly dataProviders: readonly string[];
  readonly dataProxy: boolean;
  readonly serverSideCache: boolean;
}

export const LOCAL_CAPABILITIES: ServiceCapabilities = {
  serverSideQuery: false,
  dataProviders: [],
  dataProxy: false,
  serverSideCache: false,
};

export function isServiceCapabilities(obj: unknown): obj is ServiceCapabilities {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.serverSideQuery === "boolean"
    && Array.isArray(o.dataProviders) && o.dataProviders.every(v => typeof v === "string")
    && typeof o.dataProxy === "boolean"
    && typeof o.serverSideCache === "boolean";
}

export interface DataProviderConfig {
  readonly defaultProvider?: "browser" | "server-relay";
  readonly corsProxy?: {
    readonly url: string;
    readonly enabled: boolean;
  };
  readonly serverRelay?: {
    readonly endpoint: string;
    readonly tokenFn?: () => string | null;
  };
  readonly webSocket?: {
    readonly relay?: { readonly endpoint: string };
    readonly auth?: WebSocketAuthConfig;
  };
  readonly sse?: {
    readonly auth?: { readonly type: "query-param"; readonly paramName?: string; readonly token: string };
  };
  readonly serverQuery?: {
    readonly endpoint: string;
    readonly tokenFn?: () => string | null;
  };
  readonly capabilities?: {
    readonly endpoint: string;
  };
}

export interface ExtractionResult {
  readonly dataset: TypedDataSet;
  readonly inferredColumns: boolean;
}

export interface ResolveResult {
  readonly dataset: TypedDataSet;
  readonly inferredColumns: boolean;
  readonly source: "url" | "content" | "join" | "serverQuery";
}

const TIME_UNITS: Record<string, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  quarter: 7_776_000_000,
  year: 31_536_000_000,
};

export function parseRefreshTime(str: string): number {
  const match = str.match(/^(\d+)(\w+)$/);
  if (!match) return 10_000;
  const unitKey = match[2];
  const countStr = match[1];
  if (unitKey === undefined || countStr === undefined) return 10_000;
  const multiplier = TIME_UNITS[unitKey];
  return multiplier !== undefined ? parseInt(countStr, 10) * multiplier : 10_000;
}
