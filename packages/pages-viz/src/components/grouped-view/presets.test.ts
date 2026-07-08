import { describe, it, expect } from "vitest";
import { resolvePreset } from "./presets.js";
import type { GroupedViewProps } from "@casehubio/pages-component";
import type { ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";

function minProps(overrides: Partial<GroupedViewProps> = {}): GroupedViewProps {
  return {
    lookup: { dataSetId: "test", operations: [] } as unknown as GroupedViewProps["lookup"],
    groupBy: {
      sourceId: "status" as ColumnId,
      columnId: "status" as ColumnId,
      strategy: { mode: "distinct" as const },
      maxIntervals: 100,
      emptyIntervals: false,
      ascendingOrder: true,
    },
    ...overrides,
  };
}

describe("resolvePreset", () => {
  it("defaults to sectioned when no preset or modes given", () => {
    const result = resolvePreset(minProps());
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "table" });
  });

  it("resolves spreadsheet preset", () => {
    const result = resolvePreset(minProps({ preset: "spreadsheet" }));
    expect(result).toEqual({ groupDisplay: "table-row", contentDisplay: "table" });
  });

  it("resolves sectioned preset", () => {
    const result = resolvePreset(minProps({ preset: "sectioned" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "table" });
  });

  it("resolves list preset", () => {
    const result = resolvePreset(minProps({ preset: "list" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "list" });
  });

  it("explicit contentDisplay overrides preset", () => {
    const result = resolvePreset(minProps({ preset: "sectioned", contentDisplay: "list" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "list" });
  });

  it("explicit groupDisplay overrides preset", () => {
    const result = resolvePreset(minProps({ preset: "spreadsheet", groupDisplay: "section-heading" }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "table" });
  });

  it("fully explicit modes ignore preset", () => {
    const result = resolvePreset(minProps({
      preset: "spreadsheet",
      groupDisplay: "section-heading",
      contentDisplay: "list",
    }));
    expect(result).toEqual({ groupDisplay: "section-heading", contentDisplay: "list" });
  });

  it("throws on invalid combination table-row + list", () => {
    expect(() => resolvePreset(minProps({
      groupDisplay: "table-row",
      contentDisplay: "list",
    }))).toThrow(/invalid.*combination/i);
  });
});
