import type { TypedDataSet, ColumnId, CellValue } from "@casehubio/pages-data/dist/dataset/types.js";

const DEFAULT_SAMPLE_SIZE = 50;
const MIN_COL_WIDTH = 60;
const COL_PADDING = 24;
const FALLBACK_WIDTH = 120;

function cellToString(cell: CellValue): string {
  return cell.type === "NULL" ? "" : String(cell.value);
}

export function computeColumnWidths(
  dataset: TypedDataSet,
  columns: readonly ColumnId[],
  font: string,
  sampleSize: number = DEFAULT_SAMPLE_SIZE,
): readonly number[] {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    if (ctx) ctx.font = font;
  } catch {
    // Canvas unavailable (SSR, restricted env)
  }

  if (!ctx) {
    const equalWidth = Math.max(MIN_COL_WIDTH, FALLBACK_WIDTH);
    return columns.map(() => equalWidth);
  }

  const maxWidths = columns.map((id) => {
    const col = dataset.columns.find((c) => c.id === id);
    const headerText = col?.name ?? String(id);
    return ctx.measureText(headerText).width + COL_PADDING;
  });

  const rowCount = dataset.rows.length;
  const step = rowCount <= sampleSize ? 1 : Math.ceil(rowCount / sampleSize);

  for (let r = 0; r < rowCount; r += step) {
    const row = dataset.rows[r]!;
    for (let c = 0; c < columns.length; c++) {
      const cellText = cellToString(row.cell(columns[c]!));
      const cellWidth = ctx.measureText(cellText).width + COL_PADDING;
      if (cellWidth > maxWidths[c]!) maxWidths[c] = cellWidth;
    }
  }

  return maxWidths.map((w) => Math.max(w, MIN_COL_WIDTH));
}
