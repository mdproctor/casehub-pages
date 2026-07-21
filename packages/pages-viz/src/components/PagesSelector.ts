import { html, css, type TemplateResult } from "lit";
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data";
import type { SelectorProps } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw } from "../base/cell-extract.js";
import type { PagesFilterDetail, PagesFilterApply, PagesFilterReset } from "../base/filter-types.js";

export class PagesSelector extends PagesElement<SelectorProps> {
  private _selectedValue: string | undefined;
  private _initialValues: Array<{ value: string | number | Date | null; rowIndex: number }> | undefined;
  private _initialColumnId: ColumnId | undefined;

  override set dataSet(value: TypedDataSet | undefined) {
    super.dataSet = value;
  }

  override get dataSet(): TypedDataSet | undefined {
    return super.dataSet;
  }

  static override styles = css`
      :host {
        display: block;
        font-family: var(--pages-font-family, system-ui, sans-serif);
      }
      select {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--pages-neutral-6, #e0e0e0);
        border-radius: var(--pages-radius-sm, 4px);
        font-size: var(--pages-font-size-base, 14px);
        background: var(--pages-neutral-1, #fff);
        color: var(--pages-neutral-12, #333);
      }
      input[type="range"] {
        width: 100%;
      }
      .labels {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .label-chip {
        padding: 4px 12px;
        border: 1px solid var(--pages-neutral-6, #e0e0e0);
        border-radius: 16px;
        cursor: pointer;
        font-size: 0.9em;
        background: var(--pages-neutral-1, #fff);
        color: var(--pages-neutral-12, #333);
      }
      .label-chip.selected {
        background: var(--pages-accent-9, #5470c6);
        color: #fff;
        border-color: var(--pages-accent-9, #5470c6);
      }
    `;

  protected override renderContent(
    props: SelectorProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    if (dataset.columns.length === 0) return html``;

    const firstColumn = dataset.columns[0];
    if (!firstColumn) return html``;

    this._initialValues = this.extractDistinctValues(dataset, firstColumn.id);
    this._initialColumnId = firstColumn.id;

    if (this._selectedValue !== undefined) {
      const stillPresent = this._initialValues.some(
        v => v.value !== null && String(v.value) === this._selectedValue,
      );
      if (!stillPresent) this._selectedValue = undefined;
    }

    const distinctValues = this._initialValues;
    const columnId = this._initialColumnId ?? firstColumn.id;

    const subtype = props.subtype ?? "dropdown";

    if (subtype === "dropdown") {
      return this.renderDropdown(props, columnId, distinctValues);
    } else if (subtype === "slider") {
      return this.renderSlider(props, columnId, distinctValues);
    } else {
      return this.renderLabels(props, columnId, distinctValues);
    }
  }

  private extractDistinctValues(
    dataset: TypedDataSet,
    columnId: ColumnId,
  ): Array<{ value: string | number | Date | null; rowIndex: number }> {
    const seen = new Set<string | number | null>();
    const result: Array<{ value: string | number | Date | null; rowIndex: number }> = [];

    const colIdx = dataset.columns.findIndex((c) => c.id === columnId);
    if (colIdx < 0) return result;

    for (let rowIdx = 0; rowIdx < dataset.rows.length; rowIdx++) {
      const row = dataset.rows[rowIdx];
      const cell = row?.cells[colIdx];
      if (!row || !cell) continue;
      const raw = cellToRaw(cell);

      const key = raw instanceof Date ? raw.getTime() : raw;

      if (!seen.has(key)) {
        seen.add(key);
        result.push({ value: raw, rowIndex: rowIdx });
      }
    }

    return result;
  }

  private renderDropdown(
    props: SelectorProps,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
  ): TemplateResult {
    return html`
      <select @change=${(e: Event) => this._handleDropdownChange(e, columnId, props)}>
        <option value="-1">All</option>
        ${values.map(({ value, rowIndex }) => {
          const text = value === null ? "" : String(value);
          const selected = this._selectedValue !== undefined && text === this._selectedValue;
          return html`<option value="${String(rowIndex)}" ?selected=${selected}>${text}</option>`;
        })}
      </select>
    `;
  }

  private _handleDropdownChange(e: Event, columnId: ColumnId, props: SelectorProps): void {
    const select = e.target as HTMLSelectElement;
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) return;

    if (selectedOption.value === "-1") {
      this._selectedValue = undefined;
      this.dispatchEvent(
        new CustomEvent<PagesFilterDetail>("pages-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            reset: true,
            group: props.filter?.group,
          } satisfies PagesFilterReset,
        }),
      );
    } else {
      const displayValue = selectedOption.textContent ?? "";
      this._selectedValue = displayValue;

      const dataset = this.dataSet;
      if (!dataset) return;

      const row = dataset.rows.find(r => {
        const cell = r.cell(columnId);
        return cell.type !== "NULL" && String(cellToRaw(cell)) === displayValue;
      });
      if (!row) return;

      this.dispatchEvent(
        new CustomEvent<PagesFilterDetail>("pages-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            value: displayValue,
            row,
            reset: false,
            group: props.filter?.group,
          } satisfies PagesFilterApply,
        }),
      );
    }
  }

  private renderSlider(
    props: SelectorProps,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
  ): TemplateResult {
    const numericValues = values
      .filter((v) => typeof v.value === "number")
      .map((v) => v.value as number);

    if (numericValues.length === 0) return html``;

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    return html`
      <input type="range"
             min="${String(min)}"
             max="${String(max)}"
             value="${String(min)}"
             @change=${(e: Event) => this._handleSliderChange(e, columnId, values, props)}>
    `;
  }

  private _handleSliderChange(
    e: Event,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
    props: SelectorProps,
  ): void {
    const slider = e.target as HTMLInputElement;
    const targetValue = parseFloat(slider.value);

    let closestIndex = 0;
    let closestDiff = Infinity;

    for (const { value, rowIndex } of values) {
      if (typeof value === "number") {
        const diff = Math.abs(value - targetValue);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIndex = rowIndex;
        }
      }
    }

    const dataset = this.dataSet;
    if (!dataset) return;

    const rowObj = dataset.rows[closestIndex];
    if (!rowObj) return;

    const cell = rowObj.cell(columnId);
    if (cell.type === "NULL") return;

    const value = String(cellToRaw(cell));

    this.dispatchEvent(
      new CustomEvent<PagesFilterDetail>("pages-filter", {
        bubbles: true,
        composed: true,
        detail: {
          columnId,
          value,
          row: rowObj,
          reset: false,
          group: props.filter?.group,
        } satisfies PagesFilterApply,
      }),
    );
  }

  private renderLabels(
    props: SelectorProps,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
  ): TemplateResult {
    return html`
      <div class="labels">
        ${values.map(entry => {
          if (!entry) return html``;
          const { value, rowIndex } = entry;
          const chipText = value === null ? "" : String(value);
          const isSelected = this._selectedValue !== undefined && chipText === this._selectedValue;
          return html`
            <button class="label-chip ${isSelected ? "selected" : ""}"
                    type="button"
                    @click=${() => this._handleChipClick(chipText, rowIndex, columnId, props)}>
              ${chipText}
            </button>
          `;
        })}
      </div>
    `;
  }

  private _handleChipClick(
    chipText: string,
    rowIndex: number,
    columnId: ColumnId,
    props: SelectorProps,
  ): void {
    if (this._selectedValue === chipText) {
      // Deselect
      this._selectedValue = undefined;
      this.dispatchEvent(
        new CustomEvent<PagesFilterDetail>("pages-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            reset: true,
            group: props.filter?.group,
          } satisfies PagesFilterReset,
        }),
      );
    } else {
      // Select
      this._selectedValue = chipText;

      const dataset = this.dataSet;
      if (!dataset) return;

      const rowObj = dataset.rows[rowIndex];
      if (!rowObj) return;

      const cell = rowObj.cell(columnId);
      if (cell.type === "NULL") return;

      const cellValue = String(cellToRaw(cell));

      this.dispatchEvent(
        new CustomEvent<PagesFilterDetail>("pages-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            value: cellValue,
            row: rowObj,
            reset: false,
            group: props.filter?.group,
          } satisfies PagesFilterApply,
        }),
      );
    }
    this.requestUpdate();
  }
}

if (!customElements.get('pages-selector')) {
  customElements.define('pages-selector', PagesSelector);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-selector': PagesSelector;
  }
}
