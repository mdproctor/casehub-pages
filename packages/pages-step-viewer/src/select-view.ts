import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SelectStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';

@customElement('select-view')
export class SelectView extends LitElement {
  @property({ attribute: false }) step!: SelectStep;

  static override styles = css`
    :host {
      display: block;
      background: #282a3a;
      border: 1px solid #3b3d52;
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid #3b3d52;
      font-size: 13px;
      font-weight: 600;
    }
    .keyword { color: #cba6f7; }

    .branches { display: grid; gap: 0; }

    .branch-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .branch-row:last-child { border-bottom: none; }

    .type-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 3px;
      min-width: 70px;
      text-align: center;
      flex-shrink: 0;
      margin-top: 8px;
    }
    .type-badge.subscribe {
      background: rgba(203, 166, 247, 0.1);
      color: #cba6f7;
    }
    .type-badge.wait {
      background: rgba(148, 226, 213, 0.1);
      color: #94e2d5;
    }

    .branch-name {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #f9e2af;
      background: rgba(249, 226, 175, 0.1);
      padding: 2px 8px;
      border-radius: 3px;
      flex-shrink: 0;
      margin-top: 8px;
    }

    .arrow {
      color: #7f849c;
      font-size: 12px;
      flex-shrink: 0;
      margin-top: 8px;
    }

    .branch-steps {
      flex: 1;
    }
    step-card { margin-bottom: 4px; }
  `;

  override render() {
    if (!this.step) return nothing;

    return html`
      <div class="header">
        <span class="keyword">select</span>
      </div>
      <div class="branches">
        ${this.step.branches.map(branch => html`
          <div class="branch-row">
            <span class="type-badge ${branch.type}">${branch.type}</span>
            <span class="branch-name">${branch.name}</span>
            <span class="arrow">→</span>
            <div class="branch-steps">
              ${branch.steps.length > 0
                ? branch.steps.map(s => renderStepContent(s))
                : html`<div style="color: #7f849c; font-size: 12px; font-style: italic; margin-top: 8px;">no steps</div>`
              }
            </div>
          </div>
        `)}
      </div>
    `;
  }
}
