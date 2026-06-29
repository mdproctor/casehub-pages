import { describe, it, expect } from "vitest";
import { evaluateGenerator } from "./expression-generator.js";
import { createPresetRegistry } from "./presets/registry.js";
import { columnId, ColumnType } from "../types.js";

describe("evaluateGenerator", () => {
  const presetRegistry = createPresetRegistry();

  it("evaluates a JSONata expression that produces rows", async () => {
    const result = await evaluateGenerator(
      '[["hello", 42]]',
      [{ id: columnId("name"), type: ColumnType.LABEL }, { id: columnId("value"), type: ColumnType.NUMBER }],
      presetRegistry,
    );

    expect(result.columns).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text(result.columns[0]!.id)).toBe("hello");
    expect(result.rows[0]!.number(result.columns[1]!.id)).toBe(42);
  });

  it("throws error for expression that produces empty array without columns", async () => {
    await expect(
      evaluateGenerator("[]", undefined, presetRegistry),
    ).rejects.toThrow("EMPTY_RESULT");
  });

  it("works without explicit column definitions (infers from data)", async () => {
    const result = await evaluateGenerator(
      '[["test", 1]]',
      undefined,
      presetRegistry,
    );
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(1);
  });

  it("evaluates time-based generator expression", async () => {
    const result = await evaluateGenerator(
      '[$now(), "generated"]',
      [{ id: columnId("timestamp"), type: ColumnType.DATE }, { id: columnId("label"), type: ColumnType.LABEL }],
      presetRegistry,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text(result.columns[1]!.id)).toBe("generated");
  });
});
