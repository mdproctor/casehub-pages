import { CasehubFormInput } from "./CasehubFormInput.js";
import type { DropdownProps, FixedOptions, DataSetOptions } from "@casehub/ui";
import { isFixedOptions } from "@casehub/ui";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";

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

  protected render(
    container: HTMLElement,
    props: DropdownProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    // Style
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

    // Populate options
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
  }

  private getOptionEntries(
    options: FixedOptions | DataSetOptions,
  ): Array<{ value: string; label: string }> {
    if (isFixedOptions(options)) {
      return options.values.map((v) => ({ value: v, label: v }));
    } else {
      // DataSetOptions is parsed but not resolved at runtime — see spec Out of Scope
      // "Cascading dropdown options" remains future work
      return [];
    }
  }
}

customElements.define("casehub-dropdown", CasehubDropdown);
