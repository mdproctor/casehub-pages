import type { ColumnId } from '@casehubio/pages-data';
import type { TypedRow } from '@casehubio/pages-data';
import type { PagesDataTable } from '@casehubio/pages-table';

const table = document.querySelector('pages-data-table') as PagesDataTable;

table.selection = 'single';
table.getRowKey = (row: TypedRow) => row.text('id' as ColumnId);
