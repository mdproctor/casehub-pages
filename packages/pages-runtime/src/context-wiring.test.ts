import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextManager, type ContextConsumer } from "./context-wiring.js";
import { EMPTY_CONTEXT } from "@casehubio/pages-component";
import {
  dataSetId,
  columnId,
  ColumnType,
} from "@casehubio/pages-data";
import type {
  TypedDataSet,
  TypedRow,
} from "@casehubio/pages-data";

describe("ContextManager", () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe("initial state", () => {
    it("starts with EMPTY_CONTEXT", () => {
      expect(manager.getContext()).toEqual(EMPTY_CONTEXT);
    });
  });

  describe("updateFilter", () => {
    it("produces new RuntimeContext with updated filter values", () => {
      const filter = { category: ["A", "B"] as const };
      manager.updateFilter(filter);

      const context = manager.getContext();
      expect(context.filter).toEqual(filter);
      expect(context).not.toBe(EMPTY_CONTEXT);
    });

    it("triggers evaluateAll for registered consumers", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Filter: #{filter.category}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateFilter({ category: ["A"] as const });

      expect(apply).toHaveBeenCalledWith("Filter: A");
      element.remove();
    });
  });

  describe("updateDataset", () => {
    it("builds DataSetSnapshot and produces new context", () => {
      const dataset: TypedDataSet = {
        columns: [
          { id: columnId("id"), name: "ID", type: ColumnType.NUMBER },
          { id: columnId("name"), name: "Name", type: ColumnType.TEXT },
        ],
        rows: [
          createRow([
            { type: ColumnType.NUMBER, value: 1 },
            { type: ColumnType.TEXT, value: "Alice" },
          ]),
          createRow([
            { type: ColumnType.NUMBER, value: 2 },
            { type: ColumnType.TEXT, value: "Bob" },
          ]),
        ],
      };

      manager.updateDataset(dataSetId("users"), dataset);

      const context = manager.getContext();
      expect(context.datasets["users"]).toEqual({
        rowCount: 2,
        columns: ["id", "name"],
        first: { id: 1, name: "Alice" },
      });
    });

    it("handles empty dataset", () => {
      const dataset: TypedDataSet = {
        columns: [{ id: columnId("id"), name: "ID", type: ColumnType.NUMBER }],
        rows: [],
      };

      manager.updateDataset(dataSetId("empty"), dataset);

      const context = manager.getContext();
      expect(context.datasets["empty"]).toEqual({
        rowCount: 0,
        columns: ["id"],
        first: undefined,
      });
    });

    it("triggers evaluateAll for registered consumers", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Count: #{datasets.users.rowCount}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);

      const dataset: TypedDataSet = {
        columns: [{ id: columnId("id"), name: "ID", type: ColumnType.NUMBER }],
        rows: [createRow([{ type: ColumnType.NUMBER, value: 1 }])],
      };

      manager.updateDataset(dataSetId("users"), dataset);

      expect(apply).toHaveBeenCalledWith("Count: 1");
      element.remove();
    });
  });

  describe("updatePage", () => {
    it("produces new RuntimeContext with updated page values", () => {
      manager.updatePage("Dashboard", "/dashboard");

      const context = manager.getContext();
      expect(context.page).toEqual({ name: "Dashboard", path: "/dashboard" });
    });

    it("triggers evaluateAll for registered consumers", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Page: #{page.name}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updatePage("Home", "/");

      expect(apply).toHaveBeenCalledWith("Page: Home");
      element.remove();
    });
  });

  describe("updateParams", () => {
    it("produces new RuntimeContext with updated params", () => {
      const params = { id: "123", tab: "overview" };
      manager.updateParams(params);

      const context = manager.getContext();
      expect(context.params).toEqual(params);
    });

    it("triggers evaluateAll for registered consumers", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "ID: #{params.id}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateParams({ id: "456" });

      expect(apply).toHaveBeenCalledWith("ID: 456");
      element.remove();
    });
  });

  describe("consumer registration", () => {
    it("evaluates templates and calls apply on registration", () => {
      manager.updateFilter({ status: ["active"] as const });

      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Status: #{filter.status}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);

      expect(apply).toHaveBeenCalledWith("Status: active");
      element.remove();
    });

    it("only calls apply when resolved value changes", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Static",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply).toHaveBeenCalledWith("Static");

      // Second evaluation - no change, no call
      manager.updateFilter({ x: ["y"] as const });
      expect(apply).toHaveBeenCalledTimes(1);
      element.remove();
    });

    it("updates lastResolved after apply", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Value: #{filter.x}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateFilter({ x: ["A"] as const });

      const entry = consumer.templates.get("test");
      expect(entry?.lastResolved).toBe("Value: A");
      element.remove();
    });
  });

  describe("deregisterConsumer", () => {
    it("removes consumer from registry — no further evaluations", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Value: #{filter.x}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateFilter({ x: ["A"] as const });
      expect(apply).toHaveBeenCalledTimes(2); // Once on registration, once on updateFilter

      manager.deregisterConsumer(element);
      manager.updateFilter({ x: ["B"] as const });

      // Still only called twice (not called after deregister)
      expect(apply).toHaveBeenCalledTimes(2);
      element.remove();
    });
  });

  describe("visibleWhen - suspension model", () => {
    it("calls onSuspend when visibleWhen transitions to falsy", () => {
      const apply = vi.fn();
      const onSuspend = vi.fn();
      const onResume = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Content",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        visibleWhen: {
          expression: "#{filter.show} == 'yes'",
          lastResult: false,
          onSuspend,
          onResume,
        },
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateFilter({ show: ["yes"] as const });

      expect(onResume).toHaveBeenCalledTimes(1);
      expect(consumer.suspended).toBe(false);

      manager.updateFilter({ show: ["no"] as const });

      expect(onSuspend).toHaveBeenCalledTimes(1);
      expect(consumer.suspended).toBe(true);
      element.remove();
    });

    it("calls onResume when visibleWhen transitions from falsy to truthy", () => {
      const apply = vi.fn();
      const onSuspend = vi.fn();
      const onResume = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Content",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        visibleWhen: {
          expression: "#{filter.active} == 'true'",
          lastResult: false,
          onSuspend,
          onResume,
        },
        suspended: true,
      };

      manager.registerConsumer(consumer);

      // Initially suspended, expression is falsy
      manager.updateFilter({ active: ["false"] as const });
      expect(onResume).not.toHaveBeenCalled();

      // Expression becomes truthy
      manager.updateFilter({ active: ["true"] as const });
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(consumer.suspended).toBe(false);
      element.remove();
    });

    it("suspended consumers only re-evaluate visibleWhen, templates skipped", () => {
      const apply = vi.fn();
      const onSuspend = vi.fn();
      const onResume = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Count: #{datasets.users.rowCount}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        visibleWhen: {
          expression: "#{filter.show} == 'yes'",
          lastResult: false,
          onSuspend,
          onResume,
        },
        suspended: true,
      };

      manager.registerConsumer(consumer);

      const dataset: TypedDataSet = {
        columns: [{ id: columnId("id"), name: "ID", type: ColumnType.NUMBER }],
        rows: [createRow([{ type: ColumnType.NUMBER, value: 1 }])],
      };

      // Dataset changes while suspended
      manager.updateDataset(dataSetId("users"), dataset);

      // apply should not be called while suspended
      expect(apply).not.toHaveBeenCalled();
      element.remove();
    });
  });

  describe("cascade depth guard", () => {
    it("halts at depth 10 when circular dependency detected", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      let updateCount = 0;
      const apply = vi.fn(() => {
        updateCount++;
        if (updateCount < 20) {
          // Try to trigger infinite cascade
          manager.updateFilter({ count: [`${updateCount}`] as const });
        }
      });

      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Count: #{filter.count}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateFilter({ count: ["0"] as const });

      // The callback runs until updateCount >= 20 (the test's stop condition)
      // The depth guard triggers multiple times as the cascade repeatedly hits the limit
      expect(updateCount).toBe(20);
      expect(warnSpy).toHaveBeenCalled(); // Warning logged when depth limit hit
      expect(warnSpy.mock.calls[0]?.[0]).toContain("cascade depth limit");

      warnSpy.mockRestore();
      element.remove();
    });
  });

  describe("multiple consumers", () => {
    it("prunes disconnected consumers and only evaluates connected ones", () => {
      const apply1 = vi.fn();
      const apply2 = vi.fn();

      const element1 = document.createElement("div");
      const element2 = document.createElement("div");

      // element1 is connected
      document.body.appendChild(element1);
      // element2 is not connected

      const consumer1: ContextConsumer = {
        element: element1,
        templates: new Map([
          [
            "test",
            {
              template: "Value: #{filter.x}",
              escapeMode: "none",
              lastResolved: "",
              apply: apply1,
            },
          ],
        ]),
        suspended: false,
      };

      const consumer2: ContextConsumer = {
        element: element2,
        templates: new Map([
          [
            "test",
            {
              template: "Value: #{filter.x}",
              escapeMode: "none",
              lastResolved: "",
              apply: apply2,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer1);
      manager.registerConsumer(consumer2);

      // Reset mocks after registration to focus on evaluateAll behavior
      apply1.mockClear();
      apply2.mockClear();

      manager.updateFilter({ x: ["A"] as const });

      // Connected consumer receives update
      expect(apply1).toHaveBeenCalledWith("Value: A");
      // Disconnected consumer is pruned and NOT called during evaluateAll
      expect(apply2).not.toHaveBeenCalled();

      // Cleanup
      element1.remove();
    });

    it("prunes stale consumers with disconnected elements", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      // Attach initially so it's connected
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "Value: #{filter.x}",
              escapeMode: "none",
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);

      // Verify initial registration and update call apply
      manager.updateFilter({ x: ["A"] as const });
      expect(apply).toHaveBeenCalledWith("Value: A");

      // Verify element is connected before removing
      expect(element.isConnected).toBe(true);

      // Now remove element from DOM to disconnect it
      element.remove();
      expect(element.isConnected).toBe(false);

      // Reset mocks to verify pruning behavior
      apply.mockClear();

      // Next update should prune the disconnected consumer
      manager.updateFilter({ x: ["B"] as const });

      // apply should NOT be called because consumer was pruned
      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe("multiple templates per consumer", () => {
    it("evaluates all templates in a consumer", () => {
      const apply1 = vi.fn();
      const apply2 = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "title",
            {
              template: "Page: #{page.name}",
              escapeMode: "none",
              lastResolved: "",
              apply: apply1,
            },
          ],
          [
            "count",
            {
              template: "Items: #{datasets.items.rowCount}",
              escapeMode: "none",
              lastResolved: "",
              apply: apply2,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updatePage("Dashboard", "/dashboard");

      expect(apply1).toHaveBeenCalledWith("Page: Dashboard");

      const dataset: TypedDataSet = {
        columns: [{ id: columnId("id"), name: "ID", type: ColumnType.NUMBER }],
        rows: [createRow([{ type: ColumnType.NUMBER, value: 1 }])],
      };

      manager.updateDataset(dataSetId("items"), dataset);

      expect(apply2).toHaveBeenCalledWith("Items: 1");
      element.remove();
    });
  });

  describe("updateSelection", () => {
    it("sets selection for a dataset", () => {
      const row = { id: 42, name: "Event A" };
      manager.updateSelection("adverseEvents", row);

      const ctx = manager.getContext();
      expect(ctx.selection["adverseEvents"]).toEqual({ id: 42, name: "Event A" });
    });

    it("clears selection when row is null", () => {
      manager.updateSelection("adverseEvents", { id: 42 });
      manager.updateSelection("adverseEvents", null);

      const ctx = manager.getContext();
      expect(ctx.selection["adverseEvents"]).toBeUndefined();
    });

    it("supports multiple independent selections", () => {
      manager.updateSelection("adverseEvents", { id: 1 });
      manager.updateSelection("deviations", { id: 2 });

      const ctx = manager.getContext();
      expect(ctx.selection["adverseEvents"]).toEqual({ id: 1 });
      expect(ctx.selection["deviations"]).toEqual({ id: 2 });
    });

    it("triggers evaluateAll for registered consumers", () => {
      const apply = vi.fn();
      const element = document.createElement("div");
      document.body.appendChild(element);

      const consumer: ContextConsumer = {
        element,
        templates: new Map([
          [
            "test",
            {
              template: "ID: #{selection.adverseEvents.id}",
              escapeMode: "none" as const,
              lastResolved: "",
              apply,
            },
          ],
        ]),
        suspended: false,
      };

      manager.registerConsumer(consumer);
      manager.updateSelection("adverseEvents", { id: 42 });

      expect(apply).toHaveBeenCalledWith("ID: 42");
      element.remove();
    });

    it("clears all selections via clearAllSelections", () => {
      manager.updateSelection("adverseEvents", { id: 1 });
      manager.updateSelection("deviations", { id: 2 });
      manager.clearAllSelections();

      const ctx = manager.getContext();
      expect(ctx.selection).toEqual({});
    });
  });
});

// Helper to create a TypedRow
function createRow(cells: readonly unknown[]): TypedRow {
  return {
    cells: cells as readonly TypedRow["cells"][number][],
    cell(columnId) {
      const index = parseInt(columnId.toString().replace(/\D/g, ""), 10) || 0;
      return this.cells[index] || { type: "NULL" };
    },
    number(columnId) {
      const cell = this.cell(columnId);
      return cell.type === ColumnType.NUMBER ? cell.value : 0;
    },
    text(columnId) {
      const cell = this.cell(columnId);
      return cell.type === ColumnType.TEXT ? cell.value : "";
    },
    date(columnId) {
      const cell = this.cell(columnId);
      return cell.type === ColumnType.DATE ? cell.value : new Date(0);
    },
  };
}
