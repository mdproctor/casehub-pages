import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import { PagesTextInput } from "./PagesTextInput.js";
import type { TextInputProps } from "@casehubio/pages-component";
import type { SubmitConfig } from "@casehubio/pages-component/dist/model/action-types.js";

interface PagesActionRequestDetail {
  readonly config: {
    readonly url: string;
    readonly method?: "POST" | "PUT";
    readonly body?: Record<string, unknown>;
    readonly callbacks: {
      readonly onSuccess?: { readonly refresh?: string[]; readonly message?: string };
      readonly onError?: { readonly message?: string };
    };
  };
  readonly resolve: (result: { readonly success: boolean; readonly error?: string }) => void;
}

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

describe("Form Submit", () => {
  let el: PagesTextInput;

  beforeEach(() => {
    el = document.createElement("pages-text-input");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  it("dispatches pages-action-request on Enter key when submit config present", async () => {
    const ds = makeDataSet([["query", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/search",
      method: "POST",
    };

    el.props = { field: "query", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        resolve(detail);
      }, { once: true });
    });

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "test search";
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    input.dispatchEvent(enterEvent);

    const { config, resolve: actionResolve } = await eventPromise;

    expect(config.url).toBe("/api/search");
    expect(config.method).toBe("POST");
    expect(config.body).toEqual({ query: "test search" });
    expect(config.callbacks).toBeDefined();

    // Clean up by resolving
    actionResolve({ success: true });
  });

  it("constructs body using fieldName when provided", async () => {
    const ds = makeDataSet([["input", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/submit",
      fieldName: "customField",
    };

    el.props = { field: "input", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        resolve(detail);
      }, { once: true });
    });

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "my value";
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    input.dispatchEvent(enterEvent);

    const { config, resolve: actionResolve } = await eventPromise;

    expect(config.body).toEqual({ customField: "my value" });

    // Clean up
    actionResolve({ success: true });
  });

  it("defaults to props.field when fieldName not provided", async () => {
    const ds = makeDataSet([["username", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/user",
    };

    el.props = { field: "username", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        resolve(detail);
      }, { once: true });
    });

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "alice";
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    input.dispatchEvent(enterEvent);

    const { config, resolve: actionResolve } = await eventPromise;

    expect(config.body).toEqual({ username: "alice" });

    // Clean up
    actionResolve({ success: true });
  });

  it("clears field on successful submit when clearOnSubmit is true", async () => {
    const ds = makeDataSet([["message", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/message",
      clearOnSubmit: true,
    };

    el.props = { field: "message", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "hello world";

    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });

    const actionPromise = new Promise<void>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        // Simulate successful response
        detail.resolve({ success: true });
        resolve();
      }, { once: true });
    });

    input.dispatchEvent(enterEvent);
    await actionPromise;

    // Wait for field to be cleared
    await new Promise(r => setTimeout(r, 10));

    expect(input.value).toBe("");
  });

  it("preserves field value on failed submit", async () => {
    const ds = makeDataSet([["message", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/message",
      clearOnSubmit: true,
      onError: { message: "Submit failed" },
    };

    el.props = { field: "message", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "hello world";

    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });

    const actionPromise = new Promise<void>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        // Simulate error response
        detail.resolve({ success: false, error: "Network error" });
        resolve();
      }, { once: true });
    });

    input.dispatchEvent(enterEvent);
    await actionPromise;

    // Wait for any potential clearing
    await new Promise(r => setTimeout(r, 10));

    // Value should be preserved on error
    expect(input.value).toBe("hello world");
  });

  it("does not dispatch pages-field-change when submit mode is active", async () => {
    const ds = makeDataSet([["query", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/search",
    };

    el.props = { field: "query", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const fieldChangeEvents: Event[] = [];
    el.addEventListener("pages-field-change", (e: Event) => {
      fieldChangeEvents.push(e);
    });

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "test search";

    const actionPromise = new Promise<void>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        detail.resolve({ success: true });
        resolve();
      }, { once: true });
    });

    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    input.dispatchEvent(enterEvent);

    await actionPromise;

    // No pages-field-change should have been dispatched during Enter
    // (but input/blur events might have dispatched their own)
    // The key point is that submit operates independently
    expect(fieldChangeEvents.length).toBe(0);
  });

  it("does not trigger submit when submit config is not present", () => {
    const ds = makeDataSet([["name", "TEXT"]], [[""]]);

    el.props = { field: "name", lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    const actionEvents: Event[] = [];
    el.addEventListener("pages-action-request", (e: Event) => {
      actionEvents.push(e);
    });

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "test";
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    input.dispatchEvent(enterEvent);

    expect(actionEvents).toHaveLength(0);
  });

  it("uses method from config (defaults to POST)", async () => {
    const ds = makeDataSet([["data", "TEXT"]], [[""]]);
    const submit: SubmitConfig = {
      url: "/api/update",
      method: "PUT",
    };

    el.props = { field: "data", submit, lookup: mockLookup("test") };
    el.editable = true;
    document.body.appendChild(el);
    el.dataSet = ds;

    // Wait for MutationObserver to set up listener
    await new Promise(r => setTimeout(r, 50));

    const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
      el.addEventListener("pages-action-request", (e: Event) => {
        const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
        resolve(detail);
      }, { once: true });
    });

    const input = el.shadowRoot.querySelector("input")!;
    input.value = "updated";
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    input.dispatchEvent(enterEvent);

    const { config, resolve: actionResolve } = await eventPromise;

    expect(config.method).toBe("PUT");

    // Clean up
    actionResolve({ success: true });
  });
});
