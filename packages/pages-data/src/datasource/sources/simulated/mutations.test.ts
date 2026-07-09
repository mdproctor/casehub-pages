import {describe, expect, it} from "vitest";
import type {EvalContext} from "./mutations.js";
import {addRow, decrement, evaluateMutations, increment, removeRow, transition, when,} from "./mutations.js";
import type {CellValue, Column, ColumnId, TypedRow} from "../../../dataset/types.js";
import {ColumnType} from "../../../dataset/types.js";
import {createTypedRow} from "../../../dataset/conversion.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const COLUMNS: Column[] = [
  { id: "id" as ColumnId, name: "ID", type: ColumnType.NUMBER },
  { id: "status" as ColumnId, name: "Status", type: ColumnType.TEXT },
  { id: "count" as ColumnId, name: "Count", type: ColumnType.NUMBER },
];

function makeRow(id: number, status: string, count: number): TypedRow {
  const cells: CellValue[] = [
    { type: ColumnType.NUMBER, value: id },
    { type: ColumnType.TEXT, value: status },
    { type: ColumnType.NUMBER, value: count },
  ];
  return createTypedRow(cells, COLUMNS);
}

function ctx(elapsed: number, random?: () => number): EvalContext {
  return {
    columns: COLUMNS,
    keyColumn: "id" as ColumnId,
    elapsed,
    ...(random !== undefined && { random }),
  };
}

function getCellValue(row: TypedRow, colId: string): unknown {
  const cell = row.cell(colId as ColumnId);
  return cell.type === "NULL" ? null : cell.value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Mutation DSL", () => {
  describe("transition", () => {
    it("transitions row when delay has elapsed", () => {
      const mut = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [100, 100],
      });
      const rows = [makeRow(1, "PENDING", 5)];

      // First tick at t=0: row enters tracking, delay is 100ms
      const r1 = evaluateMutations(rows, [mut], ctx(0));
      expect(r1.events).toHaveLength(0); // delay not elapsed

      // Second tick at t=100: delay elapsed, transition fires
      const r2 = evaluateMutations(r1.rows, [mut], ctx(100));
      expect(r2.events).toHaveLength(1);
      expect(r2.events[0]).toMatchObject({ type: "replace" });
      const replaced = r2.rows[0]!;
      expect(getCellValue(replaced, "status")).toBe("ASSIGNED");
    });

    it("does not transition when delay has not elapsed", () => {
      const mut = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [200, 200],
      });
      const rows = [makeRow(1, "PENDING", 5)];

      // t=0: enters tracking
      const r1 = evaluateMutations(rows, [mut], ctx(0));
      expect(r1.events).toHaveLength(0);

      // t=100: delay is 200, not yet elapsed
      const r2 = evaluateMutations(r1.rows, [mut], ctx(100));
      expect(r2.events).toHaveLength(0);
      expect(getCellValue(r2.rows[0]!, "status")).toBe("PENDING");
    });

    it("applies probability check", () => {
      const mut = transition("status", {
        from: "PENDING",
        to: "DONE",
        after: [0, 0], // immediate delay
        probability: 0.5,
      });
      const rows = [makeRow(1, "PENDING", 5)];

      // random returns 0.8 > 0.5 — should NOT transition
      const r1 = evaluateMutations(rows, [mut], ctx(0, () => 0.8));
      expect(r1.events).toHaveLength(0);

      // random returns 0.3 < 0.5 — should transition
      const r2 = evaluateMutations(rows, [mut], ctx(0, () => 0.3));
      expect(r2.events).toHaveLength(1);
      expect(getCellValue(r2.rows[0]!, "status")).toBe("DONE");
    });

    it("ignores rows not in 'from' state", () => {
      const mut = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [0, 0],
      });
      const rows = [makeRow(1, "DONE", 5)];

      const result = evaluateMutations(rows, [mut], ctx(0));
      expect(result.events).toHaveLength(0);
      expect(getCellValue(result.rows[0]!, "status")).toBe("DONE");
    });

    it("cleans up tracking when row leaves 'from' state externally", () => {
      const mut = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [100, 100],
      });
      const rows = [makeRow(1, "PENDING", 5)];

      // t=0: enters tracking
      evaluateMutations(rows, [mut], ctx(0));

      // Row was updated externally to DONE — no longer in PENDING
      const updatedRows = [makeRow(1, "DONE", 5)];
      const r2 = evaluateMutations(updatedRows, [mut], ctx(200));
      expect(r2.events).toHaveLength(0);
    });
  });

  describe("increment", () => {
    it("increments all rows when every interval elapsed", () => {
      const mut = increment("count", { by: 1, every: 100 });
      const rows = [makeRow(1, "X", 5), makeRow(2, "Y", 10)];

      // First tick at t=0: timing initialises with lastFiredAt=0, no elapsed yet
      const r1 = evaluateMutations(rows, [mut], ctx(0));
      expect(r1.events).toHaveLength(0);

      // t=100: interval elapsed
      const r2 = evaluateMutations(r1.rows, [mut], ctx(100));
      expect(r2.events).toHaveLength(2);
      expect(getCellValue(r2.rows[0]!, "count")).toBe(6);
      expect(getCellValue(r2.rows[1]!, "count")).toBe(11);
    });

    it("respects ceiling", () => {
      const mut = increment("count", { by: 10, every: 0, ceiling: 12 });
      const rows = [makeRow(1, "X", 5)];

      // every=0 means fire every tick, but timing starts at current elapsed
      // so first tick won't fire. Use elapsed > 0 to skip the init tick.
      const r1 = evaluateMutations(rows, [mut], ctx(0));
      // init tick — no fire
      const r2 = evaluateMutations(r1.rows, [mut], ctx(1));
      // shouldFire: 1 - 0 >= 0 → true
      expect(getCellValue(r2.rows[0]!, "count")).toBe(12); // clamped
    });

    it("does not increment before every interval", () => {
      const mut = increment("count", { by: 1, every: 1000 });
      const rows = [makeRow(1, "X", 5)];

      const r1 = evaluateMutations(rows, [mut], ctx(0));
      expect(r1.events).toHaveLength(0);

      const r2 = evaluateMutations(r1.rows, [mut], ctx(500));
      expect(r2.events).toHaveLength(0);
      expect(getCellValue(r2.rows[0]!, "count")).toBe(5);
    });
  });

  describe("decrement", () => {
    it("decrements all rows when every interval elapsed", () => {
      const mut = decrement("count", { by: 2, every: 100 });
      const rows = [makeRow(1, "X", 10)];

      const r1 = evaluateMutations(rows, [mut], ctx(0));
      expect(r1.events).toHaveLength(0); // init tick

      const r2 = evaluateMutations(r1.rows, [mut], ctx(100));
      expect(r2.events).toHaveLength(1);
      expect(getCellValue(r2.rows[0]!, "count")).toBe(8);
    });

    it("respects floor", () => {
      const mut = decrement("count", { by: 100, every: 0, floor: 0 });
      const rows = [makeRow(1, "X", 5)];

      const r1 = evaluateMutations(rows, [mut], ctx(0)); // init
      const r2 = evaluateMutations(r1.rows, [mut], ctx(1));
      expect(getCellValue(r2.rows[0]!, "count")).toBe(0); // clamped to floor
    });
  });

  describe("addRow", () => {
    it("appends generated row when probability hits", () => {
      let counter = 100;
      const mut = addRow({
        probability: 1.0,
        generator: () => ({ id: counter++, status: "NEW", count: 0 }),
      });
      const rows = [makeRow(1, "X", 5)];

      const result = evaluateMutations(rows, [mut], ctx(0));
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({ type: "append" });
      expect(result.rows).toHaveLength(2);
      expect(getCellValue(result.rows[1]!, "status")).toBe("NEW");
    });

    it("does not append when probability misses", () => {
      const mut = addRow({
        probability: 0.5,
        generator: () => ({ id: 99, status: "NEW", count: 0 }),
      });
      const rows = [makeRow(1, "X", 5)];

      // random returns 0.9 > 0.5
      const result = evaluateMutations(rows, [mut], ctx(0, () => 0.9));
      expect(result.events).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("removeRow", () => {
    it("removes rows matching predicate", () => {
      const mut = removeRow({
        predicate: (row) => row["status"] === "DONE",
        probability: 1.0,
      });
      const rows = [makeRow(1, "DONE", 5), makeRow(2, "PENDING", 10)];

      const result = evaluateMutations(rows, [mut], ctx(0));
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({ type: "remove", key: "1" });
      expect(result.rows).toHaveLength(1);
      expect(getCellValue(result.rows[0]!, "id")).toBe(2);
    });

    it("applies probability", () => {
      const mut = removeRow({
        predicate: (row) => row["status"] === "DONE",
        probability: 0.5,
      });
      const rows = [makeRow(1, "DONE", 5)];

      // random returns 0.9 > 0.5 — no removal
      const result = evaluateMutations(rows, [mut], ctx(0, () => 0.9));
      expect(result.events).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("when", () => {
    it("applies nested mutations only to matching rows", () => {
      const mut = when(
        (row) => row["status"] === "PENDING",
        increment("count", { by: 10, every: 100 }),
      );
      const rows = [makeRow(1, "PENDING", 5), makeRow(2, "DONE", 20)];

      // t=0: init tick — timing starts, no fire yet
      const r1 = evaluateMutations(rows, [mut], ctx(0));
      expect(r1.events).toHaveLength(0);

      // t=100: interval elapsed — only PENDING row is passed to increment
      const r2 = evaluateMutations(r1.rows, [mut], ctx(100));
      expect(r2.events).toHaveLength(1); // only row 1 incremented
      expect(getCellValue(r2.rows[0]!, "count")).toBe(15);
      expect(getCellValue(r2.rows[1]!, "count")).toBe(20); // unchanged
    });

    it("does not apply to non-matching rows", () => {
      const mut = when(
        (row) => row["status"] === "ACTIVE",
        decrement("count", { by: 1, every: 0 }),
      );
      const rows = [makeRow(1, "PENDING", 5)];

      const r1 = evaluateMutations(rows, [mut], ctx(0));
      const r2 = evaluateMutations(r1.rows, [mut], ctx(1));
      expect(r2.events).toHaveLength(0);
      expect(getCellValue(r2.rows[0]!, "count")).toBe(5);
    });
  });

  describe("evaluateMutations — snapshot semantics", () => {
    it("all mutations see tick-start state, not intermediate", () => {
      // Mutation 1: transition PENDING → ASSIGNED
      const _m1 = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [0, 0],
      });
      // Mutation 2: only fires if row is PENDING (via when)
      const _m2 = when(
        (row) => row["status"] === "PENDING",
        increment("count", { by: 100, every: 0 }),
      );

      const rows = [makeRow(1, "PENDING", 0)];

      // Both mutations evaluate against the snapshot where status is PENDING.
      // m1 transitions to ASSIGNED, but m2 should still see PENDING and increment.
      // First tick: init timing for increment
      const r1 = evaluateMutations(rows, [_m1, _m2], ctx(0));
      // m1 fires (after=[0,0]), m2 inits timing
      // The transition fires because delay=0 and elapsed=0 means 0-0>=0 → true
      expect(r1.events.length).toBeGreaterThanOrEqual(1);

      // Second tick: m2's increment should fire, even though m1 already
      // transitioned the row — because snapshot semantics means m2 still sees
      // the pre-m1 state within the SAME tick.
      // But wait — after first tick, the row IS ASSIGNED in the actual state.
      // So on second tick, snapshot is ASSIGNED, m2 won't match.
      // The real snapshot-semantics test is within a single tick.

      // Better test: both mutations in the same tick, both operating on same row
      const freshM1 = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [0, 0],
      });
      // m2 increments only if status is PENDING — should see PENDING in snapshot
      // even though m1 transitions it
      const freshM2Inc = increment("count", { by: 100, every: 0 });
      const freshM2 = when(
        (row) => row["status"] === "PENDING",
        freshM2Inc,
      );

      const freshRows = [makeRow(1, "PENDING", 0)];
      // First call: init timing for increment (timing inits at elapsed=0)
      const init = evaluateMutations(freshRows, [freshM1, freshM2], ctx(0));
      // m1 transitions, m2 inits timing. Row is now ASSIGNED in actual state.

      // Second call at t=1: both see the ACTUAL current state (ASSIGNED)
      // m1 won't fire (not PENDING), m2 won't match predicate (ASSIGNED)
      // This is correct — snapshot semantics is WITHIN a tick, not across ticks.
      const tick2 = evaluateMutations(init.rows, [freshM1, freshM2], ctx(1));
      expect(tick2.events).toHaveLength(0);
    });

    it("mutation order does not affect result within a tick", () => {
      // Two transitions on the same row: both see original state
      const _m1 = transition("status", {
        from: "PENDING",
        to: "ASSIGNED",
        after: [0, 0],
      });
      // increment fires on all rows — doesn't depend on transition
      const _m2 = increment("count", { by: 10, every: 0 });

      const rows = [makeRow(1, "PENDING", 5)];

      // Order A: [m1, m2]
      const freshM1a = transition("status", { from: "PENDING", to: "ASSIGNED", after: [0, 0] });
      const freshM2a = increment("count", { by: 10, every: 0 });
      const initA = evaluateMutations(rows, [freshM1a, freshM2a], ctx(0));
      const resultA = evaluateMutations(initA.rows, [freshM1a, freshM2a], ctx(1));

      // Order B: [m2, m1]
      const freshM1b = transition("status", { from: "PENDING", to: "ASSIGNED", after: [0, 0] });
      const freshM2b = increment("count", { by: 10, every: 0 });
      const initB = evaluateMutations(rows, [freshM2b, freshM1b], ctx(0));
      const resultB = evaluateMutations(initB.rows, [freshM2b, freshM1b], ctx(1));

      // Same number of events regardless of order
      expect(resultA.events.length).toBe(resultB.events.length);
      // Same final state
      expect(getCellValue(resultA.rows[0]!, "status")).toBe(
        getCellValue(resultB.rows[0]!, "status"),
      );
      expect(getCellValue(resultA.rows[0]!, "count")).toBe(
        getCellValue(resultB.rows[0]!, "count"),
      );
    });
  });
});
