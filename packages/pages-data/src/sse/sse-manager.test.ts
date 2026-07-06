import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSEManager, type SSEEvent } from "./sse-manager.js";

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockEventSource.CONNECTING;
  url: string;
  private listeners = new Map<string, Array<(e: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
    }, 0);
  }

  addEventListener(type: string, handler: (e: Event) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(handler);
  }

  removeEventListener(type: string, handler: (e: Event) => void): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  simulateMessage(data: unknown, lastEventId?: string): void {
    const init: MessageEventInit<string> = { data: JSON.stringify(data) };
    if (lastEventId !== undefined) init.lastEventId = lastEventId;
    this.onmessage?.(new MessageEvent("message", init));
  }

  simulateNamedEvent(name: string, data: unknown, lastEventId?: string): void {
    const init: MessageEventInit<string> = { data: JSON.stringify(data) };
    if (lastEventId !== undefined) init.lastEventId = lastEventId;
    const event = new MessageEvent(name, init);
    const handlers = this.listeners.get(name) ?? [];
    for (const h of handlers) {
      h(event);
    }
  }

  getListenerCount(name: string): number {
    return this.listeners.get(name)?.length ?? 0;
  }
}

describe("SSEManager", () => {
  let manager: SSEManager;

  let rafCallbacks: Array<(ts: number) => void> = [];

  function flushRAF(): void {
    const cbs = rafCallbacks.slice();
    rafCallbacks = [];
    for (const cb of cbs) cb(performance.now());
  }

  beforeEach(() => {
    MockEventSource.instances = [];
    rafCallbacks = [];
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("requestAnimationFrame", (cb: (ts: number) => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    manager = new SSEManager();
  });

  afterEach(() => {
    manager.disconnectAll();
    vi.unstubAllGlobals();
  });

  describe("unnamed events (backward compatible)", () => {
    it("creates one EventSource per unique URL", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      manager.subscribe("/events", h1);
      manager.subscribe("/events", h2);
      expect(MockEventSource.instances).toHaveLength(1);
    });

    it("creates separate EventSources for different URLs", () => {
      manager.subscribe("/a", vi.fn());
      manager.subscribe("/b", vi.fn());
      expect(MockEventSource.instances).toHaveLength(2);
    });

    it("dispatches unnamed events to all unnamed subscribers", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      manager.subscribe("/events", h1);
      manager.subscribe("/events", h2);
      MockEventSource.instances[0]!.simulateMessage({
        type: "test",
        id: "1",
      });

      flushRAF();

      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
      const event: SSEEvent = h1.mock.calls[0]![0] as SSEEvent;
      expect(event.type).toBe("test");
      expect(event.data).toEqual({ type: "test", id: "1" });
    });

    it("uses 'message' as default type when payload has no type field", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      MockEventSource.instances[0]!.simulateMessage({ value: 42 });

      flushRAF();

      const event: SSEEvent = handler.mock.calls[0]![0] as SSEEvent;
      expect(event.type).toBe("message");
    });

    it("includes lastEventId when present", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      MockEventSource.instances[0]!.simulateMessage(
        { type: "test" },
        "evt-42",
      );

      flushRAF();

      const event: SSEEvent = handler.mock.calls[0]![0] as SSEEvent;
      expect(event.id).toBe("evt-42");
    });

    it("omits id field when lastEventId is absent", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      MockEventSource.instances[0]!.simulateMessage({ type: "test" });

      flushRAF();

      const event: SSEEvent = handler.mock.calls[0]![0] as SSEEvent;
      expect(event.id).toBeUndefined();
    });

    it("silently skips non-JSON data", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      const es = MockEventSource.instances[0]!;
      es.onmessage?.(
        new MessageEvent("message", { data: "not-json" }),
      );

      flushRAF();

      expect(handler).not.toHaveBeenCalled();
    });

    it("does not dispatch unnamed events to named-only handlers", () => {
      const unnamed = vi.fn();
      const named = vi.fn();
      manager.subscribe("/events", unnamed);
      manager.subscribe("/events", named, {
        eventNames: ["notification"],
      });
      MockEventSource.instances[0]!.simulateMessage({ type: "test" });

      flushRAF();

      expect(unnamed).toHaveBeenCalledOnce();
      expect(named).not.toHaveBeenCalled();
    });

    it("ignores duplicate subscribe of same handler", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      manager.subscribe("/events", handler);
      MockEventSource.instances[0]!.simulateMessage({ type: "test" });

      flushRAF();

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("named events", () => {
    it("receives events via addEventListener for specified names", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["notification", "unread-count"],
      });
      MockEventSource.instances[0]!.simulateNamedEvent("notification", {
        id: "abc",
        title: "New message",
      });

      flushRAF();

      expect(handler).toHaveBeenCalledOnce();
      const event: SSEEvent = handler.mock.calls[0]![0] as SSEEvent;
      expect(event.type).toBe("notification");
      expect(event.data).toEqual({ id: "abc", title: "New message" });
    });

    it("maps SSE event name to SSEEvent.type", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["unread-count"],
      });
      MockEventSource.instances[0]!.simulateNamedEvent("unread-count", {
        count: 7,
      });

      flushRAF();

      const event: SSEEvent = handler.mock.calls[0]![0] as SSEEvent;
      expect(event.type).toBe("unread-count");
    });

    it("does not receive events for names not in eventNames", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["notification"],
      });
      MockEventSource.instances[0]!.simulateNamedEvent("other-event", {
        x: 1,
      });

      flushRAF();

      expect(handler).not.toHaveBeenCalled();
    });

    it("receives multiple event types on same subscription", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["notification", "notification-updated", "unread-count"],
      });
      const es = MockEventSource.instances[0]!;
      es.simulateNamedEvent("notification", { id: "1" });
      es.simulateNamedEvent("unread-count", { count: 5 });

      flushRAF();

      expect(handler).toHaveBeenCalledTimes(2);
      expect((handler.mock.calls[0]![0] as SSEEvent).type).toBe(
        "notification",
      );
      expect((handler.mock.calls[1]![0] as SSEEvent).type).toBe(
        "unread-count",
      );
    });

    it("includes lastEventId on named events", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["notification"],
      });
      MockEventSource.instances[0]!.simulateNamedEvent(
        "notification",
        { id: "abc" },
        "seq-99",
      );

      flushRAF();

      const event: SSEEvent = handler.mock.calls[0]![0] as SSEEvent;
      expect(event.id).toBe("seq-99");
    });
  });

  describe("mixed mode", () => {
    it("routes unnamed events to unnamed handlers and named events to named handlers", () => {
      const unnamed = vi.fn();
      const named = vi.fn();
      manager.subscribe("/events", unnamed);
      manager.subscribe("/events", named, {
        eventNames: ["notification"],
      });
      const es = MockEventSource.instances[0]!;
      es.simulateMessage({ type: "legacy" });
      es.simulateNamedEvent("notification", { id: "abc" });

      flushRAF();

      expect(unnamed).toHaveBeenCalledOnce();
      expect((unnamed.mock.calls[0]![0] as SSEEvent).type).toBe("legacy");
      expect(named).toHaveBeenCalledOnce();
      expect((named.mock.calls[0]![0] as SSEEvent).type).toBe("notification");
    });

    it("shares one EventSource for mixed handlers", () => {
      manager.subscribe("/events", vi.fn());
      manager.subscribe("/events", vi.fn(), {
        eventNames: ["notification"],
      });
      expect(MockEventSource.instances).toHaveLength(1);
    });
  });

  describe("unsubscribe and cleanup", () => {
    it("closes EventSource when last subscriber unsubscribes", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      manager.unsubscribe("/events", handler);
      expect(MockEventSource.instances[0]!.readyState).toBe(
        MockEventSource.CLOSED,
      );
    });

    it("removes named event listeners on unsubscribe", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["notification", "unread-count"],
      });
      const es = MockEventSource.instances[0]!;
      expect(es.getListenerCount("notification")).toBe(1);
      expect(es.getListenerCount("unread-count")).toBe(1);

      manager.unsubscribe("/events", handler);
      expect(es.getListenerCount("notification")).toBe(0);
      expect(es.getListenerCount("unread-count")).toBe(0);
    });

    it("keeps EventSource open while other handlers remain", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      manager.subscribe("/events", h1);
      manager.subscribe("/events", h2, { eventNames: ["notification"] });
      manager.unsubscribe("/events", h1);
      expect(MockEventSource.instances[0]!.readyState).not.toBe(
        MockEventSource.CLOSED,
      );
    });

    it("is safe to unsubscribe a handler that was never subscribed", () => {
      manager.subscribe("/events", vi.fn());
      expect(() => { manager.unsubscribe("/events", vi.fn()); }).not.toThrow();
    });

    it("is safe to unsubscribe from an unknown URL", () => {
      expect(() => { manager.unsubscribe("/unknown", vi.fn()); }).not.toThrow();
    });

    it("disconnectAll closes all connections", () => {
      manager.subscribe("/a", vi.fn());
      manager.subscribe("/b", vi.fn(), { eventNames: ["x"] });
      manager.disconnectAll();
      expect(MockEventSource.instances[0]!.readyState).toBe(
        MockEventSource.CLOSED,
      );
      expect(MockEventSource.instances[1]!.readyState).toBe(
        MockEventSource.CLOSED,
      );
    });
  });

  describe("connection status", () => {
    it("reports 'connected' for active subscriptions", () => {
      manager.subscribe("/events", vi.fn());
      expect(manager.status("/events")).toBe("connected");
    });

    it("reports 'disconnected' for unknown URLs", () => {
      expect(manager.status("/unknown")).toBe("disconnected");
    });

    it("reports 'reconnecting' after error", () => {
      vi.useFakeTimers();
      manager.subscribe("/events", vi.fn());
      MockEventSource.instances[0]!.onerror?.();
      expect(manager.status("/events")).toBe("reconnecting");
      vi.useRealTimers();
    });

    it("reports 'disconnected' after unsubscribe", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      manager.unsubscribe("/events", handler);
      expect(manager.status("/events")).toBe("disconnected");
    });
  });

  describe("reconnection", () => {
    it("creates new EventSource after error with exponential backoff", () => {
      vi.useFakeTimers();
      manager.subscribe("/events", vi.fn());
      const first = MockEventSource.instances[0]!;
      first.onerror?.();
      expect(first.readyState).toBe(MockEventSource.CLOSED);

      vi.advanceTimersByTime(1000);
      expect(MockEventSource.instances).toHaveLength(2);
      expect(MockEventSource.instances[1]!.url).toBe("/events");
      vi.useRealTimers();
    });

    it("re-registers named event listeners after reconnect", () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      manager.subscribe("/events", handler, {
        eventNames: ["notification", "unread-count"],
      });
      MockEventSource.instances[0]!.onerror?.();

      vi.advanceTimersByTime(1000);
      const reconnected = MockEventSource.instances[1]!;
      expect(reconnected.getListenerCount("notification")).toBe(1);
      expect(reconnected.getListenerCount("unread-count")).toBe(1);
      vi.useRealTimers();
    });

    it("re-registers onmessage after reconnect", () => {
      vi.useFakeTimers();
      manager.subscribe("/events", vi.fn());
      MockEventSource.instances[0]!.onerror?.();

      vi.advanceTimersByTime(1000);
      const reconnected = MockEventSource.instances[1]!;
      expect(reconnected.onmessage).not.toBeNull();
      vi.useRealTimers();
    });

    it("re-registers mixed handlers after reconnect", () => {
      vi.useFakeTimers();
      manager.subscribe("/events", vi.fn());
      manager.subscribe("/events", vi.fn(), {
        eventNames: ["notification"],
      });
      MockEventSource.instances[0]!.onerror?.();

      vi.advanceTimersByTime(1000);
      const reconnected = MockEventSource.instances[1]!;

      expect(reconnected.onmessage).not.toBeNull();
      expect(reconnected.getListenerCount("notification")).toBe(1);
      vi.useRealTimers();
    });

    it("uses exponential backoff capped at 30s", () => {
      vi.useFakeTimers();
      manager.subscribe("/events", vi.fn());

      MockEventSource.instances[0]!.onerror?.();
      vi.advanceTimersByTime(1000);
      expect(MockEventSource.instances).toHaveLength(2);

      MockEventSource.instances[1]!.onerror?.();
      vi.advanceTimersByTime(2000);
      expect(MockEventSource.instances).toHaveLength(3);

      MockEventSource.instances[2]!.onerror?.();
      vi.advanceTimersByTime(4000);
      expect(MockEventSource.instances).toHaveLength(4);

      // After many failures, delay caps at 30s
      for (let i = 3; i < 10; i++) {
        MockEventSource.instances[i]!.onerror?.();
        vi.advanceTimersByTime(30_000);
      }
      expect(MockEventSource.instances.length).toBeGreaterThan(5);
      vi.useRealTimers();
    });

    it("resets backoff counter on successful message", () => {
      vi.useFakeTimers();
      manager.subscribe("/events", vi.fn());

      MockEventSource.instances[0]!.onerror?.();
      vi.advanceTimersByTime(1000);
      const reconnected = MockEventSource.instances[1]!;

      reconnected.simulateMessage({ type: "ok" });
      vi.useRealTimers();
      flushRAF();

      expect(manager.status("/events")).toBe("connected");
    });

    it("does not reconnect after unsubscribe during backoff", () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      MockEventSource.instances[0]!.onerror?.();
      manager.unsubscribe("/events", handler);

      vi.advanceTimersByTime(1000);
      expect(MockEventSource.instances).toHaveLength(1);
      vi.useRealTimers();
    });
  });

  describe("RAF batching", () => {
    it("batches multiple events into one frame", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler);
      const es = MockEventSource.instances[0]!;
      es.simulateMessage({ type: "a" });
      es.simulateMessage({ type: "b" });
      es.simulateMessage({ type: "c" });

      expect(handler).not.toHaveBeenCalled();
      flushRAF();

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("batches named events alongside unnamed events", () => {
      const unnamed = vi.fn();
      const named = vi.fn();
      manager.subscribe("/events", unnamed);
      manager.subscribe("/events", named, {
        eventNames: ["notification"],
      });
      const es = MockEventSource.instances[0]!;
      es.simulateMessage({ type: "legacy" });
      es.simulateNamedEvent("notification", { id: "1" });

      flushRAF();

      expect(unnamed).toHaveBeenCalledOnce();
      expect(named).toHaveBeenCalledOnce();
    });
  });

  describe("edge cases", () => {
    it("treats empty eventNames array as unnamed handler", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, { eventNames: [] });
      MockEventSource.instances[0]!.simulateMessage({ type: "test" });

      flushRAF();

      expect(handler).toHaveBeenCalledOnce();
    });

    it("treats no eventNames in options as unnamed handler", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, {});
      MockEventSource.instances[0]!.simulateMessage({ type: "test" });

      flushRAF();

      expect(handler).toHaveBeenCalledOnce();
    });

    it("treats undefined options as unnamed handler", () => {
      const handler = vi.fn();
      manager.subscribe("/events", handler, undefined);
      MockEventSource.instances[0]!.simulateMessage({ type: "test" });

      flushRAF();

      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
