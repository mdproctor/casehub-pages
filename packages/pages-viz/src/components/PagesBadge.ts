import type { TypedDataSet, Column } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import type { BadgeProps } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw } from "../base/cell-extract.js";

const BADGE_CSS = `
:host {
  display: block;
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: var(--pages-font-size-base, 14px);
  color: var(--pages-neutral-12, #333);
}
.pages-badge-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pages-badge-gap, 8px);
  padding: var(--pages-badge-container-padding, 4px);
}
.pages-badge {
  display: inline-block;
  padding: var(--pages-badge-padding, 4px 12px);
  border-radius: var(--pages-badge-radius, 12px);
  font-size: var(--pages-badge-font-size, 13px);
  font-weight: var(--pages-badge-font-weight, 500);
  color: var(--pages-badge-text, #fff);
  background: var(--pages-badge-bg, var(--pages-accent-9, #5470c6));
  border: var(--pages-badge-border, none);
  white-space: nowrap;
  text-align: center;
  line-height: 1.4;
}
`;

// Palette colors for auto-assignment (derived from --pages-accent variations)
const DEFAULT_PALETTE = [
  "#5470c6", // accent blue
  "#91cc75", // green
  "#fac858", // yellow
  "#ee6666", // red
  "#73c0de", // cyan
  "#3ba272", // dark green
  "#fc8452", // orange
  "#9a60b4", // purple
  "#ea7ccc", // pink
];

export class PagesBadge extends PagesElement<BadgeProps> {
  private _colorCache = new Map<string, string>();

  protected override render(
    container: HTMLDivElement,
    props: BadgeProps,
    dataset: TypedDataSet,
  ): void {
    container.textContent = "";

    // Style
    const style = document.createElement("style");
    style.textContent = BADGE_CSS;
    container.appendChild(style);

    // Empty dataset
    if (dataset.rows.length === 0) {
      return;
    }

    // Determine target column
    const targetColumn = this.resolveTargetColumn(dataset, props);
    if (!targetColumn) {
      return;
    }

    // Create badge container
    const badgeContainer = document.createElement("div");
    badgeContainer.className = "pages-badge-container";

    // Render badge for each row
    for (const row of dataset.rows) {
      const cell = row.cell(targetColumn.id);
      const raw = cellToRaw(cell);
      const text = raw === null ? "" : String(raw);

      const badge = document.createElement("span");
      badge.className = "pages-badge";
      badge.textContent = text;
      badge.setAttribute("role", "status");

      // Apply color
      const color = this.resolveColor(text, props.colorMap);
      badge.style.backgroundColor = color;

      badgeContainer.appendChild(badge);
    }

    container.appendChild(badgeContainer);
  }

  private resolveTargetColumn(dataset: TypedDataSet, props: BadgeProps): Column | undefined {
    if (props.column) {
      return dataset.columns.find((c) => c.id === props.column);
    }

    // Default to first LABEL column
    const labelColumn = dataset.columns.find((c) => c.type === ColumnType.LABEL);
    if (labelColumn) return labelColumn;

    // Fallback to first column if no LABEL columns exist
    return dataset.columns[0];
  }

  private resolveColor(value: string, colorMap?: Record<string, string>): string {
    // Check explicit colorMap first
    if (colorMap && value in colorMap) {
      return colorMap[value]!;
    }

    // Check cache
    if (this._colorCache.has(value)) {
      return this._colorCache.get(value)!;
    }

    // Auto-assign from palette
    const index = this._colorCache.size % DEFAULT_PALETTE.length;
    const color = DEFAULT_PALETTE[index]!;
    this._colorCache.set(value, color);
    return color;
  }
}

customElements.define("pages-badge", PagesBadge);
