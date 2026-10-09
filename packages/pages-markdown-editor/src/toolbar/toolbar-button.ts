import { LitElement, css, html } from 'lit';
import { property } from 'lit/decorators.js';

export class ToolbarButton extends LitElement {
  @property({ type: String }) icon = '';
  @property({ type: String }) tooltip = '';
  @property({ type: String }) shortcut = '';
  @property({ type: Boolean }) active = false;

  static override styles = css`
    :host { display: inline-flex; }
    button {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: var(--pages-neutral-11, #6b7280);
    }
    button:hover {
      background: var(--pages-neutral-3, #e5e7eb);
    }
    button[aria-pressed="true"] {
      background: var(--pages-accent-3, #c7d2fe);
      color: var(--pages-accent-11, #4338ca);
    }
  `;

  override render() {
    const title = this.shortcut
      ? `${this.tooltip} (${this.shortcut})`
      : this.tooltip;
    return html`
      <button
        title="${title}"
        aria-pressed="${this.active}"
        aria-keyshortcuts="${this.shortcut}"
        @click=${this._onClick}
      >${this.icon}</button>
    `;
  }

  private _onClick() {
    this.dispatchEvent(
      new CustomEvent('command', { bubbles: true, composed: true }),
    );
  }
}

if (!customElements.get('toolbar-button')) {
  customElements.define('toolbar-button', ToolbarButton);
}
