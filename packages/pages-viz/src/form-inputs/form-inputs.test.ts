import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import { dataSetId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import { toTypedDataSet } from "@casehubio/pages-data";
import type { PagesFieldChangeDetail } from "./PagesFormInput.js";

import { PagesTextInput } from "./PagesTextInput.js";
import { PagesNumberInput } from "./PagesNumberInput.js";
import { PagesCheckbox } from "./PagesCheckbox.js";
import { PagesTextarea } from "./PagesTextarea.js";
import { PagesDatePicker } from "./PagesDatePicker.js";
import { PagesDropdown } from "./PagesDropdown.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(
  columns: [string, string][],
  rows: (string | number | Date | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows.map(row => row.map(cell => {
      if (cell === null) return null;
      if (cell instanceof Date) return cell.toISOString();
      return String(cell);
    })),
  };
  return toTypedDataSet(ds);
}

// ── PagesTextInput ──────────────────────────────────────────────────

describe("PagesTextInput", () => {
  let el: PagesTextInput;

  beforeEach(() => {
    el = document.createElement("pages-text-input");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders input with field value from dataset", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    el.props = { field: "name", label: "Name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Alice");
  });

  it("renders label when provided", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    el.props = { field: "name", label: "Full Name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const label = el.shadowRoot!.querySelector("label")!;
    expect(label.textContent).toBe("Full Name");
  });

  it("emits pages-field-change on input when editable", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "Bob";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(1);
    expect(events[0]!.field).toBe("name");
    expect(events[0]!.value).toBe("Bob");
    expect(events[0]!.committed).toBe(false);
  });

  it("emits committed event on blur", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "Charlie";
    input.dispatchEvent(new Event("blur"));

    expect(events).toHaveLength(1);
    expect(events[0]!.committed).toBe(true);
  });

  it("does not emit events when not editable", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = false;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: Event[] = [];
    el.addEventListener("pages-field-change", (e: Event) => events.push(e));

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "test";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(0);
  });

  it("sets input to readonly when not editable", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = false;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.readOnly).toBe(true);
  });

  it("respects maxLength prop", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", maxLength: 10, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.maxLength).toBe(10);
  });
});

// ── PagesNumberInput ────────────────────────────────────────────────

describe("PagesNumberInput", () => {
  let el: PagesNumberInput;

  beforeEach(() => {
    el = document.createElement("pages-number-input");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders number input with field value", async () => {
    const ds = makeDataSet([["age", "NUMBER"]], [[42]]);
    el.props = { field: "age", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.type).toBe("number");
    expect(input.value).toBe("42");
  });

  it("emits numeric value on input", async () => {
    const ds = makeDataSet([["age", "NUMBER"]], [[0]]);
    el.props = { field: "age", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "25";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe(25);
    expect(events[0]!.committed).toBe(false);
  });

  it("emits null for invalid number", async () => {
    const ds = makeDataSet([["age", "NUMBER"]], [[0]]);
    el.props = { field: "age", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "abc";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe(null);
  });

  it("sets min/max/step attributes", async () => {
    const ds = makeDataSet([["score", "NUMBER"]], [[50]]);
    el.props = {
      field: "score",
      min: 0,
      max: 100,
      step: 5,
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.min).toBe("0");
    expect(input.max).toBe("100");
    expect(input.step).toBe("5");
  });
});

// ── PagesCheckbox ───────────────────────────────────────────────────

describe("PagesCheckbox", () => {
  let el: PagesCheckbox;

  beforeEach(() => {
    el = document.createElement("pages-checkbox");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("coerces 'true' string to checked", async () => {
    const ds = makeDataSet([["active", "LABEL"]], [["true"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.checked).toBe(true);
  });

  it("coerces 'TRUE' (uppercase) to checked", async () => {
    const ds = makeDataSet([["active", "LABEL"]], [["TRUE"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.checked).toBe(true);
  });

  it("coerces 'false' string to unchecked", async () => {
    const ds = makeDataSet([["active", "LABEL"]], [["false"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.checked).toBe(false);
  });

  it("emits 'true' or 'false' string on change", async () => {
    const ds = makeDataSet([["active", "LABEL"]], [["false"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.checked = true;
    input.dispatchEvent(new Event("change"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("true");
    expect(events[0]!.committed).toBe(true);
  });

  it("renders label", async () => {
    const ds = makeDataSet([["active", "LABEL"]], [["false"]]);
    el.props = { field: "active", label: "Is Active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const label = el.shadowRoot!.querySelector("label")!;
    expect(label.textContent).toBe("Is Active");
  });
});

// ── PagesTextarea ───────────────────────────────────────────────────

describe("PagesTextarea", () => {
  let el: PagesTextarea;

  beforeEach(() => {
    el = document.createElement("pages-textarea");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders textarea with field value", async () => {
    const ds = makeDataSet([["notes", "TEXT"]], [["Hello\nWorld"]]);
    el.props = { field: "notes", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const textarea = el.shadowRoot!.querySelector("textarea")!;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe("Hello\nWorld");
  });

  it("sets rows attribute", async () => {
    const ds = makeDataSet([["notes", "TEXT"]], [[""]]);
    el.props = { field: "notes", rows: 5, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const textarea = el.shadowRoot!.querySelector("textarea")!;
    expect(textarea.rows).toBe(5);
  });

  it("emits on input and blur", async () => {
    const ds = makeDataSet([["notes", "TEXT"]], [[""]]);
    el.props = { field: "notes", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const textarea = el.shadowRoot!.querySelector("textarea")!;
    textarea.value = "Updated text";
    textarea.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("Updated text");
    expect(events[0]!.committed).toBe(false);

    textarea.dispatchEvent(new Event("blur"));
    expect(events).toHaveLength(2);
    expect(events[1]!.committed).toBe(true);
  });
});

// ── PagesDatePicker ─────────────────────────────────────────────────

describe("PagesDatePicker", () => {
  let el: PagesDatePicker;

  beforeEach(() => {
    el = document.createElement("pages-date-picker");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders date input with ISO 8601 value from Date object", async () => {
    const date = new Date("2024-01-15T00:00:00Z");
    const ds = makeDataSet([["birthday", "DATE"]], [[date]]);
    el.props = { field: "birthday", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2024-01-15");
  });

  it("renders date input with ISO 8601 value from string", async () => {
    const ds = makeDataSet([["birthday", "TEXT"]], [["2024-01-15"]]);
    el.props = { field: "birthday", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.value).toBe("2024-01-15");
  });

  it("emits ISO 8601 date string on change", async () => {
    const ds = makeDataSet([["birthday", "DATE"]], [[new Date()]]);
    el.props = { field: "birthday", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "2025-12-31";
    input.dispatchEvent(new Event("change"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("2025-12-31");
    expect(events[0]!.committed).toBe(true);
  });

  it("sets min/max attributes", async () => {
    const ds = makeDataSet([["birthday", "DATE"]], [[new Date()]]);
    el.props = {
      field: "birthday",
      min: "2000-01-01",
      max: "2030-12-31",
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.min).toBe("2000-01-01");
    expect(input.max).toBe("2030-12-31");
  });
});

// ── PagesDropdown ───────────────────────────────────────────────────

describe("PagesDropdown", () => {
  let el: PagesDropdown;

  beforeEach(() => {
    el = document.createElement("pages-dropdown");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders select with fixed options", async () => {
    const ds = makeDataSet([["status", "LABEL"]], [["active"]]);
    el.props = {
      field: "status",
      options: { values: ["active", "inactive", "pending"] },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const select = el.shadowRoot!.querySelector("select")!;
    const options = Array.from(select.querySelectorAll("option"));
    expect(options).toHaveLength(3);
    expect(options[0]!.textContent!.trim()).toBe("active");
    expect(options[1]!.textContent!.trim()).toBe("inactive");
    expect(options[2]!.textContent!.trim()).toBe("pending");
  });

  it("selects current field value", async () => {
    const ds = makeDataSet([["status", "LABEL"]], [["inactive"]]);
    el.props = {
      field: "status",
      options: { values: ["active", "inactive", "pending"] },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const select = el.shadowRoot!.querySelector("select")!;
    expect(select.value).toBe("inactive");
  });

  it("emits on change", async () => {
    const ds = makeDataSet([["status", "LABEL"]], [["active"]]);
    el.props = {
      field: "status",
      options: { values: ["active", "inactive"] },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const events: PagesFieldChangeDetail[] = [];
    el.addEventListener("pages-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const select = el.shadowRoot!.querySelector("select")!;
    select.value = "inactive";
    select.dispatchEvent(new Event("change"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("inactive");
    expect(events[0]!.committed).toBe(true);
  });

  it("DataSetOptions renders empty until optionsDataSet is provided", async () => {
    const ds = makeDataSet([["category", "LABEL"]], [["electronics"]]);
    el.props = {
      field: "category",
      options: { dataset: dataSetId("categories"), labelColumn: "label", valueColumn: "value" },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const select = el.shadowRoot!.querySelector("select")!;
    expect(Array.from(select.querySelectorAll("option"))).toHaveLength(0);
  });

  it("DataSetOptions populates options from optionsDataSet", async () => {
    const ds = makeDataSet([["category", "LABEL"]], [["electronics"]]);
    el.props = {
      field: "category",
      options: { dataset: dataSetId("categories"), labelColumn: "label", valueColumn: "value" },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const optionsDs = makeDataSet(
      [["value", "LABEL"], ["label", "LABEL"]],
      [["electronics", "Electronics"], ["clothing", "Clothing"], ["food", "Food"]],
    );
    el.optionsDataSet = optionsDs;
    await el.updateComplete;

    const select = el.shadowRoot!.querySelector("select")!;
    const opts = Array.from(select.querySelectorAll("option"));
    expect(opts).toHaveLength(3);
    expect(opts[0]!.value).toBe("electronics");
    expect(opts[0]!.textContent!.trim()).toBe("Electronics");
    expect(opts[1]!.value).toBe("clothing");
    expect(opts[1]!.textContent!.trim()).toBe("Clothing");
    expect(opts[2]!.value).toBe("food");
    expect(opts[2]!.textContent!.trim()).toBe("Food");
  });

  it("DataSetOptions selects current field value from optionsDataSet", async () => {
    const ds = makeDataSet([["category", "LABEL"]], [["clothing"]]);
    el.props = {
      field: "category",
      options: { dataset: dataSetId("categories"), labelColumn: "label", valueColumn: "value" },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const optionsDs = makeDataSet(
      [["value", "LABEL"], ["label", "LABEL"]],
      [["electronics", "Electronics"], ["clothing", "Clothing"]],
    );
    el.optionsDataSet = optionsDs;
    await el.updateComplete;

    const select = el.shadowRoot!.querySelector("select")!;
    expect(select.value).toBe("clothing");
  });

  it("DataSetOptions dispatches pages-data-request for options dataset", async () => {
    const ds = makeDataSet([["category", "LABEL"]], [["electronics"]]);
    el.props = {
      field: "category",
      options: { dataset: dataSetId("categories"), labelColumn: "label", valueColumn: "value" },
      lookup: mockLookup("test"),
    };
    el.editable = true;

    const requests: Array<{ dataSetId: string }> = [];
    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "test-dropdown";
    wrapper.addEventListener("pages-data-request", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      requests.push({ dataSetId: detail.lookup.dataSetId });
    });
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const optionsReq = requests.find(r => r.dataSetId === "categories");
    expect(optionsReq).toBeDefined();

    wrapper.remove();
  });

  it("cascading: re-requests options when filterField changes", async () => {
    const ds = makeDataSet([["city", "LABEL"], ["country", "LABEL"]], [["Paris", "France"]]);
    el.props = {
      field: "city",
      options: {
        dataset: dataSetId("cities"),
        labelColumn: "name",
        valueColumn: "name",
        filterField: "country",
        filterColumn: "country",
      },
      lookup: mockLookup("test"),
    };
    el.editable = true;

    const requests: Array<{ dataSetId: string; operations: unknown[] }> = [];
    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "test-cascade";
    wrapper.addEventListener("pages-data-request", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      requests.push({ dataSetId: detail.lookup.dataSetId, operations: detail.lookup.operations });
    });
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    await el.updateComplete;
    el.dataSet = ds;
    await el.updateComplete;

    const optionsRequests = requests.filter(r => r.dataSetId === "cities");
    expect(optionsRequests.length).toBe(1);

    // Simulate parent field change
    el.dispatchEvent(
      new CustomEvent("pages-field-change", {
        bubbles: true,
        composed: true,
        detail: { field: "country", value: "Germany", committed: true },
      }),
    );

    const updatedOptionsRequests = requests.filter(r => r.dataSetId === "cities");
    expect(updatedOptionsRequests.length).toBe(2);
    const secondReq = updatedOptionsRequests[1]!;
    expect(secondReq.dataSetId).toBe("cities");
    expect(secondReq.operations).toHaveLength(1);
    expect(secondReq.operations[0]).toEqual({
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: "country",
        fn: "EQUALS_TO",
        args: ["Germany"],
      }],
    });

    wrapper.remove();
  });
});
