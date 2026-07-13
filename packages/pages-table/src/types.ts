import type {TemplateResult} from 'lit';
import type {DirectiveResult} from 'lit/directive.js';
import type {CellValue, Column, ColumnId, TypedRow} from '@casehubio/pages-data/dist/dataset/types.js';

export type DisplayMode = 'auto' | 'paginated' | 'scroll';
export type SelectionMode = 'none' | 'single' | 'multi';
export type SortDirection = 'asc' | 'desc' | 'none';
export type ColumnAlign = 'start' | 'center' | 'end';

export interface TableColumnConfig {
  readonly id: ColumnId;
  readonly label?: string;
  readonly sortable?: boolean;
  readonly visible?: boolean;
  readonly width?: string;
  readonly minWidth?: string;
  readonly align?: ColumnAlign;
  readonly filterable?: boolean;
  readonly compare?: (a: CellValue, b: CellValue) => number;
}

export type ColumnRenderer = (cell: CellValue, row: TypedRow, column: Column) => TemplateResult | string | DirectiveResult;

export interface SortEntry {
  readonly columnId: string;
  readonly direction: SortDirection;
}

export interface SortChangeDetail {
  readonly columnId: string;
  readonly direction: SortDirection;
  readonly sortStack: readonly SortEntry[];
}

export interface PageChangeDetail {
  readonly page: number;
  readonly pageSize: number;
}

export interface SelectionChangeDetail {
  readonly selectedKeys: readonly string[];
  readonly selectedRows: readonly TypedRow[];
  readonly scope?: 'page';
}

export interface ColumnChangeDetail {
  readonly visibleColumns: readonly string[];
}

export interface RowActivateDetail {
  readonly row: TypedRow;
  readonly key?: string;
}

export interface FilterChangeDetail {
  readonly text: string;
  readonly matchCount: number;
}

export interface LoadMoreDetail {}

export interface PagesFilterApply {
    readonly columnId: string;
    readonly value: string;
    readonly row: TypedRow;
    readonly reset: false;
    readonly group: string | undefined;
}

export interface PagesFilterReset {
    readonly columnId: string;
    readonly reset: true;
    readonly group: string | undefined;
}

export type PagesFilterDetail = PagesFilterApply | PagesFilterReset;

export interface FilterConfig {
    readonly enabled: boolean;
    readonly group?: string | undefined;
}

export type DetailMode = 'single' | 'multi';

export interface DetailChangeDetail {
  readonly key: string;
  readonly row: TypedRow;
  readonly expanded: boolean;
}

