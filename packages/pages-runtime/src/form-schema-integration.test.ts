import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@casehubio/pages-viz";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";

const SCHEMA_FORM_YAML = `
datasets:
  - uuid: devs
    content: >-
      [
        [1, "Alice", "Java", 8],
        [2, "Bob", "TypeScript", 3]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: language
        type: LABEL
      - id: years
        type: NUMBER

pages:
  - name: Dev List
    components:
      - type: table
        properties:
          lookup:
            uuid: devs
          filter:
            enabled: true
            notification: true

      - page: Edit Dev

  - name: Edit Dev
    dataScope:
      dataset: devs
      idColumn: id
    save:
      trigger: auto
      delay: 2000
      adapter: local
    components:
      - schema-form:
          excludeFields: [id]
`;

const SCHEMA_FORM_EXPLICIT_YAML = `
datasets:
  - uuid: items
    content: >-
      [
        [1, "Widget", 9.99, "true"]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: price
        type: NUMBER
      - id: active
        type: LABEL

pages:
  - name: Edit Item
    dataScope:
      dataset: items
      idColumn: id
    save:
      trigger: auto
      delay: 1000
      adapter: local
    components:
      - schema-form:
          schema:
            properties:
              name: { type: string, minLength: 1 }
              price: { type: number, minimum: 0 }
              active: { type: boolean }
            required: [name]
          excludeFields: [id]
`;

describe("schema-form runtime integration", () => {
  let target: HTMLDivElement;
  let site: LiveSite | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    site?.dispose();
    site = null;
    document.body.removeChild(target);
  });

  async function waitFor(
    condition: () => boolean,
    msg: string,
    maxWait = 1000,
  ): Promise<void> {
    const start = Date.now();
    while (!condition() && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!condition()) throw new Error(`Timeout: ${msg}`);
  }

  it("loadSite activates schema-form with auto-derived schema", async () => {
    site = await loadSite(target, SCHEMA_FORM_YAML);
    const schemaForm = target.querySelector("pages-schema-form");
    expect(schemaForm).not.toBeNull();

    await waitFor(
      () => !!(schemaForm as any).dataSet,
      "schema-form receives data",
    );

    const children = schemaForm!.shadowRoot!.querySelectorAll(
      "pages-input, pages-number-input, pages-select",
    );
    expect(children.length).toBeGreaterThan(0);
  });

  it("schema-form is editable when page has save config", async () => {
    site = await loadSite(target, SCHEMA_FORM_YAML);
    const schemaForm = target.querySelector("pages-schema-form");
    await waitFor(
      () => !!(schemaForm as any).dataSet,
      "schema-form receives data",
    );
    expect((schemaForm as any).editable).toBe(true);
  });

  it("field change from schema-form child is handled without crash", async () => {
    site = await loadSite(target, SCHEMA_FORM_YAML);
    const schemaForm = target.querySelector("pages-schema-form");
    await waitFor(
      () => !!(schemaForm as any).dataSet,
      "schema-form receives data",
    );

    const textInput = schemaForm!.shadowRoot!.querySelector("pages-input");
    expect(textInput).not.toBeNull();

    textInput!.dispatchEvent(
      new CustomEvent("pages-field-change", {
        bubbles: true, composed: true,
        detail: { field: "name", value: "Updated", committed: true },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
  });

  it("explicit schema renders correct component types", async () => {
    site = await loadSite(target, SCHEMA_FORM_EXPLICIT_YAML);
    const schemaForm = target.querySelector("pages-schema-form");
    await waitFor(
      () => !!(schemaForm as any).dataSet,
      "schema-form receives data",
    );

    expect(schemaForm!.shadowRoot!.querySelector("pages-input")).not.toBeNull();
    expect(schemaForm!.shadowRoot!.querySelector("pages-number-input")).not.toBeNull();
    expect(schemaForm!.shadowRoot!.querySelector("pages-checkbox")).not.toBeNull();
  });

  it("schema-form without save config is not editable", async () => {
    const yaml = `
datasets:
  - uuid: items
    content: >-
      [["A", 1]]
    columns:
      - id: name
        type: TEXT
      - id: qty
        type: NUMBER

pages:
  - name: ReadOnly
    dataScope:
      dataset: items
      idColumn: name
    components:
      - schema-form: {}
`;
    site = await loadSite(target, yaml);
    const schemaForm = target.querySelector("pages-schema-form");
    await waitFor(
      () => !!(schemaForm as any).dataSet,
      "schema-form receives data",
    );
    expect((schemaForm as any).editable).toBe(false);
  });
});
