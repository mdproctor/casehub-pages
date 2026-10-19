import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type ErrorCategory = 'parse' | 'walker' | 'semantic';

@customElement('yaml-error-banner')
export class YamlErrorBanner extends LitElement {
  @property() category: ErrorCategory = 'walker';
  @property() message = '';
  @property({ type: Number }) line?: number;
  @property({ type: Number }) column?: number;

  static override styles = css`
    :host {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: rgba(243, 139, 168, 0.08);
      border: 1px solid rgba(243, 139, 168, 0.3);
      border-left: 3px solid #f38ba8;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 13px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #cdd6f4;
      margin: 4px 0;
    }

    .icon {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
      font-weight: 700;
      background: rgba(243, 139, 168, 0.15);
      color: #f38ba8;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .category-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #f38ba8;
    }

    .message {
      font-size: 12px;
      color: #cdd6f4;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      word-break: break-word;
    }

    .location {
      font-size: 11px;
      color: #7f849c;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
  `;

  override render() {
    const icons: Record<ErrorCategory, string> = {
      parse: '⚠',
      walker: '✕',
      semantic: '⚑',
    };
    const labels: Record<ErrorCategory, string> = {
      parse: 'YAML parse error',
      walker: 'Walker error',
      semantic: 'Semantic warning',
    };

    return html`
      <div class="icon">${icons[this.category]}</div>
      <div class="content">
        <span class="category-label">${labels[this.category]}</span>
        <span class="message">${this.message}</span>
        ${this.renderLocation()}
      </div>
    `;
  }

  private renderLocation(): TemplateResult | typeof nothing {
    if (this.line == null) return nothing;
    const loc = this.column != null
      ? `line ${this.line}, column ${this.column}`
      : `line ${this.line}`;
    return html`<span class="location">at ${loc}</span>`;
  }
}
