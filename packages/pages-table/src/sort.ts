import type { CellValue, ColumnId, TypedRow } from '@casehubio/pages-data/dist/dataset/types.js';
import type { TableColumnConfig, SortDirection, SortEntry } from './types.js';

type RowComparator = (a: TypedRow, b: TypedRow) => number;

export function createComparator(
  columnId: ColumnId,
  direction: SortDirection,
  config?: TableColumnConfig,
): RowComparator {
  if (direction === 'none') return () => 0;

  const flip = direction === 'desc' ? -1 : 1;

  return (a: TypedRow, b: TypedRow): number => {
    const cellA = a.cell(columnId);
    const cellB = b.cell(columnId);

    if (cellA.type === 'NULL' && cellB.type === 'NULL') return 0;
    if (cellA.type === 'NULL') return 1;
    if (cellB.type === 'NULL') return -1;

    if (config?.compare) return flip * config.compare(cellA, cellB);

    return flip * resolveByType(cellA, cellB);
  };
}

export function createMultiComparator(
  sortStack: readonly SortEntry[],
  configs: readonly TableColumnConfig[],
): RowComparator {
  const comparators = sortStack
    .filter(entry => entry.direction !== 'none')
    .map(entry => {
      const columnId = entry.columnId as ColumnId;
      const config = configs.find(c => c.id === columnId);
      return createComparator(columnId, entry.direction, config);
    });

  return (a: TypedRow, b: TypedRow): number => {
    for (const cmp of comparators) {
      const result = cmp(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

function resolveByType(a: CellValue, b: CellValue): number {
  if (a.type === 'NUMBER' && b.type === 'NUMBER') {
    return a.value - b.value;
  }
  if (a.type === 'DATE' && b.type === 'DATE') {
    return a.value.getTime() - b.value.getTime();
  }
  const aVal = 'value' in a ? String(a.value) : '';
  const bVal = 'value' in b ? String(b.value) : '';
  return aVal.localeCompare(bVal);
}
