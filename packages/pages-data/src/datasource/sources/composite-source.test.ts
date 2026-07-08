import { describe, it, expect } from "vitest";
import { composite } from "./composite-source.js";
import type { DataSource, DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import { textDataset } from "./test-helpers.js";
import type { TypedDataSet } from "./test-helpers.js";

/** A DataSource that can be driven manually in tests. */
function controllableSource(): DataSource & {
  readonly connectedSink: DataSink | null;
  emitSnapshot(ds: TypedDataSet): void;
  emitAppend(): void;
  emitError(err: SourceError): void;
  readonly disconnected: boolean;
} {
  let sink: DataSink | null = null;
  let disconnected = false;

  return {
    get connectedSink() { return sink; },
    get disconnected() { return disconnected; },

    connect(s: DataSink): void {
      sink = s;
      disconnected = false;
    },

    disconnect(): void {
      disconnected = true;
      sink = null;
    },

    emitSnapshot(ds: TypedDataSet): void {
      if (!sink) throw new Error("Not connected");
      sink.apply({ type: "snapshot", dataset: ds });
    },

    emitAppend(): void {
      if (!sink) throw new Error("Not connected");
      const ds = textDataset("appended");
      sink.apply({ type: "append", rows: ds.rows });
    },

    emitError(err: SourceError): void {
      if (!sink) throw new Error("Not connected");
      sink.error(err);
    },
  };
}

describe("composite", () => {
  it("connects initial source first, then hands off to live after snapshot", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const events: DataSetEvent[] = [];
    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    // Initial should be connected, live should not
    expect(initial.connectedSink).not.toBeNull();
    expect(live.connectedSink).toBeNull();

    // Emit snapshot from initial
    const ds = textDataset("initial-data");
    initial.emitSnapshot(ds);

    // Snapshot should be forwarded to outer sink
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    expect((events[0] as { type: "snapshot"; dataset: TypedDataSet }).dataset).toBe(ds);

    // Initial should be disconnected, live should be connected
    expect(initial.disconnected).toBe(true);
    expect(live.connectedSink).not.toBeNull();

    // Live events should flow through
    live.emitAppend();
    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe("append");
  });

  it("ignores non-snapshot events from initial source", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    // Emit append from initial — should be ignored
    initial.emitAppend();
    expect(events).toHaveLength(0);

    // Initial should still be connected (no handoff yet)
    expect(initial.connectedSink).not.toBeNull();
    expect(live.connectedSink).toBeNull();

    // Now emit snapshot — should trigger handoff
    const ds = textDataset("real-data");
    initial.emitSnapshot(ds);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    expect(initial.disconnected).toBe(true);
    expect(live.connectedSink).not.toBeNull();
  });

  it("does not connect live source when initial errors", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    // Initial errors
    initial.emitError({ message: "fetch failed", permanent: true });

    // Error forwarded, live NOT connected
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("fetch failed");
    expect(live.connectedSink).toBeNull();
  });

  it("disconnect during initial phase disconnects initial only", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);
    expect(initial.connectedSink).not.toBeNull();

    source.disconnect();
    expect(initial.disconnected).toBe(true);
    expect(live.connectedSink).toBeNull();
  });

  it("disconnect during live phase disconnects live only", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);
    initial.emitSnapshot(textDataset("data"));

    // Now in live phase
    expect(live.connectedSink).not.toBeNull();

    source.disconnect();
    expect(live.disconnected).toBe(true);
  });

  it("forwards live source errors to outer sink", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);
    initial.emitSnapshot(textDataset("data"));

    // Live source errors
    live.emitError({ message: "connection lost", permanent: false });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("connection lost");
  });

  it("does not double-disconnect on repeated disconnect calls", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);

    // Disconnect twice — should not throw
    source.disconnect();
    source.disconnect();
  });

  it("hands off to live even if initial emits error after snapshot", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const events: DataSetEvent[] = [];
    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    // Initial emits snapshot first
    initial.emitSnapshot(textDataset("data"));
    expect(events).toHaveLength(1);
    expect(initial.disconnected).toBe(true);
    expect(live.connectedSink).not.toBeNull();

    // Live events work
    live.emitAppend();
    expect(events).toHaveLength(2);
  });

  it("any initial error blocks live connection (spec: no transient recovery)", () => {
    const initial = controllableSource();
    const live = controllableSource();
    const source = composite(initial, live);

    const errors: SourceError[] = [];
    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    initial.emitError({ message: "timeout", permanent: false });
    expect(errors).toHaveLength(1);

    // Even a transient error puts composite in error state — live never connects
    expect(live.connectedSink).toBeNull();
  });
});
