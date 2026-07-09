import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {createLocalLayoutStore} from "./layout-store.js";
import type {LayoutState} from "@casehubio/pages-component/dist/model/types.js";

describe("createLocalLayoutStore", () => {
  // Mock localStorage if not available
  let storage: Record<string, string> = {};

  beforeAll(() => {
    if (typeof localStorage === "undefined") {
      global.localStorage = {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => { storage[key] = value; },
        removeItem: (key: string) => { delete storage[key]; },
        clear: () => { storage = {}; },
        length: 0,
        key: () => null,
      };
    }
  });

  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    storage = {};
  });

  const sampleState: LayoutState = {
    splits: { "main-split": [60, 40] },
    docks: { "sidebar": false },
    panels: { "editor": { typeName: "diff-viewer" } },
  };

  it("round-trips save and load", async () => {
    const store = createLocalLayoutStore();
    await store.save("test-key", sampleState);
    const loaded = await store.load("test-key");
    expect(loaded).toEqual(sampleState);
  });

  it("returns null for missing key", async () => {
    const store = createLocalLayoutStore();
    const loaded = await store.load("nonexistent");
    expect(loaded).toBeNull();
  });

  it("uses prefix for localStorage keys", async () => {
    const store = createLocalLayoutStore("my-prefix:");
    await store.save("key1", sampleState);
    expect(localStorage.getItem("my-prefix:key1")).not.toBeNull();
    expect(localStorage.getItem("pages-layout:key1")).toBeNull();
  });

  it("uses default prefix pages-layout:", async () => {
    const store = createLocalLayoutStore();
    await store.save("key1", sampleState);
    expect(localStorage.getItem("pages-layout:key1")).not.toBeNull();
  });

  it("delete removes entry", async () => {
    const store = createLocalLayoutStore();
    await store.save("key1", sampleState);
    await store.delete("key1");
    const loaded = await store.load("key1");
    expect(loaded).toBeNull();
  });

  it("delete on missing key is no-op", async () => {
    const store = createLocalLayoutStore();
    await expect(store.delete("nonexistent")).resolves.toBeUndefined();
  });

  it("returns null on corrupted JSON", async () => {
    const store = createLocalLayoutStore();
    localStorage.setItem("pages-layout:corrupt", "not-json{{{");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loaded = await store.load("corrupt");
    expect(loaded).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("save catches QuotaExceededError and logs warning", async () => {
    const store = createLocalLayoutStore();
    const original = localStorage.setItem;
    localStorage.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(store.save("key1", sampleState)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    localStorage.setItem = original;
  });
});
