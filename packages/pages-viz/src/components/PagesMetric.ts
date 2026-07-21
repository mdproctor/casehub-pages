import { html, css, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { MetricProps } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw, applyCellExpression, resolveColumnExpression } from "../base/cell-extract.js";

export class PagesMetric extends PagesElement<MetricProps> {
  private _renderGen = 0;
  private _asyncValue: string | undefined;
  private _lastAsyncRaw: unknown;
  private _lastAsyncExpr: string | undefined;

  static override styles = css`
      :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); color: var(--pages-neutral-12, #333); }
      .card { background: var(--pages-neutral-1, #fff); border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); padding: 20px 16px; text-align: center; min-height: 80px; display: flex; flex-direction: column; justify-content: center; }
      .card .title { font-size: 0.85em; color: var(--pages-neutral-11, #888); margin-bottom: 8px; }
      .card .value { font-size: 2em; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .card2 { display: flex; align-items: center; gap: 12px; background: var(--pages-neutral-1, #fff); border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); padding: 12px 16px; }
      .card2 .value { font-size: 1.5em; font-weight: 600; }
      .card2 .title { font-size: 0.85em; color: var(--pages-neutral-11, #888); }
      .plain-text .title { font-size: 0.75em; color: var(--pages-neutral-11, #888); }
      .plain-text .value { font-size: 1.2em; }
      .quota { background: var(--pages-neutral-1, #fff); border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); padding: 12px 16px; }
      .quota .value { font-size: 1.5em; font-weight: 600; }
      .quota .bar { height: 6px; background: var(--pages-neutral-6, #e0e0e0); border-radius: 3px; margin-top: 8px; }
      .quota .bar-fill { height: 100%; background: var(--pages-accent-9, #5470c6); border-radius: 3px; }
      .pf-v5-c-card, .pf-c-card, [class*="card-pf"] { background: var(--pages-neutral-1, #fff); border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); padding: 16px; text-align: center; }
      .pf-v5-c-card__title, .pf-c-card__title { margin-bottom: 4px; }
      .pf-v5-c-title, .pf-c-title { font-weight: 600; }
      .pf-m-2xl { font-size: 1.8em; }
      .pf-m-xl { font-size: 1.4em; }
      .pf-v5-c-card__footer, .pf-c-card__footer { font-size: 0.85em; color: var(--pages-neutral-11, #888); }
    `;

  protected override renderContent(
    props: MetricProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    this._renderGen++;
    const gen = this._renderGen;

    const title = props.title ?? "";
    if (dataset.columns.length === 0 || dataset.rows.length === 0) {
      return this.renderCard(title, "—");
    }
    const firstColumn = dataset.columns[0];
    const firstRow = dataset.rows[0];
    if (!firstColumn || !firstRow) {
      return this.renderCard(title, "—");
    }
    const colId = firstColumn.id;
    const raw = cellToRaw(firstRow.cell(colId));
    const expr = resolveColumnExpression(colId, props.columns);
    if (expr) {
      if (raw !== this._lastAsyncRaw || expr !== this._lastAsyncExpr) {
        this._lastAsyncRaw = raw;
        this._lastAsyncExpr = expr;
        this._asyncValue = undefined;
        void applyCellExpression(raw, expr)
          .then(result => {
            if (this._renderGen !== gen) return;
            this._asyncValue = result === null ? "" : String(result);
            this.requestUpdate();
          })
          .catch((e: unknown) => {
            if (this._renderGen !== gen) return;
            this.error = e instanceof Error ? e.message : String(e);
          });
      }
      if (this._asyncValue !== undefined) {
        return this.renderWithValue(props, dataset, title, this._asyncValue);
      }
      return this.renderCard(title, "—");
    }
    this._asyncValue = undefined;
    this._lastAsyncRaw = undefined;
    this._lastAsyncExpr = undefined;
    const value = raw === null ? "" : String(raw);

    return this.renderWithValue(props, dataset, title, value);
  }

  private renderWithValue(
    props: MetricProps,
    dataset: TypedDataSet,
    title: string,
    value: string,
  ): TemplateResult {
    // HTML template override
    if (props.html?.template) {
      const escaped = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const processed = props.html.template
        .replace(/\$\{value\}/g, escaped)
        .replace(/\$\{title\}/g, escapedTitle);
      return html`<div>${unsafeHTML(processed)}</div>`;
    }

    // Render based on subtype
    const subtype = props.subtype ?? "card";

    if (subtype === "card") {
      return this.renderCard(title, value);
    } else if (subtype === "card2") {
      return this.renderCard2(title, value);
    } else if (subtype === "plain-text") {
      return this.renderPlainText(title, value);
    } else {
      return this.renderQuota(title, value, dataset);
    }
  }

  private renderCard(title: string, value: string): TemplateResult {
    return html`
      <div class="card">
        <div class="title">${title}</div>
        <div class="value">${value}</div>
      </div>
    `;
  }

  private renderCard2(title: string, value: string): TemplateResult {
    return html`
      <div class="card2">
        <div class="value">${value}</div>
        <div class="title">${title}</div>
      </div>
    `;
  }

  private renderPlainText(title: string, value: string): TemplateResult {
    return html`
      <div class="plain-text">
        <div class="title">${title}</div>
        <div class="value">${value}</div>
      </div>
    `;
  }

  private renderQuota(
    title: string,
    value: string,
    dataset: TypedDataSet,
  ): TemplateResult {
    const numValue = Number(value);
    let percentage = 0;

    if (dataset.columns.length >= 2) {
      const firstRow = dataset.rows[0];
      const secondCol = dataset.columns[1];
      const maxRaw = firstRow && secondCol ? cellToRaw(firstRow.cell(secondCol.id)) : null;
      const max = maxRaw === null ? 100 : Number(maxRaw);
      percentage = max === 0 ? 0 : (numValue / max) * 100;
    } else {
      percentage = numValue;
    }

    percentage = Math.max(0, Math.min(100, percentage));

    return html`
      <div class="quota">
        <div class="value">${value}</div>
        <div class="bar">
          <div class="bar-fill" style="width:${String(percentage)}%"></div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('pages-metric')) {
  customElements.define('pages-metric', PagesMetric);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-metric': PagesMetric;
  }
}
