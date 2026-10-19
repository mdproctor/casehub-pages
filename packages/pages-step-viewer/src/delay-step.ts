import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DelayStep as DelayStepType } from '@casehubio/yaml-core/step';
import type { DiffState, FieldChange } from '@casehubio/yaml-core/step/diff';
import { diffTokenStyles, diffMarkerStyles, renderDiffMarker, renderFieldChanges } from './diff-shared.js';

@customElement('pages-delay-step')
export class PagesDelayStep extends LitElement {
  @property({ attribute: false }) step!: DelayStepType;
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;
  @property({ attribute: false }) fieldChanges: FieldChange[] = [];

  static override styles = [diffTokenStyles, diffMarkerStyles, css`
    :host {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 12px; color: #7f849c;
      font-size: 12px; font-family: Inter, system-ui, sans-serif;
    }
    .duration {
      background: rgba(249, 226, 175, 0.15); color: #f9e2af;
      padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600;
    }
  `];

  override render() {
    return html`
      <span style="color:#f9e2af">&#x23F1;</span>
      <span class="duration">${this.step.duration}ms</span>
      ${renderDiffMarker(this.diffState)}
      ${renderFieldChanges(this.fieldChanges)}
    `;
  }
}
