import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import type { GroupedViewProps } from "@casehubio/pages-component";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import { PagesGroupedView } from "./PagesGroupedView.js";

function mockLookup(): DataSetLookup {
  return { dataSetId: "test", operations: [] } as unknown as DataSetLookup;
}

function makeGroupedDataset() {
  const ds: DataSet = {
    columns: [
      { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
      { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
      { id: "date" as ColumnId, name: "Date", type: ColumnType.LABEL },
    ],
    data: [
      ["Critical", "Server outage", "Jul 7"],
      ["Critical", "Data loss", "Jul 6"],
      ["Warning", "Slow query", "Jul 5"],
    ],
  };
  return toTypedDataSet(ds);
}

function makeProps(overrides: Partial<GroupedViewProps> = {}): GroupedViewProps {
  return {
    lookup: mockLookup(),
    groupBy: {
      sourceId: "status" as ColumnId,
      columnId: "status" as ColumnId,
      strategy: { mode: "distinct" as const },
      maxIntervals: 100,
      emptyIntervals: false,
      ascendingOrder: true,
    },
    ...overrides,
  };
}

describe("PagesGroupedView", () => {
  let element: PagesGroupedView;

  beforeEach(() => {
    element = document.createElement("pages-grouped-view") as PagesGroupedView;
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it("renders in sectioned mode by default", async () => {
    element.props = makeProps();
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const sections = shadow.querySelectorAll(".group-section");
    expect(sections.length).toBe(2);
  });

  it("renders spreadsheet mode with single table", async () => {
    element.props = makeProps({ preset: "spreadsheet" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const tables = shadow.querySelectorAll("table");
    expect(tables.length).toBe(1);
    const groupHeaders = shadow.querySelectorAll(".group-header");
    expect(groupHeaders.length).toBe(2);
  });

  it("renders list mode with dl elements", async () => {
    element.props = makeProps({ preset: "list" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const dls = shadow.querySelectorAll("dl");
    expect(dls.length).toBe(2);
  });

  it("toggles expand/collapse on group click", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    let toggleBtn = shadow.querySelector(".section-toggle") as HTMLButtonElement;
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    toggleBtn = shadow.querySelector(".section-toggle") as HTMLButtonElement;
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("has unique aria-controls IDs", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const toggles = shadow.querySelectorAll(".section-toggle");
    const ids = Array.from(toggles).map((t) => t.getAttribute("aria-controls"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(shadow.getElementById(id!)).not.toBeNull();
    }
  });

  it("emits pages-event on group toggle", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const events: CustomEvent[] = [];
    element.addEventListener("pages-event", (e: Event) => events.push(e as CustomEvent));

    const shadow = element.shadowRoot;
    const toggleBtn = shadow.querySelector(".section-toggle") as HTMLButtonElement;
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(events.length).toBe(1);
    expect(events[0]!.detail.topic).toBe("group-toggle");
    expect(events[0]!.detail.payload.group).toBe("Critical");
    expect(events[0]!.detail.payload.expanded).toBe(false);
  });

  it("shows column header bar in sectioned mode", async () => {
    element.props = makeProps({ preset: "sectioned" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const headerBar = shadow.querySelector(".column-header-bar");
    expect(headerBar).not.toBeNull();
    const buttons = headerBar!.querySelectorAll(".col-header");
    expect(buttons.length).toBe(2);
  });

  it("shows col-label spans in list mode", async () => {
    element.props = makeProps({ preset: "list" });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const headerBar = shadow.querySelector(".column-header-bar");
    expect(headerBar).not.toBeNull();
    const labels = headerBar!.querySelectorAll(".col-label");
    expect(labels.length).toBe(2);
  });

  it("hides content when defaultExpanded is false", async () => {
    element.props = makeProps({ preset: "sectioned", defaultExpanded: false });
    element.dataSet = makeGroupedDataset();
    await new Promise((r) => setTimeout(r, 0));

    const shadow = element.shadowRoot;
    const contents = shadow.querySelectorAll(".section-content");
    for (const content of contents) {
      expect(content.hasAttribute("hidden")).toBe(true);
    }
  });
});
