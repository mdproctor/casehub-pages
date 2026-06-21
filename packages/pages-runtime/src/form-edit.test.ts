/**
 * Real interaction tests for editing + saving via local adapter.
 * Tests edit across rows, back-and-forth navigation, data consistency.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@casehub/pages-viz";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";
import type { TypedDataSet } from "@casehub/pages-data/dist/dataset/types.js";

interface DataElement extends HTMLElement {
  dataSet?: TypedDataSet;
  editable?: boolean;
  shadowRoot: ShadowRoot;
}

const YAML = `
datasets:
  - uuid: contacts
    content: >-
      [
        [1, "Alice", "alice@example.com"],
        [2, "Bob", "bob@example.com"],
        [3, "Carol", "carol@example.com"]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: email
        type: TEXT

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
      delay: 200
      adapter: local
    components:
      - text-input:
          field: name
          label: Name
      - text-input:
          field: email
          label: Email
`;

describe("form editing + local save (real DOM)", () => {
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

  async function setup(): Promise<{
    tableEl: DataElement;
    formInputs: DataElement[];
  }> {
    site = await loadSite(target, YAML);

    const tableEl = target.querySelector("casehub-table") as DataElement | null;
    expect(tableEl).not.toBeNull();

    const start = Date.now();
    while (!tableEl!.dataSet && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(tableEl!.dataSet).toBeTruthy();

    const formInputs = Array.from(
      target.querySelectorAll("casehub-text-input"),
    ) as DataElement[];
    expect(formInputs.length).toBe(2);

    const start2 = Date.now();
    while (!formInputs.every((i) => i.dataSet) && Date.now() - start2 < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }

    return { tableEl: tableEl!, formInputs };
  }

  function getTableRows(tableEl: DataElement): HTMLTableRowElement[] {
    return Array.from(tableEl.shadowRoot.querySelectorAll("tbody tr"));
  }

  function clickRow(tableEl: any, rowIdx: number): void {
    const rows = getTableRows(tableEl);
    expect(rows.length).toBeGreaterThan(rowIdx);
    const td = rows[rowIdx]!.querySelector("td")!;
    td.click();
  }

  function getTableCellText(tableEl: any, rowIdx: number, colIdx: number): string {
    const rows = getTableRows(tableEl);
    const cells = rows[rowIdx]!.querySelectorAll("td");
    return cells[colIdx]!.textContent ?? "";
  }

  function getFormValue(input: any, field: string): string | undefined {
    if (!input.dataSet?.rows?.length) return undefined;
    try {
      const cell = input.dataSet.rows[0].cell(field);
      return cell.type === "NULL" ? undefined : String(cell.value);
    } catch {
      return undefined;
    }
  }

  function emitFieldChange(input: any, field: string, value: string, committed: boolean): void {
    input.dispatchEvent(
      new CustomEvent("casehub-field-change", {
        bubbles: true,
        composed: true,
        detail: { field, value, committed },
      }),
    );
  }

  // ── Tests ──

  it("1. table has 3 rows before any edits", async () => {
    const { tableEl } = await setup();
    expect(getTableRows(tableEl).length).toBe(3);
    expect(getTableCellText(tableEl, 0, 1)).toBe("Alice");
    expect(getTableCellText(tableEl, 1, 1)).toBe("Bob");
    expect(getTableCellText(tableEl, 2, 1)).toBe("Carol");
  });

  it("2. edit a field → auto-save → table still has 3 rows", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Edit name
    emitFieldChange(nameInput, "name", "Alice Updated", true);

    // Wait for auto-save (delay: 200ms) + re-push
    await new Promise((r) => setTimeout(r, 500));

    // Table must still have 3 rows
    expect(getTableRows(tableEl).length).toBe(3);
  });

  it("3. edit a field → auto-save → table reflects the edit", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));

    // Edit name
    emitFieldChange(nameInput, "name", "Alice Updated", true);

    // Wait for auto-save + re-push
    await new Promise((r) => setTimeout(r, 500));

    // Table should show updated name
    expect(getTableCellText(tableEl, 0, 1)).toBe("Alice Updated");
    // Other rows unchanged
    expect(getTableCellText(tableEl, 1, 1)).toBe("Bob");
    expect(getTableCellText(tableEl, 2, 1)).toBe("Carol");
  });

  it("4. edit Alice → switch to Bob → edit Bob → both edits persist", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select and edit Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "Alice v2", true);
    await new Promise((r) => setTimeout(r, 500));

    // Select and edit Bob
    clickRow(tableEl, 1);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "Bob v2", true);
    await new Promise((r) => setTimeout(r, 500));

    // Both edits should be in the table
    expect(getTableRows(tableEl).length).toBe(3);
    expect(getTableCellText(tableEl, 0, 1)).toBe("Alice v2");
    expect(getTableCellText(tableEl, 1, 1)).toBe("Bob v2");
    expect(getTableCellText(tableEl, 2, 1)).toBe("Carol");
  });

  it("5. edit Alice → switch to Bob → switch back to Alice → Alice edit persisted", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select and edit Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "Alice Edited", true);
    await new Promise((r) => setTimeout(r, 500));

    // Switch to Bob (no edit)
    clickRow(tableEl, 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Bob");

    // Switch back to Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice Edited");
  });

  it("6. edit multiple fields on same row → all persist", async () => {
    const { tableEl, formInputs } = await setup();
    const [nameInput, emailInput] = formInputs;

    // Select Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));

    // Edit both fields
    emitFieldChange(nameInput, "name", "Alice New", true);
    emitFieldChange(emailInput, "email", "new@example.com", true);
    await new Promise((r) => setTimeout(r, 500));

    // Both should be in table
    expect(getTableCellText(tableEl, 0, 1)).toBe("Alice New");
    expect(getTableCellText(tableEl, 0, 2)).toBe("new@example.com");
    expect(getTableRows(tableEl).length).toBe(3);
  });

  it("7. switch row before auto-save fires → edit is flushed (not discarded)", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));

    // Edit Alice (committed — triggers auto-save timer)
    emitFieldChange(nameInput, "name", "Alice SAVED", true);

    // Switch to Bob BEFORE auto-save timer fires — should flush save first
    clickRow(tableEl, 1);
    await new Promise((r) => setTimeout(r, 500));

    // Switch back to Alice — edit should have been saved
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice SAVED");

    // Table should have the saved edit and all 3 rows
    expect(getTableRows(tableEl).length).toBe(3);
    expect(getTableCellText(tableEl, 0, 1)).toBe("Alice SAVED");
  });

  it("8. edit all three rows sequentially → all 3 rows still present with edits", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Edit Alice
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "A1", true);
    await new Promise((r) => setTimeout(r, 500));

    // Edit Bob
    clickRow(tableEl, 1);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "B1", true);
    await new Promise((r) => setTimeout(r, 500));

    // Edit Carol
    clickRow(tableEl, 2);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "C1", true);
    await new Promise((r) => setTimeout(r, 500));

    // All 3 rows present with edits
    expect(getTableRows(tableEl).length).toBe(3);
    expect(getTableCellText(tableEl, 0, 1)).toBe("A1");
    expect(getTableCellText(tableEl, 1, 1)).toBe("B1");
    expect(getTableCellText(tableEl, 2, 1)).toBe("C1");
  });

  it("9. rapid back-and-forth editing between two rows → no corruption", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    for (let i = 0; i < 3; i++) {
      // Edit Alice
      clickRow(tableEl, 0);
      await new Promise((r) => setTimeout(r, 100));
      emitFieldChange(nameInput, "name", `Alice-${i}`, true);
      await new Promise((r) => setTimeout(r, 400));

      // Edit Bob
      clickRow(tableEl, 1);
      await new Promise((r) => setTimeout(r, 100));
      emitFieldChange(nameInput, "name", `Bob-${i}`, true);
      await new Promise((r) => setTimeout(r, 400));
    }

    // Final state: all 3 rows present
    expect(getTableRows(tableEl).length).toBe(3);
    expect(getTableCellText(tableEl, 0, 1)).toBe("Alice-2");
    expect(getTableCellText(tableEl, 1, 1)).toBe("Bob-2");
    expect(getTableCellText(tableEl, 2, 1)).toBe("Carol");
  });

  it("10. save failure dispatches casehub-save-error and shows error banner", async () => {
    const FAIL_YAML = `
datasets:
  - uuid: contacts
    content: >-
      [
        [1, "Alice", "alice@example.com"]
      ]
    columns:
      - id: id
        type: NUMBER
      - id: name
        type: TEXT
      - id: email
        type: TEXT
pages:
  - name: Contacts
    components:
      - displayer:
          type: TABLE
          filter:
            enabled: true
          lookup:
            uuid: contacts
      - page: Form
  - name: Form
    dataScope:
      dataset: contacts
      idColumn: id
    save:
      trigger: auto
      delay: 100
      adapter: failing
    components:
      - text-input:
          field: name
          label: Name
`;

    const failingAdapter = {
      async save() {
        return { success: false, error: "Server error: 500" };
      },
    };

    site = await loadSite(target, FAIL_YAML, {
      adapters: { failing: failingAdapter },
    });

    const formInputs = Array.from(
      target.querySelectorAll("casehub-text-input"),
    ) as DataElement[];
    expect(formInputs.length).toBe(1);

    const start = Date.now();
    while (!formInputs[0]!.dataSet && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const errors: string[] = [];
    target.addEventListener("casehub-save-error", (e: Event) => {
      errors.push((e as CustomEvent).detail.error);
    });

    // Select the row and edit
    const rows = Array.from(
      (target.querySelector("casehub-table") as DataElement).shadowRoot.querySelectorAll("tbody tr"),
    );
    rows[0]!.querySelector("td")!.click();
    await new Promise((r) => setTimeout(r, 100));

    formInputs[0]!.dispatchEvent(
      new CustomEvent("casehub-field-change", {
        bubbles: true,
        composed: true,
        detail: { field: "name", value: "Updated", committed: true },
      }),
    );

    // Wait for auto-save + error
    await new Promise((r) => setTimeout(r, 500));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe("Server error: 500");

    const banner = target.querySelector("[data-casehub-error]");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Server error: 500");
  });

  it("11. beforeunload fires preventDefault when edit state is dirty", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice and edit without waiting for auto-save
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    emitFieldChange(nameInput, "name", "Dirty", false);

    // Simulate beforeunload
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    let prevented = false;
    event.preventDefault = () => { prevented = true; };
    window.dispatchEvent(event);

    expect(prevented).toBe(true);
  });

  it("12. casehub-record-navigate next moves to next row", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Alice (row 0)
    clickRow(tableEl, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Alice");

    // Navigate next
    target.dispatchEvent(
      new CustomEvent("casehub-record-navigate", {
        bubbles: true,
        detail: { direction: "next" },
      }),
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(getFormValue(nameInput, "name")).toBe("Bob");
  });

  it("13. casehub-record-navigate prev moves to previous row", async () => {
    const { tableEl, formInputs } = await setup();
    const nameInput = formInputs[0]!;

    // Select Carol (row 2)
    clickRow(tableEl, 2);
    await new Promise((r) => setTimeout(r, 100));
    expect(getFormValue(nameInput, "name")).toBe("Carol");

    // Navigate prev
    target.dispatchEvent(
      new CustomEvent("casehub-record-navigate", {
        bubbles: true,
        detail: { direction: "prev" },
      }),
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(getFormValue(nameInput, "name")).toBe("Bob");
  });

  it("14. beforeunload does not fire preventDefault when clean", async () => {
    await setup();

    const event = new Event("beforeunload") as BeforeUnloadEvent;
    let prevented = false;
    event.preventDefault = () => { prevented = true; };
    window.dispatchEvent(event);

    expect(prevented).toBe(false);
  });
});
