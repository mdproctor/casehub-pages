import { describe, it, expect } from "vitest";
import { evaluateExpression, createRowContext } from "./expression-evaluator.js";
import type { RuntimeContext } from "./types.js";

describe("expression-evaluator", () => {
  describe("evaluateExpression", () => {
    describe("truthy evaluation", () => {
      it("returns true for non-empty filter", () => {
        const ctx: RuntimeContext = {
          filter: { ward: ["ICU"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.ward}", ctx)).toBe(true);
      });

      it("returns false for empty filter", () => {
        const ctx: RuntimeContext = {
          filter: { ward: [] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.ward}", ctx)).toBe(false);
      });

      it("returns false for missing filter", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.missing}", ctx)).toBe(false);
      });
    });

    describe("equality operators", () => {
      it("evaluates string equality", () => {
        const ctx: RuntimeContext = {
          filter: { ward: ["ICU"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.ward} == 'ICU'", ctx)).toBe(true);
        expect(evaluateExpression("#{filter.ward} == 'CCU'", ctx)).toBe(false);
      });

      it("evaluates numeric equality with string coercion", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { score: "3" },
        };
        expect(evaluateExpression("#{row.score} == 3", ctx)).toBe(true);
      });

      it("evaluates inequality", () => {
        const ctx: RuntimeContext = {
          filter: { status: ["active"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.status} != 'inactive'", ctx)).toBe(
          true
        );
        expect(evaluateExpression("#{filter.status} != 'active'", ctx)).toBe(
          false
        );
      });

      it("handles null literal", () => {
        const ctx: RuntimeContext = {
          filter: { ward: ["ICU"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.ward} != null", ctx)).toBe(true);
        expect(evaluateExpression("#{filter.missing} == null", ctx)).toBe(false); // missing resolves to "", not null
      });
    });

    describe("comparison operators", () => {
      it("evaluates numeric greater-than", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { grade: "5" },
        };
        expect(evaluateExpression("#{row.grade} >= 4", ctx)).toBe(true);
        expect(evaluateExpression("#{row.grade} > 5", ctx)).toBe(false);
      });

      it("evaluates numeric less-than", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { count: "10" },
        };
        expect(evaluateExpression("#{row.count} < 20", ctx)).toBe(true);
        expect(evaluateExpression("#{row.count} <= 10", ctx)).toBe(true);
        expect(evaluateExpression("#{row.count} < 5", ctx)).toBe(false);
      });

      it("evaluates string comparison lexicographically", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { name: "Smith" },
        };
        expect(evaluateExpression("#{row.name} > 'M'", ctx)).toBe(true);
        expect(evaluateExpression("#{row.name} < 'T'", ctx)).toBe(true);
      });

      it("uses numeric comparison when both sides are numbers", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { a: "10", b: "2" },
        };
        expect(evaluateExpression("#{row.a} > #{row.b}", ctx)).toBe(true); // 10 > 2, not "10" < "2"
      });
    });

    describe("logical operators", () => {
      it("evaluates negation", () => {
        const ctx: RuntimeContext = {
          filter: { ward: [] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("!#{filter.ward}", ctx)).toBe(true);
      });

      it("evaluates AND operator", () => {
        const ctx: RuntimeContext = {
          filter: { a: ["A"], b: ["B"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.a} && #{filter.b}", ctx)).toBe(
          true
        );

        const ctx2: RuntimeContext = {
          filter: { a: ["A"], b: [] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.a} && #{filter.b}", ctx2)).toBe(
          false
        );
      });

      it("evaluates OR operator", () => {
        const ctx: RuntimeContext = {
          filter: { a: [], b: ["B"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.a} || #{filter.b}", ctx)).toBe(
          true
        );

        const ctx2: RuntimeContext = {
          filter: { a: [], b: [] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.a} || #{filter.b}", ctx2)).toBe(
          false
        );
      });

      it("respects operator precedence (AND binds tighter than OR)", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { a: "false", b: "true", c: "true" },
        };
        // a || b && c should parse as a || (b && c)
        expect(
          evaluateExpression(
            "#{row.a} == 'false' || #{row.b} == 'true' && #{row.c} == 'false'",
            ctx
          )
        ).toBe(true); // false || (true && false) = false || false = false? No: "false" is truthy!
      });

      it("handles parentheses for grouping", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
          row: { x: "a", y: "b", z: "c" },
        };
        expect(
          evaluateExpression(
            "(#{row.x} == 'a' && #{row.y} == 'b') || #{row.z} == 'c'",
            ctx
          )
        ).toBe(true);
      });
    });

    describe("boolean literals", () => {
      it("evaluates true and false literals", () => {
        const ctx: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("true", ctx)).toBe(true);
        expect(evaluateExpression("false", ctx)).toBe(false);
        expect(evaluateExpression("true && false", ctx)).toBe(false);
        expect(evaluateExpression("true || false", ctx)).toBe(true);
      });
    });

    describe("row context", () => {
      it("evaluates expressions with row-scoped variables", () => {
        const base: RuntimeContext = {
          filter: {},
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        const rowCtx = createRowContext(base, { status: "Critical" });
        expect(evaluateExpression("#{row.status} == 'Critical'", rowCtx)).toBe(
          true
        );
      });
    });

    describe("array-valued filters", () => {
      it("uses first element for scalar operations", () => {
        const ctx: RuntimeContext = {
          filter: { priority: ["high", "medium", "low"] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.priority} == 'high'", ctx)).toBe(
          true
        );
      });

      it("treats empty array as falsy", () => {
        const ctx: RuntimeContext = {
          filter: { priority: [] },
          datasets: {},
          page: { name: "test", path: "/test" },
          params: {},
          selection: {},
        };
        expect(evaluateExpression("#{filter.priority}", ctx)).toBe(false);
      });
    });
  });

  describe("createRowContext", () => {
    it("creates a new context with row property set", () => {
      const base: RuntimeContext = {
        filter: { ward: ["ICU"] },
        datasets: {},
        page: { name: "test", path: "/test" },
        params: {},
        selection: {},
      };
      const rowCtx = createRowContext(base, { status: "Critical", score: 95 });

      expect(rowCtx.filter).toBe(base.filter);
      expect(rowCtx.datasets).toBe(base.datasets);
      expect(rowCtx.page).toBe(base.page);
      expect(rowCtx.params).toBe(base.params);
      expect(rowCtx.row).toEqual({ status: "Critical", score: 95 });
    });

    it("preserves base context properties", () => {
      const base: RuntimeContext = {
        filter: { a: ["A"] },
        datasets: {},
        page: { name: "Dashboard", path: "/dash" },
        params: { p: "P" },
        selection: {},
      };
      const rowCtx = createRowContext(base, { x: "X" });

      expect(evaluateExpression("#{filter.a} == 'A'", rowCtx)).toBe(true);
      expect(evaluateExpression("#{params.p} == 'P'", rowCtx)).toBe(true);
      expect(evaluateExpression("#{row.x} == 'X'", rowCtx)).toBe(true);
    });
  });
});
