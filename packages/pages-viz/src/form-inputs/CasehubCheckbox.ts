import { CasehubFormInput } from "./CasehubFormInput.js";
import type { CheckboxProps } from "@casehub/pages-ui";
import type { TypedDataSet } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";

const CHECKBOX_CSS = `
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
}
.casehub-form-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
label {
  font-size: var(--casehub-font-size, 14px);
  font-weight: 500;
  color: var(--casehub-text, #333);
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

export class CasehubCheckbox extends CasehubFormInput<CheckboxProps> {
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
    wrapper.className = "casehub-form-field";

    const input = document.createElement("input");
    input.type = "checkbox";
    const value = this.extractFieldValue(dataset);
    // Coerce: "true" (case-insensitive) → checked
    if (value !== undefined) {
      const strValue = String(value).toLowerCase();
      input.checked = strValue === "true";
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

customElements.define("casehub-checkbox", CasehubCheckbox);
