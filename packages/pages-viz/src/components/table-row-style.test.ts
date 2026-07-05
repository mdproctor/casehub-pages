import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { TableProps } from "@casehubio/pages-component";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import { PagesTable } from "./PagesTable.js";

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

function queryRows(el: PagesTable): HTMLTableRowElement[] {
  return Array.from(el.shadowRoot.querySelectorAll("tbody tr"));
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesTable row styling", () => {
  let el: PagesTable;

  beforeEach(() => {
    el = document.createElement("pages-table");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("conditional row classes", () => {
    it("applies pages-row-danger class when condition matches", () => {
      const ds = makeDataSet(
        [["status", "LABEL"], ["value", "NUMBER"]],
        [["Critical", 100], ["Normal", 50], ["Critical", 75]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          { condition: "#{row.status} == 'Critical'", className: "pages-row-danger" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("pages-row-danger")).toBe(true);
      expect(rows[1]!.classList.contains("pages-row-danger")).toBe(false);
      expect(rows[2]!.classList.contains("pages-row-danger")).toBe(true);
    });

    it("first matching rule wins — subsequent rules not evaluated", () => {
      const ds = makeDataSet(
        [["priority", "LABEL"], ["status", "LABEL"]],
        [["High", "Critical"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          { condition: "#{row.priority} == 'High'", className: "pages-row-warning" },
          { condition: "#{row.status} == 'Critical'", className: "pages-row-danger" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("pages-row-warning")).toBe(true);
      expect(rows[0]!.classList.contains("pages-row-danger")).toBe(false);
    });

    it("applies inline style when rule has style property", () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["Special"], ["Normal"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          {
            condition: "#{row.category} == 'Special'",
            style: { backgroundColor: "#ffe6e6", fontWeight: "bold" },
          },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.style.backgroundColor).toBe("rgb(255, 230, 230)"); // browsers normalize to rgb
      expect(rows[0]!.style.fontWeight).toBe("bold");
      expect(rows[1]!.style.backgroundColor).toBe("");
    });

    it("no class or style applied when no rule matches", () => {
      const ds = makeDataSet(
        [["status", "LABEL"]],
        [["Normal"], ["OK"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          { condition: "#{row.status} == 'Critical'", className: "pages-row-danger" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.className).toBe(""); // no classes applied
      expect(rows[1]!.className).toBe("");
    });

    it("handles numeric comparisons in row conditions", () => {
      const ds = makeDataSet(
        [["score", "NUMBER"]],
        [[85], [45], [92]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          { condition: "#{row.score} >= 80", className: "pages-row-success" },
          { condition: "#{row.score} < 50", className: "pages-row-danger" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("pages-row-success")).toBe(true);
      expect(rows[1]!.classList.contains("pages-row-danger")).toBe(true);
      expect(rows[2]!.classList.contains("pages-row-success")).toBe(true);
    });

    it("handles complex boolean conditions", () => {
      const ds = makeDataSet(
        [["status", "LABEL"], ["score", "NUMBER"]],
        [["Active", 75], ["Active", 45], ["Inactive", 80]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          {
            condition: "#{row.status} == 'Active' && #{row.score} < 50",
            className: "pages-row-warning",
          },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("pages-row-warning")).toBe(false);
      expect(rows[1]!.classList.contains("pages-row-warning")).toBe(true);
      expect(rows[2]!.classList.contains("pages-row-warning")).toBe(false);
    });

    it("handles null values in row data", () => {
      const ds = makeDataSet(
        [["status", "LABEL"]],
        [["Critical"], [null], ["Normal"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [
          { condition: "#{row.status} == 'Critical'", className: "pages-row-danger" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("pages-row-danger")).toBe(true);
      expect(rows[1]!.classList.contains("pages-row-danger")).toBe(false); // null doesn't match
      expect(rows[2]!.classList.contains("pages-row-danger")).toBe(false);
    });
  });

  describe("predefined CSS classes", () => {
    it("stylesheet includes pages-row-danger CSS class", () => {
      const ds = makeDataSet([["status", "LABEL"]], [["Critical"]]);
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [{ condition: "#{row.status} == 'Critical'", className: "pages-row-danger" }],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain("pages-row-danger");
      expect(style!.textContent).toContain("--pages-danger-3");
    });

    it("stylesheet includes pages-row-warning CSS class", () => {
      const ds = makeDataSet([["status", "LABEL"]], [["Warning"]]);
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot.querySelector("style");
      expect(style!.textContent).toContain("pages-row-warning");
      expect(style!.textContent).toContain("--pages-warning-3");
    });

    it("stylesheet includes pages-row-success CSS class", () => {
      const ds = makeDataSet([["status", "LABEL"]], [["OK"]]);
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot.querySelector("style");
      expect(style!.textContent).toContain("pages-row-success");
      expect(style!.textContent).toContain("--pages-success-3");
    });

    it("stylesheet includes pages-row-muted CSS class", () => {
      const ds = makeDataSet([["status", "LABEL"]], [["Inactive"]]);
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot.querySelector("style");
      expect(style!.textContent).toContain("pages-row-muted");
      expect(style!.textContent).toContain("--pages-neutral-3");
    });
  });

  describe("rowStyle not defined", () => {
    it("renders normally when rowStyle is undefined", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.className).toBe("");
      expect(rows[1]!.className).toBe("");
    });

    it("renders normally when rowStyle is empty array", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        rowStyle: [],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.className).toBe("");
    });
  });

  describe("interaction with existing row classes", () => {
    it("preserves clickable class when filter is enabled", () => {
      const ds = makeDataSet(
        [["status", "LABEL"]],
        [["Critical"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true },
        rowStyle: [
          { condition: "#{row.status} == 'Critical'", className: "pages-row-danger" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows[0]!.classList.contains("clickable")).toBe(true);
      expect(rows[0]!.classList.contains("pages-row-danger")).toBe(true);
    });

    it("preserves selected class when row is selected", () => {
      const ds = makeDataSet(
        [["region", "LABEL"]],
        [["North"], ["South"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true },
        rowStyle: [
          { condition: "#{row.region} == 'North'", className: "pages-row-success" },
        ],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      // Click the first cell to select it
      const rows = queryRows(el);
      rows[0]!.querySelector("td")!.click();

      // Re-render should preserve both classes
      const updatedRows = queryRows(el);
      expect(updatedRows[0]!.classList.contains("selected")).toBe(true);
      expect(updatedRows[0]!.classList.contains("pages-row-success")).toBe(true);
    });
  });
});
