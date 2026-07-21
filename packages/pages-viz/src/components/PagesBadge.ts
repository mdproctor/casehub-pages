import { html, css, type TemplateResult } from "lit";
import type { TypedDataSet, Column } from "@casehubio/pages-data";
import { ColumnType } from "@casehubio/pages-data";
import type { BadgeProps } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw } from "../base/cell-extract.js";

const DEFAULT_PALETTE = [
  "var(--pages-accent-9)",
  "var(--pages-success-9)",
  "var(--pages-warning-9)",
  "var(--pages-danger-9)",
  "var(--pages-info-9)",
  "var(--pages-accent-11)",
  "var(--pages-success-11)",
  "var(--pages-warning-11)",
  "var(--pages-danger-11)",
];

export class PagesBadge extends PagesElement<BadgeProps> {
  private _colorCache = new Map<string, string>();

  static override styles = css`
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

  protected override renderContent(
    props: BadgeProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    if (dataset.rows.length === 0) {
      return html``;
    }

    const targetColumn = this.resolveTargetColumn(dataset, props);
    if (!targetColumn) {
      return html``;
    }

    return html`
      <div class="pages-badge-container">
        ${dataset.rows.map(row => {
          const cell = row.cell(targetColumn.id);
          const raw = cellToRaw(cell);
          const text = raw === null ? "" : String(raw);
          const color = this.resolveColor(text, props.colorMap);
          return html`
            <span class="pages-badge" role="status"
                  style="background-color:${color}">
              ${text}
            </span>
          `;
        })}
      </div>
    `;
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

if (!customElements.get('pages-badge')) {
  customElements.define('pages-badge', PagesBadge);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-badge': PagesBadge;
  }
}
