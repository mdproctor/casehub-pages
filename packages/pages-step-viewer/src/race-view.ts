import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { RaceStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';

@customElement('race-view')
export class RaceView extends LitElement {
  @property({ attribute: false }) step!: RaceStep;

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
      font-size: 12px;
      font-weight: 600;
      color: #f9e2af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-icon {
      font-size: 14px;
    }
    .header-badge {
      font-size: 10px;
      font-weight: 500;
      color: #f9e2af;
      background: rgba(249, 226, 175, 0.15);
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: none;
      letter-spacing: 0;
    }
    .header-meta {
      margin-left: auto;
      font-size: 11px;
      color: #7f849c;
      text-transform: none;
      letter-spacing: 0;
    }

    .lanes {
      display: grid;
      gap: 0;
      padding: 0;
    }

    .lane {
      padding: 16px;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      min-height: 80px;
    }
    .lane:last-child {
      border-right: none;
    }

    step-card { margin-bottom: 4px; }
    swim-lane-view { margin: 8px 0; }
    step-block-view { margin: 8px 0; }
  `;

  override render() {
    if (!this.step) return nothing;

    const steps = this.step.steps;

    return html`
      <div class="header">
        <span class="header-icon">⚡</span>
        RACE
        <span class="header-badge">first to complete wins</span>
        <span class="header-meta">${steps.length} competitors</span>
      </div>
      <div class="lanes" style="grid-template-columns: repeat(${steps.length}, 1fr)">
        ${steps.map(step => html`
          <div class="lane">
            ${renderStepContent(step)}
          </div>
        `)}
      </div>
    `;
  }
}
