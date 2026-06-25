import type { Component } from "@casehubio/pages-component/dist/model/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { CasehubElement } from "@casehubio/pages-viz/dist/base/CasehubElement.js";
import type { VizComponentProps } from "@casehubio/pages-viz/dist/base/types.js";

export interface ComponentEntry {
  readonly element: HTMLElement;
  readonly vizElement?: CasehubElement<VizComponentProps>;
  readonly component: Component;
  readonly pagePath: string;
  readonly originalLookup?: DataSetLookup;
  readonly hasExplicitId: boolean;
}

export type ComponentRegistry = Map<string, ComponentEntry>;
