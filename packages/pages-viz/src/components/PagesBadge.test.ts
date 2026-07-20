import { describe, it, expect, beforeEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnId } from "@casehubio/pages-data";
import { ColumnType, columnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import { toTypedDataSet } from "@casehubio/pages-data";
import type { BadgeProps } from "@casehubio/pages-component";
import { PagesBadge } from "./PagesBadge.js";

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function createDataSet(columns: string[], rows: (string | null)[][]): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map((name) => ({
      id: name as ColumnId,
      name,
      type: ColumnType.LABEL,
    })),
    data: rows.map((row) => row.map((cell) => cell === null ? null : cell)),
  };
  return toTypedDataSet(ds);
}

describe("PagesBadge", () => {
  let element: PagesBadge;

  beforeEach(() => {
    element = document.createElement("pages-badge");
    document.body.appendChild(element);
  });

  it("renders a single badge for single-row dataset", async () => {
    const dataset = createDataSet(["status"], [["PENDING"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll(".pages-badge");
    expect(badges.length).toBe(1);
    expect(badges[0]!.textContent!.trim()).toBe("PENDING");
  });

  it("renders multiple badges for multi-row dataset", async () => {
    const dataset = createDataSet(["status"], [["PENDING"], ["ACTIVE"], ["DONE"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll(".pages-badge");
    expect(badges.length).toBe(3);
    expect(badges[0]!.textContent!.trim()).toBe("PENDING");
    expect(badges[1]!.textContent!.trim()).toBe("ACTIVE");
    expect(badges[2]!.textContent!.trim()).toBe("DONE");
  });

  it("applies colorMap for matching values", async () => {
    const dataset = createDataSet(["status"], [["PENDING"], ["ACTIVE"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
      colorMap: {
        PENDING: "#ffa726",
        ACTIVE: "#66bb6a",
      },
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll<HTMLSpanElement>(".pages-badge");
    expect(badges.length).toBe(2);
    expect(badges[0]!.style.backgroundColor).toBe("rgb(255, 167, 38)"); // #ffa726
    expect(badges[1]!.style.backgroundColor).toBe("rgb(102, 187, 106)"); // #66bb6a
  });

  it("uses fallback palette color when colorMap entry missing", async () => {
    const dataset = createDataSet(["status"], [["UNKNOWN"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
      colorMap: {
        PENDING: "#ffa726",
      },
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll<HTMLSpanElement>(".pages-badge");
    expect(badges.length).toBe(1);
    // Should have a background color (auto-generated)
    expect(badges[0]!.style.backgroundColor).toBeTruthy();
  });

  it("defaults to first LABEL column when column prop absent", async () => {
    const dataset = createDataSet(["id", "status"], [["1", "PENDING"], ["2", "ACTIVE"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll(".pages-badge");
    expect(badges.length).toBe(2);
    // Should render from first column (id), not second (status)
    expect(badges[0]!.textContent!.trim()).toBe("1");
    expect(badges[1]!.textContent!.trim()).toBe("2");
  });

  it("uses specified column when column prop present", async () => {
    const dataset = createDataSet(["id", "status"], [["1", "PENDING"], ["2", "ACTIVE"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
      column: columnId("status"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll(".pages-badge");
    expect(badges.length).toBe(2);
    expect(badges[0]!.textContent!.trim()).toBe("PENDING");
    expect(badges[1]!.textContent!.trim()).toBe("ACTIVE");
  });

  it("includes role=status for ARIA", async () => {
    const dataset = createDataSet(["status"], [["PENDING"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badge = shadowRoot!.querySelector(".pages-badge");
    expect(badge!.getAttribute("role")).toBe("status");
  });

  it("handles empty dataset gracefully", async () => {
    const dataset = createDataSet(["status"], []);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll(".pages-badge");
    expect(badges.length).toBe(0);
  });

  it("handles NULL cell values", async () => {
    const dataset = createDataSet(["status"], [[null], ["ACTIVE"]]);
    const props: BadgeProps = {
      lookup: mockLookup("test-lookup"),
    };

    element.props = props;
    element.dataSet = dataset;

    await element.updateComplete;

    const shadowRoot = element.shadowRoot;
    const badges = shadowRoot!.querySelectorAll(".pages-badge");
    expect(badges.length).toBe(2);
    expect(badges[0]!.textContent!.trim()).toBe(""); // NULL renders as empty
    expect(badges[1]!.textContent!.trim()).toBe("ACTIVE");
  });
});
