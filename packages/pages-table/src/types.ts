import type { TemplateResult } from 'lit';
import type { ColumnId, CellValue, TypedRow, Column } from '@casehubio/pages-data/dist/dataset/types.js';

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

export type ColumnRenderer = (cell: CellValue, row: TypedRow, column: Column) => TemplateResult | string;

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
