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
        type: "snapshot",
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

    expect(ws.sent).toContainEqual(JSON.stringify({ type: "subscribe", dataset: "messages" }));
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
        type: "snapshot",
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
        type: "append",
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
          type: "snapshot",
          columns: [{ id: "text", type: "TEXT" }],
          rows: [["first"]],
        },
        {
          dataset: "messages",
          type: "append",
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
        type: "replace",
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
        type: "remove",
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

    expect(ws.sent).toContainEqual(JSON.stringify({ type: "subscribe", dataset: "chat" }));
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

    expect(ws.sent).toContainEqual(JSON.stringify({ type: "unsubscribe", dataset: "messages" }));
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
});
