import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

export class PagesCheckbox extends LitElement {
  static override styles = css`
    :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); }
    .field { display: flex; align-items: center; gap: var(--pages-space-1, 4px); }
    label {
      font-size: var(--pages-font-size-base, 14px);
      font-weight: var(--pages-font-weight-medium, 500);
      color: var(--pages-neutral-12, #333);
      cursor: pointer;
    }
    input[type="checkbox"] {
      width: 18px; height: 18px; cursor: pointer;
      accent-color: var(--pages-accent-9, #5470c6);
    }
    input[type="checkbox"]:disabled { cursor: not-allowed; }
    .error {
      color: var(--pages-danger-9, #dc2626);
      font-size: var(--pages-font-size-xs, 11px);
      margin-top: var(--pages-space-0-5, 2px);
    }
  `;

  @property({ type: Boolean }) checked = false;
  @property() label: string | undefined;
  @property({ type: Boolean }) required = false;
  @property({ type: Boolean }) disabled = false;
  @property() error: string | undefined;

  override render() {
    return html`
      <div>
        <div class="field">
          <input
            type="checkbox"
            id="cb"
            .checked=${this.checked}
            ?required=${this.required}
            ?disabled=${this.disabled}
            aria-required=${ifDefined(this.required ? 'true' : undefined)}
            aria-invalid=${ifDefined(this.error ? 'true' : undefined)}
            @change=${(e: Event) => {
              this.checked = (e.target as HTMLInputElement).checked;
              this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }}
          />
          ${this.label ? html`<label for="cb">${this.label}</label>` : nothing}
        </div>
        ${this.error ? html`<span class="error" role="alert">${this.error}</span>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('pages-checkbox')) {
  customElements.define('pages-checkbox', PagesCheckbox);
}
