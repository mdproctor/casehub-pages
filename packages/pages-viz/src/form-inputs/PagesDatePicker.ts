import { PagesFormInput } from "./PagesFormInput.js";
import type { DatePickerProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";

const DATE_PICKER_CSS = `
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

export class PagesDatePicker extends PagesFormInput<DatePickerProps> {
  protected render(
    container: HTMLElement,
    props: DatePickerProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): void {
    container.innerHTML = "";

    // Style
    const style = document.createElement("style");
    style.textContent = DATE_PICKER_CSS;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "pages-form-field";

    if (props.label) {
      const label = document.createElement("label");
      label.textContent = props.label;
      wrapper.appendChild(label);
    }

    const input = document.createElement("input");
    input.type = "date";
    const value = this.extractFieldValue(dataset);
    if (value !== undefined) {
      // Coerce to ISO 8601 date string (YYYY-MM-DD)
      let isoDate: string | undefined;
      if (value instanceof Date) {
        isoDate = value.toISOString().split("T")[0];
      } else {
        const str = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
        // Attempt to parse as date
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          isoDate = parsed.toISOString().split("T")[0];
        }
      }
      if (isoDate) input.value = isoDate;
    }
    if (props.min) input.min = props.min;
    if (props.max) input.max = props.max;
    if (props.required) input.required = true;
    if (props.readonly || !this._editable) input.readOnly = true;

    input.addEventListener("change", () => {
      // Emit ISO 8601 date string
      this.emitFieldChange(input.value || null, true);
    });

    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }
}

customElements.define("pages-date-picker", PagesDatePicker);
