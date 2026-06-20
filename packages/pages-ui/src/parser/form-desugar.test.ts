import { describe, it, expect } from "vitest";
import { parsePage } from "./page-parser.js";

describe("form input desugaring", () => {
  it("desugars text-input shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ "text-input": { field: "name", label: "Name" } }] }],
    });
    const content = root.slots!.content!;
    const grid = content[0]!;
    const item = grid.items![0]!;
    expect(item.component.type).toBe("text-input");
    expect(item.component.props).toEqual({ field: "name", label: "Name" });
  });

  it("desugars number-input shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ "number-input": { field: "age", min: 0 } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("number-input");
    expect(item.component.props).toEqual({ field: "age", min: 0 });
  });

  it("desugars dropdown with fixed options", () => {
    const root = parsePage({
      pages: [{ components: [{ dropdown: { field: "dept", options: { values: ["A", "B"] } } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("dropdown");
  });

  it("desugars checkbox shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ checkbox: { field: "active" } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("checkbox");
  });

  it("desugars date-picker shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ "date-picker": { field: "start" } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("date-picker");
  });

  it("desugars textarea shorthand", () => {
    const root = parsePage({
      pages: [{ components: [{ textarea: { field: "notes", rows: 5 } }] }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("textarea");
  });
});

describe("page src desugaring", () => {
  it("desugars page with src to lazy-page", () => {
    const root = parsePage({
      pages: [{
        components: [
          { page: "Employee Form", src: "./form.yaml" },
        ],
      }],
    });
    const item = root.slots!.content![0]!.items![0]!;
    expect(item.component.type).toBe("lazy-page");
    expect(item.component.props).toEqual({ name: "Employee Form", href: "./form.yaml" });
  });

  it("desugars page without src to page-ref", () => {
    const root = parsePage({
      pages: [
        { name: "Contact Form", components: [{ html: "Form content" }] },
        { components: [{ page: "Contact Form" }] },
      ],
    });
    // After resolution, only the first page should exist
    expect(root.slots!.content!.length).toBe(1);
    expect(root.slots!.content![0]!.type).toBe("page");
  });

  it("page key without src keeps existing screen handling", () => {
    // This test ensures that the screen shorthand still works (not affected by page+src handling)
    // We just check that screen is still recognized; full navigation resolution is tested elsewhere
    const root = parsePage({
      pages: [
        { name: "LayoutPage", components: [{ html: "Layout content" }] },
        { name: "MainPage", components: [{ screen: "LayoutPage" }] },
      ],
    });
    // The root should have only the first page (LayoutPage gets embedded via the screen ref)
    expect(root.slots!.content!.length).toBe(1);
    expect(root.slots!.content![0]!.type).toBe("page");
  });
});

describe("dataScope and save parsing", () => {
  it("parses dataScope on page", () => {
    const root = parsePage({
      pages: [{
        name: "Form",
        dataScope: { dataset: "emps", idColumn: "id" },
        save: { trigger: "auto", delay: 2000, adapter: "local" },
        components: [{ "text-input": { field: "name" } }],
      }],
    });
    const page = root.slots!.content![0]!;
    expect((page.props as any).dataScope).toEqual({ dataset: "emps", idColumn: "id" });
    expect((page.props as any).save).toEqual({ trigger: "auto", delay: 2000, adapter: "local" });
  });

  it("parses save with adapterConfig from adapter-named key", () => {
    const root = parsePage({
      pages: [{
        name: "Form",
        dataScope: { dataset: "emps", idColumn: "id" },
        save: { trigger: "auto", adapter: "rest", rest: { method: "PATCH" } },
        components: [{ "text-input": { field: "name" } }],
      }],
    });
    const page = root.slots!.content![0]!;
    expect((page.props as any).save.adapterConfig).toEqual({ method: "PATCH" });
  });

  it("parses dataScope with $ref filter", () => {
    const root = parsePage({
      pages: [{
        name: "Projects",
        dataScope: {
          dataset: "projects",
          idColumn: "id",
          filter: { employee_id: { $ref: "employees.id" } },
        },
        components: [{ "text-input": { field: "name" } }],
      }],
    });
    const page = root.slots!.content![0]!;
    const ds = (page.props as any).dataScope;
    expect(ds.filter.employee_id.$ref).toBe("employees.id");
  });
});
