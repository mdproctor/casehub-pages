import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSseSource } from "./sse-source.js";
import type { DataSetEvent } from "../../events.js";
import { dataSetId } from "../../types.js";
import type { ExternalDataSetDef } from "../types.js";

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: { data: string; lastEventId?: string }) => void>>();

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (e: { data: string; lastEventId?: string }) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(handler);
  }

  removeEventListener(): void { /* no-op for tests */ }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  // Test helpers
  open(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.();
  }

  emit(type: string, data: string, lastEventId?: string): void {
    const handlers = this.listeners.get(type) ?? [];
    for (const h of handlers) {
      if (lastEventId !== undefined) {
        h({ data, lastEventId });
      } else {
        h({ data });
      }
    }
  }
}

describe("SseSource", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  it("dispatches snapshot via named SSE event", () => {
    const source = createSseSource(
      "sse://localhost/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = { uuid: dataSetId("ds"), url: "sse://localhost/events?dataset=metrics" };

    source.subscribe(dataSetId("ds"), def, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("snapshot", JSON.stringify({
      dataset: "metrics",
      columns: [{ id: "val", type: "NUMBER" }],
      rows: [["42"]],
    }));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
  });

  it("dispatches via unnamed message event (WebSocket-compatible)", () => {
    const source = createSseSource(
      "sse://localhost/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = { uuid: dataSetId("ds"), url: "sse://localhost/events?dataset=metrics" };

    source.subscribe(dataSetId("ds"), def, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("message", JSON.stringify({
      dataset: "metrics",
      op: "append",
      columns: [{ id: "val", type: "NUMBER" }],
      rows: [["99"]],
    }));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("append");
  });

  it("converts sse:// to http:// for EventSource URL", () => {
    createSseSource(
      "sse://myhost:8080/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    ).subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances[0]!.url).toContain("http://myhost:8080/events");
  });

  it("converts sses:// to https:// for EventSource URL", () => {
    createSseSource(
      "sses://secure.host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    ).subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances[0]!.url).toContain("https://secure.host/events");
  });

  it("appends auth query param to EventSource URL", () => {
    createSseSource(
      "sse://host/events",
      { auth: { type: "query-param", token: "secret" } },
      MockEventSource as unknown as typeof EventSource,
    ).subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    const url = new URL(MockEventSource.instances[0]!.url);
    expect(url.searchParams.get("token")).toBe("secret");
  });

  it("emits permanent error when readyState is CLOSED", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const errors: Array<{ message: string; permanent: boolean }> = [];

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), (e) => errors.push(e));

    const es = MockEventSource.instances[0]!;
    es.open();
    es.readyState = MockEventSource.CLOSED;
    es.onerror?.();

    expect(errors).toHaveLength(1);
    expect(errors[0]!.permanent).toBe(true);
  });

  it("does not emit error when readyState is CONNECTING (auto-reconnect)", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const errors: Array<{ message: string; permanent: boolean }> = [];

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), (e) => errors.push(e));

    const es = MockEventSource.instances[0]!;
    es.open();
    es.readyState = MockEventSource.CONNECTING;
    es.onerror?.();

    expect(errors).toHaveLength(0);
  });

  it("closes EventSource on last unsubscribe", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    source.subscribe(dataSetId("a"), { uuid: dataSetId("a") }, vi.fn(), vi.fn());
    source.subscribe(dataSetId("b"), { uuid: dataSetId("b") }, vi.fn(), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    source.unsubscribe(dataSetId("a"));
    expect(es.readyState).toBe(MockEventSource.OPEN);

    source.unsubscribe(dataSetId("b"));
    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it("logs warning on malformed JSON in SSE data", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();
    es.emit("snapshot", "not json at all");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse"), expect.anything());
    warnSpy.mockRestore();
  });

  // ---- Characterisation: named event types ----

  it("handles append event via named SSE event", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds"), url: "sse://host/events?dataset=metrics" }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("append", JSON.stringify({
      dataset: "metrics",
      columns: [{ id: "val", type: "NUMBER" }],
      rows: [["99"]],
    }));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("append");
  });

  it("handles replace event via named SSE event", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds"), url: "sse://host/events?dataset=metrics", keyColumn: "id" }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("replace", JSON.stringify({
      dataset: "metrics",
      key: "1",
      row: ["1", "100"],
      columns: [{ id: "id", type: "LABEL" }, { id: "val", type: "NUMBER" }],
    }));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("replace");
  });

  it("handles remove event via named SSE event", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds"), url: "sse://host/events?dataset=metrics", keyColumn: "id" }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("remove", JSON.stringify({
      dataset: "metrics",
      key: "1",
    }));

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("remove");
  });

  // ---- Characterisation: connection lifecycle ----

  it("does not create EventSource until first subscription", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    expect(MockEventSource.instances).toHaveLength(0);

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("reuses EventSource for second subscription", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    source.subscribe(dataSetId("ds-a"), { uuid: dataSetId("ds-a") }, vi.fn(), vi.fn());
    source.subscribe(dataSetId("ds-b"), { uuid: dataSetId("ds-b") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("does not create new EventSource when already OPEN", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    source.subscribe(dataSetId("ds-a"), { uuid: dataSetId("ds-a") }, vi.fn(), vi.fn());
    const es = MockEventSource.instances[0]!;
    es.open();

    source.subscribe(dataSetId("ds-b"), { uuid: dataSetId("ds-b") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("ignores duplicate subscription to same dataSetId", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances).toHaveLength(1);
  });

  // ---- Characterisation: wire name resolution ----

  it("extracts wire name from ?dataset= query param", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    source.subscribe(dataSetId("local-id"), { uuid: dataSetId("local-id"), url: "sse://host/events?dataset=wire-name" }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("snapshot", JSON.stringify({
      dataset: "wire-name",
      columns: [],
      rows: [],
    }));

    expect(events).toHaveLength(1);
  });

  it("uses dataSetId as wire name when no ?dataset= in URL", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    source.subscribe(dataSetId("fallback-id"), { uuid: dataSetId("fallback-id"), url: "sse://host/events" }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("snapshot", JSON.stringify({
      dataset: "fallback-id",
      columns: [],
      rows: [],
    }));

    expect(events).toHaveLength(1);
  });

  it("uses dataSetId as wire name when def.url is undefined", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];
    source.subscribe(dataSetId("no-url"), { uuid: dataSetId("no-url") }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    es.emit("snapshot", JSON.stringify({
      dataset: "no-url",
      columns: [],
      rows: [],
    }));

    expect(events).toHaveLength(1);
  });

  // ---- Characterisation: error handling ----

  it("does not emit error when readyState is CONNECTING", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const errors: Array<{ message: string; permanent: boolean }> = [];

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), (e) => errors.push(e));

    const es = MockEventSource.instances[0]!;
    es.readyState = MockEventSource.CONNECTING;
    es.onerror?.();

    expect(errors).toHaveLength(0);
  });

  it("logs warning on malformed JSON in named event", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") }, vi.fn(), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();
    es.emit("append", "{ invalid json }");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse"), expect.anything());
    warnSpy.mockRestore();
  });

  // ---- Characterisation: close() cleanup ----

  it("close() closes EventSource and clears all subscriptions", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    source.subscribe(dataSetId("a"), { uuid: dataSetId("a") }, vi.fn(), vi.fn());
    source.subscribe(dataSetId("b"), { uuid: dataSetId("b") }, vi.fn(), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    source.close();

    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it("close() allows new subscription after close", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );

    source.subscribe(dataSetId("a"), { uuid: dataSetId("a") }, vi.fn(), vi.fn());
    source.close();

    expect(MockEventSource.instances).toHaveLength(1);

    source.subscribe(dataSetId("b"), { uuid: dataSetId("b") }, vi.fn(), vi.fn());

    expect(MockEventSource.instances).toHaveLength(2);
  });

  // ---- Characterisation: unsubscribe cleanup ----

  it("unsubscribe removes wire name mapping", () => {
    const source = createSseSource(
      "sse://host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    );
    const events: DataSetEvent[] = [];

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds"), url: "sse://host/events?dataset=wire" }, (e) => events.push(e), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();

    source.unsubscribe(dataSetId("ds"));

    es.emit("snapshot", JSON.stringify({
      dataset: "wire",
      columns: [],
      rows: [],
    }));

    expect(events).toHaveLength(0);
  });
});
