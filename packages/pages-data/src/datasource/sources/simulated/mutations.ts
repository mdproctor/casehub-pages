/**
 * Mutation DSL for simulated data sources.
 *
 * Each mutation is a pure descriptor — a data object that declares *what*
 * should change. `evaluateMutations()` is the engine that evaluates all
 * mutations against a snapshot of current rows and collects the resulting
 * DataSetEvents for atomic application.
 *
 * Design invariant: **snapshot semantics** — every mutation within a single
 * tick evaluates against the row state at tick-start. Mutation A's changes
 * are NOT visible to mutation B within the same tick.
 */

import type {CellValue, Column, ColumnId, TypedRow} from "../../../dataset/types.js";
import {ColumnType} from "../../../dataset/types.js";
import type {AppendEvent, DataSetEvent, RemoveEvent, ReplaceEvent} from "../../../dataset/events.js";
import {createTypedRow} from "../../../dataset/conversion.js";
import {
    createMutationTiming,
    createTransitionTracking,
    isDelayElapsed,
    type MutationTiming,
    shouldFire,
    trackRowEntry,
    type TransitionTracking,
    untrackRow,
} from "./mutation-tracking.js";

// ---------------------------------------------------------------------------
// Mutation types
// ---------------------------------------------------------------------------

export interface TransitionMutation {
  readonly kind: "transition";
  readonly column: string;
  readonly from: string;
  readonly to: string;
  readonly after: readonly [minMs: number, maxMs: number];
  readonly probability: number;
  /** Internal — populated by evaluateMutations on first tick. */
  tracking: TransitionTracking | null;
}

export interface IncrementMutation {
  readonly kind: "increment";
  readonly column: string;
  readonly by: number;
  readonly every: number;
  readonly ceiling?: number;
  /** Internal — populated by evaluateMutations on first tick. */
  timing: MutationTiming | null;
}

export interface DecrementMutation {
  readonly kind: "decrement";
  readonly column: string;
  readonly by: number;
  readonly every: number;
  readonly floor?: number;
  /** Internal — populated by evaluateMutations on first tick. */
  timing: MutationTiming | null;
}

export interface AddRowMutation {
  readonly kind: "addRow";
  readonly probability: number;
  readonly generator: () => Record<string, unknown>;
}

export interface RemoveRowMutation {
  readonly kind: "removeRow";
  readonly predicate: (row: Record<string, unknown>) => boolean;
  readonly probability: number;
}

export interface ConditionalMutation {
  readonly kind: "when";
  readonly predicate: (row: Record<string, unknown>) => boolean;
  readonly mutations: readonly Mutation[];
}

export type Mutation =
  | TransitionMutation
  | IncrementMutation
  | DecrementMutation
  | AddRowMutation
  | RemoveRowMutation
  | ConditionalMutation;

// ---------------------------------------------------------------------------
// DSL constructors
// ---------------------------------------------------------------------------

export function transition(
  column: string,
  opts: {
    from: string;
    to: string;
    after: [minMs: number, maxMs: number];
    probability?: number;
  },
): TransitionMutation {
  return {
    kind: "transition",
    column,
    from: opts.from,
    to: opts.to,
    after: opts.after,
    probability: opts.probability ?? 1.0,
    tracking: null,
  };
}

export function increment(
  column: string,
  opts: { by: number; every: number; ceiling?: number },
): IncrementMutation {
  return {
    kind: "increment",
    column,
    by: opts.by,
    every: opts.every,
    ...(opts.ceiling !== undefined && { ceiling: opts.ceiling }),
    timing: null,
  };
}

export function decrement(
  column: string,
  opts: { by: number; every: number; floor?: number },
): DecrementMutation {
  return {
    kind: "decrement",
    column,
    by: opts.by,
    every: opts.every,
    ...(opts.floor !== undefined && { floor: opts.floor }),
    timing: null,
  };
}

export function addRow(opts: {
  probability: number;
  generator: () => Record<string, unknown>;
}): AddRowMutation {
  return {
    kind: "addRow",
    probability: opts.probability,
    generator: opts.generator,
  };
}

export function removeRow(opts: {
  predicate: (row: Record<string, unknown>) => boolean;
  probability?: number;
}): RemoveRowMutation {
  return {
    kind: "removeRow",
    predicate: opts.predicate,
    probability: opts.probability ?? 1.0,
  };
}

export function when(
  predicate: (row: Record<string, unknown>) => boolean,
  ...mutations: Mutation[]
): ConditionalMutation {
  return {
    kind: "when",
    predicate,
    mutations,
  };
}

// ---------------------------------------------------------------------------
// Row ↔ Record helpers
// ---------------------------------------------------------------------------

/** Convert a TypedRow to a plain Record for predicate evaluation. */
function rowToRecord(row: TypedRow, columns: readonly Column[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const cell = row.cells[i];
    if (cell && cell.type !== "NULL") {
      record[col.id] = cell.value;
    } else {
      record[col.id] = null;
    }
  }
  return record;
}

/** Build a CellValue from a raw value and column type. */
function toCellValue(value: unknown, colType: ColumnType): CellValue {
  if (value === null || value === undefined) {
    return { type: "NULL" as const };
  }
  switch (colType) {
    case ColumnType.NUMBER:
      return { type: ColumnType.NUMBER, value: Number(value) };
    case ColumnType.TEXT:
      return { type: ColumnType.TEXT, value: String(value) };
    case ColumnType.LABEL:
      return { type: ColumnType.LABEL, value: String(value) };
    case ColumnType.DATE:
      return {
        type: ColumnType.DATE,
        value: value instanceof Date ? value : new Date(String(value)),
      };
  }
}

/** Get the string key value from a row for a given key column. */
function getRowKey(row: TypedRow, keyColumn: ColumnId): string {
  const cell = row.cell(keyColumn);
  if (cell.type === "NULL") return "";
  return String(cell.value);
}

// ---------------------------------------------------------------------------
// Snapshot-semantics tick evaluator
// ---------------------------------------------------------------------------

export interface EvalContext {
  readonly columns: readonly Column[];
  readonly keyColumn: ColumnId;
  readonly elapsed: number;
  /** Random function for testing — defaults to Math.random. */
  readonly random?: () => number;
}

/**
 * Evaluate all mutations against a snapshot of the current rows.
 *
 * Returns the collected DataSetEvents and the new row state (rows array
 * with all changes applied atomically). This is the core of the simulation
 * engine.
 *
 * All mutations evaluate against `snapshotRows` — the rows at tick start.
 * Changes are collected and applied atomically after all evaluations.
 */
export function evaluateMutations(
  snapshotRows: readonly TypedRow[],
  mutations: readonly Mutation[],
  ctx: EvalContext,
): { events: DataSetEvent[]; rows: TypedRow[] } {
  const rng = ctx.random ?? Math.random;

  // Collect changes: keyed replacements, appends, removals
  const replacements = new Map<string, Record<string, unknown>>();
  const appends: Record<string, unknown>[] = [];
  const removals = new Set<string>();

  function processMutation(mut: Mutation, rows: readonly TypedRow[]): void {
    switch (mut.kind) {
      case "transition": {
        // Lazy-init tracking
        if (!mut.tracking) {
          (mut as { tracking: TransitionTracking }).tracking = createTransitionTracking();
        }
        const tracking = mut.tracking!;

        for (const row of rows) {
          const key = getRowKey(row, ctx.keyColumn);
          const cell = row.cell(mut.column as ColumnId);
          const cellValue = cell.type !== "NULL" ? String(cell.value) : "";

          if (cellValue === mut.from) {
            // Row is in the "from" state — ensure tracking
            trackRowEntry(tracking, key, ctx.elapsed, mut.after[0], mut.after[1]);

            if (isDelayElapsed(tracking, key, ctx.elapsed)) {
              // Delay elapsed — apply probability check
              if (rng() < mut.probability) {
                // Transition fires
                const existing = replacements.get(key) ?? {};
                existing[mut.column] = mut.to;
                replacements.set(key, existing);
                untrackRow(tracking, key);
              }
            }
          } else {
            // Row left "from" state — clean up tracking
            untrackRow(tracking, key);
          }
        }
        break;
      }

      case "increment": {
        // Lazy-init timing
        if (!mut.timing) {
          (mut as { timing: MutationTiming }).timing = createMutationTiming(ctx.elapsed);
        }
        if (!shouldFire(mut.timing!, mut.every, ctx.elapsed)) break;

        for (const row of rows) {
          const key = getRowKey(row, ctx.keyColumn);
          const cell = row.cell(mut.column as ColumnId);
          if (cell.type === ColumnType.NUMBER) {
            let newVal = cell.value + mut.by;
            if (mut.ceiling !== undefined) {
              newVal = Math.min(newVal, mut.ceiling);
            }
            const existing = replacements.get(key) ?? {};
            existing[mut.column] = newVal;
            replacements.set(key, existing);
          }
        }
        break;
      }

      case "decrement": {
        // Lazy-init timing
        if (!mut.timing) {
          (mut as { timing: MutationTiming }).timing = createMutationTiming(ctx.elapsed);
        }
        if (!shouldFire(mut.timing!, mut.every, ctx.elapsed)) break;

        for (const row of rows) {
          const key = getRowKey(row, ctx.keyColumn);
          const cell = row.cell(mut.column as ColumnId);
          if (cell.type === ColumnType.NUMBER) {
            let newVal = cell.value - mut.by;
            if (mut.floor !== undefined) {
              newVal = Math.max(newVal, mut.floor);
            }
            const existing = replacements.get(key) ?? {};
            existing[mut.column] = newVal;
            replacements.set(key, existing);
          }
        }
        break;
      }

      case "addRow": {
        if (rng() < mut.probability) {
          appends.push(mut.generator());
        }
        break;
      }

      case "removeRow": {
        for (const row of rows) {
          const key = getRowKey(row, ctx.keyColumn);
          const record = rowToRecord(row, ctx.columns);
          if (mut.predicate(record) && rng() < mut.probability) {
            removals.add(key);
          }
        }
        break;
      }

      case "when": {
        // Filter rows to those matching the predicate, then run nested mutations
        const matching = rows.filter(row => {
          const record = rowToRecord(row, ctx.columns);
          return mut.predicate(record);
        });
        for (const nested of mut.mutations) {
          processMutation(nested, matching);
        }
        break;
      }
    }
  }

  // Evaluate all mutations against the snapshot
  for (const mut of mutations) {
    processMutation(mut, snapshotRows);
  }

  // Build events and new row state
  const events: DataSetEvent[] = [];
  const newRows: TypedRow[] = [];

  // Process existing rows: apply replacements and removals
  for (const row of snapshotRows) {
    const key = getRowKey(row, ctx.keyColumn);

    if (removals.has(key)) {
      events.push({
        type: "remove",
        keyColumn: ctx.keyColumn,
        key,
      } satisfies RemoveEvent);
      continue;
    }

    const changes = replacements.get(key);
    if (changes) {
      // Build updated cells
      const newCells: CellValue[] = [];
      for (let i = 0; i < ctx.columns.length; i++) {
        const col = ctx.columns[i]!;
        if (col.id in changes) {
          newCells.push(toCellValue(changes[col.id], col.type));
        } else {
          newCells.push(row.cells[i]!);
        }
      }
      const newRow = createTypedRow(newCells, ctx.columns);
      newRows.push(newRow);
      events.push({
        type: "replace",
        keyColumn: ctx.keyColumn,
        key,
        row: newRow,
      } satisfies ReplaceEvent);
    } else {
      newRows.push(row);
    }
  }

  // Process appends
  if (appends.length > 0) {
    const appendedRows: TypedRow[] = [];
    for (const record of appends) {
      const cells: CellValue[] = ctx.columns.map(col =>
        toCellValue(record[col.id], col.type),
      );
      const newRow = createTypedRow(cells, ctx.columns);
      appendedRows.push(newRow);
      newRows.push(newRow);
    }
    events.push({
      type: "append",
      rows: appendedRows,
    } satisfies AppendEvent);
  }

  return { events, rows: newRows };
}
