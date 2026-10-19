import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { BarrierStep, QuorumStep } from '@casehubio/yaml-core/step';
import type { DiffState, FieldChange } from '@casehubio/yaml-core/step/diff';
import { diffTokenStyles, renderDiffMarker, renderFieldChanges } from './diff-shared.js';

@customElement('barrier-bar')
export class BarrierBar extends LitElement {
  @property({ attribute: false }) step!: BarrierStep | QuorumStep;
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;
  @property({ attribute: false }) fieldChanges: FieldChange[] = [];

  static override styles = [diffTokenStyles, css`
    :host {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: rgba(137, 180, 250, 0.06);
      border-top: 2px solid #89b4fa;
      border-bottom: 2px solid #89b4fa;
      margin: 4px 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    :host([diff-state="added"]) {
      border-color: var(--pages-diff-added-text); background: var(--pages-diff-added-bg);
    }
    :host([diff-state="modified"]) {
      border-color: var(--pages-diff-modified-text); background: var(--pages-diff-modified-bg);
    }
    :host([diff-state="removed"]) {
      border-color: var(--pages-diff-removed-text); background: var(--pages-diff-removed-bg);
      opacity: 0.7;
    }

    .label {
      font-size: 11px;
      font-weight: 600;
      color: #89b4fa;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    :host([diff-state="modified"]) .label { color: var(--pages-diff-modified-text); }
    :host([diff-state="added"]) .label { color: var(--pages-diff-added-text); }

    .name {
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #7f849c;
    }

    .line {
      flex: 1;
      height: 0;
      border-top: 1px dashed #89b4fa;
    }
    :host([diff-state="modified"]) .line { border-color: var(--pages-diff-modified-text); }
    :host([diff-state="added"]) .line { border-color: var(--pages-diff-added-text); }

    .count {
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #7f849c;
    }

    .timeout {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: rgba(249, 226, 175, 0.15);
      color: #f9e2af;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 500;
    }
  `];

  override render() {
    if (!this.step) return nothing;

    const isQuorum = this.step.kind === 'quorum';
    const icon = isQuorum ? '◎' : '▮';
    const kindLabel = isQuorum ? 'quorum' : 'barrier';

    return html`
      <span class="label">${icon} ${kindLabel}</span>
      ${this.renderName()}
      <span class="line"></span>
      ${this.renderCount()}
      ${this.renderTimeout()}
      ${renderDiffMarker(this.diffState)}
      ${renderFieldChanges(this.fieldChanges)}
    `;
  }

  private renderName(): TemplateResult | typeof nothing {
    if (!this.step.name) return nothing;
    return html`<span class="name">${this.step.name}</span>`;
  }

  private renderCount(): TemplateResult {
    if (this.step.kind === 'quorum') {
      const q = this.step as QuorumStep;
      return html`<span class="count">${q.required} of ${q.ofSteps.length}</span>`;
    }
    const b = this.step as BarrierStep;
    return html`<span class="count">count: ${b.awaitSteps.length}</span>`;
  }

  private renderTimeout(): TemplateResult | typeof nothing {
    if (!this.step.timeout) return nothing;
    return html`<span class="timeout">⏱ ${this.step.timeout}ms</span>`;
  }
}
