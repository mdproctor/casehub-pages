import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehub/data/dist/dataset/external/types.js";
import { buildDataSetScope, resolveDataSetDef, extendDataSetScope } from "./dataset-scope.js";
import { buildPagePathMap, extendPagePathMap, type PagePathMap } from "./page-paths.js";

function makeDef(uuid: string) {
  return { uuid: uuid as DataSetId, content: "[]" } as any;
}

describe("buildDataSetScope", () => {
  it("root page datasets scoped to empty path", () => {
    const ds = makeDef("sales");
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(scope.get("")?.get("sales" as DataSetId)).toBe(ds);
  });

  it("child page inherits parent datasets", () => {
    const ds = makeDef("global");
    const child: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: { Sales: [child] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(scope.get("Sales")?.get("global" as DataSetId)).toBe(ds);
  });

  it("child page overrides parent dataset with same id", () => {
    const parentDs = makeDef("data");
    const childDs = makeDef("data");
    const child: Component = {
      type: "page",
      props: { name: "Sales", datasets: [childDs] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [parentDs] },
      slots: { Sales: [child] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(scope.get("Sales")?.get("data" as DataSetId)).toBe(childDs);
  });
});

describe("resolveDataSetDef", () => {
  it("resolves from own page", () => {
    const ds = makeDef("local");
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(resolveDataSetDef("local" as DataSetId, "", scope)).toBe(ds);
  });

  it("walks up ancestors to find dataset", () => {
    const ds = makeDef("root-ds");
    const grandchild: Component = { type: "page", props: { name: "Detail" } };
    const child: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { Detail: [grandchild] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: { Sales: [child] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(resolveDataSetDef("root-ds" as DataSetId, "Sales/Detail", scope)).toBe(ds);
  });

  it("returns undefined for unknown dataset", () => {
    const root: Component = { type: "page", props: { name: "App" } };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(resolveDataSetDef("nonexistent" as DataSetId, "", scope)).toBeUndefined();
  });
});

describe("extendDataSetScope", () => {
  it("extends scope with fetched subtree, inheriting parent datasets", () => {
    const parentDs: ExternalDataSetDef = {
      uuid: "parent-ds" as DataSetId,
      url: "http://example.com/data",
      columns: [],
    };
    const parentPage: Component = {
      type: "page",
      props: { name: "Sales", datasets: [parentDs] },
    };
    const root: Component = {
      type: "page",
      slots: { Sales: [parentPage] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);

    const childDs: ExternalDataSetDef = {
      uuid: "child-ds" as DataSetId,
      url: "http://example.com/child",
      columns: [],
    };
    const childPage: Component = {
      type: "page",
      props: { name: "Detail", datasets: [childDs] },
    };
    const fetchedRoot: Component = {
      type: "page",
      slots: { Detail: [childPage] },
    };

    const newPaths: PagePathMap = new Map();
    extendPagePathMap(fetchedRoot, "Sales", newPaths);

    const inherited = scope.get("Sales") ?? new Map();
    extendDataSetScope(fetchedRoot, inherited, newPaths, scope);

    // Child page inherits parent dataset AND has its own
    const detailScope = scope.get("Sales/Detail");
    expect(detailScope).toBeTruthy();
    expect(detailScope!.get("parent-ds" as DataSetId)).toBe(parentDs);
    expect(detailScope!.get("child-ds" as DataSetId)).toBe(childDs);
  });
});
