import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ParallelStep, ResolvedStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';

@customElement('swim-lane-view')
export class SwimLaneView extends LitElement {
  @property({ attribute: false }) step!: ParallelStep;

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
      color: #7f849c;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-icon {
      color: #89b4fa;
      font-size: 14px;
    }
    .header-meta {
      margin-left: auto;
      font-size: 11px;
      color: #7f849c;
    }

    .lanes {
      display: grid;
      gap: 0;
      padding: 0;
      position: relative;
    }

    .lane {
      padding: 16px;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      min-height: 120px;
      position: relative;
    }
    .lane:last-child {
      border-right: none;
    }

    .lane-name {
      font-size: 13px;
      font-weight: 600;
      color: #89b4fa;
      margin-bottom: 16px;
      padding-bottom: 6px;
      border-bottom: 2px solid #89b4fa;
      display: inline-block;
    }

    step-card { margin-bottom: 4px; }
    swim-lane-view { margin: 8px 0; }
    step-block-view { margin: 8px 0; }
  `;

  override render() {
    if (!this.step) return nothing;

    const branches = this.step.branches
      ?? this.step.steps.map((s, i) => ({ name: `lane-${i + 1}`, steps: [s] }));

    const cols = branches.length;

    return html`
      <div class="header">
        <span class="header-icon">⫘</span>
        CONCURRENT
        <span class="header-meta">${this.renderMeta(branches)}</span>
      </div>
      <div class="lanes" style="grid-template-columns: repeat(${cols}, 1fr)">
        ${branches.map(branch => html`
          <div class="lane">
            <div class="lane-name">${branch.name}</div>
            ${branch.steps.map(step => renderStepContent(step))}
          </div>
        `)}
      </div>
    `;
  }

  private renderMeta(branches: Array<{ name: string; steps: ResolvedStep[] }>): string {
    const totalSteps = branches.reduce((sum, b) => sum + b.steps.length, 0);
    return `${branches.length} branches, ${totalSteps} steps`;
  }
}
