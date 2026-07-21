import { describe, expect, it, vi } from "vitest";
import { createSourceConnector } from "./source-connector.js";
import { createDataSetManager } from "../dataset/manager.js";
import { toTypedDataSet } from "../dataset/conversion.js";
import { columnId, ColumnType, dataSetId } from "../dataset/types.js";
import type { DataSource, DataSink } from "./types.js";
import type { Column, TypedDataSet } from "../dataset/types.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: columnId(id), name, type };
}

function makeDataSet(values: string[][]): TypedDataSet {
  return toTypedDataSet({
    columns: [col("name", "Name", ColumnType.LABEL)],
    data: values,
  });
}

const DS_ID = dataSetId("test-ds");

function immediateSource(dataset: TypedDataSet): DataSource {
  return {
    connect(sink: DataSink) {
      sink.apply({ type: "snapshot", dataset });
    },
    disconnect() {},
  };
}

function capturingSource(): { source: DataSource; sink: () => DataSink | undefined; disconnected: () => boolean } {
  let captured: DataSink | undefined;
  let wasDisconnected = false;
  return {
    source: {
      connect(sink: DataSink) { captured = sink; wasDisconnected = false; },
      disconnect() { wasDisconnected = true; captured = undefined; },
    },
    sink: () => captured,
    disconnected: () => wasDisconnected,
  };
}

function failingSource(message: string, permanent = true): DataSource {
  return {
    connect(sink: DataSink) {
      sink.error({ message, permanent });
    },
    disconnect() {},
  };
}

describe("SourceConnector", () => {
  describe("connect", () => {
    it("feeds snapshot events to DataSetManager", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);
      const ds = makeDataSet([["Alice"]]);

      connector.connect(immediateSource(ds));

      expect(manager.get(DS_ID)).toBe(ds);
      expect(connector.connected).toBe(true);
    });

    it("exposes the connected source", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);
      const source = immediateSource(makeDataSet([["Alice"]]));

      connector.connect(source);

      expect(connector.source).toBe(source);
    });

    it("fires onConnecting before source.connect", () => {
      const order: string[] = [];
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager, {
        onConnecting: () => order.push("onConnecting"),
      });
      const source: DataSource = {
        connect() { order.push("source.connect"); },
        disconnect() {},
      };

      connector.connect(source);

      expect(order).toEqual(["onConnecting", "source.connect"]);
    });

    it("no-ops when already connected to the same source", () => {
      const connectCalls = vi.fn();
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);
      const source: DataSource = {
        connect: connectCalls,
        disconnect() {},
      };

      connector.connect(source);
      connector.connect(source);

      expect(connectCalls).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    it("disconnects the source", () => {
      const { source, disconnected } = capturingSource();
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      connector.connect(source);
      expect(connector.connected).toBe(true);

      connector.disconnect();
      expect(disconnected()).toBe(true);
      expect(connector.connected).toBe(false);
      expect(connector.source).toBeUndefined();
    });

    it("no-ops when not connected", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      expect(() => connector.disconnect()).not.toThrow();
    });
  });

  describe("replace", () => {
    it("disconnects old source and connects new one", () => {
      const old = capturingSource();
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);
      const ds2 = makeDataSet([["Bob"]]);
      const newSource = immediateSource(ds2);

      connector.connect(old.source);
      connector.replace(newSource);

      expect(old.disconnected()).toBe(true);
      expect(connector.source).toBe(newSource);
      expect(manager.get(DS_ID)).toBe(ds2);
    });

    it("connects even when nothing was previously connected", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);
      const ds = makeDataSet([["Alice"]]);

      connector.replace(immediateSource(ds));

      expect(connector.connected).toBe(true);
      expect(manager.get(DS_ID)).toBe(ds);
    });
  });

  describe("stale-source guard", () => {
    it("ignores events from a replaced source", () => {
      const old = capturingSource();
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      connector.connect(old.source);
      const staleSink = old.sink()!;

      const ds2 = makeDataSet([["Bob"]]);
      connector.replace(immediateSource(ds2));

      // Stale sink delivers — should be ignored
      staleSink.apply({ type: "snapshot", dataset: makeDataSet([["Stale"]]) });

      expect(manager.get(DS_ID)).toBe(ds2);
    });

    it("ignores errors from a replaced source", () => {
      const old = capturingSource();
      const manager = createDataSetManager();
      const onError = vi.fn();
      const connector = createSourceConnector(DS_ID, manager, { onError });

      connector.connect(old.source);
      const staleSink = old.sink()!;

      connector.replace(immediateSource(makeDataSet([["Bob"]])));

      staleSink.error({ message: "stale error", permanent: true });
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    it("disconnects and reconnects the same source", () => {
      const connectCalls: number[] = [];
      let callCount = 0;
      const ds1 = makeDataSet([["v1"]]);
      const ds2 = makeDataSet([["v2"]]);
      const source: DataSource = {
        connect(sink: DataSink) {
          callCount++;
          connectCalls.push(callCount);
          sink.apply({ type: "snapshot", dataset: callCount === 1 ? ds1 : ds2 });
        },
        disconnect() {},
      };
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      connector.connect(source);
      expect(manager.get(DS_ID)).toBe(ds1);

      connector.refresh();
      expect(manager.get(DS_ID)).toBe(ds2);
      expect(connectCalls).toEqual([1, 2]);
    });

    it("no-ops when not connected", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      expect(() => connector.refresh()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("fires onError for source errors", () => {
      const onError = vi.fn();
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager, { onError });

      connector.connect(failingSource("boom"));

      expect(onError).toHaveBeenCalledWith({ message: "boom", permanent: true });
    });

    it("does not fire onError when no callback provided", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      expect(() => connector.connect(failingSource("boom"))).not.toThrow();
    });
  });

  describe("dispose", () => {
    it("disconnects and clears source", () => {
      const { source, disconnected } = capturingSource();
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      connector.connect(source);
      connector.dispose();

      expect(disconnected()).toBe(true);
      expect(connector.connected).toBe(false);
      expect(connector.source).toBeUndefined();
    });

    it("is safe to call multiple times", () => {
      const manager = createDataSetManager();
      const connector = createSourceConnector(DS_ID, manager);

      connector.dispose();
      connector.dispose();
    });
  });

  describe("DataSetManager.onChanged integration", () => {
    it("triggers onChanged when source delivers snapshot", () => {
      const onChanged = vi.fn();
      const manager = createDataSetManager({ onChanged });
      const connector = createSourceConnector(DS_ID, manager);
      const ds = makeDataSet([["Alice"]]);

      connector.connect(immediateSource(ds));

      expect(onChanged).toHaveBeenCalledWith(DS_ID, ds);
    });
  });
});
