import { describe, it, expect, vi } from "vitest";
import { resolveExternalDataSet } from "./resolver.js";
import type { ResolverContext } from "./resolver.js";
import { createDataSetManager } from "../manager.js";
import { createPresetRegistry } from "./presets/registry.js";
import { createDataProviderFactory } from "./provider-factory.js";
import { toTypedDataSet } from "../conversion.js";
import type { Column } from "../types.js";
import { ColumnType, dataSetId, columnId } from "../types.js";
import { DataSetError } from "../errors.js";
import type {
  ExternalDataSetDef,
  DataProvider,
  DataRequest,
  FetchResult,
} from "./types.js";
import { HttpMethod, LOCAL_CAPABILITIES } from "./types.js";

function makeCtx(overrides?: Partial<ResolverContext>): ResolverContext {
  return {
    manager: createDataSetManager(),
    providerFactory: createDataProviderFactory(),
    providerConfig: {},
    presetRegistry: createPresetRegistry(),
    capabilities: LOCAL_CAPABILITIES,
    ...overrides,
  };
}

function mockProviderFactory(data: unknown, contentType?: string) {
  const provider: DataProvider = {
    fetch(): Promise<FetchResult> {
      return Promise.resolve(contentType !== undefined ? { data, contentType } : { data });
    },
  };
  return {
    create: () => provider,
  };
}

function col(id: string, name: string, type: ColumnType): Column {
  return { id: columnId(id), name, type };
}

const COLS = [
  col("name", "Name", ColumnType.LABEL),
  col("value", "Value", ColumnType.NUMBER),
];

describe("resolveExternalDataSet", () => {
  // ---- Content-based resolution ----

  it("resolves content-based definition and registers in manager", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-inline"),
      content: JSON.stringify([
        { name: "Alice", value: 100 },
        { name: "Bob", value: 200 },
      ]),
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("content");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(result.dataset.rows[1]!.number(columnId("value"))).toBe(200);
    // Should be registered in manager
    expect(ctx.manager.has(dataSetId("ds-inline"))).toBe(true);
  });

  it("resolves content-based with expression filter", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-expr"),
      content: JSON.stringify([
        { name: "Alice", value: 100 },
        { name: "Bob", value: 200 },
        { name: "Charlie", value: 300 },
      ]),
      expression: "$[value > 150]",
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("content");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Bob");
    expect(result.dataset.rows[1]!.text(columnId("name"))).toBe("Charlie");
  });

  // ---- URL-based resolution ----

  it("resolves url-based definition with mock provider", async () => {
    const jsonData = [
      { city: "London", pop: 9000000 },
      { city: "Paris", pop: 2100000 },
    ];
    const ctx = makeCtx({
      providerFactory: mockProviderFactory(JSON.stringify(jsonData)),
    });
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-url"),
      url: "https://api.example.com/cities",
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("url");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("city"))).toBe("London");
    expect(ctx.manager.has(dataSetId("ds-url"))).toBe(true);
  });

  // ---- Join-based resolution ----

  it("resolves join-based definition", async () => {
    const ctx = makeCtx();
    const dsA = toTypedDataSet({ columns: COLS, data: [["Alice", "100"]] });
    const dsB = toTypedDataSet({ columns: COLS, data: [["Bob", "200"]] });
    ctx.manager.apply(dataSetId("ds-a"), { type: "snapshot", dataset: dsA });
    ctx.manager.apply(dataSetId("ds-b"), { type: "snapshot", dataset: dsB });

    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-joined"),
      join: [dataSetId("ds-a"), dataSetId("ds-b")],
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("join");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(result.dataset.rows[1]!.text(columnId("name"))).toBe("Bob");
    // Joined dataset registered under its own uuid
    expect(ctx.manager.has(dataSetId("ds-joined"))).toBe(true);
  });

  // ---- Accumulate ----

  it("accumulates rows across multiple resolutions", async () => {
    const ctx = makeCtx();

    const def1: ExternalDataSetDef = {
      uuid: dataSetId("ds-acc"),
      content: JSON.stringify([{ name: "Alice", value: 100 }]),
      accumulate: true,
    };

    await resolveExternalDataSet(def1, ctx);

    const def2: ExternalDataSetDef = {
      uuid: dataSetId("ds-acc"),
      content: JSON.stringify([{ name: "Bob", value: 200 }]),
      accumulate: true,
    };

    const result = await resolveExternalDataSet(def2, ctx);

    // The returned dataset is the freshly extracted one (single row)
    expect(result.dataset.rows).toHaveLength(1);
    // But the manager should have appended both rows (new at end)
    const stored = ctx.manager.get(dataSetId("ds-acc"));
    expect(stored).toBeDefined();
    expect(stored!.rows).toHaveLength(2);
    expect(stored!.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(stored!.rows[1]!.text(columnId("name"))).toBe("Bob");
  });

  // ---- Validation: missing uuid ----

  it("throws INVALID_DEFINITION when uuid is missing", async () => {
    const ctx = makeCtx();
    const def = {
      content: JSON.stringify([{ a: 1 }]),
    } as unknown as ExternalDataSetDef;

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("INVALID_DEFINITION");
    }
  });

  // ---- Validation: no source ----

  it("throws INVALID_DEFINITION when no source is provided", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-empty"),
    };

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("INVALID_DEFINITION");
    }
  });

  // ---- Fetch failure ----

  it("wraps fetch errors as FETCH_FAILED", async () => {
    const failingProvider: DataProvider = {
      fetch(): Promise<FetchResult> {
        return Promise.reject(new Error("Network timeout"));
      },
    };
    const ctx = makeCtx({
      providerFactory: { create: () => failingProvider },
    });
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-fail"),
      url: "https://api.example.com/broken",
    };

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("FETCH_FAILED");
    }
  });

  // ---- Source field correctness ----

  it("returns source='url' for url-based definitions", async () => {
    const ctx = makeCtx({
      providerFactory: mockProviderFactory(
        JSON.stringify([{ x: 1 }]),
      ),
    });
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-src-url"),
      url: "https://api.example.com/data",
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.source).toBe("url");
  });

  it("returns source='content' for content-based definitions", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-src-content"),
      content: JSON.stringify([{ x: 1 }]),
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.source).toBe("content");
  });

  it("returns source='join' for join-based definitions", async () => {
    const ctx = makeCtx();
    ctx.manager.apply(
      dataSetId("j1"),
      { type: "snapshot", dataset: toTypedDataSet({ columns: COLS, data: [["A", "1"]] }) },
    );
    ctx.manager.apply(
      dataSetId("j2"),
      { type: "snapshot", dataset: toTypedDataSet({ columns: COLS, data: [["B", "2"]] }) },
    );
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-src-join"),
      join: [dataSetId("j1"), dataSetId("j2")],
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.source).toBe("join");
  });

  // ---- Inferred columns ----

  it("sets inferredColumns=true when no explicit columns are declared", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-infer"),
      content: JSON.stringify([{ name: "Alice", value: 100 }]),
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.inferredColumns).toBe(true);
  });

  it("sets inferredColumns=false when explicit columns are declared", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-explicit"),
      content: JSON.stringify([{ name: "Alice", value: 100 }]),
      columns: [
        { id: columnId("name"), type: ColumnType.LABEL },
        { id: columnId("value"), type: ColumnType.NUMBER },
      ],
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.inferredColumns).toBe(false);
  });

  // ---- Validation: multiple sources ----

  it("throws INVALID_DEFINITION when multiple sources are provided", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-multi"),
      url: "https://api.example.com/data",
      content: JSON.stringify([{ a: 1 }]),
    };

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("INVALID_DEFINITION");
    }
  });

  // ---- DataRequest building ----

  it("builds DataRequest with defaults and custom headers", async () => {
    let capturedRequest: DataRequest | undefined;
    const captureProvider: DataProvider = {
      fetch(req: DataRequest): Promise<FetchResult> {
        capturedRequest = req;
        return Promise.resolve({ data: JSON.stringify([{ a: 1 }]) });
      },
    };
    const ctx = makeCtx({
      providerFactory: { create: () => captureProvider },
    });
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-req"),
      url: "https://api.example.com/data",
      method: HttpMethod.POST,
      headers: { Authorization: "Bearer token" },
      query: { page: "1" },
      body: '{"filter": true}',
    };

    await resolveExternalDataSet(def, ctx);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.url).toBe("https://api.example.com/data");
    expect(capturedRequest!.method).toBe(HttpMethod.POST);
    expect(capturedRequest!.headers).toEqual({ Authorization: "Bearer token" });
    expect(capturedRequest!.query).toEqual({ page: "1" });
    expect(capturedRequest!.body).toBe('{"filter": true}');
  });

  it("defaults method to GET and headers/query to empty objects", async () => {
    let capturedRequest: DataRequest | undefined;
    const captureProvider: DataProvider = {
      fetch(req: DataRequest): Promise<FetchResult> {
        capturedRequest = req;
        return Promise.resolve({ data: JSON.stringify([{ a: 1 }]) });
      },
    };
    const ctx = makeCtx({
      providerFactory: { create: () => captureProvider },
    });
    const def: ExternalDataSetDef = {
      uuid: dataSetId("ds-defaults"),
      url: "https://api.example.com/data",
    };

    await resolveExternalDataSet(def, ctx);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe(HttpMethod.GET);
    expect(capturedRequest!.headers).toEqual({});
    expect(capturedRequest!.query).toEqual({});
    expect(capturedRequest!.form).toBeUndefined();
    expect(capturedRequest!.body).toBeUndefined();
  });

  // ---- Server-query route ----

  describe("serverQuery route", () => {
    it("routes serverQuery to ServerQueryClient and stores snapshot", async () => {
      const manager = createDataSetManager();
      const lookup = { dataSetId: dataSetId("sq-ds"), operations: [] };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          columns: [{ id: "name", name: "Name", type: "LABEL" }],
          rows: [["Alice"]],
        }),
      }) as unknown as typeof globalThis.fetch;

      const ctx = makeCtx({
        manager,
        providerConfig: {
          serverQuery: { endpoint: "/api/dataset/query" },
        },
      });

      const def: ExternalDataSetDef = {
        uuid: dataSetId("sq-ds"),
        serverQuery: true,
      };

      const result = await resolveExternalDataSet(def, ctx, lookup, mockFetch);

      expect(result.source).toBe("serverQuery");
      expect(result.inferredColumns).toBe(false);
      expect(manager.has(dataSetId("sq-ds"))).toBe(true);
    });

    it("throws CONFIG_MISSING when serverQuery is true but config is absent", async () => {
      const ctx = makeCtx({ providerConfig: {} });
      const def: ExternalDataSetDef = {
        uuid: dataSetId("sq-ds"),
        serverQuery: true,
      };

      await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow("CONFIG_MISSING");
    });

    it("passes lookup operations to ServerQueryClient", async () => {
      const capturedBodies: string[] = [];
      const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBodies.push(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ columns: [], rows: [] }),
        });
      }) as unknown as typeof globalThis.fetch;

      const ctx = makeCtx({
        providerConfig: {
          serverQuery: { endpoint: "/api/dataset/query" },
        },
      });

      const lookup = {
        dataSetId: dataSetId("sq-ds"),
        operations: [{ type: "sort" as const, columns: [{ columnId: columnId("name"), order: "ASCENDING" as const }] }],
      };

      const def: ExternalDataSetDef = {
        uuid: dataSetId("sq-ds"),
        serverQuery: true,
      };

      await resolveExternalDataSet(def, ctx, lookup, mockFetch);

      const parsed = JSON.parse(capturedBodies[0]!);
      expect(parsed.operations).toHaveLength(1);
      expect(parsed.operations[0].type).toBe("sort");
    });
  });
});
