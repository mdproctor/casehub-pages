import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@casehub/pages-viz";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";
import type { TypedDataSet } from "@casehub/pages-data/dist/dataset/types.js";
import { columnId } from "@casehub/pages-data/dist/dataset/types.js";

interface DataElement extends HTMLElement {
  dataSet?: TypedDataSet;
  editable?: boolean;
  error?: string;
}

const CONTACT_MANAGER_YAML = `
datasets:
  - uuid: contacts
    content: >-
      [
        [1, "Alice", "alice@example.com", "Work", "true"],
        [2, "Bob", "bob@example.com", "Personal", "false"],
        [3, "Carol", "carol@example.com", "Work", "true"]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: email
        type: TEXT
      - id: category
        type: LABEL
      - id: active
        type: LABEL

pages:
  - name: Contact List
    components:
      - displayer:
          type: TABLE
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
      - text-input:
          field: name
          label: Name
      - text-input:
          field: email
          label: Email
      - dropdown:
          field: category
          label: Category
          options:
            values: [Work, Personal, Family]
      - checkbox:
          field: active
          label: Active
`;

describe("form integration — YAML end-to-end", () => {
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

  function getFormInputs(): DataElement[] {
    return Array.from(
      target.querySelectorAll(
        "casehub-text-input, casehub-number-input, casehub-dropdown, casehub-checkbox, casehub-date-picker, casehub-textarea"
      ),
    );
  }

  function getTable(): DataElement | null {
    return target.querySelector("casehub-table");
  }

  it("loadSite renders table and form inputs from YAML", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const table = getTable();
    expect(table).not.toBeNull();

    await waitFor(() => !!table!.dataSet, "table data");
    expect(table!.dataSet!.rows.length).toBe(3);

    const inputs = getFormInputs();
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("form inputs receive dataset on initial load", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const inputs = getFormInputs();
    expect(inputs.length).toBeGreaterThan(0);

    await waitFor(() => inputs.every((i) => i.dataSet), "all form inputs have data");

    for (const input of inputs) {
      expect(input.dataSet!.rows.length).toBe(3);
    }
  });

  it("table row click filters form inputs to one record", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const table = getTable();
    await waitFor(() => !!table!.dataSet, "table data");

    const inputs = getFormInputs();
    await waitFor(() => inputs.every((i) => i.dataSet), "form input data");

    // Simulate table row click — emit casehub-filter for id column, row 0
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), rowIndex: 0, reset: false, group: undefined },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    for (const input of inputs) {
      expect(input.dataSet!.rows.length).toBe(1);
    }
  });

  it("clicking a different row updates form inputs to the new record", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const table = getTable();
    await waitFor(() => !!table!.dataSet, "table data");

    const inputs = getFormInputs();
    await waitFor(() => inputs.every((i) => i.dataSet), "form input data");

    // Click row 0 (Alice)
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), rowIndex: 0, reset: false, group: undefined },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    const nameInputs = inputs.filter((i) => i.tagName.toLowerCase() === "casehub-text-input");
    expect(nameInputs.length).toBeGreaterThan(0);
    const nameInput = nameInputs[0]!;
    const aliceNameCell = nameInput.dataSet!.rows[0]!.cell(columnId("name"));
    expect(aliceNameCell.type !== "NULL" && aliceNameCell.value).toBe("Alice");

    // Click row 1 (Bob)
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), rowIndex: 1, reset: false, group: undefined },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    const bobNameCell = nameInput.dataSet!.rows[0]!.cell(columnId("name"));
    expect(bobNameCell.type !== "NULL" && bobNameCell.value).toBe("Bob");
  });

  it("form inputs are editable when page has save config", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const inputs = getFormInputs();
    await waitFor(() => inputs.some((i) => i.dataSet), "form input data");

    for (const input of inputs) {
      expect(input.editable).toBe(true);
    }
  });

  it("form inputs without save config are read-only", async () => {
    const yamlNoSave = `
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
  - name: ReadonlyForm
    dataScope:
      dataset: items
      idColumn: name
    components:
      - text-input:
          field: name
          label: Name
`;

    site = await loadSite(target, yamlNoSave);
    const inputs = getFormInputs();
    expect(inputs.length).toBeGreaterThan(0);

    await waitFor(() => inputs.some((i) => i.dataSet), "form input data");

    for (const input of inputs) {
      expect(input.editable).toBe(false);
    }
  });

  it("clicking different columns in table always filters by idColumn", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const table = getTable();
    await waitFor(() => !!table!.dataSet, "table data");

    const inputs = getFormInputs();
    await waitFor(() => inputs.every((i) => i.dataSet), "form input data");

    // Click Alice's name cell (columnId: "name", rowIndex: 0)
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("name"), rowIndex: 0, reset: false, group: undefined },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    const nameInput = inputs.find((i) => i.tagName.toLowerCase() === "casehub-text-input")!;
    expect(nameInput.dataSet!.rows.length).toBe(1);
    const aliceCell = nameInput.dataSet!.rows[0]!.cell(columnId("name"));
    expect(aliceCell.type !== "NULL" && aliceCell.value).toBe("Alice");

    // Click Bob's email cell (different column! columnId: "email", rowIndex: 1)
    // Without the fix, this would compound: name="Alice" AND email="bob@..."
    // With the fix, it translates to idColumn filter: id=2 (Bob)
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("email"), rowIndex: 1, reset: false, group: undefined },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    expect(nameInput.dataSet!.rows.length).toBe(1);
    const bobCell = nameInput.dataSet!.rows[0]!.cell(columnId("name"));
    expect(bobCell.type !== "NULL" && bobCell.value).toBe("Bob");
  });

  it("selecting a row after text-filtering the table works correctly", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const table = getTable();
    await waitFor(() => !!table!.dataSet, "table data");

    const inputs = getFormInputs();
    await waitFor(() => inputs.every((i) => i.dataSet), "form input data");

    // Select Alice first (row 0)
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), rowIndex: 0, reset: false, group: undefined },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    const nameInput = inputs.find((i) => i.tagName.toLowerCase() === "casehub-text-input")!;
    const aliceNameCell2 = nameInput.dataSet!.rows[0]!.cell(columnId("name"));
    expect(aliceNameCell2.type !== "NULL" && aliceNameCell2.value).toBe("Alice");

    // Now simulate what happens after table text-filter shows only Bob:
    // The table emits with the ROW OBJECT directly (not rowIndex) because
    // the display index doesn't match the dataset index after filtering.
    const bobRow = table!.dataSet!.rows[1]; // Bob is row 1 in the full dataset
    table!.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("name"), row: bobRow, reset: false, group: undefined },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));

    expect(nameInput.dataSet!.rows.length).toBe(1);
    const bobNameCell2 = nameInput.dataSet!.rows[0]!.cell(columnId("name"));
    expect(bobNameCell2.type !== "NULL" && bobNameCell2.value).toBe("Bob");
  });

  it("casehub-field-change events are handled without crash", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const inputs = getFormInputs();
    await waitFor(() => inputs.every((i) => i.dataSet), "form input data");

    const nameInput = inputs.find((i) => i.tagName.toLowerCase() === "casehub-text-input");
    expect(nameInput).toBeDefined();

    nameInput!.dispatchEvent(
      new CustomEvent("casehub-field-change", {
        bubbles: true,
        composed: true,
        detail: { field: "name", value: "Updated", committed: true },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    // No error thrown = pass
  });
});
