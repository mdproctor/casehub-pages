import type {DataSource} from "@casehubio/pages-data/dist/datasource/types.js";
import type {DataSetEvent} from "@casehubio/pages-data/dist/dataset/events.js";
import type {SortColumn} from "@casehubio/pages-data/dist/dataset/sort.js";
import type {DataSetId, TypedDataSet} from "@casehubio/pages-data/dist/dataset/types.js";
import type {ExternalColumnDef} from "@casehubio/pages-data/dist/dataset/external/types.js";
import {dataSetId} from "@casehubio/pages-data/dist/dataset/types.js";
import type {VizTarget} from "../model/hosting.js";

export interface SourceFactoryOptions {
  readonly columns?: readonly ExternalColumnDef[];
  readonly dataPath?: string;
  readonly totalPath?: string;
}

export type SourceFactory = (url: string, id: DataSetId, options?: SourceFactoryOptions) => DataSource;

export interface DataSourceControllerOptions {
  onChange?: () => void;
  onRefresh?: () => void;
  dataSetId?: DataSetId;
  sourceFactory?: SourceFactory;
  columns?: readonly ExternalColumnDef[];
  dataPath?: string;
  totalPath?: string;
}

export class DataSourceController implements VizTarget {
  private _loading = false;
  private _dataSet: TypedDataSet | undefined = undefined;
  private _error = "";

  private _totalRows = -1;
  private _activeSort: SortColumn | undefined;
  private _activePage: number | undefined;

  private _source: DataSource | undefined;
  private _endpoint: string | undefined;
  private _connected = false;
  private readonly _dataSetId: DataSetId;

  readonly onChange: (() => void) | undefined;
  private readonly _onRefresh: (() => void) | undefined;
  private readonly _sourceFactory: SourceFactory | undefined;
  private readonly _columns: readonly ExternalColumnDef[] | undefined;
  private readonly _dataPath: string | undefined;
  private readonly _totalPath: string | undefined;

  constructor(options?: DataSourceControllerOptions) {
    this.onChange = options?.onChange;
    this._onRefresh = options?.onRefresh;
    this._sourceFactory = options?.sourceFactory;
    this._dataSetId = options?.dataSetId ?? dataSetId("ds-controller");
    this._columns = options?.columns;
    this._dataPath = options?.dataPath;
    this._totalPath = options?.totalPath;
  }

  get loading(): boolean { return this._loading; }
  set loading(v: boolean) {
    const hadError = this._error !== "";
    if (v) this._error = "";
    if (v === this._loading && !hadError) return;
    this._loading = v;
    this.onChange?.();
  }

  get dataSet(): TypedDataSet | undefined { return this._dataSet; }
  set dataSet(v: TypedDataSet | undefined) {
    this._loading = false;
    this._error = "";
    this._dataSet = v;
    this.onChange?.();
  }

  get error(): string { return this._error; }
  set error(v: string) {
    this._loading = false;
    this._dataSet = undefined;
    this._error = v;
    this.onChange?.();
  }

  get totalRows(): number { return this._totalRows; }
  set totalRows(v: number) { this._totalRows = v; }

  get activeSort(): SortColumn | undefined { return this._activeSort; }
  set activeSort(v: SortColumn | undefined) { this._activeSort = v; }

  get activePage(): number | undefined { return this._activePage; }
  set activePage(v: number | undefined) { this._activePage = v; }

  get endpoint(): string | undefined { return this._endpoint; }
  set endpoint(url: string | undefined) {
    if (url === this._endpoint) return;
    this.disconnectSource();
    this._endpoint = url;
    if (url) {
      this._source = this.createSourceFromUrl(url);
      if (this._connected) this.connectSource();
    }
  }

  get source(): DataSource | undefined { return this._source; }
  set source(s: DataSource | undefined) {
    if (s === this._source) return;
    this.disconnectSource();
    this._endpoint = undefined;
    this._source = s;
    if (s && this._connected) this.connectSource();
  }

  connect(): void {
    if (this._connected) return;
    this._connected = true;
    this.connectSource();
  }

  disconnect(): void {
    if (!this._connected) return;
    this._connected = false;
    this.disconnectSource();
  }

  refresh(): void {
    if (this._source && this._connected) {
      this.disconnectSource();
      this.loading = true;
      this.connectSource();
      return;
    }
    if (this._onRefresh && this._dataSet !== undefined) {
      this._onRefresh();
    }
  }

  dispose(): void {
    this.disconnect();
    this._source = undefined;
    this._endpoint = undefined;
  }

  private connectSource(): void {
    if (!this._source) return;
    this.loading = true;
    const capturedSource = this._source;
    this._source.connect({
      apply: (event: DataSetEvent) => {
        if (this._source !== capturedSource) return;
        this.handleEvent(event);
      },
      error: (err) => {
        if (this._source !== capturedSource) return;
        if (err.permanent) {
          this.error = err.message;
        }
      },
    });
  }

  private disconnectSource(): void {
    this._source?.disconnect();
  }

  private handleEvent(event: DataSetEvent): void {
    switch (event.type) {
      case "snapshot":
        this.dataSet = event.dataset;
        if (event.totalRows !== undefined) this.totalRows = event.totalRows;
        break;
      case "append": {
        const ds = this._dataSet as TypedDataSet | undefined;
        if (!ds) break;
        const colCount = ds.columns.length;
        if (event.rows.some(r => r.cells.length !== colCount)) break;
        const combined = [...ds.rows, ...event.rows];
        const rows = event.maxRows !== undefined
          ? combined.slice(-event.maxRows) : combined;
        this.dataSet = { columns: ds.columns, rows };
        break;
      }
      case "replace": {
        const ds = this._dataSet as TypedDataSet | undefined;
        if (!ds) break;
        let matched = false;
        const rows = ds.rows.map(r => {
          const cell = r.cell(event.keyColumn);
          if (cell.type !== "NULL" && String(cell.value) === event.key) {
            matched = true;
            return event.row;
          }
          return r;
        });
        if (!matched) break;
        this.dataSet = { columns: ds.columns, rows };
        break;
      }
      case "remove": {
        const ds = this._dataSet as TypedDataSet | undefined;
        if (!ds) break;
        const rows = ds.rows.filter(r => {
          const cell = r.cell(event.keyColumn);
          return cell.type === "NULL" || String(cell.value) !== event.key;
        });
        if (rows.length === ds.rows.length) break;
        this.dataSet = { columns: ds.columns, rows };
        break;
      }
    }
  }

  private createSourceFromUrl(url: string): DataSource {
    if (this._sourceFactory) {
      return this._sourceFactory(url, this._dataSetId, {
        columns: this._columns,
        dataPath: this._dataPath,
        totalPath: this._totalPath,
      });
    }
    return {
      connect() {},
      disconnect() {},
    };
  }
}
