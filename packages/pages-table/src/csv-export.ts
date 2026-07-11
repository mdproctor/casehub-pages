import type { TypedDataSet, CellValue, Column } from '@casehubio/pages-data/dist/dataset/types.js';
import type { TableColumnConfig } from './types.js';

export function tableToCsv(dataSet: TypedDataSet, columnConfig?: readonly TableColumnConfig[]): string {
  const visibleColumns = getVisibleColumns(dataSet.columns, columnConfig);

  const header = visibleColumns.map(col => {
    const config = columnConfig?.find(c => c.id === col.id);
    return escapeCsvField(config?.label ?? col.name);
  }).join(',');

  const dataRows = dataSet.rows.map(row =>
    visibleColumns.map(col => {
      const cell = row.cell(col.id);
      return escapeCsvField(formatCellValue(cell));
    }).join(',')
  );

  return [header, ...dataRows].join('\n');
}

export function downloadCsv(csv: string, filename = 'export.csv'): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(csv: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(csv);
    return true;
  } catch {
    return false;
  }
}

function getVisibleColumns(columns: readonly Column[], config?: readonly TableColumnConfig[]): readonly Column[] {
  if (!config) return columns;
  return columns.filter(col => {
    const cfg = config.find(c => c.id === col.id);
    return cfg?.visible !== false;
  });
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCellValue(cell: CellValue): string {
  if (cell.type === 'NULL') return '';
  if (cell.type === 'DATE') return cell.value.toISOString();
  return String(cell.value);
}
