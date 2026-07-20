import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import { toTypedDataSet } from "@casehubio/pages-data";
import type { CountdownProps } from "@casehubio/pages-component";
import { PagesCountdown } from "./PagesCountdown.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, columns: [] } as unknown as DataSetLookup;
}

function makeDataSet(
  columns: [string, string][],
  rows: (string | number | Date | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows.map(row => row.map(cell => {
      if (cell === null) return null;
      if (cell instanceof Date) return cell.toISOString();
      return String(cell);
    })),
  };
  return toTypedDataSet(ds);
}

describe("PagesCountdown", () => {
  let element: PagesCountdown;

  beforeEach(() => {
    element = document.createElement("pages-countdown");
    document.body.appendChild(element);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(element);
    vi.useRealTimers();
  });

  it("displays time remaining from deadline in dataset", async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000 + 23 * 60 * 1000 + 15 * 1000);
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      format: "full",
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display).toBeTruthy();
    expect(display?.textContent).toMatch(/2d 5h 23m 15s/);
  });

  it("displays compact format with largest two units", async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000 + 23 * 60 * 1000 + 15 * 1000);
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      format: "compact",
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent).toMatch(/2d 5h/);
  });

  it("displays days-only format", async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000);
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      format: "days-only",
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent).toMatch(/2 days/);
  });

  it("updates display when timer advances", async () => {
    const futureDate = new Date(Date.now() + 10 * 1000); // 10 seconds
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      format: "full",
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    let display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent).toMatch(/10s/);

    // Advance 5 seconds
    vi.advanceTimersByTime(5000);
    await element.updateComplete;

    display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent).toMatch(/5s/);
  });

  it("shows EXPIRED when past deadline", async () => {
    const pastDate = new Date(Date.now() - 1000);
    const dataset = makeDataSet([["deadline", "DATE"]], [[pastDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent!.trim()).toBe("EXPIRED");
    expect(display?.classList.contains("countdown-critical")).toBe(true);
  });

  it("applies warning class when remaining time < warningThreshold", async () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      warningThreshold: "4hour", // 4 hours
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.classList.contains("countdown-warning")).toBe(true);
  });

  it("applies critical class when remaining time < criticalThreshold", async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      warningThreshold: "4hour",
      criticalThreshold: "1hour",
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.classList.contains("countdown-critical")).toBe(true);
  });

  it("transitions from normal to warning to critical", async () => {
    const futureDate = new Date(Date.now() + 5 * 60 * 60 * 1000); // 5 hours
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
      warningThreshold: "4hour",
      criticalThreshold: "1hour",
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    let display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.classList.contains("countdown-warning")).toBe(false);
    expect(display?.classList.contains("countdown-critical")).toBe(false);

    // Advance to warning threshold (1 hour and 1 second past warning)
    vi.advanceTimersByTime(1 * 60 * 60 * 1000 + 1000);
    await element.updateComplete;

    display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.classList.contains("countdown-warning")).toBe(true);
    expect(display?.classList.contains("countdown-critical")).toBe(false);

    // Advance to critical threshold (3 hours and 1 second more)
    vi.advanceTimersByTime(3 * 60 * 60 * 1000 + 1000);
    await element.updateComplete;

    display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.classList.contains("countdown-warning")).toBe(false);
    expect(display?.classList.contains("countdown-critical")).toBe(true);
  });

  it("clears timer in disconnectedCallback", async () => {
    const futureDate = new Date(Date.now() + 10 * 1000);
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    // Trigger disconnectedCallback (afterEach will try to remove again, so we use disconnectedCallback directly)
    element.disconnectedCallback();

    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it("has aria-live=polite on display element", async () => {
    const futureDate = new Date(Date.now() + 10 * 1000);
    const dataset = makeDataSet([["deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.getAttribute("aria-live")).toBe("polite");
  });

  it("defaults to first column when deadlineColumn not specified", async () => {
    const futureDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const dataset = makeDataSet([["auto-deadline", "DATE"]], [[futureDate]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent).toMatch(/1d/);
  });

  it("handles missing or invalid deadline gracefully", async () => {
    const dataset = makeDataSet([["deadline", "DATE"]], [[null]]);

    const props: CountdownProps = {
      lookup: mockLookup("test-ds"),
      deadlineColumn: "deadline" as ColumnId,
    };

    element.props = props;
    element.dataSet = dataset;
    await element.updateComplete;

    const display = element.shadowRoot?.querySelector("[data-countdown-display]");
    expect(display?.textContent).toMatch(/—/);
  });
});
