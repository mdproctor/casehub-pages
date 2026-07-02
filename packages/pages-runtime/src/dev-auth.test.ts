import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDevAuthTokenFn } from "./dev-auth.js";

describe("dev-auth", () => {
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    // Mock sessionStorage
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: originalSessionStorage,
      writable: true,
    });
  });

  it("should return null when no token stored", () => {
    const tokenFn = createDevAuthTokenFn();
    expect(tokenFn()).toBeNull();
  });

  it("should return token when stored", () => {
    sessionStorage.setItem("pages-dev-auth-token", "test-token-123");
    const tokenFn = createDevAuthTokenFn();
    expect(tokenFn()).toBe("test-token-123");
  });

  it("should use custom key parameter", () => {
    sessionStorage.setItem("custom-key", "custom-token-456");
    const tokenFn = createDevAuthTokenFn("custom-key");
    expect(tokenFn()).toBe("custom-token-456");
  });

  it("should use default key when not specified", () => {
    sessionStorage.setItem("pages-dev-auth-token", "default-key-token");
    const tokenFn = createDevAuthTokenFn();
    expect(tokenFn()).toBe("default-key-token");
  });

  it("should return null on sessionStorage error", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: () => { throw new Error("Storage access denied"); },
      },
      writable: true,
    });

    const tokenFn = createDevAuthTokenFn();
    expect(tokenFn()).toBeNull();
  });
});
