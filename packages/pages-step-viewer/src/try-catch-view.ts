import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { TryCatchFinallyStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';

@customElement('try-catch-view')
export class TryCatchView extends LitElement {
  @property({ attribute: false }) step!: TryCatchFinallyStep;

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

    .region {
      padding: 12px 16px;
      border-bottom: 1px solid #3b3d52;
    }
    .region:last-child { border-bottom: none; }
    .region.try     { background: rgba(166, 227, 161, 0.04); }
    .region.catch   { background: rgba(243, 139, 168, 0.04); }
    .region.finally { background: rgba(148, 226, 213, 0.04); }

    .region-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 8px;
    }
    .region-label.try     { color: #a6e3a1; }
    .region-label.catch   { color: #f38ba8; }
    .region-label.finally { color: #94e2d5; }

    step-card { margin-bottom: 4px; }
    swim-lane-view { margin: 8px 0; }
    step-block-view { margin: 8px 0; }
  `;

  override render() {
    if (!this.step) return nothing;

    return html`
      <div class="header">
        <span class="keyword">try / catch / finally</span>
      </div>
      <div class="region try">
        <div class="region-label try">TRY</div>
        ${this.step.trySteps.map(s => renderStepContent(s))}
      </div>
      ${this.step.catchSteps.length > 0 ? html`
        <div class="region catch">
          <div class="region-label catch">CATCH</div>
          ${this.step.catchSteps.map(s => renderStepContent(s))}
        </div>
      ` : nothing}
      ${this.step.finallySteps.length > 0 ? html`
        <div class="region finally">
          <div class="region-label finally">FINALLY</div>
          ${this.step.finallySteps.map(s => renderStepContent(s))}
        </div>
      ` : nothing}
    `;
  }
}
