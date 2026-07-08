import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServerQueryClient } from "./server-query.js";
import { dataSetId } from "../../types.js";
import type { DataSetLookup } from "../../lookup.js";

function makeLookup(id: string): DataSetLookup {
  return { dataSetId: dataSetId(id), operations: [] };
}

function mockFetch(body: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("ServerQueryClient", () => {
  it("POSTs DataSetLookup and returns TypedDataSet", async () => {
    const response = {
      columns: [{ id: "name", name: "Name", type: "LABEL" }],
      rows: [["Alice"], ["Bob"]],
    };
    const fetchFn = mockFetch(response);
    const client = new ServerQueryClient("/api/dataset/query", fetchFn);

    const result = await client.query(makeLookup("ds-1"));

    expect(fetchFn).toHaveBeenCalledWith("/api/dataset/query", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].name).toBe("Name");
    expect(result.rows).toHaveLength(2);
  });

  it("adds Authorization header when tokenFn returns a token", async () => {
    const response = { columns: [], rows: [] };
    const fetchFn = mockFetch(response);
    const tokenFn = () => "jwt-token-123";
    const client = new ServerQueryClient("/api/dataset/query", fetchFn, tokenFn);

    await client.query(makeLookup("ds-1"));

    expect(fetchFn).toHaveBeenCalledWith("/api/dataset/query", expect.objectContaining({
      headers: { "Content-Type": "application/json", "Authorization": "Bearer jwt-token-123" },
    }));
  });

  it("omits Authorization header when tokenFn returns null", async () => {
    const response = { columns: [], rows: [] };
    const fetchFn = mockFetch(response);
    const tokenFn = () => null;
    const client = new ServerQueryClient("/api/dataset/query", fetchFn, tokenFn);

    await client.query(makeLookup("ds-1"));

    const calledHeaders = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].headers as Record<string, string>;
    expect(calledHeaders["Authorization"]).toBeUndefined();
  });

  it("dispatches pages-auth-expired on 401 and throws", async () => {
    const fetchFn = mockFetch({ error: "Unauthorized" }, 401);
    const client = new ServerQueryClient("/api/dataset/query", fetchFn);

    // Mock document.dispatchEvent for the test
    const mockDispatchEvent = vi.fn();
    const originalDocument = globalThis.document;
    (globalThis as { document?: { dispatchEvent: typeof mockDispatchEvent } }).document = { dispatchEvent: mockDispatchEvent };

    await expect(client.query(makeLookup("ds-1"))).rejects.toThrow("FETCH_FAILED");
    expect(mockDispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "pages-auth-expired" }));

    // Restore original document
    if (originalDocument) {
      (globalThis as { document?: Document }).document = originalDocument;
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  it("throws DataSetError on non-ok response", async () => {
    const fetchFn = mockFetch({ error: "Server error" }, 500);
    const client = new ServerQueryClient("/api/dataset/query", fetchFn);

    await expect(client.query(makeLookup("ds-1"))).rejects.toThrow("FETCH_FAILED");
  });

  it("maps null values in rows correctly", async () => {
    const response = {
      columns: [
        { id: "name", name: "Name", type: "LABEL" },
        { id: "age", name: "Age", type: "NUMBER" },
      ],
      rows: [["Alice", "30"], [null, null]],
    };
    const fetchFn = mockFetch(response);
    const client = new ServerQueryClient("/api/dataset/query", fetchFn);

    const result = await client.query(makeLookup("ds-1"));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].cells[0].type).toBe("NULL");
    expect(result.rows[1].cells[1].type).toBe("NULL");
  });
});
