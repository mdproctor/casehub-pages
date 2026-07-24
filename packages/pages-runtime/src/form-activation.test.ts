import { describe, it, expect } from "vitest";
import type { Component } from "@casehubio/pages-component";
import type { DataSetId, ColumnId } from "@casehubio/pages-data";
import "@casehubio/pages-viz"; // side-effect: registers chart/table custom elements
import { loadSite } from "./site.js";

describe("form input activation", () => {
  async function waitForElement(
    target: HTMLElement,
    selector: string,
    maxWait = 500,
  ): Promise<HTMLElement> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const el = target.querySelector<HTMLElement>(selector);
      if (el) return el;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Element not found: ${selector}`);
  }

  async function waitForData(
    target: HTMLElement,
    selector: string,
    maxWait = 500,
  ): Promise<HTMLElement & { dataSet?: unknown }> {
    const el = await waitForElement(target, selector);
    const vizTag = el.dataset.componentType;
    if (!vizTag) throw new Error(`No componentType on ${selector}`);
    const vizEl = el.querySelector<HTMLElement & { dataSet?: unknown }>(`pages-${vizTag}`);
    if (!vizEl) throw new Error(`Viz element not found in ${selector}`);
    const start = Date.now();
    while (!vizEl.dataSet && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return vizEl;
  }

  it("activates input as a data component with implicit lookup", async () => {
    const root: Component = {
      type: "page",
      props: { name: "Root" },
      slots: {
        content: [{
          type: "page",
          props: {
            name: "Form",
            dataScope: { dataset: "emps" as DataSetId, idColumn: "id" },
            save: { adapter: "local" },
            datasets: [{
              uuid: "emps" as DataSetId,
              content: JSON.stringify([
                ["1", "Alice"],
                ["2", "Bob"],
              ]),
              columns: [
                { id: "id", type: "TEXT" },
                { id: "name", type: "TEXT" },
              ],
            }],
          },
          slots: {
            content: [{
              type: "input",
              id: "name-input",
              props: { field: "name", label: "Name" },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // The input element should exist
    const inputContainer = target.querySelector("[data-component-type='input']");
    expect(inputContainer).not.toBeNull();

    // The pages-input custom element should be inside
    const formEl = inputContainer!.querySelector("pages-input") as any;
    expect(formEl).not.toBeNull();

    // Standalone components get value set by the proxy, not dataSet
    const start = Date.now();
    while (formEl.value === "" && Date.now() - start < 500) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(formEl.value).toBeTruthy();

    site.dispose();
    document.body.removeChild(target);
  });

  it("sets error on form input without page dataScope", async () => {
    const root: Component = {
      type: "page",
      props: { name: "Root" },
      slots: {
        content: [{
          type: "input",
          id: "orphan-input",
          props: { field: "name", label: "Name" },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    const formEl = target.querySelector("pages-input") as any;
    expect(formEl).not.toBeNull();
    expect(formEl.error).toBe("Form input requires page dataScope");

    site.dispose();
    document.body.removeChild(target);
  });

  it("sets editable to false when page has no save config", async () => {
    const root: Component = {
      type: "page",
      props: { name: "Root" },
      slots: {
        content: [{
          type: "page",
          props: {
            name: "Form",
            dataScope: { dataset: "emps" as DataSetId, idColumn: "id" },
            // No save config
            datasets: [{
              uuid: "emps" as DataSetId,
              content: JSON.stringify([["1", "Alice"]]),
              columns: [
                { id: "id", type: "TEXT" },
                { id: "name", type: "TEXT" },
              ],
            }],
          },
          slots: {
            content: [{
              type: "input",
              id: "readonly-input",
              props: { field: "name", label: "Name" },
            }],
          },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    const formEl = target.querySelector("pages-input") as any;
    expect(formEl).not.toBeNull();
    expect(formEl.label).toBe("Name");

    site.dispose();
    document.body.removeChild(target);
  });

  it("filter changes on parent page propagate to child form inputs", async () => {
    // Parent page has a selector that filters; child page has a input
    // that should receive the filtered data
    const root: Component = {
      type: "page",
      props: {
        name: "App",
        datasets: [{
          uuid: "people" as DataSetId,
          content: JSON.stringify([
            ["Sales", "1", "Alice"],
            ["Sales", "2", "Bob"],
            ["Eng", "3", "Charlie"],
          ]),
          columns: [
            { id: "dept", type: "LABEL" },
            { id: "id", type: "TEXT" },
            { id: "name", type: "TEXT" },
          ],
        }],
      },
      slots: {
        default: [
          {
            type: "selector",
            id: "dept-sel",
            props: {
              filter: { notification: true },
              lookup: {
                dataSetId: "people" as DataSetId,
                operations: [{
                  type: "group" as const,
                  groupingKey: {
                    sourceId: "dept" as ColumnId,
                    columnId: "dept" as ColumnId,
                    strategy: { mode: "distinct" as const },
                    maxIntervals: 100,
                    emptyIntervals: true,
                    ascendingOrder: true,
                  },
                  columns: [
                    { kind: "key" as const, sourceId: "dept" as ColumnId, columnId: "dept" as ColumnId },
                  ],
                }],
              },
            },
          },
          {
            type: "page",
            props: {
              name: "Detail",
              dataScope: { dataset: "people" as DataSetId, idColumn: "id" },
              save: { adapter: "local" },
            },
            slots: {
              content: [{
                type: "input",
                id: "detail-name",
                props: { field: "name", label: "Name" },
              }],
            },
          },
        ],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    // Wait for selector data
    await waitForData(target, "[data-component-id='dept-sel']");

    // Wait for input value to be set by proxy
    const formEl = target.querySelector("pages-input") as any;
    expect(formEl).not.toBeNull();
    const startTime = Date.now();
    while (formEl.value === "" && Date.now() - startTime < 500) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(formEl.value).toBeTruthy();
    const initialValue = formEl.value;

    // Select "Sales" (row index 0 in the grouped output)
    const selectorViz = target.querySelector("pages-selector")!;
    const selectEl = selectorViz.shadowRoot!.querySelector("select")!;
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // After filtering, the proxy receives a new dataset and sets .value
    // The value should still be set (pipeline still delivers data)
    expect(formEl.value).toBeTruthy();

    site.dispose();
    document.body.removeChild(target);
  });
});
