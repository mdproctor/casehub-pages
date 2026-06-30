import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebSocketSource } from "./websocket-source.js";
import type { DataSetEvent } from "../../events.js";
import { dataSetId } from "../../types.js";
import type { ExternalDataSetDef } from "../types.js";

// Mock WebSocket for node environment
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => {
      this.onclose?.({ code: 1000, reason: "" });
    }, 0);
  }

  // Helper to simulate connection opening
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
}

describe("WebSocketSource", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it("dispatches snapshot event to subscribed listener", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify({
        dataset: "messages",
        op: "snapshot",
        columns: [{ id: "text", type: "TEXT" }],
        rows: [["hello"]],
      }),
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("snapshot");
  });

  it("sends subscribe message on subscribe", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    expect(ws.sent).toContainEqual(JSON.stringify({ op: "subscribe", dataset: "messages" }));
  });

  it("ignores events for unsubscribed datasets", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify({
        dataset: "other",
        op: "snapshot",
        columns: [{ id: "x", type: "TEXT" }],
        rows: [["ignored"]],
      }),
    });

    expect(events).toHaveLength(0);
  });

  it("closes connection when last subscriber unsubscribes", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    source.unsubscribe(dataSetId("chat"));
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("dispatches append event to subscribed listener", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify({
        dataset: "messages",
        op: "append",
        columns: [{ id: "text", type: "TEXT" }],
        rows: [["world"]],
      }),
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("append");
  });

  it("handles malformed JSON without crashing", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({ data: "{invalid json" });

    expect(events).toHaveLength(0);
    expect(ws.readyState).toBe(MockWebSocket.OPEN); // Still open
  });

  it("handles missing type field without crashing", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify({
        dataset: "messages",
        columns: [{ id: "text", type: "TEXT" }],
        rows: [["test"]],
      }),
    });

    expect(events).toHaveLength(0);
  });

  it("handles batch messages", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify([
        {
          dataset: "messages",
          op: "snapshot",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["first"]],
        },
        {
          dataset: "messages",
          op: "append",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["second"]],
        },
      ]),
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("snapshot");
    expect(events[1]!.type).toBe("append");
  });

  it("reconnects on abnormal close (1006)", async () => {
    vi.useFakeTimers();
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws1 = MockWebSocket.instances[0]!;
    ws1.open();

    ws1.readyState = MockWebSocket.CLOSED;
    ws1.onclose?.({ code: 1006, reason: "abnormal" });

    // Advance timers to trigger reconnect (1s initial delay)
    await vi.advanceTimersByTimeAsync(1000);

    expect(MockWebSocket.instances).toHaveLength(2);
    vi.useRealTimers();
  });

  it("does not reconnect on normal close (1000)", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;

    ws.readyState = 3;
    ws.onclose?.({ code: 1000, reason: "normal" });

    await new Promise((r) => setTimeout(r, 100));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("does not reconnect on application error (4000+)", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;

    ws.readyState = 3;
    ws.onclose?.({ code: 4001, reason: "auth expired" });

    await new Promise((r) => setTimeout(r, 100));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("populates keyColumn for replace event from def", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
      keyColumn: "id",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify({
        dataset: "messages",
        op: "replace",
        key: "123",
        row: ["hello"],
        columns: [{ id: "text", type: "TEXT" }],
      }),
    });

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.type).toBe("replace");
    if (event?.type === "replace") {
      expect(String(event.keyColumn)).toBe("id");
      expect(event.key).toBe("123");
    }
  });

  it("populates keyColumn for remove event from def", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const events: DataSetEvent[] = [];
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
      keyColumn: "id",
    };

    source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.onmessage?.({
      data: JSON.stringify({
        dataset: "messages",
        op: "remove",
        key: "123",
      }),
    });

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.type).toBe("remove");
    if (event?.type === "remove") {
      expect(String(event.keyColumn)).toBe("id");
      expect(event.key).toBe("123");
    }
  });

  it("uses DataSetId as wire name when no ?dataset= in URL", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    expect(ws.sent).toContainEqual(JSON.stringify({ op: "subscribe", dataset: "chat" }));
  });

  it("sends unsubscribe message on unsubscribe", async () => {
    const source = createWebSocketSource(
      "ws://localhost/ws",
      undefined,
      MockWebSocket as unknown as typeof WebSocket,
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("chat"),
      url: "ws://localhost/ws?dataset=messages",
    };

    source.subscribe(dataSetId("chat"), def, vi.fn());

    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const ws = MockWebSocket.instances[0]!;
    ws.open();

    ws.sent = [];
    source.unsubscribe(dataSetId("chat"));

    expect(ws.sent).toContainEqual(JSON.stringify({ op: "unsubscribe", dataset: "messages" }));
  });

  describe("WebSocketSource — connection URL", () => {
    it("appends auth token as query parameter", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        { auth: { type: "query-param", token: "secret123" } },
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      const url = new URL(ws.url);
      expect(url.searchParams.get("token")).toBe("secret123");
    });

    it("uses custom auth param name", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        { auth: { type: "query-param", paramName: "api_key", token: "key456" } },
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      const url = new URL(ws.url);
      expect(url.searchParams.get("api_key")).toBe("key456");
      expect(url.searchParams.has("token")).toBe(false);
    });

    it("rewrites URL through relay endpoint", async () => {
      const source = createWebSocketSource(
        "ws://upstream:8080/ws",
        { relay: { endpoint: "wss://relay.example.com/ws-relay" } },
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://upstream:8080/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      const url = new URL(ws.url);
      expect(url.hostname).toBe("relay.example.com");
      expect(url.pathname).toBe("/ws-relay");
      expect(url.searchParams.get("target")).toBe("ws://upstream:8080/ws");
    });

    it("applies auth to relay URL when both configured", async () => {
      const source = createWebSocketSource(
        "ws://upstream:8080/ws",
        {
          relay: { endpoint: "wss://relay.example.com/ws-relay" },
          auth: { type: "query-param", token: "relay-token" },
        },
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://upstream:8080/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      const url = new URL(ws.url);
      expect(url.hostname).toBe("relay.example.com");
      expect(url.searchParams.get("target")).toBe("ws://upstream:8080/ws");
      expect(url.searchParams.get("token")).toBe("relay-token");
    });

    it("connects to baseUrl directly when no config", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      expect(MockWebSocket.instances[0]!.url).toBe("ws://localhost/ws");
    });
  });

  describe("WebSocketSource — single-subscriber fallback (#61)", () => {
    it("routes message without dataset field to sole subscriber", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const events: DataSetEvent[] = [];
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      ws.onmessage?.({
        data: JSON.stringify({
          op: "snapshot",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["hello"]],
        }),
      });

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("snapshot");
    });

    it("drops message without dataset field when multiple subscribers exist", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const events: DataSetEvent[] = [];
      const def1: ExternalDataSetDef = {
        uuid: dataSetId("d1"),
        url: "ws://localhost/ws?dataset=a",
      };
      const def2: ExternalDataSetDef = {
        uuid: dataSetId("d2"),
        url: "ws://localhost/ws?dataset=b",
      };

      source.subscribe(dataSetId("d1"), def1, (e) => events.push(e));
      source.subscribe(dataSetId("d2"), def2, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      ws.onmessage?.({
        data: JSON.stringify({
          op: "snapshot",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["hello"]],
        }),
      });

      expect(events).toHaveLength(0);
    });

    it("does not fallback when dataset field is present but unrecognized", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const events: DataSetEvent[] = [];
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, (e) => events.push(e));

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      ws.onmessage?.({
        data: JSON.stringify({
          dataset: "unknown",
          op: "snapshot",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["hello"]],
        }),
      });

      expect(events).toHaveLength(0);
    });
  });

  describe("WebSocketSource — duplicate subscribe guard (#62a)", () => {
    it("does not send duplicate subscribe message for same dataSetId", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def1: ExternalDataSetDef = {
        uuid: dataSetId("d1"),
        url: "ws://localhost/ws?dataset=messages",
      };
      const def2: ExternalDataSetDef = {
        uuid: dataSetId("d2"),
        url: "ws://localhost/ws?dataset=other",
      };

      source.subscribe(dataSetId("d1"), def1, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      // First subscriber sends subscribe
      const subscribeCount = ws.sent.filter(
        (m) => JSON.parse(m).op === "subscribe",
      ).length;
      expect(subscribeCount).toBe(1);

      // Second subscriber with different ID sends another subscribe
      source.subscribe(dataSetId("d2"), def2, vi.fn());
      const afterTwoSubs = ws.sent.filter(
        (m) => JSON.parse(m).op === "subscribe",
      ).length;
      expect(afterTwoSubs).toBe(2);

      // Third subscribe for same ID as first — should NOT send another
      source.subscribe(dataSetId("d1"), def1, vi.fn());
      const afterDuplicate = ws.sent.filter(
        (m) => JSON.parse(m).op === "subscribe",
      ).length;
      expect(afterDuplicate).toBe(2); // Still 2, not 3
    });
  });

  describe("WebSocketSource — event op routing", () => {
    it("dispatches pages-event for event op messages", async () => {
      // Create a mock event target (using EventTarget instead of DOM element for node compat)
      const eventTarget = new EventTarget() as EventTarget & { dispatchEvent: (event: Event) => boolean };
      const events: Array<{ topic: string; payload: unknown }> = [];
      eventTarget.addEventListener("pages-event", ((e: Event) => {
        events.push((e as CustomEvent).detail);
      }) as EventListener);

      const source = createWebSocketSource(
        "ws://localhost/ws",
        { eventTarget: eventTarget as unknown as HTMLElement },
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      // Send event op message
      ws.onmessage?.({
        data: JSON.stringify({
          op: "event",
          topic: "selection-changed",
          payload: { line: 42 },
        }),
      });

      // Verify pages-event was dispatched
      expect(events).toHaveLength(1);
      expect(events[0]!.topic).toBe("selection-changed");
      expect((events[0]!.payload as { line: number }).line).toBe(42);
    });

    it("silently drops event op when no eventTarget configured", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      // Send event op message — should not throw
      ws.onmessage?.({
        data: JSON.stringify({
          op: "event",
          topic: "test",
          payload: { data: 123 },
        }),
      });

      // No error, just silent drop
      expect(true).toBe(true);
    });
  });

  describe("WebSocketSource — incremental reconnect (#56)", () => {
    it("includes since in subscribe message on reconnect when seq was received", async () => {
      vi.useFakeTimers();
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws1 = MockWebSocket.instances[0]!;
      ws1.open();

      // Receive a message with seq
      ws1.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "snapshot",
          seq: "42",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["hello"]],
        }),
      });

      // Simulate abnormal close and reconnect
      ws1.readyState = MockWebSocket.CLOSED;
      ws1.onclose?.({ code: 1006, reason: "abnormal" });
      await vi.advanceTimersByTimeAsync(1000);

      expect(MockWebSocket.instances).toHaveLength(2);
      const ws2 = MockWebSocket.instances[1]!;
      ws2.open();

      // Check that resubscribe includes since
      const resubscribe = ws2.sent.find((m) => JSON.parse(m).op === "subscribe");
      expect(resubscribe).toBeDefined();
      const parsed = JSON.parse(resubscribe!);
      expect(parsed.since).toBe("42");

      vi.useRealTimers();
    });

    it("does not include since on first connection (no prior seq)", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      const subscribeMsg = ws.sent.find((m) => JSON.parse(m).op === "subscribe");
      const parsed = JSON.parse(subscribeMsg!);
      expect(parsed.since).toBeUndefined();
    });

    it("tracks seq across multiple events, uses latest", async () => {
      vi.useFakeTimers();
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws1 = MockWebSocket.instances[0]!;
      ws1.open();

      ws1.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "snapshot",
          seq: "10",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["first"]],
        }),
      });

      ws1.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "append",
          seq: "15",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["second"]],
        }),
      });

      ws1.readyState = MockWebSocket.CLOSED;
      ws1.onclose?.({ code: 1006, reason: "abnormal" });
      await vi.advanceTimersByTimeAsync(1000);

      const ws2 = MockWebSocket.instances[1]!;
      ws2.open();

      const resubscribe = ws2.sent.find((m) => JSON.parse(m).op === "subscribe");
      expect(JSON.parse(resubscribe!).since).toBe("15");

      vi.useRealTimers();
    });

    it("does not advance seq for events without seq field", async () => {
      vi.useFakeTimers();
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws1 = MockWebSocket.instances[0]!;
      ws1.open();

      // First event with seq
      ws1.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "snapshot",
          seq: "10",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["first"]],
        }),
      });

      // Second event without seq — lastSeq should stay at "10"
      ws1.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "append",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["second"]],
        }),
      });

      ws1.readyState = MockWebSocket.CLOSED;
      ws1.onclose?.({ code: 1006, reason: "abnormal" });
      await vi.advanceTimersByTimeAsync(1000);

      const ws2 = MockWebSocket.instances[1]!;
      ws2.open();

      const resubscribe = ws2.sent.find((m) => JSON.parse(m).op === "subscribe");
      expect(JSON.parse(resubscribe!).since).toBe("10");

      vi.useRealTimers();
    });

    it("resets seq on explicit close()", async () => {
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      ws.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "snapshot",
          seq: "42",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["hello"]],
        }),
      });

      source.close();

      // Re-subscribe after close — should not have since
      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
      const ws2 = MockWebSocket.instances[1]!;
      ws2.open();

      const subscribeMsg = ws2.sent.find((m) => JSON.parse(m).op === "subscribe");
      expect(JSON.parse(subscribeMsg!).since).toBeUndefined();
    });

    it("does not reset seq on abnormal close (reconnect preserves it)", async () => {
      vi.useFakeTimers();
      const source = createWebSocketSource(
        "ws://localhost/ws",
        undefined,
        MockWebSocket as unknown as typeof WebSocket,
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("chat"),
        url: "ws://localhost/ws?dataset=messages",
      };

      source.subscribe(dataSetId("chat"), def, vi.fn());

      await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
      const ws1 = MockWebSocket.instances[0]!;
      ws1.open();

      ws1.onmessage?.({
        data: JSON.stringify({
          dataset: "messages",
          op: "snapshot",
          seq: "100",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["hello"]],
        }),
      });

      // Abnormal close — handleClose() is called but should NOT reset lastSeq
      ws1.readyState = MockWebSocket.CLOSED;
      ws1.onclose?.({ code: 1006, reason: "abnormal" });
      await vi.advanceTimersByTimeAsync(1000);

      const ws2 = MockWebSocket.instances[1]!;
      ws2.open();

      const resubscribe = ws2.sent.find((m) => JSON.parse(m).op === "subscribe");
      expect(JSON.parse(resubscribe!).since).toBe("100");

      vi.useRealTimers();
    });
  });
});
