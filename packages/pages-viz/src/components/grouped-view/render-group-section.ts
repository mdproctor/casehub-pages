import type { GroupBoundary } from "./group-extraction.js";

export function renderGroupSectionHeader(
  boundary: GroupBoundary,
  expanded: boolean,
  instanceId: string,
  index: number,
  showSummary: boolean,
): string {
  const chevronClass = expanded ? "section-chevron expanded" : "section-chevron";
  let summaryText = "";
  if (showSummary && boundary.aggregates.size > 0) {
    summaryText = " · " + Array.from(boundary.aggregates.values())
      .map((v) => String(v))
      .join(", ");
  }
  const ariaId = `${instanceId}-group-${index}`;

  return `<div class="group-section">
    <button class="section-toggle"
            aria-expanded="${expanded}"
            aria-controls="${ariaId}"
            data-group="${escapeAttr(boundary.name)}">
      <span class="${chevronClass}">▶</span>
      <span class="section-title">${escapeHtml(boundary.name)}</span>
      <span class="section-summary">${boundary.rowCount} items${escapeHtml(summaryText)}</span>
    </button>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
