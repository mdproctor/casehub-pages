import { html, css, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { PagesFormInput } from "./PagesFormInput.js";
import type { DatePickerProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";

export class PagesDatePicker extends PagesFormInput<DatePickerProps> {
  static override styles = css`
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

  protected override renderContent(
    props: DatePickerProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): TemplateResult {
    const value = this.extractFieldValue(dataset);
    // Coerce to ISO 8601 date string (YYYY-MM-DD)
    let isoDate: string | undefined;
    if (value !== undefined) {
      if (value instanceof Date) {
        isoDate = value.toISOString().split("T")[0];
      } else {
        const str = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
          isoDate = parsed.toISOString().split("T")[0];
        }
      }
    }
    const isReadonly = !!props.readonly || !this._editable;

    return html`
      <div class="pages-form-field">
        ${props.label ? html`<label>${props.label}</label>` : ""}
        <input
          type="date"
          .value=${isoDate ?? ""}
          min=${ifDefined(props.min)}
          max=${ifDefined(props.max)}
          ?required=${!!props.required}
          ?readonly=${isReadonly}
          @change=${(e: Event) => {
            this.emitFieldChange((e.target as HTMLInputElement).value || null, true);
          }}
        />
      </div>
    `;
  }
}

if (!customElements.get('pages-date-picker')) {
  customElements.define('pages-date-picker', PagesDatePicker);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-date-picker': PagesDatePicker;
  }
}
