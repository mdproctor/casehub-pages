import { CasehubFormInput } from "./CasehubFormInput.js";
import type { TextareaProps } from "@casehub/ui";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";

const TEXTAREA_CSS = `
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
textarea {
  padding: 8px 12px;
  border: 1px solid var(--casehub-border, #e0e0e0);
  border-radius: var(--casehub-radius, 4px);
  font-size: var(--casehub-font-size, 14px);
  font-family: inherit;
  background: var(--casehub-bg, #fff);
  color: var(--casehub-text, #333);
  resize: vertical;
}
textarea:focus {
  outline: none;
  border-color: var(--casehub-accent, #5470c6);
}
textarea:read-only {
  background: var(--casehub-bg-disabled, #f5f5f5);
  cursor: not-allowed;
}
`;

export class CasehubTextarea extends CasehubFormInput<TextareaProps> {
  protected render(
    container: HTMLElement,
    props: TextareaProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    // Style
    const style = document.createElement("style");
    style.textContent = TEXTAREA_CSS;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "casehub-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const textarea = document.createElement("textarea");
    const value = this.extractFieldValue(dataset);
    if (value !== undefined) textarea.value = String(value);
    if (props.rows !== undefined) textarea.rows = props.rows;
    if (props.maxLength) textarea.maxLength = props.maxLength;
    if (props.required) textarea.required = true;
    if (props.readonly || !this._editable) textarea.readOnly = true;

    textarea.addEventListener("input", () => {
      this.emitFieldChange(textarea.value, false);
    });
    textarea.addEventListener("blur", () => {
      this.emitFieldChange(textarea.value, true);
    });

    wrapper.appendChild(textarea);
    container.appendChild(wrapper);
  }
}

customElements.define("casehub-textarea", CasehubTextarea);
