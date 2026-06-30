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
    ).subscribe(dataSetId("ds"), { uuid: dataSetId("ds") } as ExternalDataSetDef, vi.fn(), vi.fn());

    expect(MockEventSource.instances[0]!.url).toContain("http://myhost:8080/events");
  });

  it("converts sses:// to https:// for EventSource URL", () => {
    createSseSource(
      "sses://secure.host/events",
      undefined,
      MockEventSource as unknown as typeof EventSource,
    ).subscribe(dataSetId("ds"), { uuid: dataSetId("ds") } as ExternalDataSetDef, vi.fn(), vi.fn());

    expect(MockEventSource.instances[0]!.url).toContain("https://secure.host/events");
  });

  it("appends auth query param to EventSource URL", () => {
    createSseSource(
      "sse://host/events",
      { auth: { type: "query-param", token: "secret" } },
      MockEventSource as unknown as typeof EventSource,
    ).subscribe(dataSetId("ds"), { uuid: dataSetId("ds") } as ExternalDataSetDef, vi.fn(), vi.fn());

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

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") } as ExternalDataSetDef, vi.fn(), (e) => errors.push(e));

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

    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") } as ExternalDataSetDef, vi.fn(), (e) => errors.push(e));

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

    source.subscribe(dataSetId("a"), { uuid: dataSetId("a") } as ExternalDataSetDef, vi.fn(), vi.fn());
    source.subscribe(dataSetId("b"), { uuid: dataSetId("b") } as ExternalDataSetDef, vi.fn(), vi.fn());

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
    source.subscribe(dataSetId("ds"), { uuid: dataSetId("ds") } as ExternalDataSetDef, vi.fn(), vi.fn());

    const es = MockEventSource.instances[0]!;
    es.open();
    es.emit("snapshot", "not json at all");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse"), expect.anything());
    warnSpy.mockRestore();
  });
});
