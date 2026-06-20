import { CasehubFormInput } from "./CasehubFormInput.js";
import type { TextInputProps } from "@casehub/pages-ui";
import type { TypedDataSet } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";

const TEXT_INPUT_CSS = `
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
input {
  padding: 8px 12px;
  border: 1px solid var(--casehub-border, #e0e0e0);
  border-radius: var(--casehub-radius, 4px);
  font-size: var(--casehub-font-size, 14px);
  background: var(--casehub-bg, #fff);
  color: var(--casehub-text, #333);
}
input:focus {
  outline: none;
  border-color: var(--casehub-accent, #5470c6);
}
input:read-only {
  background: var(--casehub-bg-disabled, #f5f5f5);
  cursor: not-allowed;
}
`;

export class CasehubTextInput extends CasehubFormInput<TextInputProps> {
  protected render(
    container: HTMLElement,
    props: TextInputProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    // Style
    const style = document.createElement("style");
    style.textContent = TEXT_INPUT_CSS;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "casehub-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const input = document.createElement("input");
    input.type = "text";
    const value = this.extractFieldValue(dataset);
    if (value !== undefined) input.value = String(value);
    if (props.placeholder) input.placeholder = props.placeholder;
    if (props.maxLength) input.maxLength = props.maxLength;
    if (props.required) input.required = true;
    if (props.readonly || !this._editable) input.readOnly = true;

    input.addEventListener("input", () => {
      this.emitFieldChange(input.value, false);
    });
    input.addEventListener("blur", () => {
      this.emitFieldChange(input.value, true);
    });

    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }
}

customElements.define("casehub-text-input", CasehubTextInput);
