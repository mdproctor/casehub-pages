import { html, css, type TemplateResult, type PropertyValues } from "lit";
import { PagesFormInput } from "./PagesFormInput.js";
import type { DropdownProps, FixedOptions, DataSetOptions } from "@casehubio/pages-component";
import { isFixedOptions } from "@casehubio/pages-component";
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { DataSetOp } from "@casehubio/pages-data";
import { cellToRaw } from "../base/cell-extract.js";

export class PagesDropdown extends PagesFormInput<DropdownProps> {
  static override styles = css`
    :host {
      display: block;
      font-family: var(--pages-font-family, system-ui, sans-serif);
    }
    .pages-form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    label {
      font-size: var(--pages-font-size-base, 14px);
      font-weight: 500;
      color: var(--pages-neutral-12, #333);
    }
    select {
      padding: 8px 12px;
      border: 1px solid var(--pages-neutral-6, #e0e0e0);
      border-radius: var(--pages-radius-sm, 4px);
      font-size: var(--pages-font-size-base, 14px);
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #333);
    }
    select:focus {
      outline: none;
      border-color: var(--pages-accent-9, #5470c6);
    }
    select:disabled {
      background: var(--pages-neutral-3, #f5f5f5);
      cursor: not-allowed;
    }
  `;

  private _optionsDataSet: TypedDataSet | undefined;
  private _optionsRequested = false;
  private _cascadeListener: ((e: Event) => void) | undefined;
  private _cascadeFilterValue: string | undefined;

  set optionsDataSet(value: TypedDataSet) {
    this._optionsDataSet = value;
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeCascadeListener();
  }

  override updated(changed: PropertyValues): void {
    super.updated(changed);
    const props = this.props;
    if (props && !isFixedOptions(props.options)) {
      if (!this._optionsRequested) {
        this.requestOptionsData(props.options);
      }
      this.setupCascadeListener(props.options);
    }
  }

  protected override renderContent(
    props: DropdownProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): TemplateResult {
    const value = this.extractFieldValue(dataset);
    const valueStr = typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
    const optionEntries = this.getOptionEntries(props.options);
    const isDisabled = !!props.readonly || !this._editable;

    return html`
      <div class="pages-form-field">
        ${props.label ? html`<label>${props.label}</label>` : ""}
        <select
          ?required=${!!props.required}
          ?disabled=${isDisabled}
          @change=${(e: Event) => this.emitFieldChange((e.target as HTMLSelectElement).value, true)}
        >
          ${optionEntries.map((opt) => html`
            <option value=${opt.value} ?selected=${valueStr !== undefined && valueStr === opt.value}>
              ${opt.label}
            </option>
          `)}
        </select>
      </div>
    `;
  }

  private getOptionEntries(
    options: FixedOptions | DataSetOptions,
  ): Array<{ value: string; label: string }> {
    if (isFixedOptions(options)) {
      return options.values.map((v) => ({ value: v, label: v }));
    }
    if (this._optionsDataSet) {
      return this.extractOptionsFromDataSet(options, this._optionsDataSet);
    }
    return [];
  }

  private extractOptionsFromDataSet(
    options: DataSetOptions,
    ds: TypedDataSet,
  ): Array<{ value: string; label: string }> {
    const entries: Array<{ value: string; label: string }> = [];
    for (const row of ds.rows) {
      const rawValue = cellToRaw(row.cell(options.valueColumn as ColumnId));
      const rawLabel = cellToRaw(row.cell(options.labelColumn as ColumnId));
      entries.push({
        value: rawValue === null ? "" : String(rawValue),
        label: rawLabel === null ? "" : String(rawLabel),
      });
    }
    return entries;
  }

  private requestOptionsData(options: DataSetOptions): void {
    this._optionsRequested = true;
    const setOptionsDs = (ds: TypedDataSet): void => { this.optionsDataSet = ds; };
    const proxy = {
      set dataSet(ds: TypedDataSet) { setOptionsDs(ds); },
      set totalRows(_n: number) { /* ignored */ },
      set theme(_t: string) { /* ignored */ },
      set error(msg: string) { console.error("Options dataset error:", msg); },
    };

    const ops: DataSetOp[] = [];
    if (options.filterField && options.filterColumn && this._cascadeFilterValue !== undefined) {
      ops.push({
        type: "filter" as const,
        expressions: [{
          type: "unresolved" as const,
          columnId: options.filterColumn as ColumnId,
          fn: "EQUALS_TO" as const,
          args: [this._cascadeFilterValue],
        }],
      });
    }

    this.dispatchEvent(
      new CustomEvent("pages-data-request", {
        bubbles: true,
        composed: true,
        detail: {
          element: proxy,
          lookup: { dataSetId: options.dataset, operations: ops },
        },
      }),
    );
  }

  private setupCascadeListener(options: DataSetOptions): void {
    if (!options.filterField || !options.filterColumn) return;
    this.removeCascadeListener();

    const filterField = options.filterField;
    this._cascadeListener = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, unknown>>).detail;
      if (detail.field === filterField) {
        const detailValue: unknown = detail.value;
        if (typeof detailValue === "string") this._cascadeFilterValue = detailValue;
        else if (typeof detailValue === "number") this._cascadeFilterValue = String(detailValue);
        else this._cascadeFilterValue = undefined;
        this._optionsRequested = false;
        this._optionsDataSet = undefined;
        this.requestOptionsData(options);
      }
    };
    this.addEventListener("pages-field-change", this._cascadeListener);
  }

  private removeCascadeListener(): void {
    if (this._cascadeListener) {
      this.removeEventListener("pages-field-change", this._cascadeListener);
      this._cascadeListener = undefined;
    }
  }
}

if (!customElements.get('pages-dropdown')) {
  customElements.define('pages-dropdown', PagesDropdown);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-dropdown': PagesDropdown;
  }
}
