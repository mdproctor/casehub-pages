import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";
import type { CasehubFieldChangeDetail } from "./CasehubFormInput.js";

import { CasehubTextInput } from "./CasehubTextInput.js";
import { CasehubNumberInput } from "./CasehubNumberInput.js";
import { CasehubCheckbox } from "./CasehubCheckbox.js";
import { CasehubTextarea } from "./CasehubTextarea.js";
import { CasehubDatePicker } from "./CasehubDatePicker.js";
import { CasehubDropdown } from "./CasehubDropdown.js";

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
    data: rows,
  };
  return toTypedDataSet(ds);
}

// ── CasehubTextInput ──────────────────────────────────────────────────

describe("CasehubTextInput", () => {
  let el: CasehubTextInput;

  beforeEach(() => {
    el = document.createElement("casehub-text-input") as CasehubTextInput;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders input with field value from dataset", () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    el.props = { field: "name", label: "Name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Alice");
  });

  it("renders label when provided", () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    el.props = { field: "name", label: "Full Name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const label = el.shadowRoot!.querySelector("label")!;
    expect(label.textContent).toBe("Full Name");
  });

  it("emits casehub-field-change on input when editable", () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
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

  it("emits committed event on blur", () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "Charlie";
    input.dispatchEvent(new Event("blur"));

    expect(events).toHaveLength(1);
    expect(events[0]!.committed).toBe(true);
  });

  it("does not emit events when not editable", () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = false;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: any[] = [];
    el.addEventListener("casehub-field-change", (e: any) => events.push(e));

    const input = el.shadowRoot!.querySelector("input")!;
    input.value = "test";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(0);
  });

  it("sets input to readonly when not editable", () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = false;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.readOnly).toBe(true);
  });

  it("respects maxLength prop", () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);
    el.props = { field: "name", maxLength: 10, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")!;
    expect(input.maxLength).toBe(10);
  });
});

// ── CasehubNumberInput ────────────────────────────────────────────────

describe("CasehubNumberInput", () => {
  let el: CasehubNumberInput;

  beforeEach(() => {
    el = document.createElement("casehub-number-input") as CasehubNumberInput;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders number input with field value", () => {
    const ds = makeDataSet([["age", "NUMBER"]], [[42]]);
    el.props = { field: "age", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.value).toBe("42");
  });

  it("emits numeric value on input", () => {
    const ds = makeDataSet([["age", "NUMBER"]], [[0]]);
    el.props = { field: "age", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    input.value = "25";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe(25);
    expect(events[0]!.committed).toBe(false);
  });

  it("emits null for invalid number", () => {
    const ds = makeDataSet([["age", "NUMBER"]], [[0]]);
    el.props = { field: "age", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    input.value = "abc";
    input.dispatchEvent(new Event("input"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe(null);
  });

  it("sets min/max/step attributes", () => {
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
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.min).toBe("0");
    expect(input.max).toBe("100");
    expect(input.step).toBe("5");
  });
});

// ── CasehubCheckbox ───────────────────────────────────────────────────

describe("CasehubCheckbox", () => {
  let el: CasehubCheckbox;

  beforeEach(() => {
    el = document.createElement("casehub-checkbox") as CasehubCheckbox;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("coerces 'true' string to checked", () => {
    const ds = makeDataSet([["active", "LABEL"]], [["true"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("coerces 'TRUE' (uppercase) to checked", () => {
    const ds = makeDataSet([["active", "LABEL"]], [["TRUE"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("coerces 'false' string to unchecked", () => {
    const ds = makeDataSet([["active", "LABEL"]], [["false"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it("emits 'true' or 'false' string on change", () => {
    const ds = makeDataSet([["active", "LABEL"]], [["false"]]);
    el.props = { field: "active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("true");
    expect(events[0]!.committed).toBe(true);
  });

  it("renders label", () => {
    const ds = makeDataSet([["active", "LABEL"]], [["false"]]);
    el.props = { field: "active", label: "Is Active", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const label = el.shadowRoot!.querySelector("label")!;
    expect(label.textContent).toBe("Is Active");
  });
});

// ── CasehubTextarea ───────────────────────────────────────────────────

describe("CasehubTextarea", () => {
  let el: CasehubTextarea;

  beforeEach(() => {
    el = document.createElement("casehub-textarea") as CasehubTextarea;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders textarea with field value", () => {
    const ds = makeDataSet([["notes", "TEXT"]], [["Hello\nWorld"]]);
    el.props = { field: "notes", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const textarea = el.shadowRoot!.querySelector("textarea")!;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe("Hello\nWorld");
  });

  it("sets rows attribute", () => {
    const ds = makeDataSet([["notes", "TEXT"]], [[""]]);
    el.props = { field: "notes", rows: 5, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const textarea = el.shadowRoot!.querySelector("textarea")!;
    expect(textarea.rows).toBe(5);
  });

  it("emits on input and blur", () => {
    const ds = makeDataSet([["notes", "TEXT"]], [[""]]);
    el.props = { field: "notes", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
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

// ── CasehubDatePicker ─────────────────────────────────────────────────

describe("CasehubDatePicker", () => {
  let el: CasehubDatePicker;

  beforeEach(() => {
    el = document.createElement("casehub-date-picker") as CasehubDatePicker;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders date input with ISO 8601 value from Date object", () => {
    const date = new Date("2024-01-15T00:00:00Z");
    const ds = makeDataSet([["birthday", "DATE"]], [[date]]);
    el.props = { field: "birthday", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2024-01-15");
  });

  it("renders date input with ISO 8601 value from string", () => {
    const ds = makeDataSet([["birthday", "TEXT"]], [["2024-01-15"]]);
    el.props = { field: "birthday", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.value).toBe("2024-01-15");
  });

  it("emits ISO 8601 date string on change", () => {
    const ds = makeDataSet([["birthday", "DATE"]], [[new Date()]]);
    el.props = { field: "birthday", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    input.value = "2025-12-31";
    input.dispatchEvent(new Event("change"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("2025-12-31");
    expect(events[0]!.committed).toBe(true);
  });

  it("sets min/max attributes", () => {
    const ds = makeDataSet([["birthday", "DATE"]], [[new Date()]]);
    el.props = {
      field: "birthday",
      min: "2000-01-01",
      max: "2030-12-31",
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const input = el.shadowRoot!.querySelector("input")! as HTMLInputElement;
    expect(input.min).toBe("2000-01-01");
    expect(input.max).toBe("2030-12-31");
  });
});

// ── CasehubDropdown ───────────────────────────────────────────────────

describe("CasehubDropdown", () => {
  let el: CasehubDropdown;

  beforeEach(() => {
    el = document.createElement("casehub-dropdown") as CasehubDropdown;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("renders select with fixed options", () => {
    const ds = makeDataSet([["status", "LABEL"]], [["active"]]);
    el.props = {
      field: "status",
      options: { values: ["active", "inactive", "pending"] },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const select = el.shadowRoot!.querySelector("select")!;
    const options = Array.from(select.querySelectorAll("option"));
    expect(options).toHaveLength(3);
    expect(options[0]!.textContent).toBe("active");
    expect(options[1]!.textContent).toBe("inactive");
    expect(options[2]!.textContent).toBe("pending");
  });

  it("selects current field value", () => {
    const ds = makeDataSet([["status", "LABEL"]], [["inactive"]]);
    el.props = {
      field: "status",
      options: { values: ["active", "inactive", "pending"] },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const select = el.shadowRoot!.querySelector("select")! as HTMLSelectElement;
    expect(select.value).toBe("inactive");
  });

  it("emits on change", () => {
    const ds = makeDataSet([["status", "LABEL"]], [["active"]]);
    el.props = {
      field: "status",
      options: { values: ["active", "inactive"] },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const events: CasehubFieldChangeDetail[] = [];
    el.addEventListener("casehub-field-change", (e: Event) =>
      events.push((e as CustomEvent).detail),
    );

    const select = el.shadowRoot!.querySelector("select")! as HTMLSelectElement;
    select.value = "inactive";
    select.dispatchEvent(new Event("change"));

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe("inactive");
    expect(events[0]!.committed).toBe(true);
  });

  it("DataSetOptions not implemented yet (returns empty)", () => {
    const ds = makeDataSet([["category", "LABEL"]], [["electronics"]]);

    el.props = {
      field: "category",
      options: { dataset: "categories", labelColumn: "label", valueColumn: "value" },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const select = el.shadowRoot!.querySelector("select")!;
    const options = Array.from(select.querySelectorAll("option"));
    // DataSetOptions is parsed but not resolved — returns empty until runtime wiring is implemented
    expect(options).toHaveLength(0);
  });

  it("renders empty select when dataset options not yet loaded", () => {
    const ds = makeDataSet([["category", "LABEL"]], [["electronics"]]);
    el.props = {
      field: "category",
      options: { dataset: "categories", labelColumn: "label", valueColumn: "value" },
      lookup: mockLookup("test"),
    };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const select = el.shadowRoot!.querySelector("select")!;
    const options = Array.from(select.querySelectorAll("option"));
    expect(options).toHaveLength(0);
  });
});
