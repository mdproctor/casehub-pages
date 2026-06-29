import { describe, it, expect, vi } from "vitest";
import { createDataSetManager } from "./manager.js";
import { toTypedDataSet } from "./conversion.js";
import type { Column } from "./types.js";
import { ColumnType, dataSetId, columnId } from "./types.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: columnId(id), name, type };
}

function testDataSet(rows: (string | null)[][]) {
  return toTypedDataSet({
    columns: [
      col("name", "Name", ColumnType.LABEL),
      col("amount", "Amount", ColumnType.NUMBER),
    ],
    data: rows,
  });
}

const ID_A = dataSetId("dataset-a");
const ID_B = dataSetId("dataset-b");

describe("DataSetManager — onChanged callback", () => {
  it("register triggers onChanged with the registered dataset", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const ds = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, ds);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(ID_A, ds);
  });

  it("accumulate triggers onChanged with the accumulated dataset", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const ds1 = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, ds1);
    callback.mockClear();

    const ds2 = testDataSet([["Bob", "200"]]);
    mgr.accumulate(ID_A, ds2);
    expect(callback).toHaveBeenCalledOnce();
    // accumulate should trigger with the resulting merged dataset
    const result = mgr.get(ID_A)!;
    expect(callback).toHaveBeenCalledWith(ID_A, result);
  });

  it("remove does NOT trigger onChanged", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const ds = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, ds);
    callback.mockClear();

    mgr.remove(ID_A);
    expect(callback).not.toHaveBeenCalled();
  });

  it("multiple register calls trigger onChanged each time", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });

    const ds1 = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, ds1);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(ID_A, ds1);

    callback.mockClear();

    const ds2 = testDataSet([["Bob", "200"]]);
    mgr.register(ID_A, ds2);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(ID_A, ds2);

    callback.mockClear();

    const ds3 = testDataSet([["Charlie", "300"]]);
    mgr.register(ID_B, ds3);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(ID_B, ds3);
  });

  it("no callback provided — no error (callback is optional)", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    // Should not throw
    expect(() => mgr.register(ID_A, ds)).not.toThrow();
    expect(mgr.get(ID_A)).toBe(ds);
  });

  it("callback receives correct dataset after accumulate merge", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });

    const initial = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, initial);
    callback.mockClear();

    const additional = testDataSet([["Bob", "200"]]);
    mgr.accumulate(ID_A, additional);

    expect(callback).toHaveBeenCalledOnce();
    const [id, dataset] = callback.mock.calls[0]!;
    expect(id).toBe(ID_A);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]!.text(columnId("name"))).toBe("Bob");
    expect(dataset.rows[1]!.text(columnId("name"))).toBe("Alice");
  });

  it("apply() snapshot triggers onChanged", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const ds = testDataSet([["Alice", "100"]]);
    mgr.apply(ID_A, { type: "snapshot", dataset: ds });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(ID_A, ds);
  });

  it("apply() append triggers onChanged when dataset exists", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, seed);
    callback.mockClear();

    const newRow = testDataSet([["Bob", "200"]]).rows[0]!;
    mgr.apply(ID_A, { type: "append", rows: [newRow] });

    expect(callback).toHaveBeenCalledOnce();
    const [id, dataset] = callback.mock.calls[0]!;
    expect(id).toBe(ID_A);
    expect(dataset.rows).toHaveLength(2);
  });

  it("apply() append does NOT trigger onChanged when dataset does not exist", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const row = testDataSet([["Alice", "100"]]).rows[0]!;
    mgr.apply(ID_A, { type: "append", rows: [row] });
    expect(callback).not.toHaveBeenCalled();
  });

  it("apply() replace triggers onChanged when rows matched", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, seed);
    callback.mockClear();

    const replacement = testDataSet([["Alice", "999"]]).rows[0]!;
    mgr.apply(ID_A, {
      type: "replace",
      keyColumn: columnId("name"),
      key: "Alice",
      row: replacement,
    });

    expect(callback).toHaveBeenCalledOnce();
    const [id, dataset] = callback.mock.calls[0]!;
    expect(id).toBe(ID_A);
    expect(dataset.rows[0]!.number(columnId("amount"))).toBe(999);
  });

  it("apply() replace does NOT trigger onChanged when no rows match", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, seed);
    callback.mockClear();

    const replacement = testDataSet([["Bob", "999"]]).rows[0]!;
    mgr.apply(ID_A, {
      type: "replace",
      keyColumn: columnId("name"),
      key: "Bob",
      row: replacement,
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("apply() remove triggers onChanged when rows matched", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = testDataSet([["Alice", "100"], ["Bob", "200"]]);
    mgr.register(ID_A, seed);
    callback.mockClear();

    mgr.apply(ID_A, {
      type: "remove",
      keyColumn: columnId("name"),
      key: "Alice",
    });

    expect(callback).toHaveBeenCalledOnce();
    const [id, dataset] = callback.mock.calls[0]!;
    expect(id).toBe(ID_A);
    expect(dataset.rows).toHaveLength(1);
    expect(dataset.rows[0]!.text(columnId("name"))).toBe("Bob");
  });

  it("apply() remove does NOT trigger onChanged when no rows match", () => {
    const callback = vi.fn();
    const mgr = createDataSetManager({ onChanged: callback });
    const seed = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, seed);
    callback.mockClear();

    mgr.apply(ID_A, {
      type: "remove",
      keyColumn: columnId("name"),
      key: "Bob",
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
