import type { DataSetId, DataSetOp, ExternalDataSetDef, ExternalColumnDef, HttpMethod } from "@casehubio/pages-data";
import type { ChartSettings } from "./displayer-types.js";

export interface DataScopeRef {
  readonly $ref: string;
}

export interface DataScope {
  readonly dataset: DataSetId;
  readonly idColumn: string;
  readonly filter?: Readonly<Record<string, string | DataScopeRef>>;
}

export interface SaveConfig {
  readonly trigger?: "auto" | "field" | "button" | "manual";
  readonly delay?: number;
  readonly adapter: string;
  readonly adapterConfig?: Readonly<Record<string, unknown>>;
}

export interface PageProps {
  readonly name?: string;
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Readonly<Record<string, string>>;
  readonly dataScope?: DataScope;
  readonly save?: SaveConfig;
}

export interface PageSettings {
  readonly mode?: "light" | "dark";
  readonly allowUrlProperties?: boolean;
  readonly dataComponentDefaults?: DataComponentDefaults;
  readonly datasetDefaults?: DataSetDefaults;
}

export interface DataComponentDefaults {
  readonly lookup?: LookupDefaults;
  readonly chart?: Partial<ChartSettings>;
}

export interface LookupDefaults {
  readonly dataSetId?: DataSetId;
  readonly operations?: readonly DataSetOp[];
  readonly rowCount?: number;
  readonly rowOffset?: number;
}

export interface DataSetDefaults {
  readonly url?: string;
  readonly content?: string;
  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly columns?: readonly ExternalColumnDef[];
  readonly cacheEnabled?: boolean;
  readonly refreshTime?: string;
}
