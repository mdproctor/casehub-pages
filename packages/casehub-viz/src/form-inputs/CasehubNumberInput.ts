import { CasehubFormInput } from "./CasehubFormInput.js";
import type { NumberInputProps } from "@casehub/ui";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";

const NUMBER_INPUT_CSS = `
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

export class CasehubNumberInput extends CasehubFormInput<NumberInputProps> {
  protected render(
    container: HTMLElement,
    props: NumberInputProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    // Style
    const style = document.createElement("style");
    style.textContent = NUMBER_INPUT_CSS;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "casehub-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const input = document.createElement("input");
    input.type = "number";
    const value = this.extractFieldValue(dataset);
    if (value !== undefined) {
      const num = typeof value === "number" ? value : parseFloat(String(value));
      if (!isNaN(num)) input.value = String(num);
    }
    if (props.min !== undefined) input.min = String(props.min);
    if (props.max !== undefined) input.max = String(props.max);
    if (props.step !== undefined) input.step = String(props.step);
    if (props.required) input.required = true;
    if (props.readonly || !this._editable) input.readOnly = true;

    input.addEventListener("input", () => {
      const numValue = parseFloat(input.value);
      this.emitFieldChange(isNaN(numValue) ? null : numValue, false);
    });
    input.addEventListener("blur", () => {
      const numValue = parseFloat(input.value);
      this.emitFieldChange(isNaN(numValue) ? null : numValue, true);
    });

    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }
}

customElements.define("casehub-number-input", CasehubNumberInput);
