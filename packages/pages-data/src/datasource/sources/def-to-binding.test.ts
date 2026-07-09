import { describe, it, expect, vi } from "vitest";
import { dataSetId, ColumnType, columnId } from "../../dataset/types.js";
import type { ExternalDataSetDef } from "../../dataset/external/types.js";
import { HttpMethod } from "../../dataset/external/types.js";
import { createDataSetManager } from "../../dataset/manager.js";
import type { DataSink } from "../types.js";
import { defToBinding } from "./def-to-binding.js";
import type { DefToBindingDeps } from "./def-to-binding.js";
import type { PushPool } from "../../dataset/external/sources/push-pool.js";

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
  const deps: DefToBindingDeps = {
    manager: overrides?.manager ?? createDataSetManager(),
    wsPool: overrides?.wsPool ?? createMockPool(),
    ssePool: overrides?.ssePool ?? createMockPool(),
    presets: overrides?.presets ?? { get: () => undefined, has: () => false },
  };
  if (overrides?.fetchFn !== undefined) {
    (deps as { fetchFn: typeof globalThis.fetch }).fetchFn = overrides.fetchFn;
  }
  return deps;
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

      const binding = defToBinding(def, createDeps());

      expect(binding.id).toBe("sq");
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

    it("passes fetchFn from deps to restSource", () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response("[]", { headers: { "content-type": "application/json" } }),
      );
      const def: ExternalDataSetDef = {
        uuid: dataSetId("fetch-ds"),
        url: "https://api.example.com/data",
      };

      const binding = defToBinding(def, createDeps({ fetchFn }));
      const { sink } = collectSink();
      binding.source.connect(sink);
      expect(fetchFn).toHaveBeenCalled();
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

      const { sink, events } = collectSink();
      const binding = defToBinding(def, createDeps());
      binding.source.connect(sink);
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
