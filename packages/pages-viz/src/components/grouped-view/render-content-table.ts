import type { TypedDataSet, ColumnId, CellValue } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupBoundary } from "./group-extraction.js";

function cellToDisplay(cell: CellValue): string {
  if (cell.type === "NULL") return "";
  return escapeHtml(String(cell.value));
}

export function renderContentTable(
  dataset: TypedDataSet,
  boundary: GroupBoundary,
  contentColumns: readonly ColumnId[],
  colWidths: readonly number[],
  instanceId: string,
  index: number,
  expanded: boolean,
): string {
  const ariaId = `${instanceId}-group-${index}`;
  const hiddenAttr = expanded ? "" : " hidden";
  const colgroup = colWidths
    .map((w) => `<col style="width: ${w}px">`)
    .join("");
  const theadCells = contentColumns.map((id) => {
    const col = dataset.columns.find((c) => c.id === id);
    return `<th>${escapeHtml(col?.name ?? String(id))}</th>`;
  }).join("");

  let rows = "";
  for (let r = boundary.startRow; r < boundary.startRow + boundary.rowCount; r++) {
    const row = dataset.rows[r]!;
    const cells = contentColumns
      .map((id) => `<td>${cellToDisplay(row.cell(id))}</td>`)
      .join("");
    rows += `<tr>${cells}</tr>`;
  }

  return `<div class="section-content" id="${ariaId}"${hiddenAttr}>
    <table style="table-layout: fixed">
      <colgroup>${colgroup}</colgroup>
      <thead class="visually-hidden"><tr>${theadCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
