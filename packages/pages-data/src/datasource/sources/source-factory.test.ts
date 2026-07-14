import { describe, it, expect, vi } from "vitest";
import { createSourceFactory } from "./source-factory.js";
import type { DataSink } from "../types.js";
import type { DataSetId } from "../../dataset/types.js";
import { ColumnType, col } from "./test-helpers.js";

function collectSink(): { sink: DataSink; events: unknown[]; errors: unknown[] } {
  const events: unknown[] = [];
  const errors: unknown[] = [];
  return {
    sink: {
      apply(event) { events.push(event); },
      error(err) { errors.push(err); },
    },
    events,
    errors,
  };
}

const TEST_ID = "test-ds" as DataSetId;

describe("createSourceFactory", () => {
  it("routes relative URL to restSource", () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify([["a"]]), {
      headers: { "content-type": "application/json" },
    }));
    const factory = createSourceFactory({ fetchFn });
    const source = factory("/api/items", TEST_ID);
    expect(source).toBeDefined();
    expect(typeof source.connect).toBe("function");
    expect(typeof source.disconnect).toBe("function");
  });

  it("routes http:// URL to restSource and calls fetch", () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("[]", {
      headers: { "content-type": "application/json" },
    }));
    const factory = createSourceFactory({ fetchFn });
    const source = factory("http://api.example.com/data", TEST_ID);
    const { sink } = collectSink();
    source.connect(sink);
    expect(fetchFn).toHaveBeenCalledWith("http://api.example.com/data", expect.anything());
    source.disconnect();
  });

  it("routes https:// URL to restSource", () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("[]", {
      headers: { "content-type": "application/json" },
    }));
    const factory = createSourceFactory({ fetchFn });
    const source = factory("https://api.example.com/data", TEST_ID);
    const { sink } = collectSink();
    source.connect(sink);
    expect(fetchFn).toHaveBeenCalled();
    source.disconnect();
  });

  it("routes ws:// URL to wsSource", () => {
    const mockPool = {
      configure: vi.fn(),
      acquire: vi.fn().mockReturnValue({
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
      releaseAll: vi.fn(),
    };
    const factory = createSourceFactory({ wsPool: mockPool });
    const source = factory("ws://host/events", TEST_ID);
    const { sink } = collectSink();
    source.connect(sink);
    expect(mockPool.acquire).toHaveBeenCalled();
    source.disconnect();
  });

  it("routes wss:// URL to wsSource", () => {
    const mockPool = {
      configure: vi.fn(),
      acquire: vi.fn().mockReturnValue({
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
      releaseAll: vi.fn(),
    };
    const factory = createSourceFactory({ wsPool: mockPool });
    const source = factory("wss://host/events", TEST_ID);
    const { sink } = collectSink();
    source.connect(sink);
    expect(mockPool.acquire).toHaveBeenCalled();
    source.disconnect();
  });

  it("routes sse:// URL to sseSource", () => {
    const mockPool = {
      configure: vi.fn(),
      acquire: vi.fn().mockReturnValue({
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
      releaseAll: vi.fn(),
    };
    const factory = createSourceFactory({ ssePool: mockPool });
    const source = factory("sse://host/topic", TEST_ID);
    const { sink } = collectSink();
    source.connect(sink);
    expect(mockPool.acquire).toHaveBeenCalled();
    source.disconnect();
  });

  it("routes sses:// URL to sseSource", () => {
    const mockPool = {
      configure: vi.fn(),
      acquire: vi.fn().mockReturnValue({
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
      releaseAll: vi.fn(),
    };
    const factory = createSourceFactory({ ssePool: mockPool });
    const source = factory("sses://host/topic", TEST_ID);
    const { sink } = collectSink();
    source.connect(sink);
    expect(mockPool.acquire).toHaveBeenCalled();
    source.disconnect();
  });

  it("forwards columns and dataPath to rest source", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ items: [["x"]] }),
      { headers: { "content-type": "application/json" } },
    ));
    const factory = createSourceFactory({ fetchFn });
    const source = factory("/api/data", TEST_ID, {
      columns: [col("col1", ColumnType.TEXT)],
      dataPath: "items",
    });
    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });
    expect(events[0]).toHaveProperty("type", "snapshot");
    source.disconnect();
  });

  it("uses default pools when no deps provided", () => {
    const factory = createSourceFactory();
    const source = factory("/api/items", TEST_ID);
    expect(source).toBeDefined();
    expect(typeof source.connect).toBe("function");
  });

  it("forwards totalPath to restSource and extracts totalRows (#185)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ meta: { count: 50 }, items: [["a"]] }),
      { headers: { "content-type": "application/json" } },
    ));
    const factory = createSourceFactory({ fetchFn });
    const source = factory("/api/data", TEST_ID, {
      columns: [col("col1", ColumnType.TEXT)],
      dataPath: "items",
      totalPath: "meta.count",
    });
    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });
    expect((events[0] as { totalRows?: number }).totalRows).toBe(50);
    source.disconnect();
  });
});
