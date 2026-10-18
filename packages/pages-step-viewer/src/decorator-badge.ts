import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type DecoratorKind = 'retry' | 'timeout' | 'loop' | 'when' | 'mutex' | 'foreach';

const ICONS: Record<string, string> = {
  retry: '↻',
  timeout: '⏱',
  loop: '↻',
  when: '?',
  mutex: '🔒',
  foreach: '∀',
};

@customElement('decorator-badge')
export class DecoratorBadge extends LitElement {
  @property({ reflect: true }) kind!: DecoratorKind;
  @property() label = '';

  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      flex-shrink: 0;
    }
    :host([kind="retry"])   { background: rgba(250, 179, 135, 0.2); color: #fab387; }
    :host([kind="timeout"]) { background: rgba(249, 226, 175, 0.2); color: #f9e2af; }
    :host([kind="loop"])    { background: rgba(148, 226, 213, 0.2); color: #94e2d5; }
    :host([kind="when"])    { background: rgba(203, 166, 247, 0.2); color: #cba6f7; }
    :host([kind="mutex"])   { background: rgba(243, 139, 168, 0.2); color: #f38ba8; }
    :host([kind="foreach"]) { background: rgba(137, 180, 250, 0.2); color: #89b4fa; }
  `;

  override render() {
    return html`${ICONS[this.kind] ?? '▸'} ${this.label}`;
  }
}
