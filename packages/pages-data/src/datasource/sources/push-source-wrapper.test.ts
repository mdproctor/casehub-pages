import { describe, it, expect } from "vitest";
import { sseSource } from "./sse-source.js";
import { wsSource } from "./ws-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import type { PushSource, PushSourceError } from "../../dataset/external/sources/push-source.js";
import type { DataSetEventListener } from "../../dataset/events.js";
import type { ExternalDataSetDef } from "../../dataset/external/types.js";
import { dataSetId, col, ColumnType, makeDataset } from "./test-helpers.js";
import type { DataSetId } from "./test-helpers.js";

interface MockSubscription {
  dataSetId: DataSetId;
  def: ExternalDataSetDef;
  listener: DataSetEventListener;
  onError: (error: PushSourceError) => void;
}

function mockPushPool(): PushPool & {
  lastSubscription: MockSubscription | null;
  unsubscribedIds: DataSetId[];
  acquiredUrls: string[];
} {
  let lastSubscription: MockSubscription | null = null;
  const unsubscribedIds: DataSetId[] = [];
  const acquiredUrls: string[] = [];

  const mockSource: PushSource = {
    subscribe(dsId, def, listener, onError) {
      lastSubscription = { dataSetId: dsId, def, listener, onError };
    },
    unsubscribe(dsId) {
      unsubscribedIds.push(dsId);
    },
    close() {},
  };

  return {
    get lastSubscription() { return lastSubscription; },
    unsubscribedIds,
    acquiredUrls,
    configure() {},
    acquire(baseUrl: string) {
      acquiredUrls.push(baseUrl);
      return mockSource;
    },
    releaseAll() {},
  };
}

describe("sseSource", () => {
  it("acquires from pool and subscribes on connect", () => {
    const pool = mockPushPool();
    const source = sseSource("sse://backend/events", dataSetId("sse-ds"), { pool });

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);

    expect(pool.acquiredUrls).toContain("sse://backend/events");
    expect(pool.lastSubscription).not.toBeNull();
    expect(pool.lastSubscription!.dataSetId).toBe("sse-ds");
  });

  it("forwards events from push source to sink", () => {
    const pool = mockPushPool();
    const source = sseSource("sse://backend/events", dataSetId("sse-ds"), { pool });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    // Simulate push source emitting a snapshot
    const dataset = makeDataset(
      [col("x", ColumnType.TEXT)],
      [["hello"]],
    );
    pool.lastSubscription!.listener({ type: "snapshot", dataset });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
  });

  it("maps PushSourceError to sink.error()", () => {
    const pool = mockPushPool();
    const source = sseSource("sse://backend/events", dataSetId("sse-ds"), { pool });

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    pool.lastSubscription!.onError({
      message: "SSE connection closed permanently",
      permanent: true,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("SSE connection closed permanently");
    expect(errors[0]!.permanent).toBe(true);
  });

  it("unsubscribes on disconnect", () => {
    const pool = mockPushPool();
    const source = sseSource("sse://backend/events", dataSetId("sse-ds"), { pool });

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);
    source.disconnect();

    expect(pool.unsubscribedIds).toContain("sse-ds");
  });

  it("does not forward events after disconnect", () => {
    const pool = mockPushPool();
    const source = sseSource("sse://backend/events", dataSetId("sse-ds"), { pool });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    const listener = pool.lastSubscription!.listener;

    source.disconnect();

    // Late event after disconnect — should be swallowed
    const dataset = makeDataset(
      [col("x", ColumnType.TEXT)],
      [["late"]],
    );
    listener({ type: "snapshot", dataset });

    expect(events).toHaveLength(0);
  });

  it("passes options into the def", () => {
    const pool = mockPushPool();
    const source = sseSource("sse://backend/events", dataSetId("sse-ds"), { pool,
      keyColumn: "id",
      cacheMaxRows: 1000,
    });

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);

    expect(pool.lastSubscription!.def.keyColumn).toBe("id");
    expect(pool.lastSubscription!.def.cacheMaxRows).toBe(1000);
  });
});

describe("wsSource", () => {
  it("acquires from pool and subscribes on connect", () => {
    const pool = mockPushPool();
    const source = wsSource("ws://backend/events", dataSetId("ws-ds"), { pool });

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);

    expect(pool.acquiredUrls).toContain("ws://backend/events");
    expect(pool.lastSubscription).not.toBeNull();
    expect(pool.lastSubscription!.dataSetId).toBe("ws-ds");
  });

  it("forwards events from push source to sink", () => {
    const pool = mockPushPool();
    const source = wsSource("ws://backend/events", dataSetId("ws-ds"), { pool });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    const dataset = makeDataset(
      [col("x", ColumnType.TEXT)],
      [["hello"]],
    );
    pool.lastSubscription!.listener({ type: "snapshot", dataset });

    expect(events).toHaveLength(1);
  });

  it("maps PushSourceError to sink.error()", () => {
    const pool = mockPushPool();
    const source = wsSource("ws://backend/events", dataSetId("ws-ds"), { pool });

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    pool.lastSubscription!.onError({
      message: "Application error (4001): auth failed",
      permanent: true,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]!.permanent).toBe(true);
  });

  it("unsubscribes on disconnect", () => {
    const pool = mockPushPool();
    const source = wsSource("ws://backend/events", dataSetId("ws-ds"), { pool });

    const sink: DataSink = {
      apply() {},
      error() {},
    };

    source.connect(sink);
    source.disconnect();

    expect(pool.unsubscribedIds).toContain("ws-ds");
  });
});
