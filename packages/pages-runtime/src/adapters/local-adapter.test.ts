import { describe, it, expect, vi } from "vitest";
import { createLocalAdapter } from "./local-adapter.js";
import type { DataSetManager } from "@casehubio/pages-data";
import type { TypedDataSet, DataSetId, ColumnId, Column } from "@casehubio/pages-data";
import { ColumnType } from "@casehubio/pages-data";
import { createTypedRow } from "@casehubio/pages-data";

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

    const applySpy = vi.fn((_id: DataSetId, event: any) => {
      if (event.type === "snapshot") {
        storedDataset = event.dataset;
      }
    });
    const manager: DataSetManager = {
      apply: applySpy,
      get: vi.fn(() => storedDataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
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
    expect(applySpy).toHaveBeenCalledWith("users" as DataSetId, expect.objectContaining({ type: "snapshot" }));

    const updatedDataset = storedDataset;
    expect(updatedDataset.rows.length).toBe(2);
    expect(updatedDataset.rows[1]!.text("name" as ColumnId)).toBe("Bob Updated");
    expect(updatedDataset.rows[1]!.text("email" as ColumnId)).toBe("bob.new@example.com");
    expect(updatedDataset.rows[0]!.text("name" as ColumnId)).toBe("Alice");
  });

  it("should return error if dataset not found", async () => {
    const manager: DataSetManager = {
      apply: vi.fn(),
      get: vi.fn(() => undefined),
      remove: vi.fn(),
      has: vi.fn(() => false),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
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
      apply: vi.fn(),
      get: vi.fn(() => dataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
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
      apply: vi.fn((_id, event: any) => {
        if (event.type === "snapshot") {
          storedDataset = event.dataset;
        }
      }),
      get: vi.fn(() => storedDataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
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

  it("should delete a record from the dataset", async () => {
    const columns: Column[] = [
      { id: "id" as ColumnId, name: "ID", type: ColumnType.NUMBER },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
    ];

    const row1 = createTypedRow([
      { type: ColumnType.NUMBER, value: 1 },
      { type: ColumnType.TEXT, value: "Alice" },
    ], columns);
    const row2 = createTypedRow([
      { type: ColumnType.NUMBER, value: 2 },
      { type: ColumnType.TEXT, value: "Bob" },
    ], columns);

    const dataset: TypedDataSet = { columns, rows: [row1, row2] };
    let storedDataset = dataset;

    const manager: DataSetManager = {
      apply: vi.fn((_id, event: any) => {
        if (event.type === "snapshot") {
          storedDataset = event.dataset;
        }
      }),
      get: vi.fn(() => storedDataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
    };

    const adapter = createLocalAdapter(manager);
    const result = await adapter.delete!("users" as DataSetId, "id", 1);

    expect(result.success).toBe(true);
    expect(storedDataset.rows.length).toBe(1);
    expect(storedDataset.rows[0]!.text("name" as ColumnId)).toBe("Bob");
  });

  it("should create a new record in the dataset", async () => {
    const columns: Column[] = [
      { id: "id" as ColumnId, name: "ID", type: ColumnType.NUMBER },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
    ];

    const row1 = createTypedRow([
      { type: ColumnType.NUMBER, value: 1 },
      { type: ColumnType.TEXT, value: "Alice" },
    ], columns);

    const dataset: TypedDataSet = { columns, rows: [row1] };
    let storedDataset = dataset;

    const manager: DataSetManager = {
      apply: vi.fn((_id, event: any) => {
        if (event.type === "snapshot") {
          storedDataset = event.dataset;
        }
      }),
      get: vi.fn(() => storedDataset),
      remove: vi.fn(),
      has: vi.fn(() => true),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
    };

    const adapter = createLocalAdapter(manager);
    const result = await adapter.create!("users" as DataSetId, { id: 2, name: "Bob" });

    expect(result.success).toBe(true);
    expect(storedDataset.rows.length).toBe(2);
    expect(storedDataset.rows[1]!.text("name" as ColumnId)).toBe("Bob");
  });

  it("delete returns error if dataset not found", async () => {
    const manager: DataSetManager = {
      apply: vi.fn(),
      get: vi.fn(() => undefined),
      remove: vi.fn(),
      has: vi.fn(() => false),
      lookup: vi.fn(),
      age: vi.fn(() => undefined),
    };

    const adapter = createLocalAdapter(manager);
    const result = await adapter.delete!("unknown" as DataSetId, "id", 1);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
