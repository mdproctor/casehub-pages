import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { toTypedDataSet, ColumnType } from "@casehubio/pages-data";
import type { ColumnId, DataSet } from "@casehubio/pages-data";
import type { PagesSchemaForm } from "./PagesSchemaForm.js";
import "./PagesSchemaForm.js";

function makeDataSet(
  columns: Array<[string, string]>,
  data: (string | number | null)[][],
) {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: data.map((row) => row.map((v) => (v === null ? null : String(v)))),
  };
  return toTypedDataSet(ds);
}

describe("PagesSchemaForm — auto-derive schema", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders correct child types from dataset columns", async () => {
    const ds = makeDataSet(
      [["name", "TEXT"], ["age", "NUMBER"], ["status", "LABEL"], ["start", "DATE"]],
      [["Alice", "30", "Active", "2026-01-01"]],
    );
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = {};
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    expect(form.shadowRoot!.querySelector("pages-input")).not.toBeNull();
    expect(form.shadowRoot!.querySelector("pages-number-input")).not.toBeNull();
    expect(form.shadowRoot!.querySelector("pages-select")).not.toBeNull();
    expect(form.shadowRoot!.querySelector("pages-date-picker")).not.toBeNull();
  });

  it("excludeFields hides specified fields", async () => {
    const ds = makeDataSet(
      [["id", "NUMBER"], ["name", "TEXT"]],
      [["1", "Alice"]],
    );
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { excludeFields: ["id"] };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const allInputs = form.shadowRoot!.querySelectorAll(
      "pages-input, pages-number-input, pages-select, pages-checkbox, pages-date-picker, pages-textarea",
    );
    expect(allInputs.length).toBe(1);
    expect(allInputs[0]!.tagName.toLowerCase()).toBe("pages-input");
  });
});

describe("PagesSchemaForm — explicit schema", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("maps string to text-input", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { name: { type: "string" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-input")).not.toBeNull();
  });

  it("maps number to number-input", async () => {
    const ds = makeDataSet([["age", "NUMBER"]], [["30"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { age: { type: "number", minimum: 0 } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-number-input")).not.toBeNull();
  });

  it("maps string with enum to dropdown", async () => {
    const ds = makeDataSet([["lang", "LABEL"]], [["Java"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = {
      schema: { properties: { lang: { type: "string", enum: ["Java", "TypeScript", "Python"] } } },
    };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-select")).not.toBeNull();
  });

  it("maps boolean to checkbox", async () => {
    const ds = makeDataSet([["active", "LABEL"]], [["true"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { active: { type: "boolean" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-checkbox")).not.toBeNull();
  });

  it("maps format:date to date-picker", async () => {
    const ds = makeDataSet([["dob", "DATE"]], [["2000-01-01"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { dob: { type: "string", format: "date" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-date-picker")).not.toBeNull();
  });

  it("maps format:textarea to textarea", async () => {
    const ds = makeDataSet([["notes", "TEXT"]], [["Some text"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { notes: { type: "string", format: "textarea" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-textarea")).not.toBeNull();
  });

  it("maps integer to number-input with step=1", async () => {
    const ds = makeDataSet([["count", "NUMBER"]], [["5"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { count: { type: "integer" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    const numInput = form.shadowRoot!.querySelector("pages-number-input");
    expect(numInput).not.toBeNull();
  });

  it("explicit schema overrides auto-derived", async () => {
    const ds = makeDataSet([["notes", "TEXT"]], [["text"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { notes: { type: "string", format: "textarea" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;
    expect(form.shadowRoot!.querySelector("pages-textarea")).not.toBeNull();
    expect(form.shadowRoot!.querySelector("pages-input")).toBeNull();
  });
});

describe("PagesSchemaForm — field customization", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("fieldOrder controls rendering order", async () => {
    const ds = makeDataSet([["a", "TEXT"], ["b", "TEXT"], ["c", "TEXT"]], [["1", "2", "3"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { fieldOrder: ["c", "a", "b"] };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const inputs = form.shadowRoot!.querySelectorAll("pages-input");
    expect(inputs.length).toBe(3);
    expect((inputs[0] as any).label).toBe("C");
    expect((inputs[1] as any).label).toBe("A");
    expect((inputs[2] as any).label).toBe("B");
  });

  it("labels override auto-generated labels", async () => {
    const ds = makeDataSet([["workingYears", "NUMBER"]], [["5"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { labels: { workingYears: "Years of Experience" } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const numInput = form.shadowRoot!.querySelector("pages-number-input") as any;
    expect(numInput.props.label).toBe("Years of Experience");
  });
});

describe("PagesSchemaForm — events and data flow", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("children receive dataset values from schema form", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = {};
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const textInput = form.shadowRoot!.querySelector("pages-input") as any;
    expect(textInput).not.toBeNull();
    expect(textInput.value).toBe("Alice");
    expect(textInput.label).toBe("Name");
  });

  it("display mode sets children as not editable", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { mode: "display" };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const textInput = form.shadowRoot!.querySelector("pages-input") as any;
    expect(textInput.disabled).toBe(true);
  });
});

describe("PagesSchemaForm — create mode", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("zero rows triggers create mode with submit button", async () => {
    const ds = makeDataSet([["name", "TEXT"]], []);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { name: { type: "string" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const submitBtn = form.shadowRoot!.querySelector(".submit-btn");
    expect(submitBtn).not.toBeNull();
  });

  it("submit emits pages-record-create with collected values", async () => {
    const ds = makeDataSet([["name", "TEXT"]], []);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { schema: { properties: { name: { type: "string" } } } };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const textInput = form.shadowRoot!.querySelector("pages-input") as any;
    textInput.value = "NewName";

    const events: CustomEvent[] = [];
    form.addEventListener("pages-record-create", (e) => events.push(e as CustomEvent));

    form.submit();

    expect(events.length).toBe(1);
    expect(events[0]!.detail.record).toEqual({ name: "NewName" });
  });

  it("submit returns null when required fields are empty", async () => {
    const ds = makeDataSet([["name", "TEXT"]], []);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = {
      schema: { properties: { name: { type: "string" } }, required: ["name"] },
    };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const events: CustomEvent[] = [];
    form.addEventListener("pages-record-create", (e) => events.push(e as CustomEvent));

    const result = form.submit();
    expect(result).toBeNull();
    expect(events.length).toBe(0);
  });

  it("forceCreate shows submit button even with data rows", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = { forceCreate: true };
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const submitBtn = form.shadowRoot!.querySelector(".submit-btn");
    expect(submitBtn).not.toBeNull();
  });

  it("edit mode with data rows does not show submit button", async () => {
    const ds = makeDataSet([["name", "TEXT"]], [["Alice"]]);
    const form = document.createElement("pages-schema-form") as PagesSchemaForm;
    form.props = {};
    form.editable = true;
    container.appendChild(form);
    await form.updateComplete;
    form.dataSet = ds;
    await form.updateComplete;

    const submitBtn = form.shadowRoot!.querySelector(".submit-btn");
    expect(submitBtn).toBeNull();
  });
});
