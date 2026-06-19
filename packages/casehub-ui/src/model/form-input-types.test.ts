import { describe, it, expect } from "vitest";
import { isFixedOptions } from "./form-input-types.js";
import type { FixedOptions, DataSetOptions } from "./form-input-types.js";

describe("form input type utilities", () => {
  it("isFixedOptions identifies FixedOptions correctly", () => {
    const fixedOpts: FixedOptions = { values: ["Option A", "Option B"] };
    expect(isFixedOptions(fixedOpts)).toBe(true);
  });

  it("isFixedOptions rejects DataSetOptions", () => {
    const datasetOpts: DataSetOptions = {
      dataset: "employees" as any,
      labelColumn: "name",
      valueColumn: "id",
    };
    expect(isFixedOptions(datasetOpts)).toBe(false);
  });
});
