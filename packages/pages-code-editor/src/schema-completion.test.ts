import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  buildYamlContext,
  navigateSchema,
  schemaToCompletions,
} from "./schema-completion.js";
import { dashboardSchema } from "@casehubio/pages-schema";

describe("buildYamlContext", () => {
  it("returns empty path at top level", () => {
    const ctx = buildYamlContext("", 0);
    expect(ctx.path).toEqual([]);
  });

  it("returns empty path for single-line content", () => {
    const doc = "pag";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path).toEqual([]);
  });

  it("builds ancestor path from indented YAML", () => {
    const doc = "pages:\n  - components:\n      - type: ";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path).toContain("pages");
    expect(ctx.path).toContain("components");
  });

  it("builds path through list items in compact YAML", () => {
    const doc = "pages:\n- name: index\n  rows:\n    ";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path).toContain("pages");
    expect(ctx.path).toContain("rows");
  });

  it("collects siblings from list item peers", () => {
    const doc = "- type: bar-chart\n  properties:\n    ";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path).toContain("properties");
    expect(ctx.siblings).toBeDefined();
  });

  it("extracts sibling key-value pairs", () => {
    const doc = "  - type: bar-chart\n    properties:\n      sub";
    const pos = doc.length;
    const ctx = buildYamlContext(doc, pos);
    expect(ctx.siblings).toBeDefined();
  });

  it("skips blank lines", () => {
    const doc = "pages:\n\n  - name: ";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path).toContain("pages");
  });
});

describe("navigateSchema", () => {
  const testSchema = z.object({
    pages: z.array(z.object({
      name: z.string().optional(),
      components: z.array(z.object({
        type: z.string(),
        visible: z.boolean().optional(),
      })),
    })),
    properties: z.record(z.string()),
  });

  it("returns root schema for empty path", () => {
    const result = navigateSchema(testSchema, []);
    expect(result).toBe(testSchema);
  });

  it("descends into object keys", () => {
    const result = navigateSchema(testSchema, ["pages"]);
    expect(result).toBeDefined();
  });

  it("descends through arrays to element schema", () => {
    const result = navigateSchema(testSchema, ["pages", "name"]);
    expect(result).toBeDefined();
  });

  it("descends through nested arrays", () => {
    const result = navigateSchema(testSchema, ["pages", "components", "type"]);
    expect(result).toBeDefined();
  });

  it("returns null for unknown key", () => {
    const result = navigateSchema(testSchema, ["nonexistent"]);
    expect(result).toBeNull();
  });

  it("unwraps optionals", () => {
    const schema = z.object({ foo: z.string().optional() });
    const result = navigateSchema(schema, ["foo"]);
    expect(result).toBeDefined();
  });

  it("handles discriminated union with sibling type", () => {
    const union = z.discriminatedUnion("type", [
      z.object({ type: z.literal("a"), props: z.object({ x: z.number() }) }),
      z.object({ type: z.literal("b"), props: z.object({ y: z.string() }) }),
    ]);
    const result = navigateSchema(union, ["props"], { type: "a" });
    expect(result).toBeDefined();
    if (result && result instanceof z.ZodObject) {
      expect("x" in result.shape).toBe(true);
    }
  });

  it("returns null for discriminated union without sibling type", () => {
    const union = z.discriminatedUnion("type", [
      z.object({ type: z.literal("a"), props: z.object({ x: z.number() }) }),
      z.object({ type: z.literal("b"), props: z.object({ y: z.string() }) }),
    ]);
    const result = navigateSchema(union, ["props"]);
    expect(result).toBeNull();
  });
});

describe("schemaToCompletions", () => {
  it("produces key completions from ZodObject", () => {
    const schema = z.object({
      title: z.string(),
      visible: z.boolean(),
      count: z.number(),
    });
    const completions = schemaToCompletions(schema);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("title");
    expect(labels).toContain("visible");
    expect(labels).toContain("count");
  });

  it("sets type to property for object keys", () => {
    const schema = z.object({ foo: z.string() });
    const completions = schemaToCompletions(schema);
    expect(completions[0]?.type).toBe("property");
  });

  it("appends colon-space to property apply text", () => {
    const schema = z.object({ title: z.string() });
    const completions = schemaToCompletions(schema);
    expect(completions[0]?.apply).toBe("title: ");
  });

  it("produces value completions from ZodEnum", () => {
    const schema = z.enum(["asc", "desc"]);
    const completions = schemaToCompletions(schema);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("asc");
    expect(labels).toContain("desc");
  });

  it("sets type to enum for enum values", () => {
    const schema = z.enum(["a", "b"]);
    const completions = schemaToCompletions(schema);
    expect(completions[0]?.type).toBe("enum");
  });

  it("produces true/false from ZodBoolean", () => {
    const schema = z.boolean();
    const completions = schemaToCompletions(schema);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("true");
    expect(labels).toContain("false");
  });

  it("produces literal value from ZodLiteral", () => {
    const schema = z.literal("fixed-value");
    const completions = schemaToCompletions(schema);
    expect(completions[0]?.label).toBe("fixed-value");
  });

  it("returns empty for ZodNumber", () => {
    const schema = z.number();
    const completions = schemaToCompletions(schema);
    expect(completions).toEqual([]);
  });

  it("returns empty for ZodString", () => {
    const schema = z.string();
    const completions = schemaToCompletions(schema);
    expect(completions).toEqual([]);
  });

  it("uses description as detail text", () => {
    const schema = z.object({
      subtype: z.enum(["a", "b"]).describe("chart variant"),
    });
    const completions = schemaToCompletions(schema);
    const subtype = completions.find(c => c.label === "subtype");
    expect(subtype?.detail).toBe("chart variant");
  });

  it("handles discriminated union by listing type key + common keys", () => {
    const union = z.discriminatedUnion("type", [
      z.object({ type: z.literal("a"), props: z.string().optional() }),
      z.object({ type: z.literal("b"), props: z.string().optional() }),
    ]);
    const completions = schemaToCompletions(union);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("type");
    expect(labels).toContain("props");
  });

  it("merges completions from ZodUnion branches", () => {
    const union = z.union([
      z.object({ x: z.number() }),
      z.object({ y: z.string() }),
    ]);
    const completions = schemaToCompletions(union);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("x");
    expect(labels).toContain("y");
  });
});

describe("integration with dashboardSchema", () => {
  const sampleYaml = `pages:
- name: index
  rows:
  - columns:
    - span: 4
      components:
      - type: metric
        properties:
          text: Revenue
          value: "$48,200"
    - span: 8
      components:
      - type: bar-chart
        properties:
          chart:
            title: Monthly Sales
          lookup:
            uuid: sales
datasets:
- uuid: sales
  url: https://api.example.com/data`;

  it("resolves top-level context and navigates dashboardSchema", () => {
    const ctx = buildYamlContext(sampleYaml, 0);
    expect(ctx.path).toEqual([]);
    const result = navigateSchema(dashboardSchema, []);
    expect(result).toBeDefined();
    const completions = schemaToCompletions(result!);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("pages");
    expect(labels).toContain("datasets");
    expect(labels).toContain("properties");
  });

  it("navigates to pages array and gets page keys", () => {
    const doc = "pages:\n- name: index\n  ";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path).toContain("pages");
    const result = navigateSchema(dashboardSchema, ctx.path, ctx.siblings);
    expect(result).toBeDefined();
    if (result) {
      const completions = schemaToCompletions(result);
      const labels = completions.map(c => c.label);
      expect(labels).toContain("name");
      expect(labels).toContain("components");
      expect(labels).toContain("rows");
    }
  });

  it("navigates into component properties with type sibling", () => {
    const doc = "pages:\n- name: index\n  rows:\n  - columns:\n    - span: 4\n      components:\n      - type: metric\n        properties:\n          ";
    const ctx = buildYamlContext(doc, doc.length);
    expect(ctx.path.length).toBeGreaterThan(0);
    expect(ctx.path).toContain("properties");
    expect(ctx.siblings.type).toBe("metric");
  });

  it("produces different completions at different positions", () => {
    const doc = "pages:\n- name: test\n  components:\n  - type: metric\n    properties:\n      ";

    // Top level: cursor at pos 0
    const top = buildYamlContext("", 0);
    const topSchema = navigateSchema(dashboardSchema, top.path, top.siblings);
    const topLabels = topSchema ? schemaToCompletions(topSchema).map(c => c.label) : [];
    expect(topLabels).toContain("pages");
    expect(topLabels).not.toContain("columns");

    // Inside properties at end of doc (indent 6)
    const propsCtx = buildYamlContext(doc, doc.length);
    const propsSchema = navigateSchema(dashboardSchema, propsCtx.path, propsCtx.siblings);
    const propsLabels = propsSchema ? schemaToCompletions(propsSchema).map(c => c.label) : [];
    // Should include metric-specific properties, not just "columns"
    expect(propsLabels).toContain("title");
    expect(propsLabels).toContain("subtype");
    expect(propsLabels).toContain("trend");
    expect(propsLabels.length).toBeGreaterThan(5);
  });

  it("produces completions at empty top level", () => {
    const doc = "";
    const ctx = buildYamlContext(doc, 0);
    const result = navigateSchema(dashboardSchema, ctx.path, ctx.siblings);
    expect(result).toBeDefined();
    const completions = schemaToCompletions(result!);
    expect(completions.length).toBeGreaterThan(0);
    const labels = completions.map(c => c.label);
    expect(labels).toContain("pages");
  });
});
