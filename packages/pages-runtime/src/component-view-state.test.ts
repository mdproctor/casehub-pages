import { describe, it, expect } from "vitest";
import type { ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";
import {
  createComponentViewState,
  updateSort,
  updatePage,
  getComponentState,
} from "./component-view-state.js";

const sort = (col: string, order: "ASCENDING" | "DESCENDING"): SortColumn => ({
  columnId: col as ColumnId,
  order,
});

describe("ComponentViewState", () => {
  it("createComponentViewState returns empty map", () => {
    const state = createComponentViewState();
    expect(state.size).toBe(0);
  });

  it("getComponentState returns undefined for unknown component", () => {
    const state = createComponentViewState();
    expect(getComponentState(state, "unknown")).toBeUndefined();
  });

  it("updateSort sets sort for a component", () => {
    const state = createComponentViewState();
    updateSort(state, "t1", sort("Revenue", "DESCENDING"));
    const cs = getComponentState(state, "t1");
    expect(cs?.sort?.columnId).toBe("Revenue");
    expect(cs?.sort?.order).toBe("DESCENDING");
  });

  it("updateSort with undefined clears sort", () => {
    const state = createComponentViewState();
    updateSort(state, "t1", sort("Revenue", "ASCENDING"));
    updateSort(state, "t1", undefined);
    const cs = getComponentState(state, "t1");
    expect(cs?.sort).toBeUndefined();
  });

  it("updatePage sets page for a component", () => {
    const state = createComponentViewState();
    updatePage(state, "t1", 3);
    expect(getComponentState(state, "t1")?.page).toBe(3);
  });

  it("updatePage with undefined clears page", () => {
    const state = createComponentViewState();
    updatePage(state, "t1", 5);
    updatePage(state, "t1", undefined);
    expect(getComponentState(state, "t1")?.page).toBeUndefined();
  });

  it("sort and page are independent per component", () => {
    const state = createComponentViewState();
    updateSort(state, "t1", sort("A", "ASCENDING"));
    updatePage(state, "t2", 7);
    expect(getComponentState(state, "t1")?.sort?.columnId).toBe("A");
    expect(getComponentState(state, "t1")?.page).toBeUndefined();
    expect(getComponentState(state, "t2")?.sort).toBeUndefined();
    expect(getComponentState(state, "t2")?.page).toBe(7);
  });

  it("updateSort replaces previous sort (no accumulation)", () => {
    const state = createComponentViewState();
    updateSort(state, "t1", sort("A", "ASCENDING"));
    updateSort(state, "t1", sort("B", "DESCENDING"));
    expect(getComponentState(state, "t1")?.sort?.columnId).toBe("B");
    expect(getComponentState(state, "t1")?.sort?.order).toBe("DESCENDING");
  });

  it("updateSort preserves existing page", () => {
    const state = createComponentViewState();
    updatePage(state, "t1", 5);
    updateSort(state, "t1", sort("X", "ASCENDING"));
    expect(getComponentState(state, "t1")?.page).toBe(5);
  });

  it("updatePage preserves existing sort", () => {
    const state = createComponentViewState();
    updateSort(state, "t1", sort("X", "ASCENDING"));
    updatePage(state, "t1", 3);
    expect(getComponentState(state, "t1")?.sort?.columnId).toBe("X");
  });
});
