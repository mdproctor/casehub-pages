import { describe, it, expect, vi } from "vitest";
import { createLocalAdapter } from "./local-adapter.js";
import type { DataSetManager } from "@casehub/data/dist/dataset/manager.js";
import type { TypedDataSet, DataSetId, ColumnId, Column } from "@casehub/data/dist/dataset/types.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";
import { createTypedRow } from "@casehub/data/dist/dataset/conversion.js";

describe("local-adapter", () => {
  it("should update a record in the dataset", async () => {
    const columns: Column[] = [
      { id: "id" as ColumnId, name: "ID", type: ColumnType.NUMBER },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
      { id: "email" as ColumnId, name: "Email", type: ColumnType.TEXT },
    ];

    const row1 = createTypedRow([
      { type: ColumnType.NUMBER, value: 1 },
      { type: ColumnType.TEXT, value: "Alice" },
      { type: ColumnType.TEXT, value: "alice@example.com" },
    ], columns);

    const row2 = createTypedRow([
      { type: ColumnType.NUMBER, value: 2 },
      { type: ColumnType.TEXT, value: "Bob" },
      { type: ColumnType.TEXT, value: "bob@example.com" },
    ], columns);

    const dataset: TypedDataSet = { columns, rows: [row1, row2] };
    let storedDataset = dataset;

    const manager: DataSetManager = {
      register: vi.fn((id, ds) => { storedDataset = ds; }),
      get: vi.fn(() => storedDataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      accumulate: vi.fn(),
      lookup: vi.fn(),
    };

    const adapter = createLocalAdapter(manager);

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 2, name: "Bob Updated", email: "bob.new@example.com" },
      ["name", "email"],
      "id",
      2,
    );

    expect(result.success).toBe(true);
    expect(manager.register).toHaveBeenCalledWith("users" as DataSetId, expect.any(Object));

    const updatedDataset = storedDataset;
    expect(updatedDataset.rows.length).toBe(2);
    expect(updatedDataset.rows[1]!.text("name" as ColumnId)).toBe("Bob Updated");
    expect(updatedDataset.rows[1]!.text("email" as ColumnId)).toBe("bob.new@example.com");
    expect(updatedDataset.rows[0]!.text("name" as ColumnId)).toBe("Alice");
  });

  it("should return error if dataset not found", async () => {
    const manager: DataSetManager = {
      register: vi.fn(),
      get: vi.fn(() => undefined),
      remove: vi.fn(),
      has: vi.fn(() => false),
      accumulate: vi.fn(),
      lookup: vi.fn(),
    };

    const adapter = createLocalAdapter(manager);

    const result = await adapter.save(
      "unknown" as DataSetId,
      { id: 1 },
      ["id"],
      "id",
      1,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should return error if record not found", async () => {
    const columns: Column[] = [
      { id: "id" as ColumnId, name: "ID", type: ColumnType.NUMBER },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
    ];

    const row1 = createTypedRow([
      { type: ColumnType.NUMBER, value: 1 },
      { type: ColumnType.TEXT, value: "Alice" },
    ], columns);

    const dataset: TypedDataSet = { columns, rows: [row1] };

    const manager: DataSetManager = {
      register: vi.fn(),
      get: vi.fn(() => dataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      accumulate: vi.fn(),
      lookup: vi.fn(),
    };

    const adapter = createLocalAdapter(manager);

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 999, name: "Unknown" },
      ["name"],
      "id",
      999,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should handle NULL values", async () => {
    const columns: Column[] = [
      { id: "id" as ColumnId, name: "ID", type: ColumnType.NUMBER },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
      { id: "email" as ColumnId, name: "Email", type: ColumnType.TEXT },
    ];

    const row1 = createTypedRow([
      { type: ColumnType.NUMBER, value: 1 },
      { type: ColumnType.TEXT, value: "Alice" },
      { type: ColumnType.TEXT, value: "alice@example.com" },
    ], columns);

    const dataset: TypedDataSet = { columns, rows: [row1] };
    let storedDataset = dataset;

    const manager: DataSetManager = {
      register: vi.fn((id, ds) => { storedDataset = ds; }),
      get: vi.fn(() => storedDataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      accumulate: vi.fn(),
      lookup: vi.fn(),
    };

    const adapter = createLocalAdapter(manager);

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 1, name: "Alice", email: null },
      ["email"],
      "id",
      1,
    );

    expect(result.success).toBe(true);
    const updatedDataset = storedDataset;
    const emailCell = updatedDataset.rows[0]!.cell("email" as ColumnId);
    expect(emailCell.type).toBe("NULL");
  });
});
