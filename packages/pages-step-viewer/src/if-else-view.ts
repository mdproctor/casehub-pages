import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { IfElseStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';
import { renderDiffContent } from './diff-dispatch.js';
import type { DiffState, DiffNode, FieldChange } from '@casehubio/yaml-core/step/diff';
import { diffTokenStyles, diffMarkerStyles, renderDiffMarker, renderFieldChanges } from './diff-shared.js';

@customElement('if-else-view')
export class IfElseView extends LitElement {
  @property({ attribute: false }) step!: IfElseStep;
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;
  @property({ attribute: false }) fieldChanges: FieldChange[] = [];
  @property({ attribute: false }) diffNode?: DiffNode;

  static override styles = [diffTokenStyles, diffMarkerStyles, css`
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
    .condition {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #f9e2af;
      background: rgba(249, 226, 175, 0.1);
      padding: 2px 8px;
      border-radius: 3px;
    }

    .branches {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }

    .branch {
      padding: 12px 16px;
    }
    .branch:first-child {
      border-right: 1px solid #3b3d52;
    }

    .branch-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 8px;
    }
    .branch-label.then { color: #a6e3a1; }
    .branch-label.else { color: #f38ba8; }

    step-card { margin-bottom: 4px; }
    swim-lane-view { margin: 8px 0; }
    step-block-view { margin: 8px 0; }
  `];

  override render() {
    if (!this.step) return nothing;

    return html`
      <div class="header">
        <span class="keyword">if</span>
        <span class="condition">${this.step.condition}</span>
      </div>
      <div class="branches">
        <div class="branch">
          <div class="branch-label then">THEN</div>
          ${this.diffNode?.scopes?.['then']
            ? this.diffNode.scopes['then'].map(n => renderDiffContent(n))
            : this.step.thenSteps.map(s => renderStepContent(s))}
        </div>
        <div class="branch">
          <div class="branch-label else">ELSE</div>
          ${this.diffNode?.scopes?.['else']
            ? this.diffNode.scopes['else'].map(n => renderDiffContent(n))
            : this.step.elseSteps.length > 0
              ? this.step.elseSteps.map(s => renderStepContent(s))
              : html`<div style="color: #7f849c; font-size: 12px; font-style: italic;">no steps</div>`
          }
        </div>
      </div>
      ${renderDiffMarker(this.diffState)}
      ${renderFieldChanges(this.fieldChanges)}
    `;
  }
}
