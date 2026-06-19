import type { SaveAdapter, SaveResult } from "../save-adapter.js";
import type { DataSetId, ColumnId, TypedDataSet, CellValue } from "@casehub/data/dist/dataset/types.js";
import type { DataSetManager } from "@casehub/data/dist/dataset/manager.js";
import { createTypedRow } from "@casehub/data/dist/dataset/conversion.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";

export function createLocalAdapter(manager: DataSetManager): SaveAdapter {
  return {
    async save(dataSetId, record, changedFields, idColumn, idValue): Promise<SaveResult> {
      const existing = manager.get(dataSetId);
      if (!existing) {
        return { success: false, error: `Dataset "${String(dataSetId)}" not found` };
      }

      const rowIndex = existing.rows.findIndex(row => {
        const cell = row.cell(idColumn as ColumnId);
        return cell.type !== "NULL" && String(cell.value) === String(idValue);
      });

      if (rowIndex === -1) {
        return { success: false, error: `Record with ${idColumn}=${String(idValue)} not found` };
      }

      const oldRow = existing.rows[rowIndex]!;
      const newCells: CellValue[] = oldRow.cells.map((cell, i) => {
        const col = existing.columns[i]!;
        if (changedFields.includes(col.id as string)) {
          const newValue = record[col.id as string];
          if (newValue === null || newValue === undefined) {
            return { type: "NULL" as const };
          }
          // Preserve cell type, update value
          switch (cell.type) {
            case ColumnType.NUMBER: {
              const num = Number(newValue);
              if (Number.isNaN(num)) return { type: "NULL" as const };
              return { type: ColumnType.NUMBER, value: num } as const;
            }
            case ColumnType.DATE: {
              const date = new Date(String(newValue));
              if (Number.isNaN(date.getTime())) return { type: "NULL" as const };
              return { type: ColumnType.DATE, value: date } as const;
            }
            case ColumnType.TEXT:
              return { type: ColumnType.TEXT, value: String(newValue) } as const;
            case ColumnType.LABEL:
              return { type: ColumnType.LABEL, value: String(newValue) } as const;
            default:
              return cell;
          }
        }
        return cell;
      });

      const newRow = createTypedRow(newCells, existing.columns);
      const newRows = [...existing.rows];
      newRows[rowIndex] = newRow;
      const newDataset: TypedDataSet = { columns: existing.columns, rows: newRows };
      manager.register(dataSetId, newDataset);

      return { success: true };
    },
  };
}
