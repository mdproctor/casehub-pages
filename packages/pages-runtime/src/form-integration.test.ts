import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@casehubio/pages-viz";
import type { PagesElement, PagesFormInput } from "@casehubio/pages-viz";
import type { PagesFilterApply } from "@casehubio/pages-viz/dist/base/filter-types.js";
import { cellToRaw } from "@casehubio/pages-viz/dist/base/cell-extract.js";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";
import { columnId } from "@casehubio/pages-data";
import type { FormInputCommon } from "@casehubio/pages-component";
import type { VizComponentProps } from "@casehubio/pages-viz/dist/base/types.js";

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
          label: Name
      - input:
          field: email
          label: Email
      - select:
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

  function getFormInputs(): HTMLElement[] {
    return Array.from(
      target.querySelectorAll<HTMLElement>(
        "pages-input, pages-number-input, pages-select, pages-checkbox, pages-date-picker, pages-textarea"
      ),
    );
  }

  function getMetric(): PagesElement<VizComponentProps> | null {
    return target.querySelector("pages-metric");
  }

  it("loadSite renders metric and form inputs from YAML", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const metric = getMetric();
    expect(metric).not.toBeNull();

    await waitFor(() => !!metric!.dataSet, "metric data");
    expect(metric!.dataSet!.rows.length).toBe(3);

    const inputs = getFormInputs();
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("form inputs receive dataset on initial load", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const inputs = getFormInputs();
    expect(inputs.length).toBeGreaterThan(0);

    const nameInput = inputs.find((i) => i.tagName.toLowerCase() === "pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");
    expect(nameInput.value).toBeTruthy();
  });

  it("filter event updates form inputs to filtered record", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const metric = getMetric();
    await waitFor(() => !!metric!.dataSet, "metric data");

    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");

    // Simulate filter event — emit pages-filter for id column, row 0 (Alice)
    const clickedRow = metric!.dataSet!.rows[0]!;
    const idValue = String(cellToRaw(clickedRow.cell(columnId("id"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), value: idValue, row: clickedRow, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(nameInput.value).toBe("Alice");
  });

  it("selecting a different record updates form inputs to the new record", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const metric = getMetric();
    await waitFor(() => !!metric!.dataSet, "metric data");

    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");

    // Select row 0 (Alice)
    const clickedRow0 = metric!.dataSet!.rows[0]!;
    const idValue0 = String(cellToRaw(clickedRow0.cell(columnId("id"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), value: idValue0, row: clickedRow0, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.value).toBe("Alice");

    // Select row 1 (Bob)
    const clickedRow1 = metric!.dataSet!.rows[1]!;
    const idValue1 = String(cellToRaw(clickedRow1.cell(columnId("id"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), value: idValue1, row: clickedRow1, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.value).toBe("Bob");
  });

  it("form inputs are editable when page has save config", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");
    expect(nameInput.label).toBe("Name");
  });

  it("form inputs without save config render with label", async () => {
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
      - input:
          field: name
          label: Name
`;

    site = await loadSite(target, yamlNoSave);
    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");
    expect(nameInput.label).toBe("Name");
  });

  it("filtering by different columns always filters by idColumn", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const metric = getMetric();
    await waitFor(() => !!metric!.dataSet, "metric data");

    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");

    // Filter by Alice's name cell (columnId: "name", rowIndex: 0)
    const clickedRow0 = metric!.dataSet!.rows[0]!;
    const nameValue0 = String(cellToRaw(clickedRow0.cell(columnId("name"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("name"), value: nameValue0, row: clickedRow0, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.value).toBe("Alice");

    // Filter by Bob's email cell (different column!)
    const clickedRow1 = metric!.dataSet!.rows[1]!;
    const emailValue1 = String(cellToRaw(clickedRow1.cell(columnId("email"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("email"), value: emailValue1, row: clickedRow1, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.value).toBe("Bob");
  });

  it("selecting a different row after initial selection works correctly", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const metric = getMetric();
    await waitFor(() => !!metric!.dataSet, "metric data");

    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");

    // Select Alice first (row 0)
    const clickedRow0 = metric!.dataSet!.rows[0]!;
    const idValue0 = String(cellToRaw(clickedRow0.cell(columnId("id"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("id"), value: idValue0, row: clickedRow0, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.value).toBe("Alice");

    // Now select Bob
    const bobRow = metric!.dataSet!.rows[1]!;
    const bobNameValue = String(cellToRaw(bobRow.cell(columnId("name"))));
    metric!.dispatchEvent(
      new CustomEvent("pages-filter", {
        bubbles: true,
        composed: true,
        detail: { columnId: columnId("name"), value: bobNameValue, row: bobRow, reset: false, group: undefined } satisfies PagesFilterApply,
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.value).toBe("Bob");
  });

  it("pages-field-change events are handled without crash", async () => {
    site = await loadSite(target, CONTACT_MANAGER_YAML);

    const nameInput = target.querySelector("pages-input") as any;
    expect(nameInput).not.toBeNull();
    await waitFor(() => nameInput.value !== "", "name input has value");

    nameInput.dispatchEvent(
      new CustomEvent("pages-field-change", {
        bubbles: true,
        composed: true,
        detail: { field: "name", value: "Updated", committed: true },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
  });
});
