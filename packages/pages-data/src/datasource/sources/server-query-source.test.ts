import { describe, it, expect, vi } from "vitest";
import { serverQuerySource } from "./server-query-source.js";
import type { DataSink, SourceError } from "../types.js";
import type { DataSetEvent } from "../../dataset/events.js";
import { dataSetId } from "./test-helpers.js";
import type { TypedDataSet } from "./test-helpers.js";

function mockFetch(response: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe("serverQuerySource", () => {
  it("emits snapshot from server query response", async () => {
    const fetchFn = mockFetch({
      columns: [
        { id: "name", name: "Name", type: "TEXT" },
        { id: "count", name: "Count", type: "NUMBER" },
      ],
      rows: [
        ["alice", "42"],
        ["bob", "17"],
      ],
    });

    const source = serverQuerySource(
      "https://api.example.com/query",
      dataSetId("sq-ds"),
      undefined,
      fetchFn,
    );

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
    const snapshot = events[0] as { type: "snapshot"; dataset: TypedDataSet };
    expect(snapshot.dataset.rows).toHaveLength(2);

    source.disconnect();
  });

  it("emits error when server query fails", async () => {
    const fetchFn = mockFetch({ error: "forbidden" }, 403);

    const source = serverQuerySource(
      "https://api.example.com/query",
      dataSetId("fail-ds"),
      undefined,
      fetchFn,
    );

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
    expect(errors[0]!.message).toContain("403");

    source.disconnect();
  });

  it("does not emit after disconnect", async () => {
    let resolveFetch: (() => void) | null = null;
    const fetchFn = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = () => { resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            columns: [{ id: "x", name: "X", type: "TEXT" }],
            rows: [["val"]],
          }),
        }); };
      });
    }) as unknown as typeof globalThis.fetch;

    const source = serverQuerySource(
      "https://api.example.com/query",
      dataSetId("late-ds"),
      undefined,
      fetchFn,
    );

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);
    source.disconnect();

    // Resolve after disconnect
    resolveFetch!();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(events).toHaveLength(0);
  });

  it("passes auth token via tokenFn", async () => {
    const fetchFn = mockFetch({
      columns: [{ id: "x", name: "X", type: "TEXT" }],
      rows: [["val"]],
    });

    const source = serverQuerySource(
      "https://api.example.com/query",
      dataSetId("auth-ds"),
      { tokenFn: () => "secret-token" },
      fetchFn,
    );

    const events: DataSetEvent[] = [];
    const sink: DataSink = {
      apply(event) { events.push(event); },
      error() {},
    };

    source.connect(sink);

    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    // Verify the fetch was called with Authorization header
    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const [, reqInit] = calls[0]! as [string, RequestInit];
    const headers = reqInit.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer secret-token");

    source.disconnect();
  });
});
