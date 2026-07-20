import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { SelectorProps } from "@casehubio/pages-component";
import { toTypedDataSet } from "@casehubio/pages-data";
import type { PagesFilterApply, PagesFilterReset } from "../base/filter-types.js";

import { PagesSelector } from "./PagesSelector.js";

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

// ── Tests ─────────────────────────────────────────────────────────────

describe("PagesSelector", () => {
  let el: PagesSelector;

  beforeEach(() => {
    el = document.createElement("pages-selector");
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  // ── Dropdown ──────────────────────────────────────────────────────

  describe("dropdown (default subtype)", () => {
    it("renders <select> with All option plus distinct values", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"], ["B"], ["A"], ["C"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const select = el.shadowRoot!.querySelector("select");
      expect(select).not.toBeNull();

      const options = Array.from(select!.querySelectorAll("option"));
      expect(options).toHaveLength(4); // All + A, B, C
      expect(options[0]!.textContent!.trim()).toBe("All");
      expect(options[1]!.textContent!.trim()).toBe("A");
      expect(options[2]!.textContent!.trim()).toBe("B");
      expect(options[3]!.textContent!.trim()).toBe("C");
    });

    it("selection change emits PagesFilterApply with value and row", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"], ["B"], ["C"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true, group: "myGroup" },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      const select = el.shadowRoot!.querySelector("select")!;
      select.selectedIndex = 2; // Select "B" (index 0 = All, 1 = A, 2 = B)
      select.dispatchEvent(new Event("change"));

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as PagesFilterApply;
      expect(detail.columnId).toBe("category");
      expect(detail.value).toBe("B");
      expect(detail.row).toBe(ds.rows[1]);
      expect(detail.reset).toBe(false);
      expect(detail.group).toBe("myGroup");
    });

    it("selecting All emits PagesFilterReset", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      const select = el.shadowRoot!.querySelector("select")!;
      select.selectedIndex = 0; // All
      select.dispatchEvent(new Event("change"));

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as PagesFilterReset;
      expect(detail.reset).toBe(true);
      expect(detail.columnId).toBe("category");
      expect(detail).not.toHaveProperty("value");
      expect(detail).not.toHaveProperty("row");
    });

    it("filter group is undefined when not set in props", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      const select = el.shadowRoot!.querySelector("select")!;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event("change"));

      expect(events[0]!.detail.group).toBeUndefined();
    });
  });

  // ── Slider ────────────────────────────────────────────────────────

  describe("slider subtype", () => {
    it("renders <input type=range> with min/max from data", async () => {
      const ds = makeDataSet(
        [["score", "NUMBER"]],
        [[10], [50], [30]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "slider",
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const slider = el.shadowRoot!.querySelector("input[type='range']") as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.min).toBe("10");
      expect(slider.max).toBe("50");
    });

    it("slider change emits PagesFilterApply with value and row", async () => {
      const ds = makeDataSet(
        [["score", "NUMBER"]],
        [[10], [20], [30]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "slider",
        filter: { enabled: true },
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      const slider = el.shadowRoot!.querySelector("input[type='range']") as HTMLInputElement;
      slider.value = "20";
      slider.dispatchEvent(new Event("change"));

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as PagesFilterApply;
      expect(detail.columnId).toBe("score");
      expect(detail.value).toBe("20");
      expect(detail.row).toBe(ds.rows[1]);
      expect(detail.reset).toBe(false);
    });
  });

  // ── Labels ────────────────────────────────────────────────────────

  describe("labels subtype", () => {
    it("renders clickable button chips for distinct values", async () => {
      const ds = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"], ["Blue"], ["Red"], ["Green"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const chips = el.shadowRoot!.querySelectorAll(".label-chip");
      expect(chips).toHaveLength(3); // Red, Blue, Green
      expect(chips[0]!.textContent!.trim()).toBe("Red");
      expect(chips[1]!.textContent!.trim()).toBe("Blue");
      expect(chips[2]!.textContent!.trim()).toBe("Green");
    });

    it("click emits PagesFilterApply with value and row and adds .selected class", async () => {
      const ds = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"], ["Blue"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      const chips = el.shadowRoot!.querySelectorAll(".label-chip");
      const redChip = chips[0] as HTMLButtonElement;
      redChip.click();

      expect(events).toHaveLength(1);
      const detail = events[0]!.detail as PagesFilterApply;
      expect(detail.columnId).toBe("tag");
      expect(detail.value).toBe("Red");
      expect(detail.row).toBe(ds.rows[0]);
      expect(detail.reset).toBe(false);

      // Check selection state — re-query after Lit re-render
      await el.updateComplete;
      const updatedChip = el.shadowRoot!.querySelectorAll(".label-chip")[0] as HTMLButtonElement;
      expect(updatedChip.classList.contains("selected")).toBe(true);
    });

    it("click selected label emits reset: true and removes .selected", async () => {
      const ds = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener("pages-filter", (e) => events.push(e as CustomEvent));

      const chip = el.shadowRoot!.querySelector(".label-chip") as HTMLButtonElement;

      // First click — select
      chip.click();
      await el.updateComplete;
      let updatedChip = el.shadowRoot!.querySelector(".label-chip") as HTMLButtonElement;
      expect(updatedChip.classList.contains("selected")).toBe(true);

      // Second click — deselect
      updatedChip.click();
      await el.updateComplete;
      updatedChip = el.shadowRoot!.querySelector(".label-chip") as HTMLButtonElement;
      expect(events).toHaveLength(2);
      expect(events[1]!.detail.reset).toBe(true);
      expect(updatedChip.classList.contains("selected")).toBe(false);
    });
  });

  // ── Data re-push ──────────────────────────────────────────────────

  describe("data re-push with labels", () => {
    it("label selection clears when data re-push removes selected value", async () => {
      const ds1 = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"], ["Blue"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds1;
      await el.updateComplete;

      // Select "Red"
      const chips = el.shadowRoot!.querySelectorAll(".label-chip");
      (chips[0] as HTMLButtonElement).click();
      await el.updateComplete;
      expect(el.shadowRoot!.querySelector(".label-chip.selected")).toBeTruthy();

      // Re-push without "Red"
      const ds2 = makeDataSet(
        [["tag", "LABEL"]],
        [["Blue"], ["Green"]],
      );
      el.dataSet = ds2;
      await el.updateComplete;

      // No chip should be selected
      expect(el.shadowRoot!.querySelector(".label-chip.selected")).toBeNull();
    });
  });

  // ── CSS ───────────────────────────────────────────────────────────

  describe("styling", () => {
    it("renders style element in shadow DOM", async () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = ds;
      await el.updateComplete;

      const styles = el.shadowRoot!.querySelectorAll("style");
      expect(styles.length).toBeGreaterThan(0);
      const allStyleText = Array.from(styles).map(s => s.textContent).join("");
      expect(allStyleText).toContain(":host");
      expect(allStyleText).toContain("select");
    });
  });
});
