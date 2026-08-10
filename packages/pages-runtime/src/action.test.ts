import { describe, it, expect, vi } from "vitest";
import { ActionExecutor } from "./action.js";
import type { ActionRequest, ActionCallbacks } from "@casehubio/pages-component";
import type { RuntimeContext } from "@casehubio/pages-component";

describe("ActionExecutor", () => {
  const mockContext: RuntimeContext = {
    filter: { region: ["North"], status: ["active"] },
    datasets: {},
    page: { name: "Dashboard", path: "/dashboard" },
    params: { orgId: "123" },
    selection: {},
  };

  it("executes successful POST with template resolution in URL", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/orgs/#{params.orgId}/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {
      onSuccess: { refresh: ["tasks"] },
    };

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/orgs/123/actions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
    );
  });

  it("executes successful POST with template resolution in body", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: {
        orgId: "#{params.orgId}",
        region: "#{filter.region}",
        status: "#{filter.status}",
      },
    };

    const callbacks: ActionCallbacks = {};

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          orgId: "123",
          region: "North",
          status: "active",
        }),
      })
    );
  });

  it("executes successful POST with template resolution in headers", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      headers: { "X-Org-Id": "#{params.orgId}" },
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/actions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Org-Id": "123"
        },
      })
    );
  });

  it("returns failure for 4xx response", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        statusText: "Bad Request"
      })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe("Bad Request");
  });

  it("returns failure for 5xx response", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        statusText: "Internal Server Error"
      })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBe("Internal Server Error");
  });

  it("returns failure for network error", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("Network connection failed");
    });

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network connection failed");
  });

  it("prepends baseUrl to relative URL", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    await executor.execute(request, callbacks, mockContext);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/actions",
      expect.any(Object)
    );
  });

  it("does not prepend baseUrl to absolute URL", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "https://other.example.com/api/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    await executor.execute(request, callbacks, mockContext);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://other.example.com/api/actions",
      expect.any(Object)
    );
  });

  it("uses injected fetch function", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    await executor.execute(request, callbacks, mockContext);

    expect(mockFetch).toHaveBeenCalled();
  });

  it("recursively resolves templates in nested body objects", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      method: "POST",
      body: {
        metadata: {
          orgId: "#{params.orgId}",
          region: "#{filter.region}",
        },
      },
    };

    const callbacks: ActionCallbacks = {};

    const result = await executor.execute(request, callbacks, mockContext);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/actions",
      expect.objectContaining({
        body: JSON.stringify({
          metadata: {
            orgId: "123",
            region: "North",
          },
        }),
      })
    );
  });

  it("defaults to POST when method is omitted", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "OK" })
    );

    const executor = new ActionExecutor(mockFetch, "https://api.example.com");

    const request: ActionRequest = {
      url: "/api/actions",
      body: { action: "start" },
    };

    const callbacks: ActionCallbacks = {};

    await executor.execute(request, callbacks, mockContext);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/actions",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});
