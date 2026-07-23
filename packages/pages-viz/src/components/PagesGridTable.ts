import { html, css, nothing, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import type { TypedDataSet, TypedRow, Column } from "@casehubio/pages-data";
import type { GridTableProps, CellDisplay, GridStripe } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw } from "../base/cell-extract.js";

const TRUTHY = new Set(["true", "yes", "1", "on", "✓", "✔"]);
const FALSY = new Set(["false", "no", "0", "off", "✗", "✘"]);

@customElement("pages-grid-table")
export class PagesGridTable extends PagesElement<GridTableProps> {
  static override styles = css`
    :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); color: var(--pages-neutral-12, #333); }
    table { width: 100%; border-collapse: collapse; font-size: var(--pages-font-size-base, 14px); }
    table.compact { width: auto; }
    table.compact th, table.compact td { padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px); white-space: nowrap; }
    th { text-align: left; padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px); font-weight: var(--pages-font-weight-semibold, 600); color: var(--pages-neutral-11, #666); font-size: var(--pages-font-size-sm, 13px); }
    thead th { border-bottom: 2px solid var(--pages-neutral-4, #ddd); }
    td { padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px); border-bottom: 1px solid var(--pages-neutral-3, #eee); }
    tr:last-child td, tr:last-child th[scope="row"] { border-bottom: none; }
    th[scope="row"] { border-bottom: 1px solid var(--pages-neutral-3, #eee); font-weight: var(--pages-font-weight-medium, 500); }
    table.v-lines td, table.v-lines th { border-right: 1px solid var(--pages-neutral-3, #eee); }
    table.v-lines td:last-child, table.v-lines th:last-child { border-right: none; }
    table.stripe-rows tbody tr:nth-child(even) td, table.stripe-rows tbody tr:nth-child(even) th[scope="row"] { background: var(--pages-neutral-2, #f8f8f8); }
    table.stripe-cols td:nth-child(even), table.stripe-cols thead th:nth-child(even) { background: var(--pages-neutral-2, #f8f8f8); }
    .empty-cell { color: var(--pages-neutral-8, #999); font-style: italic; }
    .cell-bool { text-align: center; font-size: 1.1em; }
    .cell-bool-true { color: var(--pages-success-9, #22c55e); }
    .cell-bool-false { color: var(--pages-danger-9, #ef4444); }
    .cell-color { display: flex; align-items: center; gap: var(--pages-space-2, 8px); }
    .color-swatch { width: 16px; height: 16px; border-radius: var(--pages-radius-sm, 4px); border: 1px solid var(--pages-neutral-4, #ddd); flex-shrink: 0; }
    .cell-badge { display: inline-block; padding: 2px 8px; border-radius: var(--pages-radius-sm, 4px); font-size: var(--pages-font-size-sm, 13px); font-weight: var(--pages-font-weight-medium, 500); background: var(--pages-neutral-3, #eee); color: var(--pages-neutral-12, #333); }
    .cell-number { text-align: right; font-variant-numeric: tabular-nums; }
  `;

  protected override renderContent(
    props: GridTableProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    const showColHeaders = props.columnHeaders !== false;
    const showRowHeaders = props.rowHeaders === true;
    const cellDisplayMap = props.cellDisplay;
    const isCompact = props.compact === true;
    const stripe = props.stripe;
    const vLines = props.verticalLines === true;
    const allColumns = dataset.columns;

    if (allColumns.length === 0) {
      return html`<table><tbody><tr><td class="empty-cell">—</td></tr></tbody></table>`;
    }

    const headerCol = showRowHeaders ? allColumns[0] : undefined;
    const dataCols = showRowHeaders ? allColumns.slice(1) : allColumns;

    const headerRow = showColHeaders
      ? html`<thead><tr>
          ${headerCol ? html`<th class="corner"></th>` : nothing}
          ${dataCols.map(c => html`<th scope="col">${c.name}</th>`)}
        </tr></thead>`
      : nothing;

    const totalCols = (showRowHeaders ? 1 : 0) + dataCols.length;

    const bodyRows = dataset.rows.length === 0
      ? html`<tr><td colspan="${String(totalCols)}" class="empty-cell">—</td></tr>`
      : dataset.rows.map(row => html`<tr>
          ${headerCol ? html`<th scope="row">${this._renderCell(row, headerCol, "text")}</th>` : nothing}
          ${dataCols.map(c => html`<td>${this._renderCell(row, c, cellDisplayMap?.[c.id as string] ?? "text")}</td>`)}
        </tr>`);

    const classes = [
      isCompact ? "compact" : "",
      vLines ? "v-lines" : "",
      stripe === "rows" || stripe === "both" ? "stripe-rows" : "",
      stripe === "columns" || stripe === "both" ? "stripe-cols" : "",
    ].filter(Boolean).join(" ");

    return html`
      <table class="${classes}">
        ${headerRow}
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  private _renderCell(
    row: TypedRow,
    col: Column,
    display: CellDisplay,
  ): TemplateResult | string {
    const raw = cellToRaw(row.cell(col.id));
    if (raw === null) return "";
    const text = String(raw);

    switch (display) {
      case "boolean": {
        const lower = text.toLowerCase();
        if (TRUTHY.has(lower)) return html`<span class="cell-bool cell-bool-true">✓</span>`;
        if (FALSY.has(lower)) return html`<span class="cell-bool cell-bool-false">✗</span>`;
        return html`<span class="cell-bool">${text}</span>`;
      }
      case "color":
        return html`<span class="cell-color"><span class="color-swatch" style="background:${text}"></span>${text}</span>`;
      case "badge":
        return html`<span class="cell-badge">${text}</span>`;
      case "number":
        return html`<span class="cell-number">${text}</span>`;
      default:
        return text;
    }
  }
}
