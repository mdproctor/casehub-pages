import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MatchStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';
import type { DiffState, DiffNode, FieldChange } from '@casehubio/yaml-core/step/diff';
import { diffTokenStyles, diffMarkerStyles, renderDiffMarker, renderFieldChanges } from './diff-shared.js';

@customElement('match-view')
export class MatchView extends LitElement {
  @property({ attribute: false }) step!: MatchStep;
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
    .scrutinee {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #f9e2af;
      background: rgba(249, 226, 175, 0.1);
      padding: 2px 8px;
      border-radius: 3px;
    }

    .cases { display: grid; gap: 0; }

    .case-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .case-row:last-child { border-bottom: none; }

    .pattern {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 3px;
      background: rgba(203, 166, 247, 0.1);
      color: #cba6f7;
      min-width: 80px;
      flex-shrink: 0;
      margin-top: 8px;
    }
    .pattern.default {
      background: rgba(127, 132, 156, 0.1);
      color: #7f849c;
      font-style: italic;
    }

    .arrow {
      color: #7f849c;
      font-size: 12px;
      flex-shrink: 0;
      margin-top: 8px;
    }

    .case-steps {
      flex: 1;
    }
    step-card { margin-bottom: 4px; }
  `];

  override render() {
    if (!this.step) return nothing;

    return html`
      <div class="header">
        <span class="keyword">match</span>
        <span class="scrutinee">${this.step.scrutinee}</span>
      </div>
      <div class="cases">
        ${this.step.cases.map(c => html`
          <div class="case-row">
            <span class="pattern ${c.pattern.type === 'default' ? 'default' : ''}">${this.formatPattern(c)}</span>
            <span class="arrow">→</span>
            <div class="case-steps">
              ${c.steps.map(s => renderStepContent(s))}
            </div>
          </div>
        `)}
      </div>
      ${renderDiffMarker(this.diffState)}
      ${renderFieldChanges(this.fieldChanges)}
    `;
  }

  private formatPattern(c: { pattern: { type: string; value?: unknown }; guard: string | null }): string {
    if (c.pattern.type === 'default') return 'default';
    const val = c.pattern.value != null ? `"${c.pattern.value}"` : String(c.pattern.type);
    return c.guard ? `${val} when ${c.guard}` : val;
  }
}
