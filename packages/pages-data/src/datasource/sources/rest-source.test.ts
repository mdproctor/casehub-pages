import { describe, it, expect, vi, afterEach } from "vitest";
import { restSource } from "./rest-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import type { DataSetId } from "../../dataset/types.js";
import { ColumnType, col } from "./test-helpers.js";
import { HttpMethod } from "../../dataset/external/types.js";

const TEST_ID = "test-ds" as DataSetId;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(data: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue(jsonResponse(data, status));
}

function collectSink(): { sink: DataSink; events: DataSetEvent[]; errors: SourceError[] } {
  const events: DataSetEvent[] = [];
  const errors: SourceError[] = [];
  return {
    sink: {
      apply(event) { events.push(event); },
      error(err) { errors.push(err); },
    },
    events,
    errors,
  };
}

describe("restSource (standalone)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits snapshot on connect", async () => {
    const fetchFn = mockFetch([["alice"], ["bob"]]);
    const source = restSource("https://api.example.com/data", TEST_ID, {
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    source.disconnect();
  });

  it("emits error when fetch fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));
    const source = restSource("https://api.example.com/fail", TEST_ID, {
      columns: [col("x", ColumnType.TEXT)],
      fetchFn,
    });

    const { sink, errors } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(errors.length).toBeGreaterThan(0); });

    expect(errors[0]!.message).toContain("network error");
    source.disconnect();
  });

  it("uses globalThis.fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([["x"]]),
    );

    const source = restSource("https://api.example.com/data", TEST_ID, {
      columns: [col("val", ColumnType.TEXT)],
    });

    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
    source.disconnect();
  });

  it("polls when refreshTime is set", async () => {
    vi.useFakeTimers();
    let fetchCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return jsonResponse([["row-" + String(fetchCount)]]);
    });

    const source = restSource("https://api.example.com/data", TEST_ID, {
      columns: [col("val", ColumnType.TEXT)],
      refreshTime: "5second",
      fetchFn,
    });

    const { sink } = collectSink();
    source.connect(sink);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCount).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchCount).toBe(2);

    source.disconnect();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchCount).toBe(2);
  });

  it("does not emit after disconnect", async () => {
    let resolveFetch: (() => void) | null = null;
    const fetchFn = vi.fn().mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveFetch = () => { resolve(jsonResponse([["late"]])); };
      }),
    );

    const source = restSource("https://api.example.com/data", TEST_ID, {
      columns: [col("val", ColumnType.TEXT)],
      fetchFn,
    });

    const { sink, events } = collectSink();
    source.connect(sink);
    source.disconnect();
    resolveFetch!();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(events).toHaveLength(0);
  });

  it("passes method, headers, and body to fetch", async () => {
    const fetchFn = mockFetch([["ok"]]);
    const source = restSource("https://api.example.com/data", TEST_ID, {
      method: HttpMethod.POST,
      headers: { "Authorization": "Bearer token" },
      body: '{"q": "test"}',
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Authorization": "Bearer token" }),
        body: '{"q": "test"}',
      }),
    );
    source.disconnect();
  });

  it("appends query params to URL", async () => {
    const fetchFn = mockFetch([["ok"]]);
    const source = restSource("https://api.example.com/data", TEST_ID, {
      query: { page: "1", size: "10" },
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

    const calledUrl = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("page=1");
    expect(calledUrl).toContain("size=10");
    source.disconnect();
  });

  it("sends form data as URL-encoded body", async () => {
    const fetchFn = mockFetch([["ok"]]);
    const source = restSource("https://api.example.com/data", TEST_ID, {
      form: { username: "alice", action: "login" },
      columns: [col("name", ColumnType.TEXT)],
      fetchFn,
    });

    const { sink, events } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

    const calledInit = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(calledInit.body).toContain("username=alice");
    expect((calledInit.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    source.disconnect();
  });

  it("error is non-permanent (transient)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("timeout"));
    const source = restSource("https://api.example.com/data", TEST_ID, {
      fetchFn,
    });

    const { sink, errors } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(errors.length).toBeGreaterThan(0); });

    expect(errors[0]!.permanent).toBe(false);
    source.disconnect();
  });

  describe("totalPath (#185)", () => {
    it("extracts totalRows from nested response via dot-path", async () => {
      const fetchFn = mockFetch({ _meta: { total: 42 }, items: [["alice"], ["bob"]] });
      const source = restSource("https://api.example.com/data", TEST_ID, {
        columns: [col("name", ColumnType.TEXT)],
        dataPath: "items",
        totalPath: "_meta.total",
        fetchFn,
      });

      const { sink, events } = collectSink();
      source.connect(sink);
      await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

      expect(events[0]!.type).toBe("snapshot");
      expect((events[0] as { totalRows?: number }).totalRows).toBe(42);
      source.disconnect();
    });

    it("extracts totalRows from top-level field", async () => {
      const fetchFn = mockFetch({ total: 100, data: [["x"]] });
      const source = restSource("https://api.example.com/data", TEST_ID, {
        columns: [col("name", ColumnType.TEXT)],
        dataPath: "data",
        totalPath: "total",
        fetchFn,
      });

      const { sink, events } = collectSink();
      source.connect(sink);
      await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

      expect((events[0] as { totalRows?: number }).totalRows).toBe(100);
      source.disconnect();
    });

    it("omits totalRows when totalPath is not set", async () => {
      const fetchFn = mockFetch({ total: 99, data: [["x"]] });
      const source = restSource("https://api.example.com/data", TEST_ID, {
        columns: [col("name", ColumnType.TEXT)],
        dataPath: "data",
        fetchFn,
      });

      const { sink, events } = collectSink();
      source.connect(sink);
      await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

      expect((events[0] as { totalRows?: number }).totalRows).toBeUndefined();
      source.disconnect();
    });

    it("omits totalRows when path resolves to non-numeric value", async () => {
      const fetchFn = mockFetch({ _meta: { total: "not-a-number" }, items: [["a"]] });
      const source = restSource("https://api.example.com/data", TEST_ID, {
        columns: [col("name", ColumnType.TEXT)],
        dataPath: "items",
        totalPath: "_meta.total",
        fetchFn,
      });

      const { sink, events } = collectSink();
      source.connect(sink);
      await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

      expect((events[0] as { totalRows?: number }).totalRows).toBeUndefined();
      source.disconnect();
    });

    it("omits totalRows when path does not exist in response", async () => {
      const fetchFn = mockFetch({ items: [["a"]] });
      const source = restSource("https://api.example.com/data", TEST_ID, {
        columns: [col("name", ColumnType.TEXT)],
        dataPath: "items",
        totalPath: "_meta.total",
        fetchFn,
      });

      const { sink, events } = collectSink();
      source.connect(sink);
      await vi.waitFor(() => { expect(events.length).toBeGreaterThan(0); });

      expect((events[0] as { totalRows?: number }).totalRows).toBeUndefined();
      source.disconnect();
    });

    it("includes totalRows on refresh polls too", async () => {
      vi.useFakeTimers();
      let fetchCount = 0;
      const fetchFn = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return jsonResponse({ _meta: { total: fetchCount * 10 }, items: [["row-" + String(fetchCount)]] });
      });

      const source = restSource("https://api.example.com/data", TEST_ID, {
        columns: [col("name", ColumnType.TEXT)],
        dataPath: "items",
        totalPath: "_meta.total",
        refreshTime: "5second",
        fetchFn,
      });

      const { sink, events } = collectSink();
      source.connect(sink);
      await vi.advanceTimersByTimeAsync(0);
      expect((events[0] as { totalRows?: number }).totalRows).toBe(10);

      await vi.advanceTimersByTimeAsync(5000);
      expect((events[1] as { totalRows?: number }).totalRows).toBe(20);

      source.disconnect();
    });
  });
});
