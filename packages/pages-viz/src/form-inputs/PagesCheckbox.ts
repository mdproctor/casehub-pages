import { PagesFormInput } from "./PagesFormInput.js";
import type { CheckboxProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";

const CHECKBOX_CSS = `
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

export class PagesCheckbox extends PagesFormInput<CheckboxProps> {
  protected render(
    container: HTMLElement,
    props: CheckboxProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    // Style
    const style = document.createElement("style");
    style.textContent = CHECKBOX_CSS;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "pages-form-field";

    const input = document.createElement("input");
    input.type = "checkbox";
    const value = this.extractFieldValue(dataset);
    // Coerce: "true" (case-insensitive) → checked
    if (value !== undefined) {
      let strValue: string;
      if (typeof value === "string") strValue = value;
      else if (typeof value === "boolean") strValue = String(value);
      else if (typeof value === "number") strValue = String(value);
      else strValue = "";
      input.checked = strValue.toLowerCase() === "true";
    }
    if (props.required) input.required = true;
    if (props.readonly || !this._editable) input.disabled = true;

    input.addEventListener("change", () => {
      // Emit "true" / "false" as string
      this.emitFieldChange(input.checked ? "true" : "false", true);
    });

    wrapper.appendChild(input);

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      label.addEventListener("click", () => {
        if (!input.disabled) {
          input.click();
        }
      });
      wrapper.appendChild(label);
    }

    container.appendChild(wrapper);
  }
}

customElements.define("pages-checkbox", PagesCheckbox);
