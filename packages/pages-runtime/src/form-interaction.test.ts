/**
 * Real interaction tests for form + table combinations.
 * These tests drive the actual shadow DOM elements (click table cells,
 * type in the filter box) rather than emitting synthetic events.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@casehubio/pages-viz";
import type { CasehubTable } from "@casehubio/pages-viz";
import type { CasehubTextInput } from "@casehubio/pages-viz";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";

const YAML = `
datasets:
  - uuid: contacts
    content: >-
      [
        [1, "Alice", "alice@example.com", "Work"],
        [2, "Bob", "bob@example.com", "Personal"],
        [3, "Carol", "carol@example.com", "Work"]
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

pages:
  - name: Contacts
    components:
      - displayer:
          type: TABLE
          filter:
            enabled: true
            notification: true
          lookup:
            uuid: contacts
      - page: Form

  - name: Form
    dataScope:
      dataset: contacts
      idColumn: id
    save:
      trigger: auto
      delay: 5000
      adapter: local
    components:
      - text-input:
          field: name
          label: Name
      - text-input:
          field: email
          label: Email
`;

describe("form ↔ table interaction (real DOM)", () => {
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
    location.hash = "";
  });

  async function setup(): Promise<{
    tableEl: CasehubTable;
    formInputs: CasehubTextInput[];
  }> {
    site = await loadSite(target, YAML);

    const tableEl = target.querySelector("casehub-table");
    expect(tableEl).not.toBeNull();

    // Wait for table data
    const start = Date.now();
    while (!tableEl!.dataSet && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(tableEl!.dataSet).toBeTruthy();

    // Wait for form inputs
    const formInputs = Array.from(
      target.querySelectorAll("casehub-text-input"),
    );
    expect(formInputs.length).toBeGreaterThan(0);

    const start2 = Date.now();
    while (!formInputs.every((i) => i.dataSet) && Date.now() - start2 < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }

    return { tableEl: tableEl!, formInputs };
  }

  function getTableRows(tableEl: CasehubTable): HTMLTableRowElement[] {
    return Array.from(tableEl.shadowRoot.querySelectorAll("tbody tr"));
  }

  function getFilterInput(tableEl: CasehubTable): HTMLInputElement | null {
    return tableEl.shadowRoot.querySelector(".filter-box input");
  }

  function clickCell(row: HTMLTableRowElement, colIndex: number): void {
    const cells = row.querySelectorAll("td");
    const cell = cells[colIndex];
    expect(cell).toBeDefined();
    cell!.click();
  }

  function typeInFilter(tableEl: CasehubTable, text: string): void {
    const input = getFilterInput(tableEl);
    expect(input).not.toBeNull();
    input!.value = text;
    input!.dispatchEvent(new Event("input"));
  }

  function getFormValue(input: CasehubTextInput, field: string): string | undefined {
    if (!input.dataSet?.rows.length) return undefined;
    try {
      const cell = input.dataSet.rows[0]!.cell(field as import("@casehubio/pages-data/dist/dataset/types.js").ColumnId);
      return cell.type === "NULL" ? undefined : String(cell.value);
    } catch {
      return undefined;
    }
  }

  // ── Test Cases ──

  it("1. click row → form shows that record", async () => {
    const { tableEl, formInputs } = await setup();

    const rows = getTableRows(tableEl);
    expect(rows.length).toBe(3);

    // Click Alice's row (first cell)
    clickCell(rows[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));

    const nameInput = formInputs[0]!;
    expect(nameInput.dataSet!.rows.length).toBe(1);
    expect(getFormValue(nameInput, "name")).toBe("Alice");
  });

  it("2. click row A → click row B → form switches to B", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    const rows = getTableRows(tableEl);

    // Click Alice
    clickCell(rows[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Click Bob
    clickCell(rows[1]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Bob");
  });

  it("3. click Alice in name column → click Bob in email column → form shows Bob", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    const rows = getTableRows(tableEl);

    // Click Alice's name cell (col 1 — name)
    clickCell(rows[0]!, 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Click Bob's email cell (col 2 — email) — different column!
    clickCell(rows[1]!, 2);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Bob");
  });

  it("4. type filter → click filtered row → form shows correct record", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Step A: Verify table has 3 rows initially
    expect(getTableRows(tableEl).length).toBe(3);

    // Step B: Type "Bob" in filter box
    typeInFilter(tableEl, "Bob");
    await new Promise((r) => setTimeout(r, 200));

    // Step C: Verify table shows only 1 row after filter
    const filteredRows = getTableRows(tableEl);
    expect(filteredRows.length).toBe(1);

    // Step D: Verify the visible row's text is "Bob" not "Alice"
    const cells = filteredRows[0]!.querySelectorAll("td");
    const cellTexts = Array.from(cells).map((c) => c.textContent);
    expect(cellTexts[1]).toBe("Bob"); // name column

    // Step E: Spy on filter events BEFORE clicking
    const filterEvents: { columnId: unknown; value: unknown; row: unknown; rowName: string }[] = [];
    tableEl.addEventListener("casehub-filter", ((e: Event) => {
      const d = (e as CustomEvent).detail;
      filterEvents.push({
        columnId: d.columnId,
        value: d.value,
        row: d.row,
        rowName: d.row ? String(d.row.cell("name").value) : "NO ROW",
      });
    }));

    // Step F: Click Bob's id cell (col 0)
    cells[0]!.click();
    await new Promise((r) => setTimeout(r, 200));

    // Step G: Check what event was emitted (new event shape has row and value, not rowIndex)
    expect(filterEvents.length).toBe(1);
    expect(filterEvents[0]!.row).toBeDefined();
    expect(filterEvents[0]!.value).toBeDefined();

    // Step H: Form should show Bob
    expect(nameInput.dataSet!.rows.length).toBe(1);
    expect(getFormValue(nameInput, "name")).toBe("Bob");
  });

  it("5. select Alice → filter to Bob → click Bob → form shows Bob", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice
    const rows = getTableRows(tableEl);
    clickCell(rows[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Filter table to "Bob"
    typeInFilter(tableEl, "Bob");
    await new Promise((r) => setTimeout(r, 100));

    const filteredRows = getTableRows(tableEl);
    expect(filteredRows.length).toBe(1);

    // Click Bob
    clickCell(filteredRows[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));

    expect(getFormValue(nameInput, "name")).toBe("Bob");
  });

  it("6. select Alice → filter to Carol → click Carol → clear filter → form still shows Carol", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice
    clickCell(getTableRows(tableEl)[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Filter to Carol
    typeInFilter(tableEl, "Carol");
    await new Promise((r) => setTimeout(r, 100));
    clickCell(getTableRows(tableEl)[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Carol");

    // Clear text filter
    typeInFilter(tableEl, "");
    await new Promise((r) => setTimeout(r, 100));

    // All rows visible again, but form should still show Carol
    expect(getTableRows(tableEl).length).toBe(3);
    expect(getFormValue(nameInput, "name")).toBe("Carol");
  });

  it("7. click same row twice → form clears (toggle/deselect)", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    const rows = getTableRows(tableEl);
    clickCell(rows[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Click Alice again — toggles off, clears record selection filter
    clickCell(rows[0]!, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(nameInput.dataSet!.rows.length).toBe(3); // Filter cleared, all rows visible
  });

  it("8. both form inputs update together on row selection", async () => {
    const { tableEl, formInputs } = await setup();
    expect(formInputs.length).toBe(2); // name + email

    const rows = getTableRows(tableEl);
    clickCell(rows[1]!, 0); // Bob
    await new Promise((r) => setTimeout(r, 100));

    expect(getFormValue(formInputs[0]!, "name")).toBe("Bob");
    expect(getFormValue(formInputs[1]!, "email")).toBe("bob@example.com");
  });

  it("9. form inputs are editable", async () => {
    const { formInputs } = await setup();
    for (const input of formInputs) {
      expect(input.editable).toBe(true);
    }
  });
});
