import { describe, it, expect } from "vitest";
import { z } from "zod";
import { lookupSchema, externalDataSetDefSchema } from "../index.js";

describe("public schema exports", () => {
  it("lookupSchema is a Zod schema", () => {
    expect(lookupSchema).toBeDefined();
    expect(lookupSchema instanceof z.ZodType).toBe(true);
  });

  it("lookupSchema parses a valid lookup", () => {
    const result = lookupSchema.parse({ uuid: "ds-1" });
    expect(result.uuid).toBe("ds-1");
  });

  it("externalDataSetDefSchema is a Zod schema", () => {
    expect(externalDataSetDefSchema).toBeDefined();
    expect(externalDataSetDefSchema instanceof z.ZodType).toBe(true);
  });

  it("externalDataSetDefSchema parses a valid URL dataset", () => {
    const result = externalDataSetDefSchema.parse({
      uuid: "ds-1",
      url: "https://api.example.com/data",
    });
    expect(result.uuid).toBe("ds-1");
  });
});
