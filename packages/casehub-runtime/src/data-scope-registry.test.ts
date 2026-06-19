import { describe, it, expect } from "vitest";
import { createDataScopeRegistry, hasDataScope, getDataScope } from "./data-scope-registry.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

describe("DataScopeRegistry", () => {
  it("registers and retrieves DataScope", () => {
    const reg = createDataScopeRegistry();
    const ds = { dataset: "emps" as DataSetId, idColumn: "id" };
    reg.set("Root/Form", ds);
    expect(hasDataScope(reg, "Root/Form")).toBe(true);
    expect(getDataScope(reg, "Root/Form")).toEqual(ds);
  });

  it("returns false for unregistered paths", () => {
    const reg = createDataScopeRegistry();
    expect(hasDataScope(reg, "Missing")).toBe(false);
    expect(getDataScope(reg, "Missing")).toBeUndefined();
  });
});
