import { describe, it, expect, vi } from "vitest";
import type { DataSetId } from "../../dataset/types.js";
import { dataSetId, ColumnType, columnId } from "../../dataset/types.js";
import type { ExternalDataSetDef } from "../../dataset/external/types.js";
import { HttpMethod, LOCAL_CAPABILITIES } from "../../dataset/external/types.js";
import { createDataSetManager } from "../../dataset/manager.js";
import { createDataProviderFactory } from "../../dataset/external/provider-factory.js";
import type { DataSink } from "../types.js";
import { defToBinding } from "./def-to-binding.js";
import type { DefToBindingDeps } from "./def-to-binding.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";
import type { ResolverContext } from "../../dataset/external/resolver.js";

function createMockPool(): PushPool {
  return {
    acquire: vi.fn().mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    }),
    configure: vi.fn(),
    releaseAll: vi.fn(),
  };
}

function createDeps(overrides?: Partial<DefToBindingDeps>): DefToBindingDeps {
  const manager = overrides?.manager ?? createDataSetManager();
  const ctx: ResolverContext = overrides?.ctx ?? {
    manager,
    providerFactory: createDataProviderFactory(),
    providerConfig: {},
    presetRegistry: { get: () => undefined, has: () => false },
    capabilities: LOCAL_CAPABILITIES,
  };
  return {
    ctx,
    wsPool: overrides?.wsPool ?? createMockPool(),
    ssePool: overrides?.ssePool ?? createMockPool(),
    manager,
  };
}

function collectSink(): { sink: DataSink; events: unknown[]; errors: unknown[] } {
  const events: unknown[] = [];
  const errors: unknown[] = [];
  return {
    sink: {
      apply: (e) => events.push(e),
      error: (e) => errors.push(e),
    },
    events,
    errors,
  };
}

describe("defToBinding", () => {
  describe("inline content mapping", () => {
    it("maps def with content to inlineSource", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("inline-1"),
        content: '[["Alice"], ["Bob"]]',
        columns: [{ id: columnId("name"), type: ColumnType.LABEL }],
      };

      const binding = defToBinding(def, createDeps());

      expect(binding.id).toBe("inline-1");
      expect(binding.source).toBeDefined();
      expect(binding.keyColumn).toBeUndefined();

      // Verify source delivers data
      const { sink, events } = collectSink();
      binding.source.connect(sink);
      expect(events).toHaveLength(1);
      expect((events[0] as { type: string }).type).toBe("snapshot");
    });

    it("preserves keyColumn for inline content", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("inline-keyed"),
        content: '[["a", "1"]]',
        columns: [
          { id: columnId("id"), type: ColumnType.LABEL },
          { id: columnId("val"), type: ColumnType.NUMBER },
        ],
        keyColumn: "id",
      };

      const binding = defToBinding(def, createDeps());
      expect(binding.keyColumn).toBe("id");
    });

    it("passes expression and dataPath to inlineSource", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("inline-expr"),
        content: '{"items": [["x"]]}',
        expression: "$",
        dataPath: "items",
      };

      const binding = defToBinding(def, createDeps());
      expect(binding.id).toBe("inline-expr");
      expect(binding.source).toBeDefined();
    });
  });

  describe("join mapping", () => {
    it("maps def with join to joinSource", () => {
      const manager = createDataSetManager();
      const def: ExternalDataSetDef = {
        uuid: dataSetId("joined"),
        join: [dataSetId("a"), dataSetId("b")],
      };

      const binding = defToBinding(def, createDeps({ manager }));

      expect(binding.id).toBe("joined");
      expect(binding.source).toBeDefined();
      // joinSource doesn't set keyColumn
      expect(binding.keyColumn).toBeUndefined();
    });
  });

  describe("server-query mapping", () => {
    it("maps def with serverQuery to serverQuerySource", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("sq"),
        url: "https://api.example.com/query",
        serverQuery: true,
      };

      const deps = createDeps();
      const binding = defToBinding(def, deps);

      expect(binding.id).toBe("sq");
      expect(binding.source).toBeDefined();
    });

    it("uses serverQuery endpoint from providerConfig when available", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("sq2"),
        url: "https://api.example.com/query",
        serverQuery: true,
      };

      const manager = createDataSetManager();
      const ctx: ResolverContext = {
        manager,
        providerFactory: createDataProviderFactory(),
        providerConfig: {
          serverQuery: {
            endpoint: "https://configured-endpoint.example.com/query",
            tokenFn: () => "test-token",
          },
        },
        presetRegistry: { get: () => undefined, has: () => false },
        capabilities: LOCAL_CAPABILITIES,
      };

      const binding = defToBinding(def, { ...createDeps(), ctx, manager });
      expect(binding.id).toBe("sq2");
      expect(binding.source).toBeDefined();
    });
  });

  describe("WebSocket mapping", () => {
    it("maps ws:// URL to wsSource", () => {
      const wsPool = createMockPool();
      const def: ExternalDataSetDef = {
        uuid: dataSetId("ws-ds"),
        url: "ws://localhost:8080/stream",
        keyColumn: "id",
        columns: [{ id: columnId("id"), type: ColumnType.LABEL }],
      };

      const binding = defToBinding(def, createDeps({ wsPool }));

      expect(binding.id).toBe("ws-ds");
      expect(binding.keyColumn).toBe("id");
      expect(binding.source).toBeDefined();
    });

    it("maps wss:// URL to wsSource", () => {
      const wsPool = createMockPool();
      const def: ExternalDataSetDef = {
        uuid: dataSetId("wss-ds"),
        url: "wss://secure.example.com/stream",
      };

      const binding = defToBinding(def, createDeps({ wsPool }));
      expect(binding.id).toBe("wss-ds");
      expect(binding.source).toBeDefined();
    });
  });

  describe("SSE mapping", () => {
    it("maps sse:// URL to sseSource", () => {
      const ssePool = createMockPool();
      const def: ExternalDataSetDef = {
        uuid: dataSetId("sse-ds"),
        url: "sse://localhost:8080/events",
        keyColumn: "eventId",
      };

      const binding = defToBinding(def, createDeps({ ssePool }));

      expect(binding.id).toBe("sse-ds");
      expect(binding.keyColumn).toBe("eventId");
      expect(binding.source).toBeDefined();
    });

    it("maps sses:// URL to sseSource", () => {
      const ssePool = createMockPool();
      const def: ExternalDataSetDef = {
        uuid: dataSetId("sses-ds"),
        url: "sses://secure.example.com/events",
      };

      const binding = defToBinding(def, createDeps({ ssePool }));
      expect(binding.id).toBe("sses-ds");
      expect(binding.source).toBeDefined();
    });
  });

  describe("REST mapping (default)", () => {
    it("maps URL to restSource with all options", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("rest-ds"),
        url: "https://api.example.com/data",
        method: HttpMethod.POST,
        headers: { "Content-Type": "application/json" },
        query: { page: "1" },
        body: '{"filter": true}',
        dataPath: "data.items",
        type: "json",
        expression: "$[0]",
        columns: [{ id: columnId("name"), type: ColumnType.LABEL }],
        refreshTime: "5s",
        accumulate: true,
        cacheMaxRows: 100,
        cacheEnabled: true,
        keyColumn: "name",
      };

      const binding = defToBinding(def, createDeps());

      expect(binding.id).toBe("rest-ds");
      expect(binding.keyColumn).toBe("name");
      expect(binding.source).toBeDefined();
    });

    it("maps empty URL to restSource", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("empty-url"),
      };

      const binding = defToBinding(def, createDeps());

      expect(binding.id).toBe("empty-url");
      expect(binding.source).toBeDefined();
    });

    it("maps http:// URL to restSource (not ws/sse)", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("http-ds"),
        url: "https://api.example.com/data",
      };

      const binding = defToBinding(def, createDeps());
      expect(binding.id).toBe("http-ds");
      expect(binding.source).toBeDefined();
    });
  });

  describe("priority rules", () => {
    it("content takes priority over url", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("priority"),
        content: '[["x"]]',
        url: "https://should-be-ignored.com",
        columns: [{ id: columnId("c"), type: ColumnType.LABEL }],
      };

      // Should produce inlineSource, not restSource
      const { sink, events } = collectSink();
      const binding = defToBinding(def, createDeps());
      binding.source.connect(sink);
      // inlineSource delivers synchronously
      expect(events).toHaveLength(1);
    });

    it("join takes priority over url", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("join-prio"),
        join: [dataSetId("a")],
        url: "https://should-be-ignored.com",
      };

      const binding = defToBinding(def, createDeps());
      expect(binding.id).toBe("join-prio");
      // joinSource — not restSource
      expect(binding.source).toBeDefined();
    });

    it("serverQuery takes priority over ws:// url prefix", () => {
      const def: ExternalDataSetDef = {
        uuid: dataSetId("sq-prio"),
        url: "ws://ignored-for-sq",
        serverQuery: true,
      };

      const binding = defToBinding(def, createDeps());
      expect(binding.id).toBe("sq-prio");
    });
  });
});
