import { describe, it, expect, vi } from "vitest";
import { DataSourceController } from "./data-source-controller.js";
import type { DataSource, DataSink } from "@casehubio/pages-data/dist/datasource/types.js";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType, columnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import type { DataSetEvent } from "@casehubio/pages-data/dist/dataset/events.js";

function makeDataSet(values: string[][]): TypedDataSet {
  return toTypedDataSet({
    columns: [{ id: columnId("name"), name: "name", type: ColumnType.TEXT }],
    data: values.map(row => row.map(v => v ?? null)),
  });
}

function immediateSource(dataset: TypedDataSet): DataSource {
  return {
    connect(sink: DataSink) { sink.apply({ type: "snapshot", dataset }); },
    disconnect() {},
  };
}

function failingSource(message: string): DataSource {
  return {
    connect(sink: DataSink) { sink.error({ message, permanent: true }); },
    disconnect() {},
  };
}

function deferredSource(): {
  source: DataSource;
  emitSnapshot: (ds: TypedDataSet) => void;
  emitAppend: (event: DataSetEvent) => void;
  emitError: (msg: string) => void;
  disconnectSpy: ReturnType<typeof vi.fn>;
} {
  let sink: DataSink | undefined;
  const disconnectSpy = vi.fn();
  return {
    source: {
      connect(s: DataSink) { sink = s; },
      disconnect() { disconnectSpy(); sink = undefined; },
    },
    emitSnapshot(ds: TypedDataSet) { sink?.apply({ type: "snapshot", dataset: ds }); },
    emitAppend(event: DataSetEvent) { sink?.apply(event); },
    emitError(msg: string) { sink?.error({ message: msg, permanent: true }); },
    disconnectSpy,
  };
}

describe("DataSourceController", () => {
  describe("initial state", () => {
    it("starts idle — loading false, no data, no error", () => {
      const ctrl = new DataSourceController();
      expect(ctrl.loading).toBe(false);
      expect(ctrl.dataSet).toBeUndefined();
      expect(ctrl.error).toBe("");
    });
  });

  describe("mutual-clearing invariant", () => {
    it("setting dataSet clears error and loading", () => {
      const ctrl = new DataSourceController();
      ctrl.error = "fail";
      ctrl.loading = true;
      ctrl.dataSet = [1, 2, 3];
      expect(ctrl.error).toBe("");
      expect(ctrl.loading).toBe(false);
    });

    it("setting error clears dataSet and loading", () => {
      const ctrl = new DataSourceController();
      ctrl.dataSet = [1, 2, 3];
      ctrl.loading = true;
      ctrl.error = "fail";
      expect(ctrl.dataSet).toBeUndefined();
      expect(ctrl.loading).toBe(false);
    });

    it("setting loading = true clears error", () => {
      const ctrl = new DataSourceController();
      ctrl.error = "fail";
      ctrl.loading = true;
      expect(ctrl.error).toBe("");
    });

    it("setting loading = true preserves stale dataSet", () => {
      const ctrl = new DataSourceController();
      ctrl.dataSet = [1, 2, 3];
      ctrl.loading = true;
      expect(ctrl.dataSet).toEqual([1, 2, 3]);
    });
  });

  describe("onChange", () => {
    it("fires on dataSet change", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.dataSet = "test";
      expect(onChange).toHaveBeenCalledOnce();
    });

    it("fires on error change", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.error = "fail";
      expect(onChange).toHaveBeenCalledOnce();
    });

    it("fires on loading change", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.loading = true;
      expect(onChange).toHaveBeenCalledOnce();
    });

    it("does not fire when loading set to same value with no error", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.loading = false;
      expect(onChange).not.toHaveBeenCalled();
    });

    it("fires when loading set to same value but error was present", () => {
      const onChange = vi.fn();
      const ctrl = new DataSourceController({ onChange });
      ctrl.error = "fail";
      onChange.mockClear();
      ctrl.loading = true;
      expect(onChange).toHaveBeenCalledOnce();
    });
  });

  describe("source lifecycle — snapshot", () => {
    it("delivers snapshot from source on connect", () => {
      const ds = makeDataSet([["alice"]]);
      const ctrl = new DataSourceController();
      ctrl.source = immediateSource(ds);
      ctrl.connect();
      expect(ctrl.dataSet).toEqual(ds);
      expect(ctrl.loading).toBe(false);
    });

    it("sets loading on connect before data arrives", () => {
      const { source } = deferredSource();
      const states: boolean[] = [];
      const ctrl = new DataSourceController({
        onChange: () => { states.push(ctrl.loading); },
      });
      ctrl.source = source;
      ctrl.connect();
      expect(states[0]).toBe(true);
    });

    it("delivers error from source", () => {
      const ctrl = new DataSourceController();
      ctrl.source = failingSource("boom");
      ctrl.connect();
      expect(ctrl.error).toBe("boom");
      expect(ctrl.loading).toBe(false);
    });

    it("disconnect stops delivery", () => {
      const { source, emitSnapshot } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      ctrl.disconnect();
      emitSnapshot(makeDataSet([["late"]]));
      expect(ctrl.dataSet).toBeUndefined();
    });

    it("setting new source disconnects old source", () => {
      const { source: s1, disconnectSpy } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = s1;
      ctrl.connect();
      ctrl.source = immediateSource(makeDataSet([["new"]]));
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe("source lifecycle — append", () => {
    it("appends rows to existing dataset", () => {
      const ds = makeDataSet([["alice"]]);
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);
      expect((ctrl.dataSet as TypedDataSet).rows).toHaveLength(1);

      const newRow = toTypedDataSet({
        columns: [{ id: columnId("name"), name: "name", type: ColumnType.TEXT }],
        data: [["bob"]],
      }).rows[0]!;

      emitAppend({ type: "append", rows: [newRow] });
      expect((ctrl.dataSet as TypedDataSet).rows).toHaveLength(2);
    });

    it("respects maxRows on append", () => {
      const ds = makeDataSet([["a"], ["b"]]);
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);

      const newRow = toTypedDataSet({
        columns: [{ id: columnId("name"), name: "name", type: ColumnType.TEXT }],
        data: [["c"]],
      }).rows[0]!;

      emitAppend({ type: "append", rows: [newRow], maxRows: 2 });
      const result = ctrl.dataSet as TypedDataSet;
      expect(result.rows).toHaveLength(2);
      expect((result.rows[0]!.cells[0]! as { value: unknown }).value).toBe("b");
      expect((result.rows[1]!.cells[0]! as { value: unknown }).value).toBe("c");
    });

    it("ignores append when no existing dataset", () => {
      const { source, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();

      const newRow = toTypedDataSet({
        columns: [{ id: columnId("name"), name: "name", type: ColumnType.TEXT }],
        data: [["orphan"]],
      }).rows[0]!;

      emitAppend({ type: "append", rows: [newRow] });
      expect(ctrl.dataSet).toBeUndefined();
    });

    it("ignores append with mismatched column count", () => {
      const ds = makeDataSet([["alice"]]);
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);

      const badRow = toTypedDataSet({
        columns: [
          { id: columnId("a"), name: "a", type: ColumnType.TEXT },
          { id: columnId("b"), name: "b", type: ColumnType.TEXT },
        ],
        data: [["x", "y"]],
      }).rows[0]!;

      emitAppend({ type: "append", rows: [badRow] });
      expect((ctrl.dataSet as TypedDataSet).rows).toHaveLength(1);
    });
  });

  describe("source lifecycle — replace", () => {
    it("replaces row by key", () => {
      const ds = toTypedDataSet({
        columns: [
          { id: columnId("id"), name: "id", type: ColumnType.LABEL },
          { id: columnId("val"), name: "val", type: ColumnType.TEXT },
        ],
        data: [["1", "old"]],
      });
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);

      const replacement = toTypedDataSet({
        columns: [
          { id: columnId("id"), name: "id", type: ColumnType.LABEL },
          { id: columnId("val"), name: "val", type: ColumnType.TEXT },
        ],
        data: [["1", "new"]],
      }).rows[0]!;

      emitAppend({
        type: "replace",
        keyColumn: columnId("id"),
        key: "1",
        row: replacement,
      });

      const result = ctrl.dataSet as TypedDataSet;
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0]!.cells[1]! as { value: unknown }).value).toBe("new");
    });

    it("ignores replace when key not found", () => {
      const ds = makeDataSet([["alice"]]);
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);

      const replacement = makeDataSet([["bob"]]).rows[0]!;
      emitAppend({
        type: "replace",
        keyColumn: columnId("name"),
        key: "missing",
        row: replacement,
      });

      expect((ctrl.dataSet as TypedDataSet).rows).toHaveLength(1);
      expect(((ctrl.dataSet as TypedDataSet).rows[0]!.cells[0]! as { value: unknown }).value).toBe("alice");
    });
  });

  describe("source lifecycle — remove", () => {
    it("removes row by key", () => {
      const ds = makeDataSet([["alice"], ["bob"]]);
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);

      emitAppend({
        type: "remove",
        keyColumn: columnId("name"),
        key: "alice",
      });

      const result = ctrl.dataSet as TypedDataSet;
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0]!.cells[0]! as { value: unknown }).value).toBe("bob");
    });

    it("ignores remove when key not found", () => {
      const ds = makeDataSet([["alice"]]);
      const { source, emitSnapshot, emitAppend } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(ds);

      emitAppend({
        type: "remove",
        keyColumn: columnId("name"),
        key: "missing",
      });

      expect((ctrl.dataSet as TypedDataSet).rows).toHaveLength(1);
    });
  });

  describe("refresh", () => {
    it("reconnects the source", () => {
      let connectCount = 0;
      const source: DataSource = {
        connect(sink: DataSink) {
          connectCount++;
          sink.apply({ type: "snapshot", dataset: makeDataSet([["v" + String(connectCount)]]) });
        },
        disconnect() {},
      };
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      expect(connectCount).toBe(1);
      ctrl.refresh();
      expect(connectCount).toBe(2);
    });

    it("does not double-fire onChange on refresh", () => {
      const onChange = vi.fn();
      const { source, emitSnapshot } = deferredSource();
      const ctrl = new DataSourceController({ onChange });
      ctrl.source = source;
      ctrl.connect();
      emitSnapshot(makeDataSet([["a"]]));
      onChange.mockClear();

      ctrl.refresh();
      expect(onChange).toHaveBeenCalledOnce();
    });
  });

  describe("dispose", () => {
    it("disconnects and clears source", () => {
      const { source, disconnectSpy } = deferredSource();
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      ctrl.dispose();
      expect(disconnectSpy).toHaveBeenCalled();
      expect(ctrl.source).toBeUndefined();
      expect(ctrl.endpoint).toBeUndefined();
    });
  });

  describe("VizTarget pass-through", () => {
    it("stores totalRows, activeSort, activePage", () => {
      const ctrl = new DataSourceController();
      ctrl.totalRows = 42;
      ctrl.activePage = 3;
      expect(ctrl.totalRows).toBe(42);
      expect(ctrl.activePage).toBe(3);
      expect(ctrl.activeSort).toBeUndefined();
    });
  });

  describe("transient errors", () => {
    it("ignores non-permanent errors", () => {
      const source: DataSource = {
        connect(sink: DataSink) {
          sink.error({ message: "transient", permanent: false });
        },
        disconnect() {},
      };
      const ctrl = new DataSourceController();
      ctrl.source = source;
      ctrl.connect();
      expect(ctrl.error).toBe("");
      expect(ctrl.loading).toBe(true);
    });
  });

  describe("sourceFactory (#148)", () => {
    it("uses sourceFactory to create source from endpoint URL", () => {
      const ds = makeDataSet([["from-factory"]]);
      const factory = vi.fn().mockReturnValue(immediateSource(ds));
      const ctrl = new DataSourceController({ sourceFactory: factory });
      ctrl.endpoint = "/api/items";
      ctrl.connect();

      expect(factory).toHaveBeenCalledWith("/api/items", expect.anything(), expect.anything());
      expect(ctrl.dataSet).toEqual(ds);
    });

    it("routes http URL through sourceFactory", () => {
      const factory = vi.fn().mockReturnValue(immediateSource(makeDataSet([["ok"]])));
      const ctrl = new DataSourceController({ sourceFactory: factory });
      ctrl.endpoint = "https://api.example.com/data";
      ctrl.connect();

      expect(factory).toHaveBeenCalledWith("https://api.example.com/data", expect.anything(), expect.anything());
    });

    it("endpoint without sourceFactory still creates a no-op source", () => {
      const ctrl = new DataSourceController();
      ctrl.endpoint = "/api/items";
      ctrl.connect();
      expect(ctrl.loading).toBe(true);
      expect(ctrl.dataSet).toBeUndefined();
    });

    it("changing endpoint disconnects old source and creates new one", () => {
      const ds1 = makeDataSet([["first"]]);
      const ds2 = makeDataSet([["second"]]);
      let callCount = 0;
      const factory = vi.fn().mockImplementation(() => {
        callCount++;
        return immediateSource(callCount === 1 ? ds1 : ds2);
      });
      const ctrl = new DataSourceController({ sourceFactory: factory });
      ctrl.endpoint = "/api/v1";
      ctrl.connect();
      expect(ctrl.dataSet).toEqual(ds1);

      ctrl.endpoint = "/api/v2";
      expect(factory).toHaveBeenCalledTimes(2);
      expect(ctrl.dataSet).toEqual(ds2);
    });

    it("setting source directly bypasses sourceFactory", () => {
      const factory = vi.fn();
      const ds = makeDataSet([["direct"]]);
      const ctrl = new DataSourceController({ sourceFactory: factory });
      ctrl.source = immediateSource(ds);
      ctrl.connect();

      expect(factory).not.toHaveBeenCalled();
      expect(ctrl.dataSet).toEqual(ds);
    });
  });

  describe("onRefresh (#134)", () => {
    it("calls onRefresh callback when refresh is called in hosted mode", () => {
      const onRefresh = vi.fn();
      const ctrl = new DataSourceController({ onRefresh });
      ctrl.dataSet = "some data";
      ctrl.refresh();

      expect(onRefresh).toHaveBeenCalledOnce();
    });

    it("does not call onRefresh when source is connected (standalone mode)", () => {
      const onRefresh = vi.fn();
      let connectCount = 0;
      const source: DataSource = {
        connect(sink: DataSink) {
          connectCount++;
          sink.apply({ type: "snapshot", dataset: makeDataSet([["v" + String(connectCount)]]) });
        },
        disconnect() {},
      };
      const ctrl = new DataSourceController({ onRefresh });
      ctrl.source = source;
      ctrl.connect();
      ctrl.refresh();

      expect(onRefresh).not.toHaveBeenCalled();
      expect(connectCount).toBe(2);
    });

    it("calls onRefresh when no source is connected and data exists", () => {
      const onRefresh = vi.fn();
      const ctrl = new DataSourceController({ onRefresh });
      ctrl.dataSet = [1, 2, 3];
      ctrl.refresh();
      expect(onRefresh).toHaveBeenCalledOnce();
    });

    it("does not call onRefresh when no data and no source", () => {
      const onRefresh = vi.fn();
      const ctrl = new DataSourceController({ onRefresh });
      ctrl.refresh();
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });
});
