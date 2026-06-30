import { describe, it, expect, vi } from "vitest";
import { createWebSocketPool } from "./websocket-pool.js";
import { dataSetId } from "../../types.js";
import type { WebSocketSourceConfig } from "./websocket-source.js";

describe("WebSocketPool", () => {
  it("returns same source for same base URL", () => {
    const pool = createWebSocketPool();
    const def1 = { uuid: dataSetId("d1"), url: "ws://host/ws?dataset=a" };
    const def2 = { uuid: dataSetId("d2"), url: "ws://host/ws?dataset=b" };

    const s1 = pool.acquire("ws://host/ws");
    const s2 = pool.acquire("ws://host/ws");
    expect(s1).toBe(s2);
  });

  it("returns different sources for different base URLs", () => {
    const pool = createWebSocketPool();
    const def1 = { uuid: dataSetId("d1"), url: "ws://host/ws1" };
    const def2 = { uuid: dataSetId("d2"), url: "ws://host/ws2" };

    const s1 = pool.acquire("ws://host/ws1");
    const s2 = pool.acquire("ws://host/ws2");
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

    const s1 = pool.acquire("ws://host/ws1");
    const s2 = pool.acquire("ws://host/ws2");

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

    const s1 = pool.acquire("ws://host/ws");
    const s2 = pool.acquire("ws://host/ws");
    expect(s1).toBe(s2);
  });
});

describe("WebSocketPool — configuration", () => {
  it("passes config to created sources via configure()", () => {
    const constructedUrls: string[] = [];

    class ConfigTrackingWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 0;
      onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
      onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
      onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
      onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
      send = vi.fn();
      close = vi.fn();

      constructor(public url: string) {
        constructedUrls.push(url);
      }
    }

    const pool = createWebSocketPool(
      ConfigTrackingWebSocket as unknown as typeof WebSocket,
    );
    const config: WebSocketSourceConfig = {
      auth: { type: "query-param", token: "pooltest" },
    };
    pool.configure(config);

    const source = pool.acquire("ws://host/ws");
    source.subscribe(dataSetId("d1"), { uuid: dataSetId("d1") }, () => {});

    expect(constructedUrls).toHaveLength(1);
    const url = new URL(constructedUrls[0]!);
    expect(url.searchParams.get("token")).toBe("pooltest");
  });

  it("acquire without configure creates source with no config", () => {
    const constructedUrls: string[] = [];

    class TrackingWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 0;
      onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
      onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
      onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
      onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
      send = vi.fn();
      close = vi.fn();

      constructor(public url: string) {
        constructedUrls.push(url);
      }
    }

    const pool = createWebSocketPool(
      TrackingWebSocket as unknown as typeof WebSocket,
    );

    const source = pool.acquire("ws://host/ws");
    source.subscribe(dataSetId("d1"), { uuid: dataSetId("d1") }, () => {});

    expect(constructedUrls).toHaveLength(1);
    expect(constructedUrls[0]).toBe("ws://host/ws");
  });
});
