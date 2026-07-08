import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ConfigurablePanel } from "@casehubio/pages-component";

// Mock xterm.js before importing PagesTerminal
const mockTerminal = {
  open: vi.fn(),
  dispose: vi.fn(),
  reset: vi.fn(),
  write: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onResize: vi.fn(() => ({ dispose: vi.fn() })),
  paste: vi.fn(),
  rows: 24,
  cols: 80,
};
vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn(() => mockTerminal),
}));

const mockFitAddon = {
  fit: vi.fn(),
  activate: vi.fn(),
  dispose: vi.fn(),
};
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(() => mockFitAddon),
}));

// Mock ResizeObserver
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observing: Element[] = [];
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observing.push(target);
  }
  unobserve(): void { /* no-op */ }
  disconnect(): void {
    this.observing = [];
  }
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string): void { this.sent.push(data); }
  close(_code?: number): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: _code ?? 1000, reason: "" });
  }
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
}
vi.stubGlobal("WebSocket", MockWebSocket);

import { PagesTerminal, type TerminalProps } from "./PagesTerminal.js";

describe("PagesTerminal ConfigurablePanel contract", () => {
  it("satisfies ConfigurablePanel<TerminalProps> at compile time", () => {
    const terminal = new PagesTerminal();
    const configurable: ConfigurablePanel<TerminalProps> = terminal;
    expect(typeof configurable.configure).toBe("function");
  });
});

describe("PagesTerminal", () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.instances = [];
    MockResizeObserver.instances = [];
    mockTerminal.rows = 24;
    mockTerminal.cols = 80;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function createElement(props?: Record<string, unknown>): HTMLElement {
    const el = document.createElement("pages-component-terminal") as HTMLElement & {
      configure: (p: Record<string, unknown>) => void;
    };
    if (props) el.configure(props);
    return el;
  }

  describe("mount lifecycle", () => {
    it("creates terminal and fits on connectedCallback", () => {
      const el = createElement({ wsUrl: "ws://localhost/ws/{cols}/{rows}" });
      container.appendChild(el);

      expect(mockTerminal.open).toHaveBeenCalledOnce();
      expect(mockFitAddon.fit).toHaveBeenCalledOnce();
    });

    it("dispatches terminal-ready with dimensions after fit", () => {
      const events: CustomEvent[] = [];
      container.addEventListener("pages-event", ((e: CustomEvent) => {
        events.push(e);
      }) as EventListener);

      const el = createElement({ wsUrl: "ws://localhost/ws/{cols}/{rows}" });
      container.appendChild(el);

      const ready = events.find(e => e.detail.topic === "terminal-ready");
      expect(ready).toBeDefined();
      expect(ready!.detail.payload).toEqual({ cols: 80, rows: 24 });
    });

    it("defers connect when dimensions are zero", () => {
      mockTerminal.cols = 0;
      mockTerminal.rows = 0;

      const el = createElement({ wsUrl: "ws://localhost/ws/{cols}/{rows}" });
      container.appendChild(el);

      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it("completes deferred connect when ResizeObserver fires with positive dimensions", () => {
      mockTerminal.cols = 0;
      mockTerminal.rows = 0;

      const events: CustomEvent[] = [];
      container.addEventListener("pages-event", ((e: CustomEvent) => {
        events.push(e);
      }) as EventListener);

      const el = createElement({ wsUrl: "ws://localhost/ws/{cols}/{rows}" });
      container.appendChild(el);

      expect(MockWebSocket.instances).toHaveLength(0);

      // Simulate ResizeObserver callback with positive dimensions
      mockTerminal.cols = 80;
      mockTerminal.rows = 24;
      const observer = MockResizeObserver.instances[0]!;
      observer.callback([], observer);

      const ready = events.find(e => e.detail.topic === "terminal-ready");
      expect(ready).toBeDefined();
      expect(ready!.detail.payload).toEqual({ cols: 80, rows: 24 });
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("disposes terminal on disconnectedCallback", () => {
      const el = createElement({ wsUrl: "ws://localhost/ws/{cols}/{rows}" });
      container.appendChild(el);
      el.remove();

      expect(mockTerminal.dispose).toHaveBeenCalledOnce();
    });

    it("tears down and re-inits on reconfigure", () => {
      const el = createElement({ wsUrl: "ws://localhost/ws/{cols}/{rows}" });
      container.appendChild(el);

      const typedEl = el as unknown as { configure: (p: Record<string, unknown>) => void };
      typedEl.configure({ wsUrl: "ws://other/ws/{cols}/{rows}" });

      // dispose called for teardown, then open called again for re-init
      expect(mockTerminal.dispose).toHaveBeenCalledOnce();
      expect(mockTerminal.open).toHaveBeenCalledTimes(2);
    });
  });

  describe("configure/connectedCallback ordering", () => {
    it("defers init when configure() is called before connectedCallback()", () => {
      const el = document.createElement("pages-component-terminal") as HTMLElement & {
        configure: (p: Record<string, unknown>) => void;
      };

      el.configure({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      expect(mockTerminal.open).not.toHaveBeenCalled();

      container.appendChild(el);
      expect(mockTerminal.open).toHaveBeenCalledOnce();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it("inits immediately when connectedCallback() fires before configure()", () => {
      const el = document.createElement("pages-component-terminal") as HTMLElement & {
        configure: (p: Record<string, unknown>) => void;
      };

      container.appendChild(el);
      expect(mockTerminal.open).not.toHaveBeenCalled();

      el.configure({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      expect(mockTerminal.open).toHaveBeenCalledOnce();
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe("WebSocket lifecycle", () => {
    it("connects WebSocket with template-substituted URL", () => {
      const el = createElement({ wsUrl: "ws://host/ws/session-1/{cols}/{rows}" });
      container.appendChild(el);

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0]!.url).toBe("ws://host/ws/session-1/80/24");
    });

    it("dispatches terminal-connected on ws open", () => {
      const events: CustomEvent[] = [];
      container.addEventListener("pages-event", ((e: CustomEvent) => {
        events.push(e);
      }) as EventListener);

      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      MockWebSocket.instances[0]!.open();

      const connected = events.find(e => e.detail.topic === "terminal-connected");
      expect(connected).toBeDefined();
    });

    it("writes received text to terminal", () => {
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      ws.onmessage?.({ data: "hello world" });

      expect(mockTerminal.write).toHaveBeenCalledWith("hello world");
    });

    it("sends terminal input through WebSocket", () => {
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      // Simulate terminal.onData callback
      const onDataCall = mockTerminal.onData.mock.calls[0] as unknown as [(data: string) => void];
      onDataCall[0]("ls\r");

      expect(ws.sent).toContain("ls\r");
    });

    it("dispatches terminal-disconnected with session-expired on code 4001", () => {
      const events: CustomEvent[] = [];
      container.addEventListener("pages-event", ((e: CustomEvent) => {
        events.push(e);
      }) as EventListener);

      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();
      ws.onclose?.({ code: 4001, reason: "session-expired" });

      const disconnected = events.find(e => e.detail.topic === "terminal-disconnected");
      expect(disconnected).toBeDefined();
      expect(disconnected!.detail.payload.reason).toBe("session-expired");
    });

    it("does not reconnect on code 4001", () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();
      ws.onclose?.({ code: 4001, reason: "session-expired" });

      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);

      vi.useRealTimers();
    });

    it("reconnects with backoff on normal close", async () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();
      ws.onclose?.({ code: 1006, reason: "" });

      expect(MockWebSocket.instances).toHaveLength(1);

      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(mockTerminal.reset).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it("calls terminal.reset() before reconnect WebSocket is created", () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      const callOrder: string[] = [];
      mockTerminal.reset.mockImplementation(() => { callOrder.push("reset"); });
      const OrigMockWS = globalThis.WebSocket as unknown as typeof MockWebSocket;
      const PatchedWS = class extends OrigMockWS {
        constructor(url: string) {
          super(url);
          callOrder.push("websocket");
        }
      };
      vi.stubGlobal("WebSocket", PatchedWS);

      ws.onclose?.({ code: 1006, reason: "" });
      vi.advanceTimersByTime(1000);

      expect(callOrder).toEqual(["reset", "websocket"]);

      vi.stubGlobal("WebSocket", OrigMockWS);
      vi.useRealTimers();
    });

    it("doubles backoff delay on consecutive failures up to 30s cap", () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);

      // Initial connection opens then drops
      MockWebSocket.instances[0]!.open();
      MockWebSocket.instances[0]!.onclose?.({ code: 1006, reason: "" });

      // retry 0 → 1000ms delay
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Reconnected socket fails immediately (no open → retries not reset)
      MockWebSocket.instances[1]!.onclose?.({ code: 1006, reason: "" });

      // retry 1 → 2000ms delay
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      MockWebSocket.instances[2]!.onclose?.({ code: 1006, reason: "" });

      // retry 2 → 4000ms delay
      vi.advanceTimersByTime(3999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);

      MockWebSocket.instances[3]!.onclose?.({ code: 1006, reason: "" });
      vi.advanceTimersByTime(8000); // retry 3 → 8000ms
      expect(MockWebSocket.instances).toHaveLength(5);

      MockWebSocket.instances[4]!.onclose?.({ code: 1006, reason: "" });
      vi.advanceTimersByTime(16000); // retry 4 → 16000ms
      expect(MockWebSocket.instances).toHaveLength(6);

      MockWebSocket.instances[5]!.onclose?.({ code: 1006, reason: "" });

      // retry 5 → capped at 30000ms (1000 * 2^5 = 32000 > cap)
      vi.advanceTimersByTime(29999);
      expect(MockWebSocket.instances).toHaveLength(6);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(7);

      vi.useRealTimers();
    });

    it("resets backoff after successful reconnect", () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);

      // First failure → 1000ms backoff
      MockWebSocket.instances[0]!.open();
      MockWebSocket.instances[0]!.onclose?.({ code: 1006, reason: "" });
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Successful reconnect resets retries
      MockWebSocket.instances[1]!.open();
      MockWebSocket.instances[1]!.onclose?.({ code: 1006, reason: "" });

      // Should be back to 1000ms, not 2000ms
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      vi.useRealTimers();
    });

    it("does not reconnect after element removal", () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      el.remove();

      // ws.onclose won't fire because _teardown nulled it
      // but even if it did, _connected is false
      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);

      vi.useRealTimers();
    });

    it("cancels reconnect timer on reconfigure", () => {
      vi.useFakeTimers();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();
      ws.onclose?.({ code: 1006, reason: "" });

      expect(MockWebSocket.instances).toHaveLength(1);

      // Reconfigure before timer fires
      const typedEl = el as unknown as { configure: (p: Record<string, unknown>) => void };
      typedEl.configure({ wsUrl: "ws://other/ws/{cols}/{rows}" });

      // Advance timer past original reconnect time
      vi.advanceTimersByTime(1500);

      // Should have exactly 2 instances: original + reconfigure, not 3
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(MockWebSocket.instances[1]!.url).toBe("ws://other/ws/80/24");

      vi.useRealTimers();
    });

    it("sendInput sends text through connected WebSocket", () => {
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);
      const ws = MockWebSocket.instances[0]!;
      ws.open();

      (el as unknown as { sendInput: (t: string) => void }).sendInput("composed text");
      expect(ws.sent).toContain("composed text");
    });

    it("sendInput is no-op when WebSocket is not connected", () => {
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);

      // ws exists but is still CONNECTING (not open)
      (el as unknown as { sendInput: (t: string) => void }).sendInput("text");
      expect(MockWebSocket.instances[0]!.sent).toHaveLength(0);
    });

    it("uses plain URL when no placeholders present", () => {
      const el = createElement({ wsUrl: "ws://host/ws/fixed-session" });
      container.appendChild(el);

      expect(MockWebSocket.instances[0]!.url).toBe("ws://host/ws/fixed-session");
    });

    it("paste delegates to terminal.paste for bracketed paste mode", () => {
      mockTerminal.paste = vi.fn();
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);

      (el as unknown as { paste: (t: string) => void }).paste("multi\nline\ntext");
      expect(mockTerminal.paste).toHaveBeenCalledWith("multi\nline\ntext");
    });

    it("paste is no-op when terminal not initialised", () => {
      const el = createElement();
      container.appendChild(el);
      // No configure() called — _terminal is undefined
      expect(() => {
        (el as unknown as { paste: (t: string) => void }).paste("text");
      }).not.toThrow();
    });
  });

  describe("public accessors", () => {
    it("terminal getter returns xterm Terminal after configure", () => {
      const el = createElement({ wsUrl: "ws://host/ws/{cols}/{rows}" });
      container.appendChild(el);

      const terminal = (el as unknown as { terminal: unknown }).terminal;
      expect(terminal).toBe(mockTerminal);
    });

    it("terminal getter returns undefined before configure", () => {
      const el = createElement();
      container.appendChild(el);

      const terminal = (el as unknown as { terminal: unknown }).terminal;
      expect(terminal).toBeUndefined();
    });
  });
});
