import { describe, it, expect } from "vitest";
import { desugarGroupedView } from "./grouped-view-desugar.js";

describe("desugarGroupedView", () => {
  it("desugars minimal grouped-view YAML", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
    });
    expect(result.type).toBe("grouped-view");
    expect(result.props).toBeDefined();
    const props = result.props as Record<string, unknown>;
    expect(props.groupBy).toBeDefined();
    const groupBy = props.groupBy as Record<string, unknown>;
    expect(groupBy.strategy).toEqual({ mode: "distinct" });
  });

  it("desugars fixedCalendar strategy with unit", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "date", strategy: "fixedCalendar", unit: "MONTH" },
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.strategy).toEqual({ mode: "fixedCalendar", unit: "MONTH" });
  });

  it("rejects fixedCalendar without unit", () => {
    expect(() => desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "date", strategy: "fixedCalendar" },
    })).toThrow(/unit.*required/i);
  });

  it("desugars dynamicRange strategy", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "ts", strategy: "dynamicRange", preferredUnit: "MONTH" },
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.strategy).toEqual({ mode: "dynamicRange", preferredUnit: "MONTH" });
  });

  it("desugars aggregations", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      aggregations: [{ column: "amount", fn: "SUM" }],
    });
    const props = result.props as Record<string, unknown>;
    const aggs = props.aggregations as Array<Record<string, unknown>>;
    expect(aggs).toHaveLength(1);
    expect(aggs[0]!.column).toBe("amount");
    expect(aggs[0]!.fn).toEqual({ fn: "SUM" });
  });

  it("maps preset field through", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      preset: "spreadsheet",
    });
    expect((result.props as Record<string, unknown>).preset).toBe("spreadsheet");
  });

  it("maps order field to ascendingOrder", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      order: "desc",
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.ascendingOrder).toBe(false);
  });

  it("defaults to ascending order", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.ascendingOrder).toBe(true);
  });

  it("rejects table-row + list combination", () => {
    expect(() => desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      groupDisplay: "table-row",
      contentDisplay: "list",
    })).toThrow(/invalid.*combination/i);
  });

  it("rejects unknown strategy", () => {
    expect(() => desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "bogus" },
    })).toThrow(/unknown.*strategy/i);
  });

  it("maps emptyGroups to emptyIntervals", () => {
    const result = desugarGroupedView({
      type: "GROUPED_VIEW",
      groupBy: { column: "status", strategy: "distinct" },
      emptyGroups: true,
    });
    const groupBy = (result.props as Record<string, unknown>).groupBy as Record<string, unknown>;
    expect(groupBy.emptyIntervals).toBe(true);
  });
});
