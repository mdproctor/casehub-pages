import { describe, it, expect, vi } from "vitest";
import { createRestAdapter } from "./rest-adapter.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

describe("rest-adapter", () => {
  it("should send PATCH request with changed fields", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: 1, name: "Updated", email: "updated@example.com" }),
    } as Response));

    const adapter = createRestAdapter(
      undefined,
      "https://api.example.com/users",
      mockFetch as any,
    );

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 1, name: "Updated", email: "updated@example.com" },
      ["name", "email"],
      "id",
      1,
    );

    expect(result.success).toBe(true);
    expect(result.updatedRecord).toEqual({ id: 1, name: "Updated", email: "updated@example.com" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/users/1",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Updated", email: "updated@example.com" }),
      }),
    );
  });

  it("should use custom method and headers from config", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      json: async () => ({}),
    } as Response));

    const adapter = createRestAdapter(
      {
        method: "PUT",
        headers: { "X-Custom-Header": "value" },
      },
      "https://api.example.com/users",
      mockFetch as any,
    );

    await adapter.save(
      "users" as DataSetId,
      { id: 1, name: "Updated" },
      ["name"],
      "id",
      1,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/users/1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Custom-Header": "value",
        }),
      }),
    );
  });

  it("should return error on HTTP failure", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response));

    const adapter = createRestAdapter(
      undefined,
      "https://api.example.com/users",
      mockFetch as any,
    );

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 999, name: "Unknown" },
      ["name"],
      "id",
      999,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 404");
  });

  it("should return error on network failure", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("Network error");
    });

    const adapter = createRestAdapter(
      undefined,
      "https://api.example.com/users",
      mockFetch as any,
    );

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 1, name: "Updated" },
      ["name"],
      "id",
      1,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should handle non-JSON response", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
    } as Response));

    const adapter = createRestAdapter(
      undefined,
      "https://api.example.com/users",
      mockFetch as any,
    );

    const result = await adapter.save(
      "users" as DataSetId,
      { id: 1, name: "Updated" },
      ["name"],
      "id",
      1,
    );

    expect(result.success).toBe(true);
    expect(result.updatedRecord).toBeUndefined();
  });
});
