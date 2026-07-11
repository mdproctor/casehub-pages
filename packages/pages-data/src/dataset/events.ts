import type { TypedDataSet, TypedRow, ColumnId } from "./types.js";

export interface SnapshotEvent {
  readonly type: "snapshot";
  readonly dataset: TypedDataSet;
  readonly totalRows?: number;
}

export interface AppendEvent {
  readonly type: "append";
  readonly rows: readonly TypedRow[];
  readonly maxRows?: number;
}

export interface ReplaceEvent {
  readonly type: "replace";
  readonly keyColumn: ColumnId;
  readonly key: string;
  readonly row: TypedRow;
}

export interface RemoveEvent {
  readonly type: "remove";
  readonly keyColumn: ColumnId;
  readonly key: string;
}

export type DataSetEvent =
  | SnapshotEvent
  | AppendEvent
  | ReplaceEvent
  | RemoveEvent;

export type DataSetEventListener = (event: DataSetEvent) => void;
