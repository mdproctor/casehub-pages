import type { DataSetEvent } from "../dataset/events.js";
import type { DataSetId } from "../dataset/types.js";
import type { ExternalColumnDef } from "../dataset/external/types.js";

export interface Disposable {
  dispose(): void;
}

export interface SourceError {
  readonly message: string;
  readonly permanent: boolean;
}

export interface DataSink {
  apply(event: DataSetEvent): void;
  error(err: SourceError): void;
}

export interface DataSource {
  connect(sink: DataSink): void;
  disconnect(): void;
}

export type DataAction =
  | { type: "update"; key: string; changes: Record<string, unknown> }
  | { type: "create"; data: Record<string, unknown> }
  | { type: "delete"; key: string };

export interface MutableDataSource extends DataSource {
  dispatch(action: DataAction): void;
}

export interface DataSourceBinding {
  readonly id: DataSetId;
  readonly source: DataSource;
  readonly keyColumn?: string;
}

export interface SourceFactoryOptions {
  readonly columns?: readonly ExternalColumnDef[] | undefined;
  readonly dataPath?: string | undefined;
}

export type SourceFactory = (
  url: string,
  id: DataSetId,
  options?: SourceFactoryOptions,
) => DataSource;
