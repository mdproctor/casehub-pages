import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetId, ColumnId } from "@casehub/data/dist/dataset/types.js";
import "@casehub/viz"; // side-effect: registers chart/table custom elements
import { loadSite } from "./site.js";

describe("form input activation", () => {
  async function waitForElement(
    target: HTMLElement,
    selector: string,
    maxWait = 500,
  ): Promise<HTMLElement> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const el = target.querySelector(selector);
      if (el) return el as HTMLElement;
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
    const vizEl = el.querySelector(`casehub-${vizTag}`) as (HTMLElement & { dataSet?: unknown }) | null;
    if (!vizEl) throw new Error(`Viz element not found in ${selector}`);
    const start = Date.now();
    while (!vizEl.dataSet && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return vizEl;
  }

  it("activates text-input as a data component with implicit lookup", async () => {
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
              type: "text-input",
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

    // The text-input element should exist
    const inputContainer = target.querySelector("[data-component-type='text-input']");
    expect(inputContainer).not.toBeNull();

    // The casehub-text-input custom element should be inside
    const vizEl = inputContainer!.querySelector("casehub-text-input") as HTMLElement & {
      editable?: boolean;
      dataSet?: unknown;
    };
    expect(vizEl).not.toBeNull();
    expect(vizEl!.editable).toBe(true);

    // Wait for data to load (async resolution)
    const start = Date.now();
    while (!vizEl!.dataSet && Date.now() - start < 500) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(vizEl!.dataSet).toBeTruthy();

    site.dispose();
    document.body.removeChild(target);
  });

  it("sets error on form input without page dataScope", async () => {
    const root: Component = {
      type: "page",
      props: { name: "Root" },
      slots: {
        content: [{
          type: "text-input",
          id: "orphan-input",
          props: { field: "name", label: "Name" },
        }],
      },
    };

    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, root);

    const vizEl = target.querySelector("casehub-text-input") as HTMLElement & {
      error?: string;
    };
    expect(vizEl).not.toBeNull();
    expect(vizEl!.error).toBe("Form input requires page dataScope");

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
              type: "text-input",
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

    const vizEl = target.querySelector("casehub-text-input") as HTMLElement & {
      editable?: boolean;
    };
    expect(vizEl).not.toBeNull();
    expect(vizEl!.editable).toBe(false);

    site.dispose();
    document.body.removeChild(target);
  });

  it("filter changes on parent page propagate to child form inputs", async () => {
    // Parent page has a selector that filters; child page has a text-input
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
                type: "text-input",
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
    const selContainer = await waitForData(target, "[data-component-id='dept-sel']");

    // Wait for text-input data
    const textViz = target.querySelector("casehub-text-input") as HTMLElement & {
      dataSet?: { rows: readonly { cell(id: string): { value: unknown; type: string } }[] };
    };
    expect(textViz).not.toBeNull();
    const startTime = Date.now();
    while (!textViz.dataSet && Date.now() - startTime < 500) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(textViz.dataSet).toBeTruthy();
    // Before filtering: should have all 3 rows
    expect(textViz.dataSet!.rows.length).toBe(3);

    // Select "Sales" (row index 0 in the grouped output)
    const selectorViz = target.querySelector("casehub-selector") as HTMLElement;
    const selectEl = selectorViz.shadowRoot!.querySelector("select")!;
    selectEl.value = "0";
    selectEl.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 50));

    // After filtering to "Sales", text-input should receive filtered data (2 Sales rows)
    // The child page has dataScope, so collectAncestorFilterOps walks up
    expect(textViz.dataSet!.rows.length).toBe(2);

    site.dispose();
    document.body.removeChild(target);
  });
});
