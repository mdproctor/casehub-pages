import { PagesFormInput } from "./PagesFormInput.js";
import type { TextInputProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";

const TEXT_INPUT_CSS = `
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

export class PagesTextInput extends PagesFormInput<TextInputProps> {
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
    wrapper.className = "pages-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const input = document.createElement("input");
    input.type = "text";
    const value = this.extractFieldValue(dataset);
    if (typeof value === "string") input.value = value;
    else if (typeof value === "number") input.value = String(value);
    else if (value !== undefined) input.value = "";
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

customElements.define("pages-text-input", PagesTextInput);
