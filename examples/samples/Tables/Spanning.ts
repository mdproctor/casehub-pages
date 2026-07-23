import type { ColumnId } from '@casehubio/pages-data';
import type { PagesDataTable } from '@casehubio/pages-table';

// Configure the cellSpan tab's table with programmatic spanning.
// Rows with "Unknown" status merge the Status and Quarter columns
// into a single cell. The Department column also uses mergeRows.
//
// Tabs destroy/create tables on switch — a MutationObserver catches
// the new table when the cellSpan tab activates.

var deptCol = 'department' as ColumnId;
var statusCol = 'status' as ColumnId;

function applySpanConfig(table: PagesDataTable) {
  if (!table.columnConfig) return;
  if (table.columnConfig.some(function(c) { return !!c.mergeRows; })) return;

  table.columnConfig = table.columnConfig.map(function(c) {
    if (String(c.id) === String(deptCol)) {
      return Object.assign({}, c, { mergeRows: true });
    }
    if (String(c.id) === String(statusCol)) {
      return Object.assign({}, c, {
        cellSpan: function(row: any, _rowIndex: number) {
          var cell = row.cell(statusCol);
          if (cell.type !== 'NULL' && cell.value === 'Unknown') {
            return { colSpan: 2 };
          }
          return undefined;
        }
      });
    }
    return c;
  });
}

function tryApply() {
  var table = document.querySelector('pages-data-table') as PagesDataTable;
  if (table && table.columnConfig) {
    applySpanConfig(table);
  }
}

var observer = new MutationObserver(function() {
  setTimeout(tryApply, 300);
});

var spanTarget = document.getElementById('sample-target');
if (spanTarget) {
  observer.observe(spanTarget, { childList: true, subtree: true });
}
