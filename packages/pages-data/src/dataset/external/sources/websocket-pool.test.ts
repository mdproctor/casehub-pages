import { describe, it, expect, vi } from "vitest";
import { createWebSocketPool } from "./websocket-pool.js";
import { dataSetId } from "../../types.js";

describe("WebSocketPool", () => {
  it("returns same source for same base URL", () => {
    const pool = createWebSocketPool();
    const def1 = { uuid: dataSetId("d1"), url: "ws://host/ws?dataset=a" };
    const def2 = { uuid: dataSetId("d2"), url: "ws://host/ws?dataset=b" };

    const s1 = pool.acquire("ws://host/ws", def1);
    const s2 = pool.acquire("ws://host/ws", def2);
    expect(s1).toBe(s2);
  });

  it("returns different sources for different base URLs", () => {
    const pool = createWebSocketPool();
    const def1 = { uuid: dataSetId("d1"), url: "ws://host/ws1" };
    const def2 = { uuid: dataSetId("d2"), url: "ws://host/ws2" };

    const s1 = pool.acquire("ws://host/ws1", def1);
    const s2 = pool.acquire("ws://host/ws2", def2);
    expect(s1).not.toBe(s2);
  });

  it("releaseAll closes all sources", () => {
    const closeMock = vi.fn();
    class MockWebSocket {
      readonly url: string;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 0;

      onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
      onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
      onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
      onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;

      send = vi.fn();
      close = closeMock;

      constructor(url: string) {
        this.url = url;
      }
    }

    const pool = createWebSocketPool(MockWebSocket as unknown as typeof WebSocket);
    const def1 = { uuid: dataSetId("d1"), url: "ws://host/ws1" };
    const def2 = { uuid: dataSetId("d2"), url: "ws://host/ws2" };

    const s1 = pool.acquire("ws://host/ws1", def1);
    const s2 = pool.acquire("ws://host/ws2", def2);

    // Subscribe to trigger connection creation
    s1.subscribe(dataSetId("d1"), def1, () => {});
    s2.subscribe(dataSetId("d2"), def2, () => {});

    pool.releaseAll();

    // close() should have been called (2 sources × close each)
    expect(closeMock).toHaveBeenCalled();
  });

  it("pool reuses connection after acquire but before dispose", () => {
    const pool = createWebSocketPool();
    const def1 = { uuid: dataSetId("d1"), url: "ws://host/ws" };

    const s1 = pool.acquire("ws://host/ws", def1);
    const s2 = pool.acquire("ws://host/ws", def1);
    expect(s1).toBe(s2);
  });
});
