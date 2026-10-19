import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ResolvedStep } from '@casehubio/yaml-core/step';
import { diffSteps, type DiffResult } from '@casehubio/yaml-core/step/diff';
import { renderStepContent } from './step-dispatch.js';
import { renderDiffContent } from './diff-dispatch.js';
import './diff-summary.js';

@customElement('pages-step-viewer')
export class PagesStepViewer extends LitElement {
  @property({ attribute: false }) steps?: ResolvedStep[];
  @property({ attribute: false }) oldSteps?: ResolvedStep[];
  @property({ attribute: false }) newSteps?: ResolvedStep[];
  @property({ attribute: false }) diffResult?: DiffResult;

  static override styles = css`
    :host { display: block; }
    .steps { display: flex; flex-direction: column; gap: 2px; }
  `;

  private get computedDiff(): DiffResult | undefined {
    if (this.diffResult) return this.diffResult;
    if (this.oldSteps && this.newSteps) return diffSteps(this.oldSteps, this.newSteps);
    return undefined;
  }

  override render() {
    const diff = this.computedDiff;
    if (diff) {
      return html`
        <diff-summary .stats=${diff.summary}></diff-summary>
        <div class="steps">
          ${diff.root.map(node => renderDiffContent(node))}
        </div>
      `;
    }
    const steps = this.steps ?? this.newSteps ?? [];
    return html`
      <div class="steps">
        ${steps.map(s => renderStepContent(s))}
      </div>
    `;
  }
}
