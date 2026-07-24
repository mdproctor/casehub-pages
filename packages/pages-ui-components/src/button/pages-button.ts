import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

export class PagesButton extends LitElement {
  static override styles = css`
    :host { display: inline-block; }
    button {
      display: inline-flex; align-items: center; gap: var(--pages-space-1, 4px);
      padding: var(--pages-space-1, 4px) var(--pages-space-3, 12px);
      border-radius: var(--pages-radius-sm, 4px);
      font-size: var(--pages-font-size-base, 14px);
      font-family: var(--pages-font-family, system-ui, sans-serif);
      font-weight: var(--pages-font-weight-medium, 500);
      cursor: pointer;
      border: 1px solid transparent;
      transition: background var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out),
                  border-color var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out);
    }
    button:disabled { cursor: not-allowed; opacity: 0.6; }
    button.sm { padding: var(--pages-space-0-5, 2px) var(--pages-space-2, 8px); font-size: var(--pages-font-size-sm, 12px); }
    button.lg { padding: var(--pages-space-2, 8px) var(--pages-space-4, 16px); font-size: var(--pages-font-size-lg, 16px); }
    button.primary {
      background: var(--pages-accent-9, #5470c6); color: white; border-color: var(--pages-accent-9, #5470c6);
    }
    button.primary:hover:not(:disabled) { background: var(--pages-accent-10, #4060b6); }
    button.secondary {
      background: transparent; color: var(--pages-accent-9, #5470c6); border-color: var(--pages-accent-9, #5470c6);
    }
    button.secondary:hover:not(:disabled) { background: var(--pages-accent-3, #e8eaf6); }
    button.ghost {
      background: transparent; color: var(--pages-neutral-12, #333); border-color: transparent;
    }
    button.ghost:hover:not(:disabled) { background: var(--pages-neutral-3, #f5f5f5); }
    button.danger {
      background: var(--pages-danger-9, #dc2626); color: white; border-color: var(--pages-danger-9, #dc2626);
    }
    button.danger:hover:not(:disabled) { background: var(--pages-danger-10, #b91c1c); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 14px; height: 14px; border: 2px solid currentColor;
      border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;
    }
  `;

  @property() label = '';
  @property() variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  @property({ type: Boolean }) disabled = false;
  @property({ type: Boolean }) loading = false;
  @property() size: 'sm' | 'md' | 'lg' = 'md';

  override render() {
    const classes = {
      [this.variant]: true,
      [this.size]: this.size !== 'md',
    };

    return html`
      <button
        class=${classMap(classes)}
        ?disabled=${this.disabled || this.loading}
      >
        ${this.loading ? html`<span class="spinner"></span>` : ''}
        ${this.label || html`<slot></slot>`}
      </button>
    `;
  }
}

if (!customElements.get('pages-button')) {
  customElements.define('pages-button', PagesButton);
}
