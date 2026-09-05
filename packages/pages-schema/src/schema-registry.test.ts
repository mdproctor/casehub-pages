import { describe, it, expect } from "vitest";
import { componentSchemaRegistry } from "./schema-registry.js";

describe("componentSchemaRegistry", () => {
  it("has entries for all 55 component types", () => {
    expect(componentSchemaRegistry.size).toBe(55);
  });

  it("includes chart types", () => {
    expect(componentSchemaRegistry.has("bar-chart")).toBe(true);
    expect(componentSchemaRegistry.has("line-chart")).toBe(true);
    expect(componentSchemaRegistry.has("pie-chart")).toBe(true);
  });

  it("includes data types", () => {
    expect(componentSchemaRegistry.has("data-table")).toBe(true);
    expect(componentSchemaRegistry.has("metric")).toBe(true);
    expect(componentSchemaRegistry.has("grouped-view")).toBe(true);
  });

  it("includes form components", () => {
    expect(componentSchemaRegistry.has("input")).toBe(true);
    expect(componentSchemaRegistry.has("select")).toBe(true);
    expect(componentSchemaRegistry.has("schema-form")).toBe(true);
  });

  it("includes layout components", () => {
    expect(componentSchemaRegistry.has("grid")).toBe(true);
    expect(componentSchemaRegistry.has("columns")).toBe(true);
    expect(componentSchemaRegistry.has("split")).toBe(true);
  });

  it("includes workbench components", () => {
    expect(componentSchemaRegistry.has("dock-bar")).toBe(true);
    expect(componentSchemaRegistry.has("host-panel")).toBe(true);
    expect(componentSchemaRegistry.has("floating-workspace")).toBe(true);
  });

  it("every entry is a valid Zod schema", () => {
    for (const [name, schema] of componentSchemaRegistry) {
      expect(schema, `${name} should be defined`).toBeDefined();
    }
  });
});
