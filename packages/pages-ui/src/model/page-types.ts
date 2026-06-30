import type { Component } from "./types.js";
import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import type { SortOrder } from "@casehubio/pages-data/dist/dataset/sort.js";

// Re-export types that moved to pages-component
export type {
  PageProps,
  PageSettings,
  DataComponentDefaults,
  LookupDefaults,
  DataSetDefaults,
  DataScope,
  DataScopeRef,
  SaveConfig,
} from "@casehubio/pages-component";

// Runtime types stay in pages-ui
export interface ViewState {
  readonly currentPage: string;
  readonly activeFilters: Readonly<Record<string, readonly string[]>>;
  readonly sort: Readonly<Record<string, { readonly columnId: string; readonly order: SortOrder }>>;
  readonly pagination: Readonly<Record<string, number>>;
  readonly textFilter: Readonly<Record<string, string>>;
}

export interface DeepLink {
  readonly page: string;
  readonly filters?: Readonly<Record<string, readonly string[]>>;
  readonly sort?: Readonly<Record<string, { readonly columnId: string; readonly order: SortOrder }>>;
  readonly pagination?: Readonly<Record<string, number>>;
  readonly textFilter?: Readonly<Record<string, string>>;
  readonly dock?: Readonly<Record<string, "open" | "closed">>;
}

export interface Site {
  readonly root: Component;
  page(path: string): Component | null;
  dataset(id: DataSetId, fromPage?: string): ExternalDataSetDef | null;
  readonly state: ViewState;
}
