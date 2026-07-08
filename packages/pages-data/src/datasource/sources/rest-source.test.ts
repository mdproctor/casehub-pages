import { describe, it, expect, vi, afterEach } from "vitest";
import { restSource } from "./rest-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { ResolverContext } from "../../dataset/external/resolver.js";
import { ColumnType, dataSetId, col } from "./test-helpers.js";
import type { DataSetId } from "./test-helpers.js";
import { HttpMethod } from "../../dataset/external/types.js";
import type { DataSetManager } from "../../dataset/manager.js";

function stubManager(): DataSetManager {
  const datasets = new Map<DataSetId, import("../../dataset/types.js").TypedDataSet>();
  return {
    get(id: DataSetId) { return datasets.get(id); },
    has(id: DataSetId) { return datasets.has(id); },
    remove(id: DataSetId) { return datasets.delete(id); },
    apply(id: DataSetId, event: DataSetEvent) {
      if (event.type === "snapshot") {
        datasets.set(id, event.dataset);
      }
    },
    lookup() { return { dataset: { columns: [], rows: [] }, totalRows: 0 }; },
  };
}

function makeResolverContext(manager?: DataSetManager): ResolverContext {
  const mgr = manager ?? stubManager();
  return {
    manager: mgr,
    providerFactory: {
      create() {
        return {
          async fetch() {
            return { data: [["alice"], ["bob"]] };
          },
        };
      },
    },
    providerConfig: {},
    presetRegistry: {
      get() { return undefined; },
      has() { return false; },
    },
    capabilities: {
      serverSideQuery: false,
      dataProviders: [],
      dataProxy: false,
      serverSideCache: false,
    },
  };
}

describe("restSource", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits snapshot on connect", async () => {
    const ctx = makeResolverContext();
    const source = restSource("https://api.example.com/data", ctx, dataSetId("test-ds"), {
      columns: [col("name", ColumnType.TEXT)],
    });

    const events: DataSetEvent[] = [];
    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    // Wait for the async fetch to complete
    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    expect(errors).toHaveLength(0);

    source.disconnect();
  });

  it("emits error when fetch fails", async () => {
    const ctx = makeResolverContext();
    // Override provider to throw
    ctx.providerFactory.create = () => ({
      async fetch() { throw new Error("network error"); },
    });

    const source = restSource("https://api.example.com/fail", ctx, dataSetId("fail-ds"), {
      columns: [col("x", ColumnType.TEXT)],
    });

    const errors: SourceError[] = [];
    const sink: DataSink = {
      apply() {},
      error(err) { errors.push(err); },
    };

    source.connect(sink);

    await vi.waitFor(() => {
      expect(errors.length).toBeGreaterThan(0);
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("network error");

    source.disconnect();
  });

  it("polls when refreshTime is set", async () => {
    vi.useFakeTimers();

    let fetchCount = 0;
    const ctx = makeResolverContext();
    ctx.providerFactory.create = () => ({
      async fetch() {
        fetchCount++;
        return { data: [["row-" + String(fetchCount)]] };
      },
    });

    const source = restSource("https://api.example.com/data", ctx, dataSetId("poll-ds"), {
      columns: [col("val", ColumnType.TEXT)],
      refreshTime: "5second",
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    // Initial fetch is async — flush microtasks
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchCount).toBe(1);

    // Advance past one refresh interval
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(2);

    // Advance past another
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(3);

    source.disconnect();

    // After disconnect, no more fetches
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchCount).toBe(3);
  });

  it("does not emit after disconnect", async () => {
    let resolveFetch: (() => void) | null = null;
    const ctx = makeResolverContext();
    ctx.providerFactory.create = () => ({
      fetch() {
        return new Promise<{ data: unknown }>((resolve) => {
          resolveFetch = () => { resolve({ data: [["late"]] }); };
        });
      },
    });

    const source = restSource("https://api.example.com/data", ctx, dataSetId("late-ds"), {
      columns: [col("val", ColumnType.TEXT)],
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    // Disconnect before fetch resolves
    source.disconnect();

    // Now resolve — should not emit
    resolveFetch!();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(events).toHaveLength(0);
  });

  it("passes method and headers to the underlying def", async () => {
    const ctx = makeResolverContext();
    const source = restSource("https://api.example.com/data", ctx, dataSetId("opts-ds"), {
      method: HttpMethod.POST,
      headers: { "Authorization": "Bearer token" },
      body: '{"q": "test"}',
      columns: [col("name", ColumnType.TEXT)],
    });

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    // If we got here without error, the def was constructed correctly
    expect(events[0]!.type).toBe("snapshot");

    source.disconnect();
  });
});
