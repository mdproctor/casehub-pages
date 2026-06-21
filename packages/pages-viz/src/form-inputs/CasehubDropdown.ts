import { CasehubFormInput } from "./CasehubFormInput.js";
import type { DropdownProps, FixedOptions, DataSetOptions } from "@casehub/pages-component";
import { isFixedOptions } from "@casehub/pages-component";
import type { TypedDataSet, ColumnId } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";
import type { DataSetOp } from "@casehub/pages-data/dist/dataset/ops.js";
import { cellToRaw } from "../base/cell-extract.js";

const DROPDOWN_CSS = `
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
}
.casehub-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
label {
  font-size: var(--casehub-font-size, 14px);
  font-weight: 500;
  color: var(--casehub-text, #333);
}
select {
  padding: 8px 12px;
  border: 1px solid var(--casehub-border, #e0e0e0);
  border-radius: var(--casehub-radius, 4px);
  font-size: var(--casehub-font-size, 14px);
  background: var(--casehub-bg, #fff);
  color: var(--casehub-text, #333);
}
select:focus {
  outline: none;
  border-color: var(--casehub-accent, #5470c6);
}
select:disabled {
  background: var(--casehub-bg-disabled, #f5f5f5);
  cursor: not-allowed;
}
`;

export class CasehubDropdown extends CasehubFormInput<DropdownProps> {
  private _optionsDataSet: TypedDataSet | undefined;
  private _optionsRequested = false;
  private _cascadeListener: ((e: Event) => void) | undefined;
  private _cascadeFilterValue: string | undefined;

  set optionsDataSet(value: TypedDataSet) {
    this._optionsDataSet = value;
    if (this.isConnected && this.dataSet) {
      this.render(this.container, this.props! as DropdownProps & { lookup?: DataSetLookup }, this.dataSet);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeCascadeListener();
  }

  protected render(
    container: HTMLElement,
    props: DropdownProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = DROPDOWN_CSS;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "casehub-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const select = document.createElement("select");
    const value = this.extractFieldValue(dataset);

    const optionEntries = this.getOptionEntries(props.options);
    for (const opt of optionEntries) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (value !== undefined && String(value) === opt.value) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    if (props.required) select.required = true;
    if (props.readonly || !this._editable) select.disabled = true;

    select.addEventListener("change", () => {
      this.emitFieldChange(select.value, true);
    });

    wrapper.appendChild(select);
    container.appendChild(wrapper);

    if (!isFixedOptions(props.options)) {
      if (!this._optionsRequested) {
        this.requestOptionsData(props.options);
      }
      this.setupCascadeListener(props.options);
    }
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
    const self = this;
    const proxy = {
      set dataSet(ds: TypedDataSet) { self.optionsDataSet = ds; },
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
      new CustomEvent("casehub-data-request", {
        bubbles: true,
        composed: true,
        detail: {
          element: proxy,
          lookup: { dataSetId: options.dataset, operations: ops } as DataSetLookup,
        },
      }),
    );
  }

  private setupCascadeListener(options: DataSetOptions): void {
    if (!options.filterField || !options.filterColumn) return;
    this.removeCascadeListener();

    const filterField = options.filterField;
    this._cascadeListener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.field === filterField) {
        this._cascadeFilterValue = detail.value !== undefined ? String(detail.value) : undefined;
        this._optionsRequested = false;
        this._optionsDataSet = undefined;
        this.requestOptionsData(options);
      }
    };
    this.addEventListener("casehub-field-change", this._cascadeListener);
  }

  private removeCascadeListener(): void {
    if (this._cascadeListener) {
      this.removeEventListener("casehub-field-change", this._cascadeListener);
      this._cascadeListener = undefined;
    }
  }
}

customElements.define("casehub-dropdown", CasehubDropdown);
