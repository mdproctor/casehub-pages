import type { GroupBoundary } from "./group-extraction.js";

export function renderGroupTableRowHeader(
  boundary: GroupBoundary,
  colSpan: number,
  expanded: boolean,
  instanceId: string,
  index: number,
  showSummary: boolean,
): string {
  const chevron = expanded ? "▼" : "▶";
  let summaryText = "";
  if (showSummary && boundary.aggregates.size > 0) {
    summaryText = " · " + Array.from(boundary.aggregates.values())
      .map((v) => String(v))
      .join(", ");
  }
  const ariaId = `${instanceId}-group-${index}`;

  return `<tr class="group-header">
    <td colspan="${colSpan}">
      <button class="group-toggle"
              aria-expanded="${expanded}"
              aria-controls="${ariaId}"
              data-group="${escapeAttr(boundary.name)}">
        ${chevron} ${escapeHtml(boundary.name)} (${boundary.rowCount})${escapeHtml(summaryText)}
      </button>
    </td>
  </tr>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
