import { beforeEach, describe, expect, it, vi } from "vitest";
import { PagesIframePlugin } from "./PagesIframePlugin.js";
import type { IframePluginProps } from "@casehubio/pages-component";
import type { TypedDataSet, TypedRow, CellValue, DataSet } from "@casehubio/pages-data";
import { ColumnType, columnId } from "@casehubio/pages-data";
import type { PagesFilterApply } from "../base/filter-types.js";
import { toTypedDataSet } from "@casehubio/pages-data";


function mockRow(cells: CellValue[]): TypedRow {
  return {
    cells,
    cell: () => cells[0]!,
    number: () => 0,
    text: () => "",
    date: () => new Date(),
  };
}
describe("PagesIframePlugin", () => {
  let element: PagesIframePlugin;

  beforeEach(() => {
    element = document.createElement("pages-iframe-plugin");
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (element.parentNode) {
      document.body.removeChild(element);
    }
  });

  it("creates iframe with correct src", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toContain("/pages/component/echarts/index.html");
  });

  it("applies width and height from props", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      width: "800px",
      height: "600px",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.style.width).toBe("800px");
    expect(iframe!.style.height).toBe("600px");
  });

  it("defaults to 100% width and height", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.style.width).toBe("100%");
    expect(iframe!.style.height).toBe("100%");
  });

  it("sends INIT message to iframe", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    const postMessageSpy = vi.fn();
    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    // Mock iframe contentWindow
    const iframe = element.shadowRoot!.querySelector("iframe");
    if (iframe) {
      Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: postMessageSpy },
        writable: true,
      });
    }

    // Fire load event to trigger message sending
    iframe!.dispatchEvent(new Event("load"));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "INIT",
        properties: expect.objectContaining({
          COMPONENT_ID: "echarts",
        }),
      }),
      "*",
    );
  });

  it("sends DATASET message with wire format", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      settings: { theme: "dark" },
    };

    const dataset: TypedDataSet = {
      columns: [
        { id: columnId("x"), name: "x", type: ColumnType.TEXT },
        { id: columnId("y"), name: "y", type: ColumnType.NUMBER },
      ],
      rows: [
        mockRow([
          { type: ColumnType.TEXT, value: "A" },
          { type: ColumnType.NUMBER, value: 10 },
        ]),
      ],
    };

    const postMessageSpy = vi.fn();
    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe = element.shadowRoot!.querySelector("iframe");
    if (iframe) {
      Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: postMessageSpy },
        writable: true,
      });
    }

    // Fire load event to trigger message sending
    iframe!.dispatchEvent(new Event("load"));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DATASET",
        properties: expect.objectContaining({
          COMPONENT_ID: "echarts",
          DATASET: expect.objectContaining({
            columns: expect.arrayContaining([
              expect.objectContaining({ id: "x" }),
              expect.objectContaining({ id: "y" }),
            ]),
            data: [["A", "10"]],
          }),
          theme: "dark",
        }),
      }),
      "*",
    );
  });

  it("handles FILTER messages — emits PagesFilterApply with row and value", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      filter: { group: "test-group" },
    };

    const rawDs: DataSet = {
      columns: [{ id: columnId("col1"), name: "col1", type: ColumnType.TEXT }],
      data: [["Alpha"], ["Beta"], ["Gamma"], ["Delta"], ["Echo"], ["Foxtrot"]],
    };
    const dataset = toTypedDataSet(rawDs);

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const filterHandler = vi.fn();
    element.addEventListener("pages-filter", filterHandler);

    // Simulate message from iframe
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "echarts",
            FILTER: {
              column: 0,
              row: 5,
              reset: false,
            },
          },
        },
      }),
    );

    expect(filterHandler).toHaveBeenCalledTimes(1);
    const detail = filterHandler.mock.calls[0]?.[0]?.detail as PagesFilterApply;
    expect(detail.columnId).toBe("col1");
    expect(detail.value).toBe("Foxtrot");
    expect(detail.row).toBe(dataset.rows[5]);
    expect(detail.reset).toBe(false);
    expect(detail.group).toBe("test-group");
  });

  it("ignores FILTER messages for other components", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("col1"), name: "col1", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const filterHandler = vi.fn();
    element.addEventListener("pages-filter", filterHandler);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "other-component",
            FILTER: { column: 0, row: 5 },
          },
        },
      }),
    );

    expect(filterHandler).not.toHaveBeenCalled();
  });

  it("handles FILTER reset messages without valid row", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      filter: { group: "test-group" },
    };

    const rawDs: DataSet = {
      columns: [{ id: columnId("col1"), name: "col1", type: ColumnType.TEXT }],
      data: [["Alpha"], ["Beta"]],
    };
    const dataset = toTypedDataSet(rawDs);

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const filterHandler = vi.fn();
    element.addEventListener("pages-filter", filterHandler);

    // Simulate reset message with row: -1 (invalid)
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "echarts",
            FILTER: {
              column: 0,
              row: -1,
              reset: true,
            },
          },
        },
      }),
    );

    expect(filterHandler).toHaveBeenCalledTimes(1);
    const detail = filterHandler.mock.calls[0]?.[0]?.detail;
    expect(detail.columnId).toBe("col1");
    expect(detail.reset).toBe(true);
    expect(detail.group).toBe("test-group");
    expect(detail.row).toBeUndefined();
    expect(detail.value).toBeUndefined();
  });

  it("cleans up message listener on disconnect", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("col1"), name: "col1", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const filterHandler = vi.fn();
    element.addEventListener("pages-filter", filterHandler);

    element.remove();

    // Message after disconnect should not trigger handler
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "echarts",
            FILTER: { column: 0, row: 5 },
          },
        },
      }),
    );

    expect(filterHandler).not.toHaveBeenCalled();
  });

  it("recreates iframe when componentId changes", async () => {
    const props1: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props1;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe1 = element.shadowRoot!.querySelector("iframe");
    expect(iframe1).toBeTruthy();
    expect(iframe1!.src).toContain("/pages/component/echarts/index.html");

    // Change componentId
    const props2: IframePluginProps = {
      componentId: "llm-prompter",
    };

    element.props = props2;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe2 = element.shadowRoot!.querySelector("iframe");
    expect(iframe2).toBeTruthy();
    expect(iframe2!.src).toContain("/pages/component/llm-prompter/index.html");
    expect(iframe2).not.toBe(iframe1); // Different iframe instance
  });

  it("waits for iframe load before sending messages", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    const postMessageSpy = vi.fn();

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();

    // Mock contentWindow but don't fire load yet
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: postMessageSpy },
      writable: true,
    });

    // Messages should not be sent yet
    expect(postMessageSpy).not.toHaveBeenCalled();

    // Fire load event
    iframe!.dispatchEvent(new Event("load"));

    // Now messages should be sent
    await element.updateComplete;
    expect(postMessageSpy).toHaveBeenCalled();
  });
});
