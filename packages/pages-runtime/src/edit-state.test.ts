import { describe, it, expect } from "vitest";
import { createEditState, updateEditState, clearEditState, getEditState, isDirty } from "./edit-state.js";

describe("EditState", () => {
  it("tracks dirty fields per page", () => {
    const es = createEditState();
    updateEditState(es, "Form", "name", "Bob");
    expect(isDirty(es, "Form")).toBe(true);
    expect(getEditState(es, "Form")!.get("name")).toBe("Bob");
  });

  it("clears state for a page", () => {
    const es = createEditState();
    updateEditState(es, "Form", "name", "Bob");
    clearEditState(es, "Form");
    expect(isDirty(es, "Form")).toBe(false);
  });

  it("tracks multiple fields independently", () => {
    const es = createEditState();
    updateEditState(es, "Form", "name", "Bob");
    updateEditState(es, "Form", "age", 30);
    expect(getEditState(es, "Form")!.size).toBe(2);
  });

  it("isolates pages", () => {
    const es = createEditState();
    updateEditState(es, "Page1", "x", 1);
    updateEditState(es, "Page2", "y", 2);
    clearEditState(es, "Page1");
    expect(isDirty(es, "Page1")).toBe(false);
    expect(isDirty(es, "Page2")).toBe(true);
  });
});
