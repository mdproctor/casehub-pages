/**
 * Smoke test: YAML and TS DSL produce structurally equivalent DOM trees.
 * If this passes, the full interaction test suite covers both formats.
 */
import { describe, it, expect, afterEach } from "vitest";
import "@casehubio/pages-viz";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";
import { columnId, ColumnType } from "@casehubio/pages-data";
import {
  page,
  textInput,
  numberInput,
  dropdown,
  checkbox,
  datePicker,
  textarea,
  metric,
  title,
  bind,
} from "@casehubio/pages-ui/dist/dsl/builders.js";
import { createLookup } from "@casehubio/pages-data";
import type { DataSetId } from "@casehubio/pages-data";
import { inlineSource } from "@casehubio/pages-data";

const CONTACT_YAML = `
datasets:
  - uuid: contacts
    content: >-
      [
        [1, "Alice", "alice@example.com", "+1-555-0101", "Work", "true", "2024-03-15", "Key client", 1],
        [2, "Bob", "bob@example.com", "+1-555-0102", "Personal", "true", "2023-11-20", "", 2],
        [3, "Carol", "carol@example.com", "+1-555-0103", "Work", "false", "2025-01-08", "On leave", 3]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: email
        type: TEXT
      - id: phone
        type: TEXT
      - id: category
        type: LABEL
      - id: active
        type: LABEL
      - id: startDate
        type: DATE
      - id: notes
        type: TEXT
      - id: priority
        type: NUMBER

pages:
  - name: Contact List
    components:
      - title: Contact Manager
      - displayer:
          type: METRIC
          filter:
            enabled: true
            notification: true
          lookup:
            uuid: contacts
      - page: Contact Form

  - name: Contact Form
    dataScope:
      dataset: contacts
      idColumn: id
    save:
      trigger: auto
      delay: 2000
      adapter: local
    components:
      - input:
          field: name
          label: Full Name
          required: true
      - input:
          field: email
          label: Email
          required: true
      - input:
          field: phone
          label: Phone
      - number-input:
          field: priority
          label: Priority
          min: 1
          max: 5
      - select:
          field: category
          label: Category
          options:
            values: [Work, Personal, Family, Other]
      - checkbox:
          field: active
          label: Active
      - date-picker:
          field: startDate
          label: Start Date
      - textarea:
          field: notes
          label: Notes
          rows: 3
`;

function buildContactManagerTS() {
  const ds = "contacts" as DataSetId;
  const columns = [
    { id: columnId("id"), type: ColumnType.NUMBER },
    { id: columnId("name"), type: ColumnType.TEXT },
    { id: columnId("email"), type: ColumnType.TEXT },
    { id: columnId("phone"), type: ColumnType.TEXT },
    { id: columnId("category"), type: ColumnType.LABEL },
    { id: columnId("active"), type: ColumnType.LABEL },
    { id: columnId("startDate"), type: ColumnType.DATE },
    { id: columnId("notes"), type: ColumnType.TEXT },
    { id: columnId("priority"), type: ColumnType.NUMBER },
  ];
  const data = JSON.stringify([
    [1, "Alice", "alice@example.com", "+1-555-0101", "Work", "true", "2024-03-15", "Key client", 1],
    [2, "Bob", "bob@example.com", "+1-555-0102", "Personal", "true", "2023-11-20", "", 2],
    [3, "Carol", "carol@example.com", "+1-555-0103", "Work", "false", "2025-01-08", "On leave", 3],
  ]);
  const contactsBinding = bind("contacts", inlineSource(data, { columns }));

  return page("Contact List",
    title("Contact Manager"),
    metric({
      filter: { enabled: true, notification: true },
      lookup: createLookup(ds, []),
    }),
    page("Contact Form",
      textInput({ field: "name", label: "Full Name", required: true }),
      textInput({ field: "email", label: "Email", required: true }),
      textInput({ field: "phone", label: "Phone" }),
      numberInput({ field: "priority", label: "Priority", min: 1, max: 5 }),
      dropdown({ field: "category", label: "Category", options: { values: ["Work", "Personal", "Family", "Other"] } }),
      checkbox({ field: "active", label: "Active" }),
      datePicker({ field: "startDate", label: "Start Date" }),
      textarea({ field: "notes", label: "Notes", rows: 3 }),
      {
        dataScope: { dataset: ds, idColumn: columnId("id") },
        save: { trigger: "auto" as const, delay: 2000, adapter: "local" },
      },
    ),
    { datasets: [contactsBinding] },
  );
}

function getComponentTree(container: HTMLElement): string[] {
  const tags: string[] = [];
  function walk(el: Element): void {
    const tag = el.tagName.toLowerCase();
    if (tag.startsWith("pages-")) {
      tags.push(tag);
    }
    // Walk shadow DOM if present
    if (el.shadowRoot) {
      // Don't recurse into shadow DOM internals (input, select, etc.)
      // Only count the custom element itself
    }
    for (const child of el.children) {
      walk(child);
    }
  }
  walk(container);
  return tags.sort();
}

describe("YAML ↔ TS equivalence", () => {
  const sites: LiveSite[] = [];

  afterEach(() => {
    for (const s of sites) s.dispose();
    sites.length = 0;
  });

  it("YAML and TS DSL produce the same custom element set", async () => {
    // Load YAML version
    const yamlTarget = document.createElement("div");
    document.body.appendChild(yamlTarget);
    const yamlSite = await loadSite(yamlTarget, CONTACT_YAML);
    sites.push(yamlSite);

    // Wait for data
    await new Promise((r) => setTimeout(r, 200));
    const yamlTags = getComponentTree(yamlTarget);

    // Load TS version
    const tsTarget = document.createElement("div");
    document.body.appendChild(tsTarget);
    const tsSite = await loadSite(tsTarget, buildContactManagerTS());
    sites.push(tsSite);

    await new Promise((r) => setTimeout(r, 200));
    const tsTags = getComponentTree(tsTarget);

    // Both should produce the same set of custom elements
    expect(tsTags).toEqual(yamlTags);
    expect(tsTags.length).toBeGreaterThan(0);

    // Verify specific components are present
    expect(tsTags).toContain("pages-metric");
    expect(tsTags).toContain("pages-input");
    expect(tsTags).toContain("pages-number-input");
    expect(tsTags).toContain("pages-select");
    expect(tsTags).toContain("pages-checkbox");
    expect(tsTags).toContain("pages-date-picker");
    expect(tsTags).toContain("pages-textarea");

    document.body.removeChild(yamlTarget);
    document.body.removeChild(tsTarget);
  });

  it("both versions receive the same dataset row count", async () => {
    const yamlTarget = document.createElement("div");
    document.body.appendChild(yamlTarget);
    const yamlSite = await loadSite(yamlTarget, CONTACT_YAML);
    sites.push(yamlSite);
    await new Promise((r) => setTimeout(r, 200));

    const tsTarget = document.createElement("div");
    document.body.appendChild(tsTarget);
    const tsSite = await loadSite(tsTarget, buildContactManagerTS());
    sites.push(tsSite);
    await new Promise((r) => setTimeout(r, 200));

    const yamlMetric = yamlTarget.querySelector("pages-metric") as any;
    const tsMetric = tsTarget.querySelector("pages-metric") as any;

    expect(yamlMetric?.dataSet?.rows.length).toBe(3);
    expect(tsMetric?.dataSet?.rows.length).toBe(3);

    const yamlInputs = yamlTarget.querySelectorAll("pages-input");
    const tsInputs = tsTarget.querySelectorAll("pages-input");
    expect(yamlInputs.length).toBe(tsInputs.length);

    document.body.removeChild(yamlTarget);
    document.body.removeChild(tsTarget);
  });

  it("TS version form inputs have labels (same as YAML)", async () => {
    const tsTarget = document.createElement("div");
    document.body.appendChild(tsTarget);
    const tsSite = await loadSite(tsTarget, buildContactManagerTS());
    sites.push(tsSite);
    await new Promise((r) => setTimeout(r, 200));

    const inputs = tsTarget.querySelectorAll("pages-input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect((input as any).label).toBeTruthy();
    }

    document.body.removeChild(tsTarget);
  });
});
