import { describe, it, expect } from "vitest";
import { resolveRefBindings } from "./ref-resolution.js";
import { createFilterState, updateFilter } from "./cross-filter.js";
import { createDataScopeRegistry } from "./data-scope-registry.js";
import type { DataSetId, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetManager } from "@casehub/data/dist/dataset/manager.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";

function mockManager(rows: Record<string, string>[]): DataSetManager {
  return {
    has: () => true,
    lookup: () => ({
      dataset: {
        columns: Object.keys(rows[0] ?? {}).map(id => ({
          id: id as ColumnId,
          name: id,
          type: ColumnType.TEXT,
        })),
        rows: rows.map(r => ({
          cells: Object.values(r).map(v => ({ type: ColumnType.TEXT as const, value: v })),
          cell: (colId: ColumnId) => {
            const val = r[colId as string];
            return val !== undefined
              ? { type: ColumnType.TEXT as const, value: val }
              : { type: "NULL" as const };
          },
          number: () => 0,
          text: (colId: ColumnId) => r[colId as string] ?? "",
          date: () => new Date(),
        })),
      },
      totalRows: rows.length,
    }),
  } as unknown as DataSetManager;
}

describe("resolveRefBindings", () => {
  it("resolves static filter values to FilterOps", () => {
    const ds = {
      dataset: "projects" as DataSetId,
      idColumn: "id",
      filter: { status: "active" },
    };
    const reg = createDataScopeRegistry();
    const fs = createFilterState();
    const mgr = mockManager([]);

    const ops = resolveRefBindings(ds, reg, fs, mgr, "Root/Form");
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("filter");
  });

  it("resolves $ref to parent record value", () => {
    const parentDs = { dataset: "emps" as DataSetId, idColumn: "id" };
    const childDs = {
      dataset: "projects" as DataSetId,
      idColumn: "id",
      filter: { employee_id: { $ref: "emps.id" } },
    };

    const reg = createDataScopeRegistry();
    reg.set("Root", parentDs);

    const fs = createFilterState();
    updateFilter(fs, "Root", undefined, "id", ["42"], false);

    const mgr = mockManager([{ id: "42", name: "Alice" }]);

    const ops = resolveRefBindings(childDs, reg, fs, mgr, "Root/Projects");
    expect(ops).toHaveLength(1);
  });

  it("returns empty ops when parent record is unavailable", () => {
    const childDs = {
      dataset: "projects" as DataSetId,
      idColumn: "id",
      filter: { employee_id: { $ref: "emps.id" } },
    };
    const reg = createDataScopeRegistry();
    const fs = createFilterState();
    const mgr = { has: () => false } as unknown as DataSetManager;

    const ops = resolveRefBindings(childDs, reg, fs, mgr, "Root/Projects");
    expect(ops).toHaveLength(0);
  });

  it("detects circular $ref chains", () => {
    const dsA = {
      dataset: "a" as DataSetId, idColumn: "id",
      filter: { col: { $ref: "b.id" } },
    };
    const dsB = {
      dataset: "b" as DataSetId, idColumn: "id",
      filter: { col: { $ref: "a.id" } },
    };
    const reg = createDataScopeRegistry();
    reg.set("Root", dsA);
    reg.set("Root/Child", dsB);

    const fs = createFilterState();
    const mgr = mockManager([]);

    const visited = new Set(["Root/Child"]);
    const ops = resolveRefBindings(dsA, reg, fs, mgr, "Root", visited);
    expect(ops).toHaveLength(0);
  });
});
