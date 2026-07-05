import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { MetricProps } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw, applyCellExpression, resolveColumnExpression } from "../base/cell-extract.js";

const METRIC_CSS = `
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

export class PagesMetric extends PagesElement<MetricProps> {
  protected override render(
    container: HTMLDivElement,
    props: MetricProps,
    dataset: TypedDataSet,
  ): void {
    container.textContent = "";

    // Style
    const style = document.createElement("style");
    style.textContent = METRIC_CSS;
    container.appendChild(style);

    // Extract value and title
    const title = props.title ?? "";
    if (dataset.columns.length === 0 || dataset.rows.length === 0) {
      this.renderCard(container, title, "—");
      return;
    }
    const firstColumn = dataset.columns[0];
    const firstRow = dataset.rows[0];
    if (!firstColumn || !firstRow) {
      this.renderCard(container, title, "—");
      return;
    }
    const colId = firstColumn.id;
    const raw = cellToRaw(firstRow.cell(colId));
    const expr = resolveColumnExpression(colId, props.columns);
    if (expr) {
      const gen = this.renderGen;
      void applyCellExpression(raw, expr)
        .then(result => {
          if (this.renderGen !== gen) return;
          this.renderWithValue(container, props, dataset, title, result === null ? "" : String(result));
        })
        .catch((e: unknown) => {
          if (this.renderGen !== gen) return;
          this.error = e instanceof Error ? e.message : String(e);
        });
      return;
    }
    const value = raw === null ? "" : String(raw);

    this.renderWithValue(container, props, dataset, title, value);
  }

  private renderWithValue(
    container: HTMLDivElement,
    props: MetricProps,
    dataset: TypedDataSet,
    title: string,
    value: string,
  ): void {
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
      const html = props.html.template
        .replace(/\$\{value\}/g, escaped)
        .replace(/\$\{title\}/g, escapedTitle);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      container.appendChild(wrapper);
      return;
    }

    // Render based on subtype
    const subtype = props.subtype ?? "card";

    if (subtype === "card") {
      this.renderCard(container, title, value);
    } else if (subtype === "card2") {
      this.renderCard2(container, title, value);
    } else if (subtype === "plain-text") {
      this.renderPlainText(container, title, value);
    } else {
      this.renderQuota(container, title, value, dataset);
    }
  }

  private renderCard(container: HTMLDivElement, title: string, value: string): void {
    const card = document.createElement("div");
    card.className = "card";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    card.appendChild(titleEl);

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    card.appendChild(valueEl);

    container.appendChild(card);
  }

  private renderCard2(container: HTMLDivElement, title: string, value: string): void {
    const card2 = document.createElement("div");
    card2.className = "card2";

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    card2.appendChild(valueEl);

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    card2.appendChild(titleEl);

    container.appendChild(card2);
  }

  private renderPlainText(container: HTMLDivElement, title: string, value: string): void {
    const plainText = document.createElement("div");
    plainText.className = "plain-text";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    plainText.appendChild(titleEl);

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    plainText.appendChild(valueEl);

    container.appendChild(plainText);
  }

  private renderQuota(
    container: HTMLDivElement,
    title: string,
    value: string,
    dataset: TypedDataSet,
  ): void {
    const quota = document.createElement("div");
    quota.className = "quota";

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;
    quota.appendChild(valueEl);

    // Calculate percentage for progress bar
    const numValue = Number(value);
    let percentage = 0;

    if (dataset.columns.length >= 2) {
      // Second column is max
      const firstRow = dataset.rows[0];
      const secondCol = dataset.columns[1];
      const maxRaw = firstRow && secondCol ? cellToRaw(firstRow.cell(secondCol.id)) : null;
      const max = maxRaw === null ? 100 : Number(maxRaw);
      percentage = max === 0 ? 0 : (numValue / max) * 100;
    } else {
      // Assume max is 100
      percentage = numValue;
    }

    // Clamp to 0-100
    percentage = Math.max(0, Math.min(100, percentage));

    const bar = document.createElement("div");
    bar.className = "bar";

    const barFill = document.createElement("div");
    barFill.className = "bar-fill";
    barFill.style.width = `${String(percentage)}%`;
    bar.appendChild(barFill);

    quota.appendChild(bar);
    container.appendChild(quota);
  }
}

customElements.define("pages-metric", PagesMetric);
