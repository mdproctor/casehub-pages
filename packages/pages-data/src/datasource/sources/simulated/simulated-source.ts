/**
 * Simulated data source.
 *
 * Takes an initial data source and a set of mutation rules that evolve the
 * data over scenario time. Implements both `DataSource` and `MutableDataSource`
 * — ticks apply mutations automatically, and `dispatch()` allows external
 * actions (e.g. user clicks "Assign").
 *
 * Lifecycle:
 *   1. connect(sink) → connects the initial DataSource with a wrapper sink
 *   2. On first snapshot from initial → captures as internal state,
 *      disconnects initial, starts tick timer via controller.schedule()
 *   3. Each tick → evaluateMutations with snapshot semantics → emit events
 *   4. disconnect() → cancels tick timer
 *
 * Edge cases:
 *   - Initial source error → propagated to sink, no tick timer started
 *   - Non-snapshot events from initial → ignored
 *   - Disconnect before initial snapshot → disconnects initial, no tick timer
 */

import type {DataAction, DataSink, DataSource, Disposable, MutableDataSource} from "../../types.js";
import type {ScenarioController} from "../../controller.js";
import type {CellValue, Column, ColumnId, TypedRow} from "../../../dataset/types.js";
import {ColumnType} from "../../../dataset/types.js";
import type {DataSetEvent, RemoveEvent, ReplaceEvent} from "../../../dataset/events.js";
import type {Mutation} from "./mutations.js";
import {evaluateMutations} from "./mutations.js";
import {createTypedRow} from "../../../dataset/conversion.js";

export interface SimulatedConfig {
  readonly initial: DataSource;
  readonly controller: ScenarioController;
  readonly interval?: number;
  readonly mutations: readonly Mutation[];
  readonly keyColumn?: string;
}

const DEFAULT_INTERVAL = 5000;

export function simulated(config: SimulatedConfig): DataSource & MutableDataSource {
  const interval = config.interval ?? DEFAULT_INTERVAL;
  const keyColumn = (config.keyColumn ?? "id") as ColumnId;

  let columns: readonly Column[] = [];
  let rows: TypedRow[] = [];
  let sink: DataSink | null = null;
  let tickDisposable: Disposable | null = null;
  let initialConnected = false;
  let snapshotReceived = false;

  function scheduleTick(): void {
    tickDisposable = config.controller.schedule(interval, () => {
      tick();
      // Reschedule for next tick
      scheduleTick();
    });
  }

  function tick(): void {
    if (!sink) return;

    const result = evaluateMutations(rows, config.mutations, {
      columns,
      keyColumn,
      elapsed: config.controller.elapsed,
    });

    rows = result.rows;

    for (const event of result.events) {
      sink.apply(event);
    }
  }

  /** Apply a DataAction to internal state and emit the corresponding event. */
  function applyAction(action: DataAction): void {
    if (!sink) return;

    switch (action.type) {
      case "update": {
        const rowIndex = rows.findIndex(r => {
          const cell = r.cell(keyColumn);
          return cell.type !== "NULL" && String(cell.value) === action.key;
        });
        if (rowIndex === -1) return;

        const row = rows[rowIndex]!;
        const newCells: CellValue[] = [];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i]!;
          if (col.id in action.changes) {
            newCells.push(toCellValue(action.changes[col.id], col.type));
          } else {
            newCells.push(row.cells[i]!);
          }
        }
        const newRow = createTypedRow(newCells, columns);
        rows[rowIndex] = newRow;
        sink.apply({
          type: "replace",
          keyColumn,
          key: action.key,
          row: newRow,
        } satisfies ReplaceEvent);
        break;
      }

      case "create": {
        const cells: CellValue[] = columns.map(col =>
          toCellValue(action.data[col.id], col.type),
        );
        const newRow = createTypedRow(cells, columns);
        rows.push(newRow);
        sink.apply({ type: "append", rows: [newRow] });
        break;
      }

      case "delete": {
        const idx = rows.findIndex(r => {
          const cell = r.cell(keyColumn);
          return cell.type !== "NULL" && String(cell.value) === action.key;
        });
        if (idx === -1) return;
        rows.splice(idx, 1);
        sink.apply({
          type: "remove",
          keyColumn,
          key: action.key,
        } satisfies RemoveEvent);
        break;
      }
    }
  }

  return {
    connect(s: DataSink): void {
      sink = s;
      snapshotReceived = false;

      // Connect the initial source with a wrapper sink
      initialConnected = true;
      config.initial.connect({
        apply(event: DataSetEvent): void {
          // Only accept the first snapshot event
          if (event.type !== "snapshot" || snapshotReceived) return;

          snapshotReceived = true;
          const snapshot = event;
          columns = snapshot.dataset.columns;
          rows = [...snapshot.dataset.rows];

          // Disconnect initial source
          if (initialConnected) {
            config.initial.disconnect();
            initialConnected = false;
          }

          // Emit the snapshot to our sink
          sink!.apply(event);

          // Start tick timer
          scheduleTick();
        },

        error(err): void {
          // Propagate error — no tick timer started
          if (initialConnected) {
            config.initial.disconnect();
            initialConnected = false;
          }
          sink?.error(err);
        },
      });
    },

    disconnect(): void {
      // Cancel tick timer
      if (tickDisposable) {
        tickDisposable.dispose();
        tickDisposable = null;
      }

      // Disconnect initial if still connected (snapshot never arrived)
      if (initialConnected) {
        config.initial.disconnect();
        initialConnected = false;
      }

      sink = null;
    },

    dispatch(action: DataAction): void {
      applyAction(action);
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
