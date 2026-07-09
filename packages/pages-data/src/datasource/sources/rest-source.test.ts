import { describe, it, expect, vi, afterEach } from "vitest";
import { restSource } from "./rest-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import { ColumnType, dataSetId, col } from "./test-helpers.js";
import { HttpMethod } from "../../dataset/external/types.js";

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
    const source = restSource("https://api.example.com/data", dataSetId("test-ds"), {
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
    const source = restSource("https://api.example.com/fail", dataSetId("fail-ds"), {
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

    const source = restSource("https://api.example.com/data", dataSetId("default-fetch"), {
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

    const source = restSource("https://api.example.com/data", dataSetId("poll-ds"), {
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

    const source = restSource("https://api.example.com/data", dataSetId("late-ds"), {
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
    const source = restSource("https://api.example.com/data", dataSetId("opts-ds"), {
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
    const source = restSource("https://api.example.com/data", dataSetId("query-ds"), {
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
    const source = restSource("https://api.example.com/data", dataSetId("form-ds"), {
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
    const source = restSource("https://api.example.com/data", dataSetId("err-ds"), {
      fetchFn,
    });

    const { sink, errors } = collectSink();
    source.connect(sink);
    await vi.waitFor(() => { expect(errors.length).toBeGreaterThan(0); });

    expect(errors[0]!.permanent).toBe(false);
    source.disconnect();
  });
});
