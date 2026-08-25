import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId, DataSetId } from "@casehubio/pages-data";
import { toTypedDataSet } from "@casehubio/pages-data";
import type { EventTimelineNode, EventTimelineStrategy } from "./event-timeline-types.js";
import { PagesEventTimeline } from "./PagesEventTimeline.js";

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

const testNodes: EventTimelineNode[] = [
  { key: "1", label: "Started", status: "completed", timestamp: "2026-01-01T00:00:00Z", category: "lifecycle" },
  { key: "2", label: "Processing", status: "active", timestamp: "2026-01-01T01:00:00Z", category: "task" },
  { key: "3", label: "Pending Review", status: "pending", category: "task" },
];

const testStrategy: EventTimelineStrategy<EventTimelineNode[]> = {
  toNodes: (data) => data,
  defaultLayout: "vertical",
  filterCategories: ["lifecycle", "task"],
};

describe("PagesEventTimeline", () => {
  let el: PagesEventTimeline;

  beforeEach(() => {
    el = document.createElement("pages-event-timeline") as PagesEventTimeline;
  });

  afterEach(() => {
    if (el.isConnected) el.remove();
  });

  it("renders nodes from strategy with direct data", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll(".timeline-node");
    expect(nodes.length).toBe(3);
  });

  it("applies status class to nodes", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const firstNode = el.shadowRoot!.querySelector(".timeline-node");
    expect(firstNode!.classList.contains("status-completed")).toBe(true);
  });

  it("renders nodes from DataSet when no direct data", async () => {
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;

    const ds = makeDataSet(
      [["key", "LABEL"], ["label", "LABEL"], ["status", "LABEL"], ["timestamp", "TEXT"]],
      [
        ["1", "Case Started", "completed", "2026-01-15T09:00:00Z"],
        ["2", "Processing", "active", "2026-01-15T10:00:00Z"],
      ],
    );
    el.dataSet = ds;
    await el.updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll(".timeline-node");
    expect(nodes.length).toBe(2);

    const firstLabel = el.shadowRoot!.querySelector(".node-label");
    expect(firstLabel!.textContent).toBe("Case Started");
  });

  it("toggles node expansion on click", async () => {
    el.strategy = testStrategy;
    el.data = [{ ...testNodes[0]!, detail: { info: "extra" } }];
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const expandBtn = el.shadowRoot!.querySelector(".expand-button") as HTMLElement;
    expect(expandBtn).not.toBeNull();
    expandBtn.click();
    await el.updateComplete;

    const detail = el.shadowRoot!.querySelector(".payload-detail");
    expect(detail).not.toBeNull();
  });

  it("filters nodes by category via activeFilters", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    el.activeFilters = new Set(["lifecycle"]);
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll(".timeline-node");
    expect(nodes.length).toBe(1);
  });

  it("renders filter bar when strategy has filterCategories", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const filterBar = el.shadowRoot!.querySelector(".filter-bar");
    expect(filterBar).not.toBeNull();
    const chips = el.shadowRoot!.querySelectorAll(".filter-chip");
    expect(chips.length).toBe(2);
  });

  it("shows empty state when no nodes", async () => {
    el.strategy = { toNodes: () => [], defaultLayout: "vertical" };
    el.data = [];
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] } };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const empty = el.shadowRoot!.querySelector(".empty-state");
    expect(empty).not.toBeNull();
  });

  it("resolves strategy from registry via strategyKey", async () => {
    PagesEventTimeline.registerStrategy("test-sort", {
      toNodes: (data: EventTimelineNode[]) => [...data].reverse(),
      defaultLayout: "vertical",
    });

    el.data = testNodes;
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] }, strategyKey: "test-sort" };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll(".timeline-node");
    expect(nodes.length).toBe(3);
    const firstLabel = nodes[0]!.querySelector(".node-label");
    expect(firstLabel!.textContent).toBe("Pending Review");
  });

  it("renders horizontal layout when props.layout is 'horizontal'", async () => {
    const horizontalStrategy: EventTimelineStrategy<EventTimelineNode[]> = {
      toNodes: (data) => data,
      defaultLayout: "horizontal",
    };
    el.strategy = horizontalStrategy;
    el.data = testNodes;
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] }, layout: "horizontal" };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const pipeline = el.shadowRoot!.querySelector(".pipeline");
    expect(pipeline).not.toBeNull();
    expect(pipeline!.getAttribute("role")).toBe("list");
    expect(pipeline!.getAttribute("aria-orientation")).toBe("horizontal");

    const stages = el.shadowRoot!.querySelectorAll('[role="listitem"]');
    expect(stages.length).toBe(3);
  });

  it("renders compact layout when props.layout is 'compact'", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    el.props = { lookup: { dataSetId: "test" as DataSetId, operations: [] }, layout: "compact" };
    document.body.appendChild(el);
    await el.updateComplete;
    el.dataSet = makeDataSet([["key", "LABEL"]], [["dummy"]]);
    await el.updateComplete;

    const strip = el.shadowRoot!.querySelector(".compact-strip");
    expect(strip).not.toBeNull();
    expect(strip!.getAttribute("role")).toBe("img");
    expect(strip!.getAttribute("aria-label")).toContain("3 events");
  });

  it("renders nodes from data prop in standalone mode (no props)", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    document.body.appendChild(el);
    await el.updateComplete;

    const nodes = el.shadowRoot!.querySelectorAll(".timeline-node");
    expect(nodes.length).toBe(3);
  });

  it("uses layout property in standalone mode", async () => {
    el.strategy = { toNodes: (d: EventTimelineNode[]) => d, defaultLayout: "vertical" };
    el.data = testNodes;
    el.layout = "horizontal";
    document.body.appendChild(el);
    await el.updateComplete;

    const pipeline = el.shadowRoot!.querySelector(".pipeline");
    expect(pipeline).not.toBeNull();
    expect(pipeline!.getAttribute("role")).toBe("list");
  });

  it("resolves renderNode from component property over strategy", async () => {
    let calledWith: string | undefined;
    const customRenderNode = (node: EventTimelineNode) => {
      calledWith = node.key;
      return undefined;
    };
    el.strategy = testStrategy;
    el.data = [testNodes[0]!];
    el.renderNode = customRenderNode;
    document.body.appendChild(el);
    await el.updateComplete;

    expect(calledWith).toBe("1");
  });

  it("configure sets endpoint and strategy", () => {
    const s: EventTimelineStrategy = { toNodes: () => [], defaultLayout: "vertical" };
    el.configure({ endpoint: "/api/events", strategy: s, layout: "compact" });
    expect(el.endpoint).toBe("/api/events");
    expect(el.strategy).toBe(s);
    expect(el.layout).toBe("compact");
  });

  it("shows loading state in self-fetch mode", async () => {
    el.strategy = testStrategy;
    el.endpoint = "/api/events";
    document.body.appendChild(el);
    await el.updateComplete;

    const container = el.shadowRoot!.querySelector(".timeline-container");
    expect(container).not.toBeNull();
    expect(container!.textContent).toContain("Loading timeline");
  });

  it("renders ARIA attributes on host", async () => {
    el.strategy = testStrategy;
    el.data = testNodes;
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-label")).toBe("Event timeline");
  });
});
