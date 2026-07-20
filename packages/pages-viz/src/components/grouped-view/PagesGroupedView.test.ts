import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, ColumnId, SortColumn } from "@casehubio/pages-data";
import { ColumnType } from "@casehubio/pages-data";
import { toTypedDataSet } from "@casehubio/pages-data";
import type { GroupedViewProps, TableColumnConfig, RowStyleRule, ColumnRenderer } from "@casehubio/pages-component";
import type { DataSetLookup } from "@casehubio/pages-data";
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

interface MockTable extends HTMLElement {
  dataSet: any;
  columnConfig: any;
  columnRenderers: any;
  rowStyle: any;
  selection: any;
  sortable: any;
  embedded: any;
  headerVisible: any;
  activeSort: any;
  getRowKey: any;
  getRowDetail: any;
  getRowClass: any;
  clientSort: any;
  mode: any;
  hiddenColumns: any;
  selectedKeys: any;
}

class MockPagesTable extends HTMLElement {
  dataSet: any;
  columnConfig: any;
  columnRenderers: any;
  rowStyle: any;
  selection: any;
  sortable: any;
  embedded: any;
  headerVisible: any;
  activeSort: any;
  getRowKey: any;
  getRowDetail: any;
  getRowClass: any;
  clientSort: any;
  mode: any;
  hiddenColumns: any;
  selectedKeys: any;
}

if (!customElements.get("pages-table")) {
  customElements.define("pages-table", MockPagesTable);
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

  describe("basic rendering", () => {
    it("sectioned mode creates pages-table per group", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      expect(tables.length).toBe(2);
    });

    it("spreadsheet mode creates pages-table per group", async () => {
      element.props = makeProps({ preset: "spreadsheet" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      expect(tables.length).toBe(2);
    });

    it("list mode renders dl elements, no pages-table", async () => {
      element.props = makeProps({ preset: "list" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      expect(tables.length).toBe(0);
      const dls = element.shadowRoot!.querySelectorAll("dl");
      expect(dls.length).toBe(2);
    });

    it("each table receives correct data subset", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      const t0 = tables[0] as MockTable;
      const t1 = tables[1] as MockTable;
      expect(t0.dataSet.rows.length).toBe(2);
      expect(t1.dataSet.rows.length).toBe(1);
    });

    it("per-group tables have embedded=true and headerVisible=false", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      for (const table of tables) {
        expect((table as MockTable).embedded).toBe(true);
        expect((table as MockTable).headerVisible).toBe(false);
      }
    });
  });

  describe("shared header bar", () => {
    it("renders shared column header bar once at top", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const bars = element.shadowRoot!.querySelectorAll(".column-header-bar");
      expect(bars.length).toBe(1);
    });

    it("header bar is outside any group-section", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const bar = element.shadowRoot!.querySelector(".column-header-bar");
      expect(bar!.closest(".group-section")).toBeNull();
    });

    it("header bar shows column names", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const labels = element.shadowRoot!.querySelectorAll(".column-header-bar .col-label, .column-header-bar .col-header");
      expect(labels.length).toBe(2);
      expect(labels[0]!.textContent).toContain("Name");
      expect(labels[1]!.textContent).toContain("Date");
    });
  });

  describe("column alignment", () => {
    it("all tables receive identical columnConfig widths", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      const configs = Array.from(tables).map((t) => (t as MockTable).columnConfig);
      expect(configs[0]).toEqual(configs[1]);
      const visibleCols = configs[0].filter((c: any) => c.visible !== false);
      expect(visibleCols.length).toBeGreaterThan(0);
      for (const col of visibleCols) {
        expect(col.width).toMatch(/fr$/);
      }
    });

    it("consumer columnConfig width overrides computed widths", async () => {
      element.props = makeProps({
        preset: "sectioned",
        columnConfig: [{ id: "name" as ColumnId, width: "200px" }],
      });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      const cfg = (tables[0] as MockTable).columnConfig;
      const nameCol = cfg.find((c: TableColumnConfig) => c.id === "name");
      expect(nameCol!.width).toBe("200px");
    });
  });

  describe("expand/collapse", () => {
    it("toggles hidden attribute on section content", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const toggle = element.shadowRoot!.querySelector("[data-group='Critical']") as HTMLButtonElement;
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const contentId = toggle.getAttribute("aria-controls")!;
      const content = element.shadowRoot!.getElementById(contentId)!;
      expect(content.hidden).toBe(false);

      toggle.click();
      await element.updateComplete;
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(content.hidden).toBe(true);
    });

    it("preserves table DOM reference after toggle", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tableBefore = element.shadowRoot!.querySelector("pages-table");
      const toggle = element.shadowRoot!.querySelector("[data-group='Critical']") as HTMLButtonElement;
      toggle.click();
      await element.updateComplete;
      toggle.click();
      await element.updateComplete;
      const tableAfter = element.shadowRoot!.querySelector("pages-table");
      expect(tableAfter).toBe(tableBefore);
    });

    it("emits pages-event on group toggle", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const events: CustomEvent[] = [];
      element.addEventListener("pages-event", (e: Event) => events.push(e as CustomEvent));
      const toggle = element.shadowRoot!.querySelector(".section-toggle") as HTMLButtonElement;
      toggle.click();
      await element.updateComplete;
      expect(events.length).toBe(1);
      expect(events[0]!.detail.topic).toBe("group-toggle");
    });

    it("hides content when defaultExpanded is false", async () => {
      element.props = makeProps({ preset: "sectioned", defaultExpanded: false });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const contents = element.shadowRoot!.querySelectorAll(".section-content");
      for (const content of contents) {
        expect((content as HTMLElement).hidden).toBe(true);
      }
    });

    it("has unique aria-controls IDs", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const toggles = element.shadowRoot!.querySelectorAll("[data-group]");
      const ids = Array.from(toggles).map((t) => t.getAttribute("aria-controls"));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(element.shadowRoot!.getElementById(id!)).not.toBeNull();
      }
    });
  });

  describe("property forwarding", () => {
    it("forwards columnRenderers to all tables", async () => {
      const renderers = new Map([["name" as ColumnId, (() => "custom") as unknown as ColumnRenderer]]);
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      (element as any).setColumnRenderers(renderers);
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      for (const table of tables) {
        expect((table as MockTable).columnRenderers).toBe(renderers);
      }
    });

    it("forwards rowStyle from props to all tables", async () => {
      const rules: readonly RowStyleRule[] = [{ condition: "true", className: "highlight" }];
      element.props = makeProps({ preset: "sectioned", rowStyle: rules });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      for (const table of tables) {
        expect((table as MockTable).rowStyle).toEqual(rules);
      }
    });

    it("forwards selection from props to all tables", async () => {
      element.props = makeProps({ preset: "sectioned", selection: "multi" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      for (const table of tables) {
        expect((table as MockTable).selection).toBe("multi");
      }
    });
  });

  describe("reconciliation", () => {
    it("reuses table DOM elements when data refreshes with same groups", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tableBefore = element.shadowRoot!.querySelector("pages-table");
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tableAfter = element.shadowRoot!.querySelector("pages-table");
      expect(tableAfter).toBe(tableBefore);
    });

    it("rebuilds tables when group structure changes", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const tableBefore = element.shadowRoot!.querySelector("pages-table");

      const newDs: DataSet = {
        columns: [
          { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
          { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
          { id: "date" as ColumnId, name: "Date", type: ColumnType.LABEL },
        ],
        data: [
          ["Info", "New item", "Jul 8"],
        ],
      };
      element.dataSet = toTypedDataSet(newDs);
      await element.updateComplete;
      const tableAfter = element.shadowRoot!.querySelector("pages-table");
      expect(tableAfter).not.toBe(tableBefore);
    });

    it("handles empty dataset without crash", async () => {
      const ds: DataSet = {
        columns: [
          { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
          { id: "name" as ColumnId, name: "Name", type: ColumnType.LABEL },
        ],
        data: [],
      };
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = toTypedDataSet(ds);
      await element.updateComplete;
      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      expect(tables.length).toBe(0);
    });
  });

  describe("sort coordination", () => {
    it("sort buttons dispatch pages-sort from grouped view", async () => {
      element.props = makeProps({ preset: "sectioned", sortable: true });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const events: CustomEvent[] = [];
      element.addEventListener("pages-sort", (e: Event) => events.push(e as CustomEvent));
      const sortBtn = element.shadowRoot!.querySelector(".col-header") as HTMLButtonElement;
      sortBtn.click();
      expect(events.length).toBe(1);
      expect(events[0]!.detail.order).toBe("ASCENDING");
    });

    it("renders static labels when sortable is false", async () => {
      element.props = makeProps({ preset: "sectioned", sortable: false });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const buttons = element.shadowRoot!.querySelectorAll(".col-header");
      expect(buttons.length).toBe(0);
      const labels = element.shadowRoot!.querySelectorAll(".column-header-bar .col-label");
      expect(labels.length).toBe(2);
    });

    it("updates sort indicators when activeSort changes", async () => {
      element.props = makeProps({ preset: "sectioned", sortable: true });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      element.activeSort = { columnId: "name" as ColumnId, order: "ASCENDING" } as SortColumn;
      element.requestUpdate();
      await element.updateComplete;
      const active = element.shadowRoot!.querySelector(".col-header[data-column='name']");
      expect(active!.getAttribute("aria-sort")).toBe("ascending");
      expect(active!.classList.contains("sort-asc")).toBe(true);
    });
  });

  describe("list mode column header bar", () => {
    it("shows col-label spans in list mode", async () => {
      element.props = makeProps({ preset: "list" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const headerBar = element.shadowRoot!.querySelector(".column-header-bar");
      expect(headerBar).not.toBeNull();
      const labels = headerBar!.querySelectorAll(".col-label");
      expect(labels.length).toBe(2);
    });
  });

  describe("interstitial hook", () => {
    it("renderAfterHeader inserts content between header and table", async () => {
      element.props = makeProps({
        preset: "sectioned",
        renderAfterHeader: (node) => {
          if (node.name === "Critical") {
            const div = document.createElement("div");
            div.className = "gate-marker";
            div.textContent = "GATE: blocks-ui#41";
            return div;
          }
          return undefined;
        },
      });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const gateMarker = element.shadowRoot!.querySelector(".gate-marker");
      expect(gateMarker).not.toBeNull();
      expect(gateMarker!.textContent).toBe("GATE: blocks-ui#41");
    });

    it("renderAfterHeader does not insert for groups returning undefined", async () => {
      element.props = makeProps({
        preset: "sectioned",
        renderAfterHeader: (node) => {
          if (node.name === "NonExistent") {
            const div = document.createElement("div");
            div.className = "gate-marker";
            return div;
          }
          return undefined;
        },
      });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const gateMarker = element.shadowRoot!.querySelector(".gate-marker");
      expect(gateMarker).toBeNull();
    });
  });

  describe("multi-level grouping", () => {
    function makeMultiLevelDataset() {
      const ds: DataSet = {
        columns: [
          { id: "phase" as ColumnId, name: "Phase", type: ColumnType.LABEL },
          { id: "status" as ColumnId, name: "Status", type: ColumnType.LABEL },
          { id: "title" as ColumnId, name: "Title", type: ColumnType.LABEL },
        ],
        data: [
          ["UI", "done", "Task A"],
          ["UI", "done", "Task B"],
          ["UI", "open", "Task C"],
          ["API", "done", "Task D"],
          ["API", "blocked", "Task E"],
        ],
      };
      return toTypedDataSet(ds);
    }

    function makeMultiLevelKey(column: string) {
      return {
        sourceId: column as ColumnId,
        columnId: column as ColumnId,
        strategy: { mode: "distinct" as const },
        maxIntervals: 100,
        emptyIntervals: false,
        ascendingOrder: true,
      };
    }

    it("renders nested section headers for multi-level groupBy", async () => {
      element.props = makeProps({
        groupBy: [makeMultiLevelKey("phase"), makeMultiLevelKey("status")],
        preset: "sectioned",
        defaultExpanded: true,
      });
      element.dataSet = makeMultiLevelDataset();
      await element.updateComplete;

      const topSections = element.shadowRoot!.querySelectorAll(".section-toggle");
      expect(topSections.length).toBe(2);
      expect(topSections[0]!.querySelector(".section-title")!.textContent).toBe("UI");
      expect(topSections[1]!.querySelector(".section-title")!.textContent).toBe("API");

      const subSections = element.shadowRoot!.querySelectorAll(".sub-section-toggle");
      expect(subSections.length).toBe(4);
    });

    it("renders tables only at leaf level", async () => {
      element.props = makeProps({
        groupBy: [makeMultiLevelKey("phase"), makeMultiLevelKey("status")],
        preset: "sectioned",
        defaultExpanded: true,
      });
      element.dataSet = makeMultiLevelDataset();
      await element.updateComplete;

      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      expect(tables.length).toBe(4);
    });

    it("leaf tables have correct row counts", async () => {
      element.props = makeProps({
        groupBy: [makeMultiLevelKey("phase"), makeMultiLevelKey("status")],
        preset: "sectioned",
        defaultExpanded: true,
      });
      element.dataSet = makeMultiLevelDataset();
      await element.updateComplete;

      const tables = element.shadowRoot!.querySelectorAll("pages-table") as NodeListOf<MockTable>;
      expect(tables[0]!.dataSet.rows.length).toBe(2);
      expect(tables[1]!.dataSet.rows.length).toBe(1);
      expect(tables[2]!.dataSet.rows.length).toBe(1);
      expect(tables[3]!.dataSet.rows.length).toBe(1);
    });

    it("excludes all groupBy columns from content", async () => {
      element.props = makeProps({
        groupBy: [makeMultiLevelKey("phase"), makeMultiLevelKey("status")],
        preset: "sectioned",
        defaultExpanded: true,
      });
      element.dataSet = makeMultiLevelDataset();
      await element.updateComplete;

      const headerBar = element.shadowRoot!.querySelector(".column-header-bar");
      expect(headerBar).not.toBeNull();
      const headers = headerBar!.querySelectorAll(".col-header, .col-label");
      const headerTexts = Array.from(headers).map((h) => h.textContent?.trim());
      expect(headerTexts).not.toContain("Phase");
      expect(headerTexts).not.toContain("Status");
      expect(headerTexts).toContain("Title");
    });

    it("single-key array behaves same as single object", async () => {
      element.props = makeProps({
        groupBy: [makeMultiLevelKey("status")],
        preset: "sectioned",
        defaultExpanded: true,
      });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const sections = element.shadowRoot!.querySelectorAll(".section-toggle");
      expect(sections.length).toBe(2);
    });
  });

  describe("list mode column renderers", () => {
    it("applies column renderer returning string in list mode", async () => {
      const renderers = new Map([
        ["name" as ColumnId, ((cell: any) => `[${String(cell.value)}]`) as unknown as ColumnRenderer],
      ]);
      element.props = makeProps({ preset: "list" });
      (element as any).setColumnRenderers(renderers);
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const dds = element.shadowRoot!.querySelectorAll("dd");
      const nameValues = Array.from(dds).filter((_, i) => i % 2 === 0).map((dd) => dd.textContent);
      expect(nameValues[0]).toBe("[Server outage]");
    });

    it("applies column renderer returning HTMLElement in list mode", async () => {
      const renderers = new Map([
        ["name" as ColumnId, ((cell: any) => {
          const span = document.createElement("span");
          span.className = "custom-render";
          span.textContent = String(cell.value);
          return span;
        }) as unknown as ColumnRenderer],
      ]);
      element.props = makeProps({ preset: "list" });
      (element as any).setColumnRenderers(renderers);
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const customSpans = element.shadowRoot!.querySelectorAll(".custom-render");
      expect(customSpans.length).toBeGreaterThan(0);
      expect(customSpans[0]!.textContent).toBe("Server outage");
    });

    it("falls back to plain text when no renderer for column", async () => {
      const renderers = new Map([
        ["nonexistent" as ColumnId, (() => "nope") as unknown as ColumnRenderer],
      ]);
      element.props = makeProps({ preset: "list" });
      element.dataSet = makeGroupedDataset();
      (element as any).setColumnRenderers(renderers);
      await element.updateComplete;
      const dds = element.shadowRoot!.querySelectorAll("dd");
      expect(dds[0]!.textContent).toBe("Server outage");
      expect(dds[0]!.children.length).toBe(0);
    });
  });

  describe("column visibility", () => {
    it("renders column picker button in header bar", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;
      const picker = element.shadowRoot!.querySelector(".column-picker-trigger");
      expect(picker).not.toBeNull();
    });

    it("toggling column visibility hides column from all tables", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const trigger = element.shadowRoot!.querySelector(".column-picker-trigger") as HTMLButtonElement;
      trigger.click();
      await element.updateComplete;

      const checkboxes = element.shadowRoot!.querySelectorAll(".column-picker-item input[type='checkbox']");
      expect(checkboxes.length).toBeGreaterThan(0);
      (checkboxes[0] as HTMLInputElement).click();
      await element.updateComplete;

      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      for (const table of tables) {
        const t = table as MockTable;
        expect(t.hiddenColumns).toBeDefined();
        expect(t.hiddenColumns.length).toBeGreaterThan(0);
      }
    });

    it("emits column-change event from grouped view", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const events: CustomEvent[] = [];
      element.addEventListener("column-change", (e: Event) => events.push(e as CustomEvent));

      const trigger = element.shadowRoot!.querySelector(".column-picker-trigger") as HTMLButtonElement;
      trigger.click();
      await element.updateComplete;

      const checkboxes = element.shadowRoot!.querySelectorAll(".column-picker-item input[type='checkbox']");
      (checkboxes[0] as HTMLInputElement).click();
      await element.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.visibleColumns).toBeDefined();
    });

    it("hides column header in shared header bar when column is toggled", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const trigger = element.shadowRoot!.querySelector(".column-picker-trigger") as HTMLButtonElement;
      trigger.click();
      await element.updateComplete;

      const checkboxes = element.shadowRoot!.querySelectorAll(".column-picker-item input[type='checkbox']");
      (checkboxes[0] as HTMLInputElement).click();
      await element.updateComplete;

      const visibleHeaders = element.shadowRoot!.querySelectorAll("[data-column]:not([hidden])");
      expect(visibleHeaders.length).toBe(1);
    });

    it("prevents hiding the last visible column", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const trigger = element.shadowRoot!.querySelector(".column-picker-trigger") as HTMLButtonElement;
      trigger.click();
      await element.updateComplete;

      // Hide first column
      const checkboxes = element.shadowRoot!.querySelectorAll(".column-picker-item input[type='checkbox']");
      (checkboxes[0] as HTMLInputElement).click();
      await element.updateComplete;

      // Re-open picker — the remaining visible column should be disabled
      trigger.click();
      await element.updateComplete;
      trigger.click();
      await element.updateComplete;

      const updatedCheckboxes = element.shadowRoot!.querySelectorAll(".column-picker-item input[type='checkbox']");
      const checkedEnabled = Array.from(updatedCheckboxes).filter(
        (cb) => (cb as HTMLInputElement).checked && !(cb as HTMLInputElement).disabled
      );
      expect(checkedEnabled.length).toBe(0);
    });
  });

  describe("cross-group unified selection", () => {
    it("selection in one group is reflected across all tables", async () => {
      const getRowKey = (row: any) => String(row.cell("name" as ColumnId).value);
      element.props = makeProps({ preset: "sectioned", selection: "multi" });
      (element as any).setGetRowKey(getRowKey);
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const tables = element.shadowRoot!.querySelectorAll("pages-table") as NodeListOf<MockTable>;
      expect(tables.length).toBe(2);

      tables[0]!.dispatchEvent(new CustomEvent("selection-change", {
        detail: { selectedKeys: ["Server outage"], selectedRows: [] },
        bubbles: true,
        composed: true,
      }));
      await element.updateComplete;

      for (const table of tables) {
        expect((table as MockTable).selectedKeys).toBeDefined();
      }
    });

    it("emits unified selection-change from grouped view", async () => {
      const getRowKey = (row: any) => String(row.cell("name" as ColumnId).value);
      element.props = makeProps({ preset: "sectioned", selection: "multi" });
      (element as any).setGetRowKey(getRowKey);
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const events: CustomEvent[] = [];
      element.addEventListener("selection-change", (e: Event) => events.push(e as CustomEvent));

      const tables = element.shadowRoot!.querySelectorAll("pages-table");
      tables[0]!.dispatchEvent(new CustomEvent("selection-change", {
        detail: { selectedKeys: ["Server outage"], selectedRows: [] },
        bubbles: true,
        composed: true,
      }));
      await element.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.selectedKeys).toContain("Server outage");
    });

    it("renders select-all checkbox in header when selection=multi", async () => {
      const getRowKey = (row: any) => String(row.cell("name" as ColumnId).value);
      element.props = makeProps({ preset: "sectioned", selection: "multi" });
      (element as any).setGetRowKey(getRowKey);
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const selectAll = element.shadowRoot!.querySelector(".select-all-checkbox");
      expect(selectAll).not.toBeNull();
    });

    it("select-all toggles all rows across all groups", async () => {
      const getRowKey = (row: any) => String(row.cell("name" as ColumnId).value);
      element.props = makeProps({ preset: "sectioned", selection: "multi" });
      (element as any).setGetRowKey(getRowKey);
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const events: CustomEvent[] = [];
      element.addEventListener("selection-change", (e: Event) => events.push(e as CustomEvent));

      const selectAll = element.shadowRoot!.querySelector(".select-all-checkbox") as HTMLInputElement;
      selectAll.click();
      await element.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0]!.detail.selectedKeys.length).toBe(3);
    });

    it("no select-all when selection is not multi", async () => {
      element.props = makeProps({ preset: "sectioned" });
      element.dataSet = makeGroupedDataset();
      await element.updateComplete;

      const selectAll = element.shadowRoot!.querySelector(".select-all-checkbox");
      expect(selectAll).toBeNull();
    });
  });
});
