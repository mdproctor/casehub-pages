import { html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { PagesFormInput } from "./PagesFormInput.js";
import type { TextareaProps } from "@casehubio/pages-component";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";

@customElement("pages-textarea")
export class PagesTextarea extends PagesFormInput<TextareaProps> {
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

  protected override renderContent(
    props: TextareaProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): TemplateResult {
    const value = this.extractFieldValue(dataset);
    const textValue = typeof value === "string" ? value
      : typeof value === "number" ? String(value)
      : "";
    const isReadonly = !!props.readonly || !this._editable;

    return html`
      <div class="pages-form-field">
        ${props.label ? html`<label>${props.label}</label>` : ""}
        <textarea
          .value=${textValue}
          rows=${ifDefined(props.rows)}
          maxlength=${ifDefined(props.maxLength)}
          ?required=${!!props.required}
          ?readonly=${isReadonly}
          @input=${(e: Event) => this.emitFieldChange((e.target as HTMLTextAreaElement).value, false)}
          @blur=${(e: Event) => this.emitFieldChange((e.target as HTMLTextAreaElement).value, true)}
        ></textarea>
      </div>
    `;
  }
}
