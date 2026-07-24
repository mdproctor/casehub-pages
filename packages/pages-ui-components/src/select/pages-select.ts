import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { SelectOption } from '../types.js';

export class PagesSelect extends LitElement {
  static override styles = css`
    :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); }
    .field { display: flex; flex-direction: column; gap: 6px; }
    label {
      font-size: var(--pages-font-size-base, 14px);
      font-weight: var(--pages-font-weight-medium, 500);
      color: var(--pages-neutral-12, #333);
    }
    select {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-6, #e0e0e0);
      border-radius: var(--pages-radius-sm, 4px);
      font-size: var(--pages-font-size-base, 14px);
      font-family: inherit;
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #333);
      transition: border-color var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out);
    }
    select:focus { outline: none; border-color: var(--pages-accent-9, #5470c6); }
    select:disabled { background: var(--pages-neutral-3, #f5f5f5); cursor: not-allowed; opacity: 0.6; }
    .error {
      color: var(--pages-danger-9, #dc2626);
      font-size: var(--pages-font-size-xs, 11px);
      margin-top: var(--pages-space-0-5, 2px);
    }
  `;

  @property() value = '';
  @property() label: string | undefined;
  @property({ attribute: false }) options: SelectOption[] = [];
  @property({ type: Boolean }) required = false;
  @property({ type: Boolean }) disabled = false;
  @property() error: string | undefined;

  override render() {
    return html`
      <div class="field">
        ${this.label ? html`<label>${this.label}</label>` : nothing}
        <select
          ?required=${this.required}
          ?disabled=${this.disabled}
          aria-required=${ifDefined(this.required ? 'true' : undefined)}
          aria-invalid=${ifDefined(this.error ? 'true' : undefined)}
          @change=${(e: Event) => {
            this.value = (e.target as HTMLSelectElement).value;
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }}
        >
          ${this.options.map((opt) => html`
            <option value=${opt.value} ?selected=${this.value === opt.value}>
              ${opt.label}
            </option>
          `)}
        </select>
        ${this.error ? html`<span class="error" role="alert">${this.error}</span>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('pages-select')) {
  customElements.define('pages-select', PagesSelect);
}
