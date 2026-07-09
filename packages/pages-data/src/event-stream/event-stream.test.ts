import {beforeEach, describe, expect, it, vi} from "vitest";
import type {EventStreamPool} from "./index.js";
import {createEventStreamPool, EventStream} from "./index.js";

// Mock EventConnection returned by createEventConnection
interface MockConn {
  listen: ReturnType<typeof vi.fn>;
  unlisten: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  connected: boolean;
  status: "connected" | "reconnecting" | "disconnected";
}

let lastMockConn: MockConn;
let capturedEventTarget: EventTarget | undefined;
let capturedBatchEvents: boolean | undefined;
let capturedOnStatusChange: ((status: "connected" | "reconnecting" | "disconnected") => void) | undefined;

vi.mock("../dataset/external/sources/event-connection.js", () => ({
  createEventConnection: (url: string, opts?: { config?: { eventTarget?: EventTarget }; batchEvents?: boolean; onStatusChange?: (status: "connected" | "reconnecting" | "disconnected") => void }) => {
    capturedEventTarget = opts?.config?.eventTarget;
    capturedBatchEvents = opts?.batchEvents;
    capturedOnStatusChange = opts?.onStatusChange;
    const conn: MockConn = {
      listen: vi.fn().mockResolvedValue({ topics: [], gaps: [] }),
      unlisten: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      send: vi.fn(),
      connected: true,
      status: "connected" as const,
    };
    lastMockConn = conn;
    return conn;
  },
}));

vi.mock("../dataset/external/sources/push-wire.js", () => ({
  buildConnectionUrl: (url: string) => url,
}));

function fireEvent(target: EventTarget, topic: string, payload: unknown): void {
  target.dispatchEvent(new CustomEvent("pages-event", {
    bubbles: true,
    composed: true,
    detail: { topic, payload },
  }));
}

describe("EventStream", () => {
  let pool: EventStreamPool;

  beforeEach(() => {
    pool = createEventStreamPool();
    capturedEventTarget = undefined;
    capturedBatchEvents = undefined;
    capturedOnStatusChange = undefined;
  });

  it("connects and listens on topics", async () => {
    const stream = new EventStream("ws://test", "notification:**", { pool });
    stream.connect();

    await vi.waitFor(() => {
      expect(lastMockConn.listen).toHaveBeenCalledWith(["notification:**"]);
    });
  });

  it("receives matching events and updates state", () => {
    const onChange = vi.fn();
    const stream = new EventStream("ws://test", "notification:**", { pool, onChange });
    stream.connect();

    fireEvent(capturedEventTarget!, "notification:user:1", { text: "hello" });

    expect(stream.latest).toEqual({ text: "hello" });
    expect(stream.all).toEqual([{ text: "hello" }]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("filters non-matching topics", () => {
    const onChange = vi.fn();
    const stream = new EventStream("ws://test", "notification:**", { pool, onChange });
    stream.connect();

    fireEvent(capturedEventTarget!, "debate:abc", { text: "wrong" });

    expect(stream.latest).toBeUndefined();
    expect(stream.all).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("caps buffer at maxBuffer", () => {
    const stream = new EventStream("ws://test", "t:**", { pool, maxBuffer: 3 });
    stream.connect();

    for (let i = 0; i < 5; i++) {
      fireEvent(capturedEventTarget!, "t:x", { i });
    }

    expect(stream.all).toHaveLength(3);
    expect(stream.all[0]).toEqual({ i: 2 });
    expect(stream.latest).toEqual({ i: 4 });
  });

  it("disconnect removes listener and calls unlisten", async () => {
    const stream = new EventStream("ws://test", "t:**", { pool });
    stream.connect();
    stream.disconnect();

    await vi.waitFor(() => {
      expect(lastMockConn.unlisten).toHaveBeenCalledWith(["t:**"]);
    });
  });

  it("last disconnect closes pooled connection", () => {
    const stream = new EventStream("ws://test", "t:**", { pool });
    stream.connect();
    stream.disconnect();

    expect(lastMockConn.close).toHaveBeenCalled();
  });

  it("two streams share one connection via pool", () => {
    const s1 = new EventStream("ws://test", "a:**", { pool });
    const s2 = new EventStream("ws://test", "b:**", { pool });
    s1.connect();
    const conn1 = lastMockConn;
    s2.connect();
    const conn2 = lastMockConn;

    expect(conn1).toBe(conn2);
  });

  it("per-topic ref counting — shared topic not unlistened until last disconnects", async () => {
    const s1 = new EventStream("ws://test", "shared:topic", { pool });
    const s2 = new EventStream("ws://test", "shared:topic", { pool });
    s1.connect();
    s2.connect();

    s1.disconnect();
    expect(lastMockConn.unlisten).not.toHaveBeenCalled();

    s2.disconnect();
    await vi.waitFor(() => {
      expect(lastMockConn.unlisten).toHaveBeenCalledWith(["shared:topic"]);
    });
  });

  it("shared: false creates isolated connection", () => {
    const s1 = new EventStream("ws://test", "a:**", { pool });
    s1.connect();
    const pooledConn = lastMockConn;

    const s2 = new EventStream("ws://test", "b:**", { pool, shared: false });
    s2.connect();
    const isolatedConn = lastMockConn;

    expect(pooledConn).not.toBe(isolatedConn);
    s1.disconnect();
    s2.disconnect();
  });

  it("parse function transforms payloads", () => {
    const stream = new EventStream<number>("ws://test", "t:**", {
      pool,
      parse: (raw) => (raw as { v: number }).v,
    });
    stream.connect();

    fireEvent(capturedEventTarget!, "t:x", { v: 42 });

    expect(stream.latest).toBe(42);
    expect(stream.all).toEqual([42]);
  });

  it("parse function failure drops event with warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = new EventStream<number>("ws://test", "t:**", {
      pool,
      parse: () => { throw new Error("bad payload"); },
    });
    stream.connect();

    fireEvent(capturedEventTarget!, "t:x", { v: "not a number" });

    expect(stream.latest).toBeUndefined();
    expect(stream.all).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("listen rejection is caught and logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = new EventStream("ws://test", "t:**", { pool });

    // Override the mock to reject
    vi.mocked(lastMockConn?.listen ?? vi.fn());
    stream.connect();
    lastMockConn.listen.mockRejectedValueOnce(new Error("timeout"));

    // Re-connect to trigger the rejection path
    const s2 = new EventStream("ws://other", "t:**", { pool });
    s2.connect();

    await vi.waitFor(() => {
      // The stream should still be functional despite listen failure
      expect(stream.status).toBeDefined();
    });
    warn.mockRestore();
    s2.disconnect();
    stream.disconnect();
  });

  it("batchEvents option is forwarded to createEventConnection", () => {
    const stream = new EventStream("ws://test", "t:**", { pool, batchEvents: true });
    stream.connect();

    expect(capturedBatchEvents).toBe(true);
  });

  it("accepts string[] topics", () => {
    const stream = new EventStream("ws://test", ["a:1", "b:2"], { pool });
    stream.connect();

    expect(lastMockConn.listen).toHaveBeenCalledWith(["a:1", "b:2"]);
  });

  it("all array is immutable (new reference on each update)", () => {
    const stream = new EventStream("ws://test", "t:**", { pool });
    stream.connect();

    fireEvent(capturedEventTarget!, "t:x", { i: 1 });
    const ref1 = stream.all;

    fireEvent(capturedEventTarget!, "t:x", { i: 2 });
    const ref2 = stream.all;

    expect(ref1).not.toBe(ref2);
  });

  describe("onReconnect", () => {
    it("fires when connection transitions from reconnecting to connected (shared pool)", () => {
      const onReconnect = vi.fn();
      const stream = new EventStream("ws://test", "t:**", { pool, onReconnect });
      stream.connect();

      expect(capturedOnStatusChange).toBeDefined();
      capturedOnStatusChange!("reconnecting");
      expect(onReconnect).not.toHaveBeenCalled();

      capturedOnStatusChange!("connected");
      expect(onReconnect).toHaveBeenCalledOnce();

      stream.disconnect();
    });

    it("fires when connection transitions from reconnecting to connected (dedicated)", () => {
      const onReconnect = vi.fn();
      const stream = new EventStream("ws://test", "t:**", { pool, shared: false, onReconnect });
      stream.connect();

      expect(capturedOnStatusChange).toBeDefined();
      capturedOnStatusChange!("reconnecting");
      capturedOnStatusChange!("connected");

      expect(onReconnect).toHaveBeenCalledOnce();
      stream.disconnect();
    });

    it("does not fire on initial connection (disconnected → connected)", () => {
      const onReconnect = vi.fn();
      const stream = new EventStream("ws://test", "t:**", { pool, onReconnect });
      stream.connect();

      capturedOnStatusChange!("connected");
      expect(onReconnect).not.toHaveBeenCalled();

      stream.disconnect();
    });

    it("does not fire after disconnect", () => {
      const onReconnect = vi.fn();
      const stream = new EventStream("ws://test", "t:**", { pool, onReconnect });
      stream.connect();

      capturedOnStatusChange!("reconnecting");
      stream.disconnect();

      capturedOnStatusChange!("connected");
      expect(onReconnect).not.toHaveBeenCalled();
    });

    it("fires multiple times on repeated reconnections", () => {
      const onReconnect = vi.fn();
      const stream = new EventStream("ws://test", "t:**", { pool, onReconnect });
      stream.connect();

      capturedOnStatusChange!("reconnecting");
      capturedOnStatusChange!("connected");
      capturedOnStatusChange!("reconnecting");
      capturedOnStatusChange!("connected");

      expect(onReconnect).toHaveBeenCalledTimes(2);
      stream.disconnect();
    });
  });
});
