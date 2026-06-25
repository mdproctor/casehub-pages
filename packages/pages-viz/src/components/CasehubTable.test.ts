import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { TableProps } from "@casehubio/pages-component";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import type { CasehubFilterApply, CasehubFilterReset } from "../base/filter-types.js";

import { CasehubTable } from "./CasehubTable.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(
  columns: [string, string][],
  rows: (string | number | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows.map(row => row.map(cell => cell === null ? null : String(cell))),
  };
  return toTypedDataSet(ds);
}

function makeDataSetWithNames(
  columns: { id: string; name: string; type: string }[],
  rows: (string | number | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map((c) => ({
      id: c.id as ColumnId,
      name: c.name,
      type: c.type as ColumnType,
    })),
    data: rows.map(row => row.map(cell => cell === null ? null : String(cell))),
  };
  return toTypedDataSet(ds);
}

function queryRows(el: CasehubTable): HTMLTableRowElement[] {
  return Array.from(el.shadowRoot.querySelectorAll("tbody tr"));
}

function queryHeaders(el: CasehubTable): HTMLTableCellElement[] {
  return Array.from(el.shadowRoot.querySelectorAll("thead th"));
}

function queryCells(row: HTMLTableRowElement): (string | null)[] {
  return Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CasehubTable", () => {
  let el: CasehubTable;

  beforeEach(() => {
    el = document.createElement("casehub-table");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  // ── Rendering ─────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders table with correct number of rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["Alice", 10], ["Bob", 20], ["Carol", 30]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(3);
    });

    it("header uses display names via resolveColumnName", () => {
      const ds = makeDataSetWithNames(
        [
          { id: "col1", name: "Column One", type: "LABEL" },
          { id: "col2", name: "Column Two", type: "NUMBER" },
        ],
        [["A", 1]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const headers = queryHeaders(el);
      expect(headers).toHaveLength(2);
      expect(headers[0]!.textContent).toContain("Column One");
      expect(headers[1]!.textContent).toContain("Column Two");
    });

    it("header uses props.columns override when present", () => {
      const ds = makeDataSetWithNames(
        [
          { id: "col1", name: "Original", type: "LABEL" },
        ],
        [["A"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        columns: [{ id: "col1" as ColumnId, name: "Overridden" }],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const headers = queryHeaders(el);
      expect(headers[0]!.textContent).toContain("Overridden");
    });

    it("cell values are rendered via cellToRaw", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 42]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      const cells = queryCells(rows[0]!);
      expect(cells[0]).toBe("Alice");
      expect(cells[1]).toBe("42");
    });

    it("null cells render as empty string", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", null]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      const cells = queryCells(rows[0]!);
      expect(cells[1]).toBe("");
    });

    it("renders style element in shadow DOM", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain("border-collapse");
    });
  });

  // ── Pagination rendering ────────────────────────────────────────

  describe("pagination rendering", () => {
    it("without pageSize shows all rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"], ["E"]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(5);
    });

    it("renders all received rows (pipeline controls the slice)", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]], // pipeline already sliced to page 1
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 5;
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(2); // renders exactly what pipeline provided
      expect(queryCells(rows[0]!)[0]).toBe("A");
      expect(queryCells(rows[1]!)[0]).toBe("B");
    });

    it("emits casehub-page when next button clicked", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 5;
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-page", (e) => events.push(e as CustomEvent));

      const btns = el.shadowRoot.querySelectorAll(".paging button");
      const nextBtn = btns[2] as HTMLButtonElement; // buttons: first(0), prev(1), next(2), last(3)
      expect(nextBtn).not.toBeNull();
      nextBtn.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.offset).toBe(2);
      expect(events[0]!.detail.count).toBe(2);
    });

    it("shows range and page count", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 5;
      el.dataSet = ds;

      const paging = el.shadowRoot.querySelector(".paging");
      expect(paging).not.toBeNull();
      const range = paging!.querySelector(".range")!;
      expect(range.textContent).toContain("1");
      expect(range.textContent).toContain("5");
    });

    it("first and prev buttons are disabled on first page", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 3;
      el.dataSet = ds;

      const btns = el.shadowRoot.querySelectorAll(".paging button");
      expect((btns[0] as HTMLButtonElement).disabled).toBe(true); // first
      expect((btns[1] as HTMLButtonElement).disabled).toBe(true); // prev
    });

    it("next and last buttons are disabled on last page", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["C"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 1; // last page (totalRows=3, pageSize=2 → 2 pages)
      el.totalRows = 3;
      el.dataSet = ds;

      const btns = el.shadowRoot.querySelectorAll(".paging button");
      expect((btns[2] as HTMLButtonElement).disabled).toBe(true); // next
      expect((btns[3] as HTMLButtonElement).disabled).toBe(true); // last
    });

    it("no paging controls when pageSize is not set", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const paging = el.shadowRoot.querySelector(".paging");
      expect(paging).toBeNull();
    });

    it("emits casehub-page when prev button clicked", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["C"], ["D"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 1;
      el.totalRows = 4;
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-page", (e) => events.push(e as CustomEvent));

      const btns = el.shadowRoot.querySelectorAll(".paging button");
      (btns[1] as HTMLButtonElement).click(); // prev

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.offset).toBe(0);
      expect(events[0]!.detail.count).toBe(2);
    });
  });

  // ── Event emission (pagination) ─────────────────────────────────────

  describe("event emission (pagination)", () => {
    it("emits casehub-page with correct offset on next click", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 10;
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-page", (e) => events.push(e as CustomEvent));

      // Click next page
      const btns = el.shadowRoot.querySelectorAll(".paging button");
      (btns[2] as HTMLButtonElement).click(); // next

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ offset: 2, count: 2 });
    });

    it("renders all received rows without slicing", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 10;
      el.dataSet = ds;

      // All received rows should be displayed (pipeline controls the slice)
      const rows = queryRows(el);
      expect(rows).toHaveLength(2);
    });

    it("shows correct page count based on totalRows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 10;
      el.dataSet = ds;

      const paging = el.shadowRoot.querySelector(".paging");
      expect(paging!.textContent).toContain("5"); // 10 / 2 = 5 pages
    });
  });

  // ── Sorting ───────────────────────────────────────────────────────

  describe("sorting", () => {
    it("emits casehub-sort when header clicked", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Charlie", 30], ["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-sort", (e) => events.push(e as CustomEvent));

      // Click on "score" header (second column)
      const headers = queryHeaders(el);
      headers[1]!.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.columnId).toBe("score");
      expect(events[0]!.detail.order).toBe("ASCENDING");
    });

    it("toggles sort order on second click of same column", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Charlie", 30], ["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.activeSort = { columnId: "score" as ColumnId, order: "ASCENDING" };
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-sort", (e) => events.push(e as CustomEvent));

      const headers = queryHeaders(el);
      headers[1]!.click(); // second click on score

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.order).toBe("DESCENDING");
    });

    it("renders rows in the order provided by pipeline", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 10], ["Bob", 20], ["Charlie", 30]], // pipeline already sorted
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.activeSort = { columnId: "score" as ColumnId, order: "ASCENDING" };
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(queryCells(rows[0]!)[1]).toBe("10");
      expect(queryCells(rows[1]!)[1]).toBe("20");
      expect(queryCells(rows[2]!)[1]).toBe("30");
    });

    it("does not emit event when sortable is false", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Charlie", 30], ["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: false };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-sort", (e) => events.push(e as CustomEvent));

      const headers = queryHeaders(el);
      headers[1]!.click();

      expect(events).toHaveLength(0);
    });
  });

  // ── Filtering ─────────────────────────────────────────────────────

  describe("filtering", () => {
    it("click cell emits casehub-filter with correct detail", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true, group: "myGroup" },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        events.push(e as CustomEvent),
      );

      // Click the first cell of the second row
      const rows = queryRows(el);
      const firstCell = rows[1]!.querySelector("td")!;
      firstCell.click();

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as CasehubFilterApply;
      expect(detail.columnId).toBe("name");
      expect(detail.value).toBe("Bob");
      expect(detail.reset).toBe(false);
      expect(detail.group).toBe("myGroup");
      expect(detail.row).toBeDefined();
    });

    it("filter event has correct columnId for non-first column", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 10]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        events.push(e as CustomEvent),
      );

      // Click the second cell (score column) of the first row
      const rows = queryRows(el);
      const secondCell = rows[0]!.querySelectorAll("td")[1]!;
      secondCell.click();

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as CasehubFilterApply;
      expect(detail.columnId).toBe("score");
      expect(detail.value).toBe("10");
    });

    it("filter group is undefined when not set in props", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        events.push(e as CustomEvent),
      );

      const rows = queryRows(el);
      rows[0]!.querySelector("td")!.click();

      expect(events[0]!.detail.group).toBeUndefined();
    });
  });

  // ── Text filter ──────────────────────────────────────────────────

  describe("text filter", () => {
    it("filter input exists in toolbar", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot.querySelector<HTMLInputElement>(".filter-box input");
      expect(input).not.toBeNull();
      expect(input!.placeholder).toBe("Filter");
    });

    it("typing in filter dispatches casehub-text-filter event", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["city", "LABEL"]],
        [["Alice", "London"], ["Bob", "Paris"], ["Charlie", "London"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: string[] = [];
      el.addEventListener("casehub-text-filter", ((e: Event) => {
        events.push((e as CustomEvent<{ text: string }>).detail.text);
      }) as EventListener);

      const input = el.shadowRoot.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "London";
      input.dispatchEvent(new Event("input"));

      expect(events).toEqual(["London"]);
      // Table still shows all rows — pipeline handles filtering
      expect(queryRows(el)).toHaveLength(3);
    });

    it("pagination uses totalRows from pipeline (not local row count)", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test"), pageSize: 2 };
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 10;
      el.dataSet = ds;

      const paging = el.shadowRoot.querySelector(".paging");
      expect(paging).not.toBeNull();
      const range = paging!.querySelector(".range")!;
      expect(range.textContent).toContain("10");
    });

    it("clearing filter dispatches empty text event", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: string[] = [];
      el.addEventListener("casehub-text-filter", ((e: Event) => {
        events.push((e as CustomEvent<{ text: string }>).detail.text);
      }) as EventListener);

      const input = el.shadowRoot.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "Alice";
      input.dispatchEvent(new Event("input"));
      input.value = "";
      input.dispatchEvent(new Event("input"));

      expect(events).toEqual(["Alice", ""]);
    });

    it("filter input retains focus after typing", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot.querySelector<HTMLInputElement>(".filter-box input")!;
      input.focus();
      input.value = "A";
      input.dispatchEvent(new Event("input"));

      const active = el.shadowRoot.activeElement;
      expect(active?.tagName).toBe("INPUT");
    });
  });

  // ── Re-render ─────────────────────────────────────────────────────

  describe("re-render", () => {
    it("renders new dataset rows as provided", () => {
      const ds1 = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 4;
      el.dataSet = ds1;

      // New data arrives from pipeline (different page)
      const ds2 = makeDataSet(
        [["name", "LABEL"]],
        [["X"], ["Y"], ["Z"]],
      );
      el.activePage = 1;
      el.totalRows = 3;
      el.dataSet = ds2;

      const rows = queryRows(el);
      expect(rows).toHaveLength(3);
      expect(queryCells(rows[0]!)[0]).toBe("X");
      expect(queryCells(rows[1]!)[0]).toBe("Y");
      expect(queryCells(rows[2]!)[0]).toBe("Z");
    });
  });

  // ── Stateless sort/pagination ────────────────────────────────────

  describe("stateless sort/pagination", () => {
    it("always emits casehub-sort on column header click", () => {
      const ds = makeDataSet([["name", "LABEL"], ["value", "NUMBER"]], [["A", 1], ["B", 2]]);
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-sort", ((e: Event) => { events.push(e as CustomEvent); }) as EventListener);

      const headers = queryHeaders(el);
      headers[0]!.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.columnId).toBe("name");
      expect(events[0]!.detail.order).toBe("ASCENDING");
    });

    it("reads activeSort for sort indicator", () => {
      const ds = makeDataSet([["name", "LABEL"], ["value", "NUMBER"]], [["A", 1], ["B", 2]]);
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.activeSort = { columnId: "name" as ColumnId, order: "DESCENDING" };
      el.dataSet = ds;

      const headers = queryHeaders(el);
      expect(headers[0]!.textContent).toContain("▼");
    });

    it("toggles sort order based on activeSort", () => {
      const ds = makeDataSet([["name", "LABEL"]], [["A"], ["B"]]);
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.activeSort = { columnId: "name" as ColumnId, order: "ASCENDING" };
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-sort", ((e: Event) => { events.push(e as CustomEvent); }) as EventListener);

      const headers = queryHeaders(el);
      headers[0]!.click(); // same column → should toggle to DESCENDING

      expect(events[0]!.detail.order).toBe("DESCENDING");
    });

    it("always emits casehub-page on page button click", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]], // pipeline provides first page only
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 5;
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-page", ((e: Event) => { events.push(e as CustomEvent); }) as EventListener);

      // Use querySelectorAll on buttons and get the next button (index 2: first, prev, next, last)
      const btns = el.shadowRoot.querySelectorAll(".paging button");
      const nextBtn = btns[2] as HTMLButtonElement;
      expect(nextBtn).not.toBeUndefined();
      expect(nextBtn.disabled).toBe(false);
      nextBtn.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.offset).toBe(2);
      expect(events[0]!.detail.count).toBe(2);
    });

    it("renders pagination controls from activePage", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["C"], ["D"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 1;
      el.totalRows = 5;
      el.dataSet = ds;

      const pageInput = el.shadowRoot.querySelector(".paging input") as HTMLInputElement;
      expect(pageInput?.value).toBe("2"); // page 1 → display "2"
    });

    it("renders all received rows without local slicing", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]], // pipeline already paginated — 2 rows
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.activePage = 0;
      el.totalRows = 5;
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(2); // renders exactly what pipeline provided
    });
  });

  // ── Click-to-filter ───────────────────────────────────────────────

  describe("click-to-filter", () => {
    it("click emits CasehubFilterApply with value and row", () => {
      const ds = makeDataSet(
        [["region", "LABEL"], ["sales", "NUMBER"]],
        [["North", 100], ["South", 200]],
      );
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true, group: "g1" } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const rows = queryRows(el);
      const firstCell = rows[0]!.querySelector("td")!;
      firstCell.click();

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as CasehubFilterApply;
      expect(detail.columnId).toBe("region");
      expect(detail.value).toBe("North");
      expect(detail.row).toBe(ds.rows[0]);
      expect(detail.reset).toBe(false);
      expect(detail.group).toBe("g1");
    });

    it("click same cell twice toggles — second emits reset", () => {
      const ds = makeDataSet([["region", "LABEL"]], [["North"], ["South"]]);
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const firstCell = queryRows(el)[0]!.querySelector("td")!;
      firstCell.click();
      firstCell.click();

      expect(events).toHaveLength(2);
      expect((events[0]!.detail as CasehubFilterApply).reset).toBe(false);
      expect((events[1]!.detail as CasehubFilterReset).reset).toBe(true);
    });

    it("column switch emits reset for old column then apply for new", () => {
      const ds = makeDataSet(
        [["region", "LABEL"], ["quarter", "LABEL"]],
        [["North", "Q1"], ["South", "Q2"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      // Click region=North
      queryRows(el)[0]!.querySelectorAll("td")[0]!.click();
      // Click quarter=Q2 (different column)
      queryRows(el)[1]!.querySelectorAll("td")[1]!.click();

      expect(events).toHaveLength(3); // apply + reset + apply
      expect((events[0]!.detail as CasehubFilterApply).columnId).toBe("region");
      expect((events[1]!.detail as CasehubFilterReset).columnId).toBe("region");
      expect((events[1]!.detail as CasehubFilterReset).reset).toBe(true);
      expect((events[2]!.detail as CasehubFilterApply).columnId).toBe("quarter");
      expect((events[2]!.detail as CasehubFilterApply).value).toBe("Q2");
    });

    it("selected row gets .selected CSS class after click", () => {
      const ds = makeDataSet([["region", "LABEL"]], [["North"], ["South"]]);
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      queryRows(el)[0]!.querySelector("td")!.click();

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("selected")).toBe(true);
      expect(rows[1]!.classList.contains("selected")).toBe(false);
    });

    it("toggle off removes .selected class", () => {
      const ds = makeDataSet([["region", "LABEL"]], [["North"]]);
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      queryRows(el)[0]!.querySelector("td")!.click();
      expect(queryRows(el)[0]!.classList.contains("selected")).toBe(true);

      queryRows(el)[0]!.querySelector("td")!.click();
      expect(queryRows(el)[0]!.classList.contains("selected")).toBe(false);
    });

    it("data re-push preserves selection when value exists", () => {
      const ds1 = makeDataSet([["region", "LABEL"]], [["North"], ["South"]]);
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds1;

      queryRows(el)[0]!.querySelector("td")!.click();

      // Re-push with same data
      const ds2 = makeDataSet([["region", "LABEL"]], [["South"], ["North"]]);
      el.dataSet = ds2;

      // "North" is still present → selection preserved → row with North gets .selected
      const rows = queryRows(el);
      const northRow = rows.find(r => queryCells(r)[0] === "North");
      expect(northRow!.classList.contains("selected")).toBe(true);
    });

    it("data re-push clears selection when value absent", () => {
      const ds1 = makeDataSet([["region", "LABEL"]], [["North"], ["South"]]);
      const props: TableProps = { lookup: mockLookup("test"), filter: { enabled: true } };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds1;

      queryRows(el)[0]!.querySelector("td")!.click();

      // Re-push WITHOUT "North"
      const ds2 = makeDataSet([["region", "LABEL"]], [["South"], ["East"]]);
      el.dataSet = ds2;

      const rows = queryRows(el);
      expect(rows.every(r => !r.classList.contains("selected"))).toBe(true);
    });
  });
});
