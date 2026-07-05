import { describe, it, expect, vi } from "vitest";
import {
  buildConnectionUrl,
  sendListen,
  sendUnlisten,
  dispatchWireEvent,
  nextRequestId,
  sendSubscribe,
  sendUnsubscribe,
} from "./push-wire.js";

describe("buildConnectionUrl", () => {
  it("returns URL unchanged when no config", () => {
    expect(buildConnectionUrl("wss://example.com/ws")).toBe("wss://example.com/ws");
  });

  it("rewrites URL through relay endpoint", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      relay: { endpoint: "wss://relay.example.com/proxy" },
    });
    const url = new URL(result);
    expect(url.origin).toBe("wss://relay.example.com");
    expect(url.pathname).toBe("/proxy");
    expect(url.searchParams.get("target")).toBe("wss://example.com/ws");
  });

  it("appends auth token as query parameter", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      auth: { type: "query-param" as const, token: "abc123" },
    });
    const url = new URL(result);
    expect(url.searchParams.get("token")).toBe("abc123");
  });

  it("uses custom param name for auth", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      auth: { type: "query-param" as const, paramName: "key", token: "abc123" },
    });
    const url = new URL(result);
    expect(url.searchParams.get("key")).toBe("abc123");
  });

  it("applies both relay and auth", () => {
    const result = buildConnectionUrl("wss://example.com/ws", {
      relay: { endpoint: "wss://relay.example.com/proxy" },
      auth: { type: "query-param" as const, token: "abc123" },
    });
    const url = new URL(result);
    expect(url.searchParams.get("target")).toBe("wss://example.com/ws");
    expect(url.searchParams.get("token")).toBe("abc123");
  });
});

describe("nextRequestId", () => {
  it("returns monotonic sequential strings", () => {
    const id1 = nextRequestId();
    const id2 = nextRequestId();
    const id3 = nextRequestId();
    expect(id1).toMatch(/^\d+$/);
    expect(id2).toMatch(/^\d+$/);
    expect(id3).toMatch(/^\d+$/);
    expect(Number(id2)).toBe(Number(id1) + 1);
    expect(Number(id3)).toBe(Number(id2) + 1);
  });
});

describe("sendListen", () => {
  it("sends listen op with id and topics", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendListen(ws, "r1", ["debate:abc", "file:/x"]);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "listen", id: "r1", topics: ["debate:abc", "file:/x"] }),
    );
  });

  it("sends listen op with id, topics, and since map", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendListen(ws, "r2", ["debate:abc"], { "debate:abc": 42, "debate:xyz": 100 });
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        op: "listen",
        id: "r2",
        topics: ["debate:abc"],
        since: { "debate:abc": 42, "debate:xyz": 100 },
      }),
    );
  });
});

describe("sendUnlisten", () => {
  it("sends unlisten op with id and topics", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendUnlisten(ws, "r3", ["debate:abc"]);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "unlisten", id: "r3", topics: ["debate:abc"] }),
    );
  });
});

describe("sendSubscribe", () => {
  it("sends subscribe op with id and dataset", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendSubscribe(ws, "r4", "orders");
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "subscribe", id: "r4", dataset: "orders" }),
    );
  });

  it("sends subscribe op with id, dataset, and since cursor", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendSubscribe(ws, "r5", "orders", "cursor-abc");
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "subscribe", id: "r5", dataset: "orders", since: "cursor-abc" }),
    );
  });
});

describe("sendUnsubscribe", () => {
  it("sends unsubscribe op with id and dataset", () => {
    const send = vi.fn();
    const ws = { send, readyState: 1 } as unknown as WebSocket;
    sendUnsubscribe(ws, "r6", "orders");
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: "unsubscribe", id: "r6", dataset: "orders" }),
    );
  });
});

describe("dispatchWireEvent", () => {
  it("dispatches pages-event CustomEvent with topic and payload", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    dispatchWireEvent({ topic: "debate:abc", payload: { text: "hi" } }, target);
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail.topic).toBe("debate:abc");
    expect(detail.payload).toEqual({ text: "hi" });
  });

  it("does not dispatch when topic is missing", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    target.addEventListener("pages-event", handler);
    dispatchWireEvent({ payload: { text: "hi" } }, target);
    expect(handler).not.toHaveBeenCalled();
  });
});
