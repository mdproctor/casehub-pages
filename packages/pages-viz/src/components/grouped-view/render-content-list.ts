import type { TypedDataSet, ColumnId, CellValue } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupBoundary } from "./group-extraction.js";

function cellToDisplay(cell: CellValue): string {
  if (cell.type === "NULL") return "";
  return escapeHtml(String(cell.value));
}

export function renderContentList(
  dataset: TypedDataSet,
  boundary: GroupBoundary,
  contentColumns: readonly ColumnId[],
  colWidthsCss: string,
  instanceId: string,
  index: number,
  expanded: boolean,
): string {
  const ariaId = `${instanceId}-group-${index}`;
  const hiddenAttr = expanded ? "" : " hidden";

  let items = "";
  for (let r = boundary.startRow; r < boundary.startRow + boundary.rowCount; r++) {
    const row = dataset.rows[r]!;
    const pairs = contentColumns.map((id) => {
      const col = dataset.columns.find((c) => c.id === id);
      const label = col?.name ?? String(id);
      return `<dt class="visually-hidden">${escapeHtml(label)}</dt><dd>${cellToDisplay(row.cell(id))}</dd>`;
    }).join("");
    items += `<div class="list-item">${pairs}</div>`;
  }

  return `<div class="section-content" id="${ariaId}"${hiddenAttr}>
    <dl class="aligned-list" style="grid-template-columns: ${colWidthsCss}">
      ${items}
    </dl>
  </div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
