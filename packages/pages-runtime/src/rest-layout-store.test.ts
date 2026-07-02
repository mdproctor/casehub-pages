import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRestLayoutStore } from "./rest-layout-store.js";
import type { LayoutState } from "@casehubio/pages-component/dist/model/types.js";

describe("rest-layout-store", () => {
  const baseUrl = "https://api.example.com";
  const layoutKey = "test-layout";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("load", () => {
    it("should return LayoutState on 200", async () => {
      const mockLayout: LayoutState = {
        splits: { "split-1": [0.5, 0.5] },
        docks: { "panel-1": true },
        panels: {},
      };

      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify(mockLayout)),
        } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      const result = await store.load(layoutKey);

      expect(result).toEqual(mockLayout);
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({ headers: {} })
      );
    });

    it("should return null on 204 (no content)", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 204,
          ok: true,
          text: () => Promise.resolve(""),
        } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      const result = await store.load(layoutKey);

      expect(result).toBeNull();
    });

    it("should return null on 401 and dispatch pages-auth-expired", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 401,
          ok: false,
          text: () => Promise.resolve(""),
        } as Response)
      );
      global.fetch = mockFetch;

      const eventSpy = vi.fn();
      document.addEventListener("pages-auth-expired", eventSpy);

      const store = createRestLayoutStore(baseUrl, () => null);
      const result = await store.load(layoutKey);

      expect(result).toBeNull();
      expect(eventSpy).toHaveBeenCalled();
      document.removeEventListener("pages-auth-expired", eventSpy);
    });

    it("should return null on 404", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 404,
          ok: false,
          text: () => Promise.resolve(""),
        } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      const result = await store.load(layoutKey);

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      const mockFetch = vi.fn(() => Promise.reject(new Error("Network error")));
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      const result = await store.load(layoutKey);

      expect(result).toBeNull();
    });

    it("should return null on invalid JSON", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve("invalid json"),
        } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      const result = await store.load(layoutKey);

      expect(result).toBeNull();
    });

    it("should include Authorization header when token is present", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ splits: {}, docks: {}, panels: {} })),
        } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => "test-token");
      await store.load(layoutKey);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({
          headers: { Authorization: "Bearer test-token" },
        })
      );
    });

    it("should not include Authorization header when token is null", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ splits: {}, docks: {}, panels: {} })),
        } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.load(layoutKey);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({ headers: {} })
      );
    });
  });

  describe("save", () => {
    it("should send PUT with text/plain content type", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({ status: 200, ok: true } as Response)
      );
      global.fetch = mockFetch;

      const layoutState: LayoutState = {
        splits: { "split-1": [0.5, 0.5] },
        docks: { "panel-1": true },
        panels: {},
      };

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.save(layoutKey, layoutState);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(layoutState),
        })
      );
    });

    it("should include Authorization header when token is present", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({ status: 200, ok: true } as Response)
      );
      global.fetch = mockFetch;

      const layoutState: LayoutState = {
        splits: {},
        docks: {},
        panels: {},
      };

      const store = createRestLayoutStore(baseUrl, () => "test-token");
      await store.save(layoutKey, layoutState);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({
          headers: {
            "Content-Type": "text/plain",
            Authorization: "Bearer test-token",
          },
        })
      );
    });

    it("should dispatch pages-auth-expired on 401", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({ status: 401, ok: false } as Response)
      );
      global.fetch = mockFetch;

      const eventSpy = vi.fn();
      document.addEventListener("pages-auth-expired", eventSpy);

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.save(layoutKey, { splits: {}, docks: {}, panels: {} });

      expect(eventSpy).toHaveBeenCalled();
      document.removeEventListener("pages-auth-expired", eventSpy);
    });

    it("should log warning and swallow errors", async () => {
      const mockFetch = vi.fn(() => Promise.reject(new Error("Network error")));
      global.fetch = mockFetch;

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.save(layoutKey, { splits: {}, docks: {}, panels: {} });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to save layout"),
        expect.any(Error)
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe("delete", () => {
    it("should send DELETE request", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({ status: 200, ok: true } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.delete(layoutKey);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({
          method: "DELETE",
          headers: {},
        })
      );
    });

    it("should include Authorization header when token is present", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({ status: 200, ok: true } as Response)
      );
      global.fetch = mockFetch;

      const store = createRestLayoutStore(baseUrl, () => "test-token");
      await store.delete(layoutKey);

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/api/layouts/${encodeURIComponent(layoutKey)}`,
        expect.objectContaining({
          headers: { Authorization: "Bearer test-token" },
        })
      );
    });

    it("should dispatch pages-auth-expired on 401", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({ status: 401, ok: false } as Response)
      );
      global.fetch = mockFetch;

      const eventSpy = vi.fn();
      document.addEventListener("pages-auth-expired", eventSpy);

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.delete(layoutKey);

      expect(eventSpy).toHaveBeenCalled();
      document.removeEventListener("pages-auth-expired", eventSpy);
    });

    it("should log warning and swallow errors", async () => {
      const mockFetch = vi.fn(() => Promise.reject(new Error("Network error")));
      global.fetch = mockFetch;

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = createRestLayoutStore(baseUrl, () => null);
      await store.delete(layoutKey);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete layout"),
        expect.any(Error)
      );
      consoleWarnSpy.mockRestore();
    });
  });
});
