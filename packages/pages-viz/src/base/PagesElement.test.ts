import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { PagesElement } from "./PagesElement.js";
import type { VizComponentProps } from "./types.js";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";

interface TestProps extends VizComponentProps {
  readonly label?: string;
}

@customElement("test-pages-element-lit")
class TestElement extends PagesElement<TestProps> {
  renderContentCalls: Array<{ props: TestProps; dataset: TypedDataSet }> = [];

  protected override renderContent(props: TestProps, dataset: TypedDataSet): TemplateResult {
    this.renderContentCalls.push({ props, dataset });
    return html`<div class="test-content">${props.label ?? ""}</div>`;
  }
}

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function mockDataSet(): TypedDataSet {
  return { columns: [], rows: [] };
}

describe("PagesElement", () => {
  let el: TestElement;
  let events: CustomEvent[];
  let handler: (e: Event) => void;

  beforeEach(() => {
    el = document.createElement("test-pages-element-lit") as TestElement;
    events = [];
    handler = (e: Event) => events.push(e as CustomEvent);
    document.body.addEventListener("pages-data-request", handler);
  });

  afterEach(() => {
    document.body.removeEventListener("pages-data-request", handler);
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("data request lifecycle", () => {
    it("fires event on connectedCallback when props with lookup are set before insertion", async () => {
      const lookup = mockLookup("sales");
      el.props = { lookup };
      document.body.appendChild(el);
      await el.updateComplete;

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.lookup).toBe(lookup);
      expect(events[0]!.detail.element).toBe(el);
    });

    it("fires event on props setter when already connected", async () => {
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(0);

      const lookup = mockLookup("sales");
      el.props = { lookup };
      await el.updateComplete;

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.lookup).toBe(lookup);
    });

    it("fires new request when lookup reference changes", async () => {
      const lookup1 = mockLookup("sales");
      el.props = { lookup: lookup1 };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(1);

      const lookup2 = mockLookup("orders");
      el.props = { lookup: lookup2 };
      await el.updateComplete;
      expect(events).toHaveLength(2);
      expect(events[1]!.detail.lookup).toBe(lookup2);
    });

    it("clears dataset when lookup changes", async () => {
      const lookup1 = mockLookup("sales");
      el.props = { lookup: lookup1 };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;
      expect(el.renderContentCalls.length).toBeGreaterThan(0);

      el.renderContentCalls = [];
      const lookup2 = mockLookup("orders");
      el.props = { lookup: lookup2 };
      await el.updateComplete;

      expect(el.renderContentCalls).toHaveLength(0);
    });

    it("fires new request on disconnect + reconnect", async () => {
      const lookup = mockLookup("sales");
      el.props = { lookup };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(1);

      el.remove();
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(2);
    });

    it("does not fire event when no lookup exists", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(0);
    });

    it("event has bubbles and composed flags", async () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      await el.updateComplete;

      expect(events[0]!.bubbles).toBe(true);
      expect(events[0]!.composed).toBe(true);
    });
  });

  describe("render dispatch", () => {
    it("does not call renderContent when no props set", async () => {
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      await el.updateComplete;
      expect(el.renderContentCalls).toHaveLength(0);
    });

    it("does not call renderContent when no dataset", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.renderContentCalls).toHaveLength(0);
    });

    it("calls renderContent when both props and dataset are present", async () => {
      const props: TestProps = { label: "test" };
      el.props = props;
      document.body.appendChild(el);
      await el.updateComplete;

      const ds = mockDataSet();
      el.dataSet = ds;
      await el.updateComplete;

      expect(el.renderContentCalls.length).toBeGreaterThanOrEqual(1);
      const lastCall = el.renderContentCalls[el.renderContentCalls.length - 1]!;
      expect(lastCall.props).toBe(props);
      expect(lastCall.dataset).toBe(ds);
    });
  });

  describe("error handling", () => {
    it("setting error prevents renderContent", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      el.renderContentCalls = [];
      el.error = "Something went wrong";
      await el.updateComplete;

      expect(el.renderContentCalls).toHaveLength(0);
    });

    it("setting dataset clears error and triggers renderContent", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.error = "fail";
      await el.updateComplete;

      el.renderContentCalls = [];
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(el.renderContentCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("error state renders error display", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      el.error = "broken";
      await el.updateComplete;

      const errorEl = el.shadowRoot!.querySelector("[data-pages-error]");
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toContain("broken");
    });
  });

  describe("standalone usage (no lookup)", () => {
    it("renders directly when dataset is set without lookup", async () => {
      el.props = { label: "standalone" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      expect(events).toHaveLength(0);
      expect(el.renderContentCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("loading state", () => {
    it("shows loading skeleton when props set but no dataset", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;

      const skeleton = el.shadowRoot!.querySelector("[data-pages-loading]");
      expect(skeleton).not.toBeNull();
    });
  });

  describe("error state rendering", () => {
    it("shows structured error with message", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.error = "Connection failed";
      await el.updateComplete;

      const errorEl = el.shadowRoot!.querySelector("[data-pages-error]");
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toContain("Connection failed");
    });

    it("includes a retry button that re-requests data", async () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(1);

      el.error = "Timeout";
      await el.updateComplete;

      const retryBtn = el.shadowRoot!.querySelector<HTMLButtonElement>("[data-pages-retry]");
      expect(retryBtn).not.toBeNull();

      retryBtn!.click();
      expect(events).toHaveLength(2);
    });

    it("does not show retry button when no lookup exists", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;
      el.error = "Error";
      await el.updateComplete;

      const retryBtn = el.shadowRoot!.querySelector("[data-pages-retry]");
      expect(retryBtn).toBeNull();
    });
  });

  describe("totalRows property", () => {
    it("defaults to -1", () => {
      expect(el.totalRows).toBe(-1);
    });

    it("stores value", () => {
      el.totalRows = 100;
      expect(el.totalRows).toBe(100);
    });
  });

  describe("theme property", () => {
    it("defaults to empty string", () => {
      expect(el.theme).toBe("");
    });

    it("can be set and triggers update", async () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      await el.updateComplete;
      el.dataSet = mockDataSet();
      await el.updateComplete;

      el.renderContentCalls = [];
      el.theme = "dark";
      expect(el.theme).toBe("dark");
      await el.updateComplete;

      expect(el.renderContentCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("refresh timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts refresh timer when props have refresh interval", async () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, refresh: { interval: 5000 } };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(1);

      vi.advanceTimersByTime(5000);
      expect(events).toHaveLength(2);

      vi.advanceTimersByTime(5000);
      expect(events).toHaveLength(3);
    });

    it("stops refresh timer on disconnect", async () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, refresh: { interval: 5000 } };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(1);

      el.remove();

      vi.advanceTimersByTime(10000);
      expect(events).toHaveLength(1);
    });

    it("restarts refresh timer on reconnect", async () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, refresh: { interval: 5000 } };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(1);

      el.remove();
      document.body.appendChild(el);
      await el.updateComplete;
      expect(events).toHaveLength(2);

      vi.advanceTimersByTime(5000);
      expect(events).toHaveLength(3);
    });
  });

  describe("resize observer", () => {
    it("has onResize hook", () => {
      expect(typeof (el as unknown as Record<string, unknown>).onResize).toBe("function");
    });
  });
});
