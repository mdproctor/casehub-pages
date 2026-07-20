import { html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { PagesFormInput } from "./PagesFormInput.js";
import type { NumberInputProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";

@customElement("pages-number-input")
export class PagesNumberInput extends PagesFormInput<NumberInputProps> {
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
    input {
      padding: 8px 12px;
      border: 1px solid var(--pages-neutral-6, #e0e0e0);
      border-radius: var(--pages-radius-sm, 4px);
      font-size: var(--pages-font-size-base, 14px);
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #333);
    }
    input:focus {
      outline: none;
      border-color: var(--pages-accent-9, #5470c6);
    }
    input:read-only {
      background: var(--pages-neutral-3, #f5f5f5);
      cursor: not-allowed;
    }
  `;

  protected override renderContent(
    props: NumberInputProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): TemplateResult {
    const value = this.extractFieldValue(dataset);
    let inputValue = "";
    if (value !== undefined) {
      const num = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
      if (!isNaN(num)) inputValue = String(num);
    }
    const isReadonly = !!props.readonly || !this._editable;

    return html`
      <div class="pages-form-field">
        ${props.label ? html`<label>${props.label}</label>` : ""}
        <input
          type="number"
          .value=${inputValue}
          min=${ifDefined(props.min !== undefined ? String(props.min) : undefined)}
          max=${ifDefined(props.max !== undefined ? String(props.max) : undefined)}
          step=${ifDefined(props.step !== undefined ? String(props.step) : undefined)}
          ?required=${!!props.required}
          ?readonly=${isReadonly}
          @input=${(e: Event) => {
            const numValue = parseFloat((e.target as HTMLInputElement).value);
            this.emitFieldChange(isNaN(numValue) ? null : numValue, false);
          }}
          @blur=${(e: Event) => {
            const numValue = parseFloat((e.target as HTMLInputElement).value);
            this.emitFieldChange(isNaN(numValue) ? null : numValue, true);
          }}
        />
      </div>
    `;
  }
}
