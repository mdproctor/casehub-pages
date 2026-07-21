import { html, css, type TemplateResult } from "lit";
import { PagesFormInput } from "./PagesFormInput.js";
import type { CheckboxProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";

export class PagesCheckbox extends PagesFormInput<CheckboxProps> {
  static override styles = css`
    :host {
      display: block;
      font-family: var(--pages-font-family, system-ui, sans-serif);
    }
    .pages-form-field {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    label {
      font-size: var(--pages-font-size-base, 14px);
      font-weight: 500;
      color: var(--pages-neutral-12, #333);
      cursor: pointer;
    }
    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    input[type="checkbox"]:disabled {
      cursor: not-allowed;
    }
  `;

  protected override renderContent(
    props: CheckboxProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): TemplateResult {
    const value = this.extractFieldValue(dataset);
    // Coerce: "true" (case-insensitive) → checked
    let isChecked = false;
    if (value !== undefined) {
      let strValue: string;
      if (typeof value === "string") strValue = value;
      else if (typeof value === "boolean") strValue = String(value);
      else if (typeof value === "number") strValue = String(value);
      else strValue = "";
      isChecked = strValue.toLowerCase() === "true";
    }
    const isDisabled = !!props.readonly || !this._editable;

    return html`
      <div class="pages-form-field">
        <input
          type="checkbox"
          id="cb"
          .checked=${isChecked}
          ?required=${!!props.required}
          ?disabled=${isDisabled}
          @change=${(e: Event) => {
            this.emitFieldChange((e.target as HTMLInputElement).checked ? "true" : "false", true);
          }}
        />
        ${props.label ? html`<label for="cb">${props.label}</label>` : ""}
      </div>
    `;
  }
}

if (!customElements.get('pages-checkbox')) {
  customElements.define('pages-checkbox', PagesCheckbox);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-checkbox': PagesCheckbox;
  }
}
