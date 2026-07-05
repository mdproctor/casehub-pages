import { PagesFormInput } from "./PagesFormInput.js";
import type { TextareaProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";

const TEXTAREA_CSS = `
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
textarea {
  padding: 8px 12px;
  border: 1px solid var(--pages-neutral-6, #e0e0e0);
  border-radius: var(--pages-radius-sm, 4px);
  font-size: var(--pages-font-size-base, 14px);
  font-family: inherit;
  background: var(--pages-neutral-1, #fff);
  color: var(--pages-neutral-12, #333);
  resize: vertical;
}
textarea:focus {
  outline: none;
  border-color: var(--pages-accent-9, #5470c6);
}
textarea:read-only {
  background: var(--pages-neutral-3, #f5f5f5);
  cursor: not-allowed;
}
`;

export class PagesTextarea extends PagesFormInput<TextareaProps> {
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
    wrapper.className = "pages-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const textarea = document.createElement("textarea");
    const value = this.extractFieldValue(dataset);
    if (typeof value === "string") textarea.value = value;
    else if (typeof value === "number") textarea.value = String(value);
    else if (value !== undefined) textarea.value = "";
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

customElements.define("pages-textarea", PagesTextarea);
