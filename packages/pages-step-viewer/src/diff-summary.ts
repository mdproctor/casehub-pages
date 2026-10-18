import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface DiffStat {
  kind: 'added' | 'removed' | 'modified';
  count: number;
  label: string;
}

@customElement('diff-summary')
export class DiffSummary extends LitElement {
  @property({ attribute: false }) stats: DiffStat[] = [];

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      font-size: 12px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .title {
      font-weight: 600;
      color: #f0f4ff;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #cdd6f4;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot.added    { background: #a6e3a1; }
    .dot.removed  { background: #f38ba8; }
    .dot.modified { background: #f9e2af; }
  `;

  override render() {
    if (!this.stats.length) return nothing;

    return html`
      <span class="title">Diff</span>
      ${this.stats.map(s => html`
        <span class="stat">
          <span class="dot ${s.kind}"></span>
          ${s.count} ${s.label}
        </span>
      `)}
    `;
  }
}
