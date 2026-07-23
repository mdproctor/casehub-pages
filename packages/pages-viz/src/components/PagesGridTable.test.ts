import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { TypedDataSet, Column, ColumnId } from "@casehubio/pages-data";
import { ColumnType, toTypedDataSet } from "@casehubio/pages-data";
import "./PagesGridTable.js";
import type { PagesGridTable } from "./PagesGridTable.js";

const L = { dataSetId: "test" as any, operations: [] } as const;

function col(id: string, type: ColumnType = ColumnType.LABEL): Column {
  return { id: id as ColumnId, name: id, type };
}

function ds(cols: Column[], data: (string | null)[][]): TypedDataSet {
  return toTypedDataSet({ columns: cols, data });
}

describe("pages-grid-table", () => {
  let el: PagesGridTable;

  beforeEach(() => {
    el = document.createElement("pages-grid-table") as PagesGridTable;
    document.body.appendChild(el);
  });

  afterEach(() => { el.remove(); });

  describe("column headers (default on)", () => {
    it("shows column headers by default", async () => {
      el.props = { lookup: L };
      el.dataSet = ds([col("name"), col("age")], [["Alice", "30"]]);
      await el.updateComplete;
      const ths = el.shadowRoot!.querySelectorAll("thead th");
      expect(ths.length).toBe(2);
      expect(ths[0]!.textContent).toBe("name");
      expect(ths[1]!.textContent).toBe("age");
    });

    it("hides column headers when columnHeaders: false", async () => {
      el.props = { lookup: L, columnHeaders: false };
      el.dataSet = ds([col("a"), col("b")], [["1", "2"]]);
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector("thead")).toBeNull();
    });
  });

  describe("row headers", () => {
    it("first column becomes th[scope=row] when rowHeaders: true", async () => {
      el.props = { lookup: L, rowHeaders: true };
      el.dataSet = ds([col("label"), col("value")], [["Status", "Running"], ["Uptime", "48h"]]);
      await el.updateComplete;

      const rowThs = el.shadowRoot!.querySelectorAll("th[scope='row']");
      expect(rowThs.length).toBe(2);
      expect(rowThs[0]!.textContent).toBe("Status");
      expect(rowThs[1]!.textContent).toBe("Uptime");
      const tds = el.shadowRoot!.querySelectorAll("tbody td");
      expect(tds.length).toBe(2);
      expect(tds[0]!.textContent).toBe("Running");
    });

    it("no row headers by default", async () => {
      el.props = { lookup: L };
      el.dataSet = ds([col("a"), col("b")], [["1", "2"]]);
      await el.updateComplete;
      expect(el.shadowRoot!.querySelectorAll("th[scope='row']").length).toBe(0);
    });
  });

  describe("cross-matrix — both headers on", () => {
    it("renders corner cell + column headers + row headers", async () => {
      el.props = { lookup: L, columnHeaders: true, rowHeaders: true };
      el.dataSet = ds(
        [col("product"), col("Q1"), col("Q2")],
        [["Widget", "100", "120"], ["Gadget", "80", "95"]],
      );
      await el.updateComplete;

      const headerCells = el.shadowRoot!.querySelectorAll("thead th");
      expect(headerCells.length).toBe(3);
      expect(headerCells[0]!.classList.contains("corner")).toBe(true);
      expect(headerCells[0]!.textContent).toBe("");
      expect(headerCells[1]!.textContent).toBe("Q1");
      expect(headerCells[2]!.textContent).toBe("Q2");

      const rowThs = el.shadowRoot!.querySelectorAll("th[scope='row']");
      expect(rowThs.length).toBe(2);
      expect(rowThs[0]!.textContent).toBe("Widget");

      const tds = el.shadowRoot!.querySelectorAll("tbody td");
      expect(tds.length).toBe(4);
      expect(tds[0]!.textContent).toBe("100");
    });
  });

  describe("no headers", () => {
    it("columnHeaders: false + rowHeaders: false — data only", async () => {
      el.props = { lookup: L, columnHeaders: false, rowHeaders: false };
      el.dataSet = ds([col("a"), col("b")], [["1", "2"]]);
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector("thead")).toBeNull();
      expect(el.shadowRoot!.querySelectorAll("th").length).toBe(0);
      expect(el.shadowRoot!.querySelectorAll("td").length).toBe(2);
    });
  });

  describe("cell display modes", () => {
    it("boolean — true renders ✓, false renders ✗", async () => {
      el.props = { lookup: L, cellDisplay: { status: "boolean" } };
      el.dataSet = ds([col("name"), col("status")], [["A", "true"], ["B", "false"]]);
      await el.updateComplete;

      const boolCells = el.shadowRoot!.querySelectorAll(".cell-bool");
      expect(boolCells.length).toBe(2);
      expect(boolCells[0]!.textContent).toBe("✓");
      expect(boolCells[0]!.classList.contains("cell-bool-true")).toBe(true);
      expect(boolCells[1]!.textContent).toBe("✗");
      expect(boolCells[1]!.classList.contains("cell-bool-false")).toBe(true);
    });

    it("color — renders swatch with value", async () => {
      el.props = { lookup: L, cellDisplay: { bg: "color" } };
      el.dataSet = ds([col("name"), col("bg")], [["Error", "#ef4444"]]);
      await el.updateComplete;

      const swatch = el.shadowRoot!.querySelector(".color-swatch") as HTMLElement;
      expect(swatch).not.toBeNull();
      expect(swatch.style.background).toBe("rgb(239, 68, 68)");
    });

    it("badge — renders styled chip", async () => {
      el.props = { lookup: L, cellDisplay: { status: "badge" } };
      el.dataSet = ds([col("name"), col("status")], [["Service A", "Active"]]);
      await el.updateComplete;

      const badge = el.shadowRoot!.querySelector(".cell-badge");
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe("Active");
    });

    it("number — right-aligned tabular nums", async () => {
      el.props = { lookup: L, cellDisplay: { value: "number" } };
      el.dataSet = ds([col("label"), col("value")], [["CPU", "85"]]);
      await el.updateComplete;

      const numCell = el.shadowRoot!.querySelector(".cell-number");
      expect(numCell).not.toBeNull();
      expect(numCell!.textContent).toBe("85");
    });

    it("text is default — plain rendering", async () => {
      el.props = { lookup: L };
      el.dataSet = ds([col("value")], [["hello"]]);
      await el.updateComplete;
      const td = el.shadowRoot!.querySelector("td");
      expect(td!.textContent).toBe("hello");
      expect(td!.querySelector(".cell-bool")).toBeNull();
      expect(td!.querySelector(".cell-color")).toBeNull();
    });
  });

  describe("empty state", () => {
    it("renders — when dataset has no rows", async () => {
      el.props = { lookup: L };
      el.dataSet = ds([col("name")], []);
      await el.updateComplete;
      const rows = el.shadowRoot!.querySelectorAll("tbody tr");
      expect(rows.length).toBe(1);
      expect(rows[0]!.textContent).toContain("—");
    });

    it("renders — when dataset has no columns", async () => {
      el.props = { lookup: L };
      el.dataSet = ds([], []);
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector(".empty-cell")).not.toBeNull();
    });
  });
});
