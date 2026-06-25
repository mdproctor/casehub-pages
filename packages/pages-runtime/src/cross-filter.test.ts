import { describe, it, expect } from "vitest";
import { createFilterState, updateFilter, collectAncestorFilterOps, clearPageFilters } from "./cross-filter.js";

describe("collectAncestorFilterOps", () => {
  it("collects filters from ancestor pages", () => {
    const fs = createFilterState();
    updateFilter(fs, "Employee List", undefined, "id", ["42"], false);
    const ops = collectAncestorFilterOps(fs, "Employee List/Employee Form", undefined);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("filter");
  });

  it("collects filters from own page AND ancestors", () => {
    const fs = createFilterState();
    updateFilter(fs, "Root", undefined, "region", ["North"], false);
    updateFilter(fs, "Root/Child", undefined, "dept", ["Eng"], false);
    const ops = collectAncestorFilterOps(fs, "Root/Child", undefined);
    expect(ops).toHaveLength(2);
  });

  it("collects from deeply nested paths", () => {
    const fs = createFilterState();
    updateFilter(fs, "A", undefined, "x", ["1"], false);
    updateFilter(fs, "A/B", undefined, "y", ["2"], false);
    const ops = collectAncestorFilterOps(fs, "A/B/C", undefined);
    expect(ops).toHaveLength(2);
  });

  it("returns empty for pages with no ancestor filters", () => {
    const fs = createFilterState();
    const ops = collectAncestorFilterOps(fs, "Orphan/Child", undefined);
    expect(ops).toHaveLength(0);
  });

  it("respects filter groups when walking ancestors", () => {
    const fs = createFilterState();
    updateFilter(fs, "Root", "g1", "col", ["val"], false);
    const withGroup = collectAncestorFilterOps(fs, "Root/Child", "g1");
    expect(withGroup).toHaveLength(1);
    const wrongGroup = collectAncestorFilterOps(fs, "Root/Child", "g2");
    expect(wrongGroup).toHaveLength(0);
  });
});

describe("clearPageFilters", () => {
  it("clears all filters for a specific page", () => {
    const fs = createFilterState();
    updateFilter(fs, "Sales", undefined, "region", ["North"], false);
    updateFilter(fs, "Sales", undefined, "year", ["2024"], false);
    clearPageFilters(fs, "Sales");
    const ops = collectAncestorFilterOps(fs, "Sales", undefined);
    expect(ops).toHaveLength(0);
  });

  it("does not affect other pages", () => {
    const fs = createFilterState();
    updateFilter(fs, "Sales", undefined, "region", ["North"], false);
    updateFilter(fs, "HR", undefined, "dept", ["Eng"], false);
    clearPageFilters(fs, "Sales");
    const salesOps = collectAncestorFilterOps(fs, "Sales", undefined);
    const hrOps = collectAncestorFilterOps(fs, "HR", undefined);
    expect(salesOps).toHaveLength(0);
    expect(hrOps).toHaveLength(1);
  });

  it("no-op for page with no filters", () => {
    const fs = createFilterState();
    clearPageFilters(fs, "Unknown");
    expect(fs.size).toBe(0);
  });

  it("clears grouped filters", () => {
    const fs = createFilterState();
    updateFilter(fs, "Sales", "g1", "region", ["North"], false);
    updateFilter(fs, "Sales", undefined, "year", ["2024"], false);
    clearPageFilters(fs, "Sales");
    const ops = collectAncestorFilterOps(fs, "Sales", "g1");
    expect(ops).toHaveLength(0);
  });
});
